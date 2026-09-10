//! Rebuilds Cursor's `x-cursor-checksum` from the Authorization value.

use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};

const CHECKSUM_TIMESTAMP_DIVISOR: i64 = 1_000_000;
const CHECKSUM_INITIAL_SEED: i32 = 165;

pub fn format_bearer_authorization(raw: &str) -> String {
    let value = raw.trim();
    if value.is_empty() {
        return String::new();
    }
    if value.len() >= 7 && value[..7].eq_ignore_ascii_case("bearer ") {
        return value.to_string();
    }
    format!("Bearer {value}")
}

pub fn build_cursor_checksum(authorization: &str, now_ms: i64) -> String {
    let timestamp = now_ms / CHECKSUM_TIMESTAMP_DIVISOR;
    let mut timestamp_bytes = [0_u8; 6];
    for index in 0..timestamp_bytes.len() {
        let shift = (timestamp_bytes.len() - 1 - index) * 8;
        timestamp_bytes[index] = ((timestamp >> shift) & 0xff) as u8;
    }
    let mut seed = CHECKSUM_INITIAL_SEED;
    for (index, byte) in timestamp_bytes.iter_mut().enumerate() {
        let current = (i32::from(*byte) ^ seed) + (index as i32 % 256);
        let current = current & 0xff;
        *byte = current as u8;
        seed = current;
    }
    let prefix = STANDARD
        .encode(timestamp_bytes)
        .trim_end_matches('=')
        .to_string();
    let digest = Sha256::digest(authorization.trim().as_bytes());
    format!("{prefix}{}", hex::encode(&digest[..16]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefixes_a_bare_token() {
        assert_eq!(format_bearer_authorization("abc"), "Bearer abc");
        assert_eq!(format_bearer_authorization("Bearer abc"), "Bearer abc");
        assert_eq!(format_bearer_authorization("bearer abc"), "bearer abc");
    }

    #[test]
    fn checksum_is_stable_for_a_fixed_timestamp() {
        let checksum = build_cursor_checksum("Bearer test", 1_700_000_000_000);
        assert_eq!(checksum, "paaotEjte47800f0be84febf6a4f71ff92d9ddf6");
        assert_eq!(
            build_cursor_checksum("Bearer test", 1_700_000_000_000),
            checksum
        );
        assert_ne!(
            build_cursor_checksum("Bearer other", 1_700_000_000_000),
            checksum
        );
    }
}
