//! Round-robin Cursor token pool with cooldown and config hot-reload.

use std::{
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

use tokio::sync::RwLock;

use crate::{
    checksum::format_bearer_authorization,
    config::{Config, TokenConfig},
};

const AUTH_COOLDOWN: Duration = Duration::from_secs(10 * 60);
const RATE_COOLDOWN: Duration = Duration::from_secs(60);
const RELOAD_INTERVAL: Duration = Duration::from_secs(10);

#[derive(Clone, Debug)]
pub struct TokenHandle {
    pub index: usize,
    pub label: String,
    pub authorization: String,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct TokenStatus {
    pub label: String,
    pub healthy: bool,
    pub cooldown_secs: u64,
}

#[derive(Clone)]
struct TokenState {
    label: String,
    authorization: String,
    cooldown_until: Option<Instant>,
}

struct Inner {
    tokens: Vec<TokenState>,
    next: usize,
}

#[derive(Clone)]
pub struct TokenPool {
    inner: Arc<RwLock<Inner>>,
}

impl TokenPool {
    pub fn new(tokens: &[TokenConfig]) -> Self {
        Self {
            inner: Arc::new(RwLock::new(Inner {
                tokens: tokens.iter().map(token_state).collect(),
                next: 0,
            })),
        }
    }

    pub async fn next_healthy(&self) -> Option<TokenHandle> {
        let mut inner = self.inner.write().await;
        let len = inner.tokens.len();
        if len == 0 {
            return None;
        }
        let now = Instant::now();
        for offset in 0..len {
            let index = (inner.next + offset) % len;
            if inner.tokens[index]
                .cooldown_until
                .is_some_and(|until| until > now)
            {
                continue;
            }
            let label = inner.tokens[index].label.clone();
            let authorization = inner.tokens[index].authorization.clone();
            inner.next = (index + 1) % len;
            return Some(TokenHandle {
                index,
                label,
                authorization,
            });
        }
        None
    }

    pub async fn mark_auth_failed(&self, index: usize) {
        self.cool_down(index, AUTH_COOLDOWN).await;
    }

    pub async fn mark_rate_limited(&self, index: usize) {
        self.cool_down(index, RATE_COOLDOWN).await;
    }

    async fn cool_down(&self, index: usize, duration: Duration) {
        let mut inner = self.inner.write().await;
        if let Some(token) = inner.tokens.get_mut(index) {
            token.cooldown_until = Some(Instant::now() + duration);
            tracing::warn!(label = %token.label, secs = duration.as_secs(), "token cooled down");
        }
    }

    pub async fn replace(&self, tokens: &[TokenConfig]) {
        let mut inner = self.inner.write().await;
        let now = Instant::now();
        let previous: Vec<_> = inner
            .tokens
            .iter()
            .filter_map(|token| {
                token
                    .cooldown_until
                    .filter(|until| *until > now)
                    .map(|until| (token.authorization.clone(), until))
            })
            .collect();
        inner.tokens = tokens
            .iter()
            .map(|config| {
                let mut state = token_state(config);
                if let Some((_, until)) = previous
                    .iter()
                    .find(|(authorization, _)| authorization == &state.authorization)
                {
                    state.cooldown_until = Some(*until);
                }
                state
            })
            .collect();
        if inner.next >= inner.tokens.len() {
            inner.next = 0;
        }
    }

    pub async fn snapshot(&self) -> Vec<TokenStatus> {
        let inner = self.inner.read().await;
        let now = Instant::now();
        inner
            .tokens
            .iter()
            .map(|token| {
                let remaining = token
                    .cooldown_until
                    .map(|until| until.saturating_duration_since(now).as_secs())
                    .unwrap_or(0);
                TokenStatus {
                    label: token.label.clone(),
                    healthy: remaining == 0,
                    cooldown_secs: remaining,
                }
            })
            .collect()
    }
}

fn token_state(config: &TokenConfig) -> TokenState {
    TokenState {
        label: config.label.trim().to_string(),
        authorization: format_bearer_authorization(&config.value),
        cooldown_until: None,
    }
}

pub async fn watch_config(
    path: PathBuf,
    pool: TokenPool,
    on_reload: impl Fn(Config) + Send + 'static,
) {
    let mut last_mtime = std::fs::metadata(&path)
        .ok()
        .and_then(|meta| meta.modified().ok());
    loop {
        tokio::time::sleep(RELOAD_INTERVAL).await;
        let mtime = match std::fs::metadata(&path)
            .ok()
            .and_then(|meta| meta.modified().ok())
        {
            Some(mtime) => mtime,
            None => continue,
        };
        if last_mtime.is_some_and(|previous| previous == mtime) {
            continue;
        }
        last_mtime = Some(mtime);
        match Config::load(&path) {
            Ok(config) => {
                pool.replace(&config.tokens).await;
                on_reload(config);
                tracing::info!(path = %path.display(), "reloaded tab-server config");
            }
            Err(error) => tracing::error!(%error, "failed to reload tab-server config"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token(label: &str, value: &str) -> TokenConfig {
        TokenConfig {
            label: label.into(),
            value: value.into(),
        }
    }

    #[tokio::test]
    async fn rotates_healthy_tokens() {
        let pool = TokenPool::new(&[token("a", "one"), token("b", "two")]);
        let first = pool.next_healthy().await.unwrap();
        let second = pool.next_healthy().await.unwrap();
        assert_eq!(first.label, "a");
        assert_eq!(second.label, "b");
        assert_eq!(first.authorization, "Bearer one");
    }

    #[tokio::test]
    async fn skips_tokens_in_cooldown() {
        let pool = TokenPool::new(&[token("a", "one"), token("b", "two")]);
        let first = pool.next_healthy().await.unwrap();
        pool.mark_auth_failed(first.index).await;
        let next = pool.next_healthy().await.unwrap();
        assert_eq!(next.label, "b");
        pool.mark_rate_limited(next.index).await;
        assert!(pool.next_healthy().await.is_none());
    }

    #[tokio::test]
    async fn replace_keeps_cooldown_for_the_same_value() {
        let pool = TokenPool::new(&[token("a", "one"), token("b", "two")]);
        let first = pool.next_healthy().await.unwrap();
        pool.mark_auth_failed(first.index).await;
        pool.replace(&[token("renamed", "one"), token("b", "two")])
            .await;
        let next = pool.next_healthy().await.unwrap();
        assert_eq!(next.label, "b");
    }
}
