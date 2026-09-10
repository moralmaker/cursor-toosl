//! Starts the public / self-hosted Cursor TAB proxy.

use std::net::SocketAddr;

use tab_server::{
    persist_loop, resolve_config_path, router, watch_config, AppState, Config, UpstreamTable,
};
use tokio::signal;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("tab_server=info")),
        )
        .init();

    let config_path = match resolve_config_path() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };
    tracing::info!(path = %config_path.display(), "loaded tab-server config");
    let config = match Config::load(&config_path) {
        Ok(config) => config,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };
    let listen = config.listen.clone();
    let state = match AppState::new(config, UpstreamTable::official()).await {
        Ok(state) => state,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    };

    let persist = tokio::spawn(persist_loop(state.stats.clone(), state.limiter.clone()));
    let reload_state = state.clone();
    tokio::spawn(watch_config(
        config_path,
        state.tokens.clone(),
        move |config| {
            let reload_state = reload_state.clone();
            tokio::spawn(async move {
                reload_state.apply_reload(&config).await;
            });
        },
    ));

    let listener = match tokio::net::TcpListener::bind(&listen).await {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("failed to listen on {listen}: {error}");
            std::process::exit(1);
        }
    };
    tracing::info!(listen, "tab-server listening");
    let server = axum::serve(
        listener,
        router(state.clone()).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal());

    if let Err(error) = server.await {
        tracing::error!(%error, "tab-server stopped");
    }
    persist.abort();
    if let Err(error) = state.stats.flush().await {
        tracing::error!(%error, "failed to flush tab stats");
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c().await.expect("ctrl_c handler");
    };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {}
        _ = terminate => {}
    }
}
