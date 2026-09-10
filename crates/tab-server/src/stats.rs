//! Persistent public completion counter.

use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

const STATS_FILE: &str = "stats.json";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct StatsSnapshot {
    pub completions: u64,
    pub since: String,
}

#[derive(Clone)]
pub struct CompletionStats {
    completions: Arc<AtomicU64>,
    persisted: Arc<AtomicU64>,
    since: Arc<RwLock<String>>,
    path: PathBuf,
}

impl CompletionStats {
    pub async fn load(data_dir: impl AsRef<Path>) -> Result<Self, std::io::Error> {
        let data_dir = data_dir.as_ref();
        tokio::fs::create_dir_all(data_dir).await?;
        let path = data_dir.join(STATS_FILE);
        let snapshot = match tokio::fs::read_to_string(&path).await {
            Ok(contents) => serde_json::from_str::<StatsSnapshot>(&contents).ok(),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error),
        };
        let snapshot = snapshot.unwrap_or_else(|| StatsSnapshot {
            completions: 0,
            since: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
        });
        Ok(Self {
            completions: Arc::new(AtomicU64::new(snapshot.completions)),
            persisted: Arc::new(AtomicU64::new(snapshot.completions)),
            since: Arc::new(RwLock::new(snapshot.since)),
            path,
        })
    }

    pub fn record_completion(&self) {
        self.completions.fetch_add(1, Ordering::Relaxed);
    }

    pub async fn snapshot(&self) -> StatsSnapshot {
        StatsSnapshot {
            completions: self.completions.load(Ordering::Relaxed),
            since: self.since.read().await.clone(),
        }
    }

    pub async fn persist_if_dirty(&self) -> Result<(), std::io::Error> {
        let current = self.completions.load(Ordering::Relaxed);
        if current == self.persisted.load(Ordering::Relaxed) {
            return Ok(());
        }
        self.write(current).await
    }

    pub async fn flush(&self) -> Result<(), std::io::Error> {
        self.write(self.completions.load(Ordering::Relaxed)).await
    }

    async fn write(&self, completions: u64) -> Result<(), std::io::Error> {
        let snapshot = StatsSnapshot {
            completions,
            since: self.since.read().await.clone(),
        };
        let body = serde_json::to_vec_pretty(&snapshot)
            .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
        let tmp = self.path.with_extension("json.tmp");
        tokio::fs::write(&tmp, body).await?;
        tokio::fs::rename(&tmp, &self.path).await?;
        self.persisted.store(completions, Ordering::Relaxed);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn persists_and_restores_the_completion_count() {
        let dir = tempfile::tempdir().unwrap();
        let stats = CompletionStats::load(dir.path()).await.unwrap();
        stats.record_completion();
        stats.record_completion();
        stats.flush().await.unwrap();
        let restored = CompletionStats::load(dir.path()).await.unwrap();
        assert_eq!(restored.snapshot().await.completions, 2);
    }
}
