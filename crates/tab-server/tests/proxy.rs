use std::net::SocketAddr;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

use axum::{
    body::Body,
    extract::Request,
    http::{header, HeaderMap, StatusCode},
    response::Response,
    Router,
};
use tab_server::{AppState, Config, UpstreamTable, STREAM_CPP};

const DEVICE: &str = "11111111-1111-4111-8111-111111111111";

fn config(data_dir: &str, tokens: &[(&str, &str)], device_rate: u32) -> Config {
    let token_rows = tokens
        .iter()
        .map(|(label, value)| format!("[[tokens]]\nlabel = \"{label}\"\nvalue = \"{value}\"\n"))
        .collect::<String>();
    Config::parse(&format!(
        r#"
listen = "127.0.0.1:0"
data_dir = "{data_dir}"
admin_key = "secret"
{token_rows}
[rate_limit]
enabled = true
per_device_per_minute = {device_rate}
per_ip_per_minute = 1000
"#
    ))
    .unwrap()
}

async fn serve_state(state: AppState) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(
            listener,
            tab_server::router(state).into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .unwrap();
    });
    format!("http://{addr}")
}

async fn serve_mock<F>(handler: F) -> String
where
    F: Fn(Request<Body>) -> Response<Body> + Send + Sync + Clone + 'static,
{
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = Router::new().fallback(move |request: Request<Body>| {
        let handler = handler.clone();
        async move { handler(request) }
    });
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    format!("http://{addr}")
}

async fn start(
    data_dir: &str,
    tokens: &[(&str, &str)],
    device_rate: u32,
    upstream: &str,
) -> String {
    let state = AppState::new(
        config(data_dir, tokens, device_rate),
        UpstreamTable::single_host(upstream),
    )
    .await
    .unwrap();
    serve_state(state).await
}

fn device_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("X-Cursor-Assistant-Device-ID", DEVICE.parse().unwrap());
    headers
}

#[tokio::test]
async fn rejects_missing_and_invalid_device_ids() {
    let dir = tempfile::tempdir().unwrap();
    let upstream = serve_mock(|_| Response::new(Body::from("ok"))).await;
    let base = start(
        dir.path().to_str().unwrap(),
        &[("a", "one")],
        240,
        &upstream,
    )
    .await;
    let client = reqwest::Client::new();
    let missing = client
        .post(format!("{base}{STREAM_CPP}"))
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), StatusCode::BAD_REQUEST);
    let invalid = client
        .post(format!("{base}{STREAM_CPP}"))
        .header("X-Cursor-Assistant-Device-ID", "not-a-uuid")
        .send()
        .await
        .unwrap();
    assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn unknown_path_is_not_found() {
    let dir = tempfile::tempdir().unwrap();
    let upstream = serve_mock(|_| Response::new(Body::from("ok"))).await;
    let base = start(
        dir.path().to_str().unwrap(),
        &[("a", "one")],
        240,
        &upstream,
    )
    .await;
    let response = reqwest::Client::new()
        .post(format!("{base}/not-a-tab-path"))
        .headers(device_headers())
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn streams_a_successful_completion_and_counts_it() {
    let dir = tempfile::tempdir().unwrap();
    let upstream = serve_mock(|_| Response::new(Body::from("hello-world"))).await;
    let base = start(
        dir.path().to_str().unwrap(),
        &[("a", "one")],
        240,
        &upstream,
    )
    .await;
    let response = reqwest::Client::new()
        .post(format!("{base}{STREAM_CPP}"))
        .headers(device_headers())
        .body("payload")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.text().await.unwrap(), "hello-world");
    let stats: serde_json::Value = serde_json::from_str(
        &reqwest::Client::new()
            .get(format!("{base}/api/stats"))
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(stats["completions"], 1);
}

#[tokio::test]
async fn retries_once_after_an_unauthorized_token() {
    let dir = tempfile::tempdir().unwrap();
    let seen = Arc::new(AtomicUsize::new(0));
    let counter = seen.clone();
    let upstream = serve_mock(move |request| {
        counter.fetch_add(1, Ordering::SeqCst);
        let auth = request
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_string();
        if auth == "Bearer bad" {
            let mut response = Response::new(Body::from("no"));
            *response.status_mut() = StatusCode::UNAUTHORIZED;
            response
        } else {
            Response::new(Body::from("ok"))
        }
    })
    .await;
    let base = start(
        dir.path().to_str().unwrap(),
        &[("bad", "bad"), ("good", "good")],
        240,
        &upstream,
    )
    .await;
    let response = reqwest::Client::new()
        .post(format!("{base}{STREAM_CPP}"))
        .headers(device_headers())
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.text().await.unwrap(), "ok");
    assert_eq!(seen.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn retries_once_after_upstream_rate_limit() {
    let dir = tempfile::tempdir().unwrap();
    let seen = Arc::new(AtomicUsize::new(0));
    let counter = seen.clone();
    let upstream = serve_mock(move |request| {
        counter.fetch_add(1, Ordering::SeqCst);
        let auth = request
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_string();
        if auth == "Bearer limited" {
            let mut response = Response::new(Body::from("slow"));
            *response.status_mut() = StatusCode::TOO_MANY_REQUESTS;
            response
        } else {
            Response::new(Body::from("ok"))
        }
    })
    .await;
    let base = start(
        dir.path().to_str().unwrap(),
        &[("limited", "limited"), ("good", "good")],
        240,
        &upstream,
    )
    .await;
    let response = reqwest::Client::new()
        .post(format!("{base}{STREAM_CPP}"))
        .headers(device_headers())
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(seen.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn rate_limit_returns_retry_after() {
    let dir = tempfile::tempdir().unwrap();
    let upstream = serve_mock(|_| Response::new(Body::from("ok"))).await;
    let base = start(dir.path().to_str().unwrap(), &[("a", "one")], 1, &upstream).await;
    let client = reqwest::Client::new();
    let first = client
        .post(format!("{base}{STREAM_CPP}"))
        .headers(device_headers())
        .send()
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    let second = client
        .post(format!("{base}{STREAM_CPP}"))
        .headers(device_headers())
        .send()
        .await
        .unwrap();
    assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(second.headers().get(header::RETRY_AFTER).is_some());
}

#[tokio::test]
async fn public_pages_do_not_require_a_device_id() {
    let dir = tempfile::tempdir().unwrap();
    let upstream = serve_mock(|_| Response::new(Body::from("ok"))).await;
    let base = start(
        dir.path().to_str().unwrap(),
        &[("a", "one")],
        240,
        &upstream,
    )
    .await;
    let client = reqwest::Client::new();
    let home = client.get(&base).send().await.unwrap();
    assert_eq!(home.status(), StatusCode::OK);
    assert!(home.text().await.unwrap().contains("当前被顶次数"));
    let health = client.get(format!("{base}/healthz")).send().await.unwrap();
    assert_eq!(health.status(), StatusCode::OK);
    let denied = client.get(format!("{base}/status")).send().await.unwrap();
    assert_eq!(denied.status(), StatusCode::UNAUTHORIZED);
    let allowed = client
        .get(format!("{base}/status"))
        .header("x-admin-key", "secret")
        .send()
        .await
        .unwrap();
    assert_eq!(allowed.status(), StatusCode::OK);
}
