//! Restarts the Cursor desktop process around an explicit takeover.

use std::{
    ffi::OsString,
    path::PathBuf,
    process::Stdio,
    time::{Duration, Instant},
};

use tokio::process::Command;

use crate::{Error, Result};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const DETACHED_PROCESS: u32 = 0x0000_0008;

const GRACEFUL_EXIT: Duration = Duration::from_secs(5);
const FORCED_EXIT: Duration = Duration::from_secs(3);
const EXIT_POLL: Duration = Duration::from_millis(200);

#[cfg(windows)]
fn hide_console(command: &mut Command) {
    command.creation_flags(CREATE_NO_WINDOW);
}

/// A Cursor instance that was stopped and can be started again with the same installation.
pub struct StoppedCursor {
    program: PathBuf,
    args: Vec<OsString>,
}

impl StoppedCursor {
    pub async fn launch(&self) -> Result<()> {
        let mut command = Command::new(&self.program);
        command
            .args(&self.args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        command.creation_flags(DETACHED_PROCESS);
        #[cfg(target_os = "macos")]
        {
            // `open` exits after requesting launch; wait so failures are visible.
            let status = command.status().await.map_err(|error| {
                Error::Config(format!(
                    "failed to start Cursor from {}: {error}",
                    self.program.display()
                ))
            })?;
            if status.success() {
                Ok(())
            } else {
                Err(Error::Config(format!(
                    "failed to start Cursor from {} (exit {status})",
                    self.program.display()
                )))
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            command.kill_on_drop(false);
            command.spawn().map(drop).map_err(|error| {
                Error::Config(format!(
                    "failed to start Cursor from {}: {error}",
                    self.program.display()
                ))
            })
        }
    }
}

/// Stops Cursor and waits until it has exited. Returns `None` when Cursor was not running.
pub async fn stop_cursor() -> Result<Option<StoppedCursor>> {
    let Some(stopped) = locate_platform_cursor().await? else {
        return Ok(None);
    };
    signal_platform_cursor(false).await?;
    if !wait_until_exited(GRACEFUL_EXIT).await? {
        signal_platform_cursor(true).await?;
        if !wait_until_exited(FORCED_EXIT).await? {
            return Err(Error::Config("Cursor did not exit".into()));
        }
    }
    Ok(Some(stopped))
}

async fn wait_until_exited(timeout: Duration) -> Result<bool> {
    let deadline = Instant::now() + timeout;
    loop {
        if !platform_cursor_running().await? {
            return Ok(true);
        }
        if Instant::now() >= deadline {
            return Ok(false);
        }
        tokio::time::sleep(EXIT_POLL).await;
    }
}

#[cfg(target_os = "linux")]
const UNIX_NAMES: &[&str] = &["cursor", "Cursor"];

/// macOS: `pgrep -x Cursor` does not match the main process (comm is a truncated
/// path). Prefer `killall` by process name, and relaunch by bundle path / id so
/// `Cursor Tools.app` is never mistaken for Cursor.
#[cfg(target_os = "macos")]
const CURSOR_APP: &str = "/Applications/Cursor.app";
#[cfg(target_os = "macos")]
const CURSOR_BUNDLE_ID: &str = "com.todesktop.230313mzl4w4u92";

#[cfg(target_os = "macos")]
async fn locate_platform_cursor() -> Result<Option<StoppedCursor>> {
    if !platform_cursor_running().await? {
        return Ok(None);
    }
    Ok(Some(macos_relaunch_target()))
}

#[cfg(target_os = "macos")]
fn macos_relaunch_target() -> StoppedCursor {
    if PathBuf::from(CURSOR_APP).is_dir() {
        return StoppedCursor {
            program: "/usr/bin/open".into(),
            args: vec![CURSOR_APP.into()],
        };
    }
    StoppedCursor {
        program: "/usr/bin/open".into(),
        args: vec!["-b".into(), CURSOR_BUNDLE_ID.into()],
    }
}

#[cfg(target_os = "linux")]
async fn locate_platform_cursor() -> Result<Option<StoppedCursor>> {
    for name in UNIX_NAMES {
        let Some(pid) = oldest_unix_pid(name).await? else {
            continue;
        };
        let environ = std::fs::read(format!("/proc/{pid}/environ")).unwrap_or_default();
        let appimage = environ
            .split(|byte| *byte == 0)
            .find_map(|entry| entry.strip_prefix(b"APPIMAGE="))
            .map(|path| PathBuf::from(String::from_utf8_lossy(path).into_owned()));
        let program = match appimage {
            Some(path) => path,
            None => std::fs::read_link(format!("/proc/{pid}/exe"))?,
        };
        return Ok(Some(StoppedCursor {
            program,
            args: Vec::new(),
        }));
    }
    Ok(None)
}

#[cfg(target_os = "linux")]
async fn oldest_unix_pid(name: &str) -> Result<Option<u32>> {
    let output = Command::new("pgrep")
        .args(["-x", "-o", name])
        .output()
        .await?;
    match output.status.code() {
        Some(0) => Ok(String::from_utf8_lossy(&output.stdout).trim().parse().ok()),
        Some(1) => Ok(None),
        _ => Err(Error::Config(format!(
            "failed to inspect the {name} process"
        ))),
    }
}

#[cfg(target_os = "macos")]
async fn platform_cursor_running() -> Result<bool> {
    // `killall -0` checks existence by process name; unlike `pgrep -x`, it matches
    // the Cursor main process whose `comm` is a truncated executable path.
    let status = Command::new("killall")
        .args(["-0", "Cursor"])
        .status()
        .await?;
    match status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => Err(Error::Config("failed to inspect the Cursor process".into())),
    }
}

#[cfg(target_os = "macos")]
async fn signal_platform_cursor(force: bool) -> Result<()> {
    let mut command = Command::new("killall");
    if force {
        command.arg("-KILL");
    }
    let status = command.arg("Cursor").status().await?;
    if status.success() || status.code() == Some(1) || !platform_cursor_running().await? {
        Ok(())
    } else {
        Err(Error::Config(
            "failed to terminate the Cursor process".into(),
        ))
    }
}

#[cfg(target_os = "linux")]
async fn platform_cursor_running() -> Result<bool> {
    for name in UNIX_NAMES {
        let status = Command::new("pgrep").args(["-x", name]).status().await?;
        match status.code() {
            Some(0) => return Ok(true),
            Some(1) => {}
            _ => {
                return Err(Error::Config(format!(
                    "failed to inspect the {name} process"
                )))
            }
        }
    }
    Ok(false)
}

#[cfg(target_os = "linux")]
async fn signal_platform_cursor(force: bool) -> Result<()> {
    for name in UNIX_NAMES {
        let mut command = Command::new("pkill");
        if force {
            command.arg("-9");
        }
        let status = command.args(["-x", name]).status().await?;
        if !(status.success() || status.code() == Some(1)) {
            return Err(Error::Config(format!(
                "failed to terminate the {name} process"
            )));
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
async fn locate_platform_cursor() -> Result<Option<StoppedCursor>> {
    match tokio::task::spawn_blocking(windows_cursor_exe_path).await {
        Ok(Ok(Some(path))) => {
            return Ok(Some(StoppedCursor {
                program: path,
                args: Vec::new(),
            }));
        }
        Ok(Ok(None)) => {}
        Ok(Err(error)) => {
            tracing::warn!(%error, "native Cursor.exe lookup failed; trying PowerShell");
        }
        Err(error) => {
            tracing::warn!(%error, "native Cursor.exe lookup task failed; trying PowerShell");
        }
    }
    match locate_cursor_via_powershell().await {
        Ok(found) => Ok(found),
        Err(error) => {
            // 查不到进程时按未运行处理，仍允许写入代理设置；不要让整次状态查询失败。
            tracing::warn!(%error, "PowerShell Cursor.exe lookup failed; treating as not running");
            Ok(None)
        }
    }
}

#[cfg(target_os = "windows")]
async fn locate_cursor_via_powershell() -> Result<Option<StoppedCursor>> {
    let powershell = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
        .join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
    let mut query = Command::new(powershell);
    hide_console(&mut query);
    let output = query
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$ErrorActionPreference='SilentlyContinue'; Get-Process -Name Cursor | Where-Object { $_.Path } | Select-Object -First 1 -ExpandProperty Path",
        ])
        .output()
        .await
        .map_err(|error| {
            Error::Config(format!("failed to inspect the Cursor.exe process: {error}"))
        })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(Error::Config(format!(
            "failed to inspect the Cursor.exe process{}",
            if stderr.trim().is_empty() {
                String::new()
            } else {
                format!(": {}", stderr.trim())
            }
        )));
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    if path.is_empty() {
        return Ok(None);
    }
    Ok(Some(StoppedCursor {
        program: PathBuf::from(path),
        args: Vec::new(),
    }))
}

#[cfg(target_os = "windows")]
fn windows_cursor_exe_path() -> Result<Option<PathBuf>> {
    use std::{
        ffi::OsString,
        mem::{size_of, zeroed},
        os::windows::ffi::OsStringExt,
    };

    use windows_sys::Win32::{
        Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
                TH32CS_SNAPPROCESS,
            },
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
    };

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(Error::Config(format!(
                "failed to inspect the Cursor.exe process: {}",
                std::io::Error::last_os_error()
            )));
        }
        struct Handle(*mut core::ffi::c_void);
        impl Drop for Handle {
            fn drop(&mut self) {
                unsafe {
                    CloseHandle(self.0);
                }
            }
        }
        let _snapshot = Handle(snapshot);

