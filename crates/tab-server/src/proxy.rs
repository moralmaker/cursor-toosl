//! Forwards Cursor TAB Connect-RPC calls through the token pool.

use std::{net::SocketAddr, time::Instant};

use axum::{
    body::{to_bytes, Body},
    extract::{ConnectInfo, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, Request, Response, StatusCode},
};
use bytes::Bytes;
use futures_util::StreamExt;

use crate::{checksum::build_cursor_checksum, routes::STREAM_CPP, AppState};

pub const DEVICE_ID_HEADER: &str = "x-cursor-assistant-device-id";
const MAX_BODY_BYTES: usize = 16 * 1024 * 1024;

const HOP_BY_HOP: &[&str] = &[
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
    "x-server-upstream-url",
    DEVICE_ID_HEADER,
];

pub async fn method_not_allowed() -> Response<Body> {
    text_response(StatusCode::METHOD_NOT_ALLOWED, "method must be POST")
}

pub async fn forward(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request<Body>,
) -> Response<Body> {
    handle(&state, addr, request).await
}

async fn handle(state: &AppState, addr: SocketAddr, request: Request<Body>) -> Response<Body> {
    if request.method() != Method::POST {
        return method_not_allowed().await;
    }
    let started = Instant::now();
    let path = request.uri().path().to_string();
    let query = request.uri().query().unwrap_or_default().to_string();
    let Some(target) = state.upstreams.resolve(&path) else {
        return text_response(StatusCode::NOT_FOUND, "not found");
    };
    let device_id = match read_device_id(request.headers()) {
        Ok(device_id) => device_id,
        Err(message) => return text_response(StatusCode::BAD_REQUEST, message),
    };
    let ip = client_ip(request.headers(), addr);
    if let Err(retry) = state.limiter.allow(&device_id, &ip).await {
        return retry_response(retry);
    }

    let (parts, body) = request.into_parts();
    let body = match to_bytes(body, MAX_BODY_BYTES).await {
        Ok(body) => body,
        Err(_) => {
            return text_response(StatusCode::PAYLOAD_TOO_LARGE, "request body exceeds 16 MiB")
        }
    };

    let Some(first) = state.tokens.next_healthy().await else {
        return text_response(StatusCode::SERVICE_UNAVAILABLE, "no healthy tab token");
    };
    let first_result = dispatch(state, &target, &query, &parts.headers, &body, &first).await;
    let (token, upstream) = match first_result {
        Ok(response) if should_retry(response.status()) => {
            if response.status() == StatusCode::TOO_MANY_REQUESTS {
                state.tokens.mark_rate_limited(first.index).await;
            } else {
                state.tokens.mark_auth_failed(first.index).await;
            }
            let Some(second) = state.tokens.next_healthy().await else {
                return text_response(StatusCode::SERVICE_UNAVAILABLE, "no healthy tab token");
            };
            match dispatch(state, &target, &query, &parts.headers, &body, &second).await {
                Ok(retried) => (second, retried),
                Err(error) => {
                    tracing::error!(path, %error, "tab upstream retry failed");
                    return text_response(StatusCode::BAD_GATEWAY, "upstream request failed");
                }
            }
        }
        Ok(response) => (first, response),
        Err(error) => {
            tracing::error!(path, %error, "tab upstream request failed");
            return text_response(StatusCode::BAD_GATEWAY, "upstream request failed");
        }
    };

    let status = upstream.status();
    if path == STREAM_CPP && status.is_success() {
        state.stats.record_completion();
    }
    tracing::info!(
        path,
        token = %token.label,
        %status,
        elapsed_ms = started.elapsed().as_millis(),
        "forwarded tab request"
    );
    to_client_response(upstream)
}

async fn dispatch(
    state: &AppState,
    target: &str,
    query: &str,
    incoming: &HeaderMap,
    body: &Bytes,
    token: &crate::tokens::TokenHandle,
) -> Result<reqwest::Response, reqwest::Error> {
    let mut url = target.to_string();
    if !query.is_empty() {
        url.push('?');
        url.push_str(query);
    }
    let now_ms = chrono::Utc::now().timestamp_millis();
    state
        .client
        .post(&url)
        .headers(upstream_headers(incoming, &token.authorization, now_ms))
        .body(body.clone())
        .send()
        .await
}

fn upstream_headers(incoming: &HeaderMap, authorization: &str, now_ms: i64) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (name, value) in incoming.iter() {
        if is_hop_by_hop(name) || name == header::AUTHORIZATION || name == "x-cursor-checksum" {
            continue;
        }
        headers.append(name.clone(), value.clone());
    }
    headers.insert(
        header::AUTHORIZATION,
        HeaderValue::from_str(authorization).unwrap_or_else(|_| HeaderValue::from_static("")),
    );
    if let Ok(checksum) = HeaderValue::from_str(&build_cursor_checksum(authorization, now_ms)) {
        headers.insert("x-cursor-checksum", checksum);
    }
    headers
}

fn to_client_response(upstream: reqwest::Response) -> Response<Body> {
    let status = upstream.status();
    let mut headers = HeaderMap::new();
    for (name, value) in upstream.headers() {
        if is_hop_by_hop(name) {
            continue;
        }
        headers.append(name.clone(), value.clone());
    }
    let stream = upstream
        .bytes_stream()
        .map(|chunk| chunk.map_err(|error| std::io::Error::other(error.to_string())));
    let mut response = Response::new(Body::from_stream(stream));
    *response.status_mut() = status;
    *response.headers_mut() = headers;
    response
}

fn read_device_id(headers: &HeaderMap) -> Result<String, &'static str> {
    let Some(value) = headers.get(DEVICE_ID_HEADER) else {
        return Err("missing X-Cursor-Assistant-Device-ID");
    };
    let value = value
        .to_str()
        .map_err(|_| "invalid X-Cursor-Assistant-Device-ID")?;
    uuid::Uuid::parse_str(value).map_err(|_| "invalid X-Cursor-Assistant-Device-ID")?;
    Ok(value.to_string())
}

fn client_ip(headers: &HeaderMap, addr: SocketAddr) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| addr.ip().to_string())
}

fn should_retry(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN | StatusCode::TOO_MANY_REQUESTS
    )
}

fn is_hop_by_hop(name: &HeaderName) -> bool {
    HOP_BY_HOP.iter().any(|header| name == *header)
}

fn retry_response(retry: std::time::Duration) -> Response<Body> {
    let mut response = text_response(StatusCode::TOO_MANY_REQUESTS, "rate limited");
    if let Ok(value) = HeaderValue::from_str(&retry.as_secs().max(1).to_string()) {
        response.headers_mut().insert(header::RETRY_AFTER, value);
    }
    response
}

fn text_response(status: StatusCode, message: &'static str) -> Response<Body> {
    let mut response = Response::new(Body::from(message));
    *response.status_mut() = status;
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_id_must_be_a_uuid() {
        let mut headers = HeaderMap::new();
        assert!(read_device_id(&headers).is_err());
        headers.insert(DEVICE_ID_HEADER, HeaderValue::from_static("not-a-uuid"));
        assert!(read_device_id(&headers).is_err());
        headers.insert(
            DEVICE_ID_HEADER,
            HeaderValue::from_static("11111111-1111-4111-8111-111111111111"),
        );
        assert_eq!(
            read_device_id(&headers).unwrap(),
            "11111111-1111-4111-8111-111111111111"
        );
    }
}
