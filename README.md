<div align="center">

# cursor-tools
cursor-tools is a local implementation of Cursor's backend.
<br>
<br>

[User Guide](https://ops.susuan.ai/download/guide.html) · [Download](https://ops.susuan.ai/download/) · [Report an Issue](https://github.com/moralmaker/cursor-toosl/issues) · [中文版本说明](./README-CN.md)

[![Release](https://img.shields.io/github/v/release/moralmaker/cursor-tools-releases?style=flat-square)](https://github.com/moralmaker/cursor-tools-releases/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/moralmaker/cursor-tools-releases/total?style=flat-square)](https://github.com/moralmaker/cursor-tools-releases/releases)
[![License](https://img.shields.io/github/license/moralmaker/cursor-toosl?style=flat-square)](./LICENSE)
[![Platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square)](https://github.com/moralmaker/cursor-tools-releases/releases/latest)

</div>

![Connect cursor-tools to a wide range of model APIs](./images/en-brand-1.png)

![cursor-tools dashboard](./images/en-home-1.png)

## About

cursor-tools is an open-source local model gateway for Cursor. It runs a service on your machine that connects Cursor to the model APIs you configure, routes model requests through your own providers, and preserves Cursor Agent capabilities such as tool calling, Skills, and MCP.

You can connect OpenAI- and Anthropic-compatible services, customize endpoints, model IDs, API keys, and request parameters, and use model channels beyond the options built into the platform.

> [!IMPORTANT]
> cursor-tools is free and open source, but the model APIs you connect may charge for usage. This is an independent project and is not affiliated with or endorsed by Cursor or its developers.

## Features

- **Bring your own model channels:** Configure your own API endpoint, credentials, and model IDs.
- **Multiple API protocols:** OpenAI Responses API, OpenAI Chat Completions API, and Anthropic Messages API compatible services.
- **Model management:** Add, duplicate, edit, reorder, and batch-test multiple model configurations.
- **Connection benchmarks:** Measure time to first token, generation speed, and inspect raw provider responses.
- **Agent workflows:** Keep tool calling, Skills, MCP, and multi-turn conversations available.
- **Session metrics:** Track token usage, cache hit rate, conversation turns, and estimated value.
- **TAB completion service:** Choose between the public service, direct official access, or a self-hosted `tab-server`.
- **Plugins:** Built-in auth plugins (Codex, Grok, Antigravity) run in a sandboxed Deno worker; more can be installed from the desktop app.
- **Cross-platform:** Run on macOS, Windows, and Linux.

## Quick Start

1. Open the [download page](https://ops.susuan.ai/download/) and get the build for your device (or use [GitHub Releases](https://github.com/moralmaker/cursor-tools-releases/releases/latest)).
2. Launch cursor-tools, open **Cursor Settings**, and initialize the local CA when prompted.
3. Open **Model Settings**, add a model with its endpoint, API key, and model ID, then run **Test**.
4. Once the test passes, keep cursor-tools running.
5. After upgrading Cursor or configuring a model for the first time, quit Cursor completely and restart it, then start a new conversation and select the configured model.

For complete installation steps, system configuration, and Frequently Asked Questions, see the [user guide](https://ops.susuan.ai/download/guide.html).

## Model Management

Model configurations support both OpenAI and Anthropic API protocols. Each model channel can independently define its context window, maximum output tokens, reasoning effort, custom headers, and additional request parameters.

![cursor-tools model settings](./images/en-model-1.png)

## TAB Completion Service

Cursor Tab completions are handled by a separate TAB service and do not go through the model channel. Choose the mode in **Settings → TAB**:

| Mode | Upstream |
|---|---|
| Public service (default) | `https://tab.susuan.ai`, operated by the project author |
| Direct | Cursor's official TAB endpoints using your own account |
| Custom | Your own deployment of [`crates/tab-server`](./crates/tab-server/README.md) |

`tab-server` is a small Rust proxy: it rotates Cursor access tokens, recomputes `x-cursor-checksum`, rate-limits by installation ID and IP, and exposes a public counter page. Run it locally with `make dev-tab-server` or ship it with `make build-tab-server-docker`.

## How It Works

```text
Cursor client
    │
    │ Agent requests and tool results
    ▼
cursor-tools local service
    │
    │ OpenAI- / Anthropic-compatible requests
    ▼
Your model API
```

cursor-tools handles protocol adaptation, model request forwarding, tool-call coordination, and conversation state on your machine. API keys and application settings are stored locally; requests are still sent to the model provider you configure.

## Repository Layout

```text
cursor-tools/
├── apps/desktop/          # Tauri 2 desktop app: React UI (src/) + Rust shell (src-tauri/)
├── server/                # cursor-server: local gateway, Agent runtime, SQLite store, plugins
├── crates/
│   ├── semble-core/       # Local code indexing and search engine
│   └── tab-server/        # Public / self-hosted Cursor TAB proxy
├── protocols/cursor/      # Cursor protobuf definitions used by server/build.rs
├── ops/                   # Cloudflare Worker: ads + desktop update manifests + admin UI
├── support/               # Protocol extractor, capture tool, and search benchmarks
├── docs/                  # Release guide, server architecture, external API contracts
├── .github/workflows/     # ci.yml (checks) and release.yml (tag-triggered multi-platform release)
├── Cargo.toml             # Rust workspace
└── Makefile               # dev / check / build entry points
```

Further reading:

- [`docs/server-architecture.md`](./docs/server-architecture.md) — `server/` directory structure, main request paths, module boundaries.
- [`docs/external-apis.md`](./docs/external-apis.md) — outbound contracts for ads, TAB, and model channels.
- [`docs/README.md`](./docs/README.md) — version bump and GitHub Releases procedure.

## Why This Project

Many Agent products bundle their tool capabilities with a fixed set of models, subscriptions, and billing options, leaving users limited to the channels offered by the platform.

cursor-tools is built to return model choice to the user. Developers can make full use of the APIs and credits they already have, choose the models and providers that fit their needs, and self-host related services when required.

## Roadmap

The project will continue to improve model compatibility, Agent tooling, local runtime stability, and the self-hosting experience while exploring support for more IDE, chat, and Agent workflows.

See the [release roadmap](https://github.com/moralmaker/cursor-toosl/discussions/32) for plans and progress.

## Community and Support

- [User Guide](https://ops.susuan.ai/download/guide.html)
- [GitHub Issues](https://github.com/moralmaker/cursor-toosl/issues)
- [Telegram community](https://t.me/cursor_tools)
- QQ groups: `1095916242`, `1094411438`, `1095918002`, `1094419321`

When filing an issue, include your OS, cursor-tools version, model type, request protocol, a redacted endpoint, the error message, and reproduction steps. Never post API keys or other credentials.

## Development

### Prerequisites

- Rust **stable** toolchain with `rustfmt` and `clippy` components
- Node.js **22** and npm
- Tauri 2 system build dependencies (only for the desktop shell)
- Docker (only for container images)

```bash
npm --prefix apps/desktop ci
```

### Run

```bash
make dev-web           # cursor-server (:3000) + Vite dev server (:1420); console at http://127.0.0.1:3000/__tools-api__/
make dev-desktop       # Tauri desktop shell with hot reload
make dev-tab-server    # TAB proxy on :8041 (falls back to crates/tab-server/config.example.toml)
```

Run the gateway against an already-built console instead:

```bash
CURSOR_CONSOLE_DIR=apps/desktop/dist cargo run --release --package cursor-server --bin cursor-server
```

### Check (CI parity)

```bash
make check
```

This runs `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace --all-targets`, and `npm --prefix apps/desktop run check`, matching `.github/workflows/ci.yml`.

### Build

```bash
make build-web                # apps/desktop/dist
make build-server             # target/release/cursor-server
make build-desktop            # platform installer + updater signature (local signing key auto-generated in .tauri/)
make build-docker             # cursor-tools:local image (gateway + console)
make build-tab-server         # target/release/tab-server
make build-tab-server-docker  # cursor-tools-tab:local image
```

Official multi-platform installers are produced by GitHub Actions when a `v*` tag is pushed. See [`docs/README.md`](./docs/README.md) for the version bump and release procedure.

### Windows on ARM64 with the workspace on an SMB share

If the toolchain is `aarch64-pc-windows-msvc` but MSVC only ships x64 libraries, and `rustc` archive writes fail on the SMB share (`os error 87`), build with the x64 host toolchain and a local target dir:

```powershell
# one-time per session: map the repo share to a drive letter (cmd/npm do not support UNC cwd)
net use W: \\Mac\Home\Desktop /persistent:no
cd W:\Mywork\Coding\Tools\cursor-tools

$env:RUSTUP_TOOLCHAIN   = 'stable-x86_64-pc-windows-msvc'      # x64 binaries run under emulation
$env:CARGO_TARGET_DIR   = 'C:\Users\moral\AppData\Local\Temp\ctarget'
cargo clippy --workspace --all-targets -- -D warnings
cargo test  --workspace --all-targets
cargo build --release --package cursor-server --bin cursor-server
```

Desktop packaging in that environment (the tauri CLI mis-detects the architecture under ARM64 node; use a non-empty key password because an empty one makes the CLI prompt interactively and hang):

```powershell
cd apps/desktop
$env:TAURI_SIGNING_PRIVATE_KEY         = (Get-Content '..\..\.tauri\cursor-tools.local.key' -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = 'cursor-tools-local'
node node_modules/@tauri-apps/cli/tauri.js build --bundles nsis --target x86_64-pc-windows-msvc
```

Artifacts land under `$env:CARGO_TARGET_DIR\release\` (server) and `dist\desktop\` (installer + `.sig` + portable exe, gitignored).

## Contributing

Issues and pull requests are welcome. Run `make check` before submitting and keep changes scoped to one concern.

## Contributors

<a href="https://github.com/moralmaker/cursor-toosl/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=moralmaker/cursor-toosl" />
</a>

## License

This project is open source under the [MIT License](./LICENSE).
