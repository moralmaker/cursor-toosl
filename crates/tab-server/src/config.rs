//! Loads and validates the tab-server TOML configuration.

use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use serde::Deserialize;

use crate::Error;

const MANIFEST_DIR: &str = env!("CARGO_MANIFEST_DIR");

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    pub listen: String,
    #[serde(default = "default_data_dir")]
    pub data_dir: String,
    #[serde(default)]
    pub admin_key: String,
    pub tokens: Vec<TokenConfig>,
    #[serde(default)]
    pub rate_limit: RateLimitConfig,
    #[serde(default)]
    pub upstream: UpstreamConfig,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TokenConfig {
    pub label: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct RateLimitConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_device_rate")]
    pub per_device_per_minute: u32,
    #[serde(default = "default_ip_rate")]
    pub per_ip_per_minute: u32,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            per_device_per_minute: default_device_rate(),
            per_ip_per_minute: default_ip_rate(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpstreamConfig {
    #[serde(default = "default_connect_timeout")]
    pub connect_timeout_ms: u64,
    #[serde(default = "default_request_timeout")]
    pub request_timeout_ms: u64,
}

impl Default for UpstreamConfig {
    fn default() -> Self {
        Self {
            connect_timeout_ms: default_connect_timeout(),
            request_timeout_ms: default_request_timeout(),
        }
    }
}

fn default_data_dir() -> String {
    "./data".into()
}

fn default_true() -> bool {
    true
}

fn default_device_rate() -> u32 {
    240
}

fn default_ip_rate() -> u32 {
    1200
}

fn default_connect_timeout() -> u64 {
    5_000
}

fn default_request_timeout() -> u64 {
    60_000
}

pub fn resolve_config_path() -> Result<PathBuf, Error> {
    if let Ok(path) = std::env::var("TAB_SERVER_CONFIG") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
        return Err(Error::Config(format!(
            "TAB_SERVER_CONFIG is not a file: {}",
            path.display()
        )));
    }
    let manifest = PathBuf::from(MANIFEST_DIR);
    let candidates = [
        PathBuf::from("config.toml"),
        PathBuf::from("crates/tab-server/config.toml"),
        manifest.join("config.toml"),
        PathBuf::from("crates/tab-server/config.example.toml"),
        manifest.join("config.example.toml"),
    ];
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            Error::Config(
                "no config.toml found; copy crates/tab-server/config.example.toml and set tokens"
                    .into(),
            )
        })
}

fn resolve_data_dir(config_path: &Path, data_dir: &str) -> String {
    let data_dir = PathBuf::from(data_dir);
    let joined = if data_dir.is_absolute() {
        data_dir
    } else {
        config_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(data_dir)
    };
    normalize_path(&joined).to_string_lossy().into_owned()
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut resolved = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                resolved.pop();
            }
            Component::Prefix(prefix) => resolved.push(prefix.as_os_str()),
            Component::RootDir => resolved.push(component.as_os_str()),
            Component::Normal(name) => resolved.push(name),
        }
    }
    resolved
}

impl Config {
    pub fn load(path: impl AsRef<Path>) -> Result<Self, Error> {
        let path = path.as_ref();
        let contents = fs::read_to_string(path).map_err(|error| {
            Error::Config(format!("failed to read {}: {error}", path.display()))
        })?;
        let mut config = Self::parse(&contents)?;
        config.data_dir = resolve_data_dir(path, &config.data_dir);
        Ok(config)
    }

    pub fn parse(contents: &str) -> Result<Self, Error> {
        let config: Self = toml::from_str(contents)
            .map_err(|error| Error::Config(format!("failed to parse config: {error}")))?;
        config.validate()?;
        Ok(config)
    }

    fn validate(&self) -> Result<(), Error> {
        if self.listen.trim().is_empty() {
            return Err(Error::Config("listen must not be empty".into()));
        }
        if self.data_dir.trim().is_empty() {
            return Err(Error::Config("data_dir must not be empty".into()));
        }
        if self.tokens.is_empty() {
            return Err(Error::Config("at least one token is required".into()));
        }
        for token in &self.tokens {
            if token.label.trim().is_empty() {
                return Err(Error::Config("token label must not be empty".into()));
            }
            if token.value.trim().is_empty() {
                return Err(Error::Config(format!(
                    "token {} is missing a value",
                    token.label
                )));
            }
        }
        if self.rate_limit.per_device_per_minute == 0 || self.rate_limit.per_ip_per_minute == 0 {
            return Err(Error::Config(
                "rate limits must be greater than zero".into(),
            ));
        }
        if self.upstream.connect_timeout_ms == 0 || self.upstream.request_timeout_ms == 0 {
            return Err(Error::Config(
                "upstream timeouts must be greater than zero".into(),
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_an_empty_token_list() {
        let error = Config::parse(
            r#"
listen = "127.0.0.1:8041"
tokens = []
"#,
        )
        .unwrap_err();
        assert!(error.to_string().contains("at least one token"));
    }

    #[test]
    fn parses_a_valid_config() {
        let config = Config::parse(
            r#"
listen = "0.0.0.0:8041"
data_dir = "/data"
admin_key = "secret"

[[tokens]]
label = "acct-a"
value = "eyJ"

[rate_limit]
enabled = false
per_device_per_minute = 10
per_ip_per_minute = 20
"#,
        )
        .unwrap();
        assert_eq!(config.tokens.len(), 1);
        assert!(!config.rate_limit.enabled);
        assert_eq!(config.rate_limit.per_device_per_minute, 10);
    }

    #[test]
    fn finds_the_crate_example_config() {
        let path = resolve_config_path().unwrap();
        assert!(path.ends_with("config.example.toml") || path.ends_with("config.toml"));
        let config = Config::load(&path).unwrap();
        assert!(!config.tokens.is_empty());
        assert!(PathBuf::from(&config.data_dir).is_absolute() || config.data_dir.contains("data"));
    }

    #[test]
    fn data_dir_is_resolved_next_to_the_config_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        fs::write(
            &path,
            r#"
listen = "127.0.0.1:8041"
data_dir = "./data"

[[tokens]]
label = "a"
value = "token"
"#,
        )
        .unwrap();
        let config = Config::load(&path).unwrap();
        assert_eq!(config.data_dir, dir.path().join("data").to_string_lossy());
    }
}
