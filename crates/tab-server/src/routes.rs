//! Official Cursor TAB path → upstream host table.

use std::collections::HashMap;

pub const STREAM_CPP: &str = "/aiserver.v1.AiService/StreamCpp";

pub const PATHS: [&str; 18] = [
    STREAM_CPP,
    "/aiserver.v1.AiService/StreamNextCursorPrediction",
    "/aiserver.v1.AiService/GetCppEditClassification",
    "/aiserver.v1.AiService/RefreshTabContext",
    "/aiserver.v1.AiService/CppConfig",
    "/aiserver.v1.AiService/CppEditHistoryStatus",
    "/aiserver.v1.AiService/CppAppend",
    "/aiserver.v1.AiService/CppEditHistoryAppend",
    "/aiserver.v1.AiService/ReportAiCodeChangeMetrics",
    "/aiserver.v1.AiService/WriteGitCommitMessage",
    "/aiserver.v1.AiService/WriteGitBranchName",
    "/aiserver.v1.CppService/AvailableModels",
    "/aiserver.v1.CppService/RecordCppFate",
    "/aiserver.v1.FileSyncService/FSSyncFile",
    "/aiserver.v1.FileSyncService/FSIsEnabledForUser",
    "/aiserver.v1.FileSyncService/FSConfig",
    "/aiserver.v1.FileSyncService/FSUploadFile",
    "/aiserver.v1.DashboardService/GetEffectiveUserPlugins",
];

const OFFICIAL: &[(&str, &str)] = &[
    (STREAM_CPP, "https://api4.cursor.sh"),
    (
        "/aiserver.v1.AiService/StreamNextCursorPrediction",
        "https://api4.cursor.sh",
    ),
    (
        "/aiserver.v1.AiService/GetCppEditClassification",
        "https://api4.cursor.sh",
    ),
    (
        "/aiserver.v1.AiService/RefreshTabContext",
        "https://api2.cursor.sh",
    ),
    ("/aiserver.v1.AiService/CppConfig", "https://api4.cursor.sh"),
    (
        "/aiserver.v1.AiService/CppEditHistoryStatus",
        "https://api2.cursor.sh",
    ),
    ("/aiserver.v1.AiService/CppAppend", "https://api3.cursor.sh"),
    (
        "/aiserver.v1.AiService/CppEditHistoryAppend",
        "https://api3.cursor.sh",
    ),
    (
        "/aiserver.v1.CppService/AvailableModels",
        "https://api3.cursor.sh",
    ),
    (
        "/aiserver.v1.CppService/RecordCppFate",
        "https://api2.cursor.sh",
    ),
    (
        "/aiserver.v1.AiService/ReportAiCodeChangeMetrics",
        "https://api2.cursor.sh",
    ),
    (
        "/aiserver.v1.AiService/WriteGitCommitMessage",
        "https://api2.cursor.sh",
    ),
    (
        "/aiserver.v1.AiService/WriteGitBranchName",
        "https://api2.cursor.sh",
    ),
    (
        "/aiserver.v1.FileSyncService/FSSyncFile",
        "https://api4.cursor.sh",
    ),
    (
        "/aiserver.v1.FileSyncService/FSIsEnabledForUser",
        "https://api4.cursor.sh",
    ),
    (
        "/aiserver.v1.FileSyncService/FSConfig",
        "https://api4.cursor.sh",
    ),
    (
        "/aiserver.v1.FileSyncService/FSUploadFile",
        "https://api4.cursor.sh",
    ),
    (
        "/aiserver.v1.DashboardService/GetEffectiveUserPlugins",
        "https://api2.cursor.sh",
    ),
];

#[derive(Clone, Debug)]
pub struct UpstreamTable {
    targets: HashMap<String, String>,
}

impl UpstreamTable {
    pub fn official() -> Self {
        Self {
            targets: OFFICIAL
                .iter()
                .map(|(path, host)| ((*path).to_string(), (*host).to_string()))
                .collect(),
        }
    }

    pub fn single_host(base: impl Into<String>) -> Self {
        let base = base.into().trim_end_matches('/').to_string();
        Self {
            targets: PATHS
                .iter()
                .map(|path| ((*path).to_string(), base.clone()))
                .collect(),
        }
    }

    pub fn resolve(&self, path: &str) -> Option<String> {
        self.targets.get(path).map(|host| format!("{host}{path}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn official_table_covers_every_published_path() {
        let table = UpstreamTable::official();
        assert_eq!(PATHS.len(), 18);
        for path in PATHS {
            let target = table.resolve(path).unwrap();
            assert!(target.starts_with("https://api"), "{target}");
            assert!(target.ends_with(path), "{target}");
        }
    }

    #[test]
    fn single_host_rewrites_every_path_for_tests() {
        let table = UpstreamTable::single_host("http://127.0.0.1:9");
        assert_eq!(
            table.resolve(STREAM_CPP).as_deref(),
            Some("http://127.0.0.1:9/aiserver.v1.AiService/StreamCpp")
        );
    }
}
