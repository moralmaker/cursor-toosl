//! Public / self-hosted Cursor TAB proxy.

mod checksum;
mod config;
mod limiter;
mod proxy;
mod routes;
mod stats;
mod status;
mod tokens;

use std::{sync::Arc, time::Duration};

use axum::{
    routing::{get, post},
    Router,
};
use tokio::sync::RwLock;

pub use config::{resolve_config_path, Config};
pub use routes::{UpstreamTable, PATHS, STREAM_CPP};
pub use tokens::{watch_config, TokenPool};

use limiter::RateLimiter;
use stats::CompletionStats;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Config(String),
    #[error("{0}")]
    Io(#[from] std::io::Error),
}

#[derive(Clone)]
pub struct AppState {
    pub tokens: TokenPool,
    pub limiter: Arc<RateLimiter>,
    pub stats: CompletionStats,
    pub client: reqwest::Client,
    pub upstreams: UpstreamTable,
    pub admin_key: Arc<RwLock<String>>,
}

impl AppState {
    pub async fn new(config: Config, upstreams: UpstreamTable) -> Result<Self, Error> {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_millis(config.upstream.connect_timeout_ms))
            .timeout(Duration::from_millis(config.upstream.request_timeout_ms))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| Error::Config(format!("failed to build HTTP client: {error}")))?;
        Ok(Self {
            tokens: TokenPool::new(&config.tokens),
            limiter: Arc::new(RateLimiter::new(&config.rate_limit)),
            stats: CompletionStats::load(&config.data_dir).await?,
            client,
            upstreams,
            admin_key: Arc::new(RwLock::new(config.admin_key.trim().to_string())),
        })
    }

    pub async fn apply_reload(&self, config: &Config) {
        self.tokens.replace(&config.tokens).await;
        self.limiter.update(&config.rate_limit);
        *self.admin_key.write().await = config.admin_key.trim().to_string();
    }
}

pub fn router(state: AppState) -> Router {
    let mut app = Router::new()
        .route("/", get(status::index))
        .route("/api/stats", get(status::public_stats))
        .route("/healthz", get(status::healthz))
        .route("/status", get(status::admin_status));
    for path in routes::PATHS {
        app = app.route(path, post(proxy::forward));
    }
    app.fallback(status::not_found).with_state(state)
}

pub async fn persist_loop(stats: CompletionStats, limiter: Arc<RateLimiter>) {
    let mut interval = tokio::time::interval(Duration::from_secs(5));
    let mut ticks = 0_u64;
    loop {
        interval.tick().await;
        if let Err(error) = stats.persist_if_dirty().await {
            tracing::error!(%error, "failed to persist tab stats");
        }
        ticks += 1;
        if ticks.is_multiple_of(12) {
            limiter.cleanup().await;
        }
    }
}
