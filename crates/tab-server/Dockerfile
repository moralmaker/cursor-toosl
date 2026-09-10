# syntax=docker/dockerfile:1.7

FROM rust:1-bookworm AS build
WORKDIR /src
COPY Cargo.lock ./
COPY crates/tab-server ./crates/tab-server
RUN printf '[workspace]\nmembers = ["crates/tab-server"]\nresolver = "2"\n' > Cargo.toml
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/src/target \
    cargo build --release --package tab-server --bin tab-server && \
    cp target/release/tab-server /tmp/tab-server

FROM debian:bookworm-slim
RUN apt-get update && \
    apt-get install --yes --no-install-recommends ca-certificates curl && \
    rm -rf /var/lib/apt/lists/* && \
    useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin tab-server && \
    mkdir -p /app /data && \
    chown tab-server:tab-server /data

COPY --from=build /tmp/tab-server /usr/local/bin/tab-server
COPY crates/tab-server/config.example.toml /app/config.example.toml

ENV TAB_SERVER_CONFIG=/data/config.toml \
    RUST_LOG=tab_server=info

USER tab-server
EXPOSE 8041
VOLUME ["/data"]
WORKDIR /app
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD curl --fail --silent http://127.0.0.1:8041/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/tab-server"]
