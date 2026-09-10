//! Public counter page, health, and admin token status.

use axum::{
    body::Body,
    extract::State,
    http::{header, HeaderMap, HeaderValue, Response, StatusCode},
    response::IntoResponse,
    Json,
};

use crate::{tokens::TokenStatus, AppState};

const INDEX_HTML: &str = include_str!("assets/index.html");

#[derive(serde::Serialize)]
pub struct AdminStatus {
    pub completions: u64,
    pub since: String,
    pub tokens: Vec<TokenStatus>,
}

pub async fn index() -> impl IntoResponse {
    (
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        INDEX_HTML,
    )
}

pub async fn public_stats(State(state): State<AppState>) -> impl IntoResponse {
    (
        [
            (header::CACHE_CONTROL, "no-store"),
            (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
        ],
        Json(state.stats.snapshot().await),
    )
}

pub async fn healthz() -> StatusCode {
    StatusCode::OK
}

pub async fn admin_status(State(state): State<AppState>, headers: HeaderMap) -> Response<Body> {
    let admin_key = state.admin_key.read().await.clone();
    if admin_key.is_empty() {
        return status_text(StatusCode::NOT_FOUND, "not found");
    }
    if !admin_key_matches(&headers, &admin_key) {
        return status_text(StatusCode::UNAUTHORIZED, "unauthorized");
    }
    let snapshot = state.stats.snapshot().await;
    let body = AdminStatus {
        completions: snapshot.completions,
        since: snapshot.since,
        tokens: state.tokens.snapshot().await,
    };
    let mut response = Response::new(Body::from(serde_json::to_vec(&body).unwrap_or_default()));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json; charset=utf-8"),
    );
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

pub async fn not_found() -> impl IntoResponse {
    (StatusCode::NOT_FOUND, "not found")
}

fn admin_key_matches(headers: &HeaderMap, admin_key: &str) -> bool {
    if headers
        .get("x-admin-key")
        .and_then(|value| value.to_str().ok())
        == Some(admin_key)
    {
        return true;
    }
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.strip_prefix("Bearer ") == Some(admin_key))
}

fn status_text(status: StatusCode, message: &'static str) -> Response<Body> {
    let mut response = Response::new(Body::from(message));
    *response.status_mut() = status;
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    response
}