        let mut entry: PROCESSENTRY32W = zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snapshot, &mut entry) == 0 {
            return Err(Error::Config(format!(
                "failed to inspect the Cursor.exe process: {}",
                std::io::Error::last_os_error()
            )));
        }

        loop {
            let name = {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                OsString::from_wide(&entry.szExeFile[..len])
                    .to_string_lossy()
                    .to_ascii_lowercase()
            };
            if name == "cursor.exe" {
                let process =
                    OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, entry.th32ProcessID);
                if !process.is_null() {
                    let _process = Handle(process);
                    let mut buffer = vec![0u16; 1024];
                    let mut size = buffer.len() as u32;
                    if QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut size) != 0 {
                        let path = PathBuf::from(OsString::from_wide(&buffer[..size as usize]));
                        if !path.as_os_str().is_empty() {
                            return Ok(Some(path));
                        }
                    }
                }
            }
            if Process32NextW(snapshot, &mut entry) == 0 {
                break;
            }
        }
    }
    Ok(None)
}

#[cfg(target_os = "windows")]
async fn platform_cursor_running() -> Result<bool> {
    match tokio::task::spawn_blocking(|| windows_cursor_exe_path().map(|path| path.is_some())).await
    {
        Ok(Ok(running)) => return Ok(running),
        Ok(Err(error)) => {
            tracing::warn!(%error, "native Cursor.exe running check failed; trying tasklist");
        }
        Err(error) => {
            tracing::warn!(%error, "native Cursor.exe running check task failed; trying tasklist");
        }
    }

    let mut list = Command::new("tasklist");
    hide_console(&mut list);
    let processes = match list
        .args(["/FI", "IMAGENAME eq Cursor.exe", "/NH", "/FO", "CSV"])
        .output()
        .await
    {
        Ok(output) => output,
        Err(error) => {
            tracing::warn!(%error, "tasklist Cursor.exe check failed; treating as not running");
            return Ok(false);
        }
    };
    if !processes.status.success() {
        tracing::warn!("tasklist Cursor.exe check returned non-zero; treating as not running");
        return Ok(false);
    }
    Ok(String::from_utf8_lossy(&processes.stdout)
        .to_ascii_lowercase()
        .contains("cursor.exe"))
}

#[cfg(target_os = "windows")]
async fn signal_platform_cursor(_force: bool) -> Result<()> {
    let mut kill = Command::new("taskkill");
    hide_console(&mut kill);
    let terminated = kill
        .args(["/F", "/T", "/IM", "Cursor.exe"])
        .status()
        .await?;
    if terminated.success() || !platform_cursor_running().await? {
        Ok(())
    } else {
        Err(Error::Config(
            "failed to terminate the Cursor.exe process".into(),
        ))
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
async fn locate_platform_cursor() -> Result<Option<StoppedCursor>> {
    Err(Error::Config(format!(
        "restarting Cursor is unsupported on {}",
        std::env::consts::OS
    )))
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
async fn platform_cursor_running() -> Result<bool> {
    Ok(false)
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
async fn signal_platform_cursor(_force: bool) -> Result<()> {
    Ok(())
}
