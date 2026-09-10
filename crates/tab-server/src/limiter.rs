//! Token-bucket limiter keyed by installation ID and client IP.

use std::{
    collections::HashMap,
    sync::atomic::{AtomicBool, AtomicU32, Ordering},
    time::{Duration, Instant},
};

use tokio::sync::Mutex;

use crate::config::RateLimitConfig;

struct Bucket {
    tokens: f64,
    last: Instant,
}

pub struct RateLimiter {
    enabled: AtomicBool,
    device_rate: AtomicU32,
    ip_rate: AtomicU32,
    devices: Mutex<HashMap<String, Bucket>>,
    ips: Mutex<HashMap<String, Bucket>>,
}

impl RateLimiter {
    pub fn new(config: &RateLimitConfig) -> Self {
        Self {
            enabled: AtomicBool::new(config.enabled),
            device_rate: AtomicU32::new(config.per_device_per_minute),
            ip_rate: AtomicU32::new(config.per_ip_per_minute),
            devices: Mutex::new(HashMap::new()),
            ips: Mutex::new(HashMap::new()),
        }
    }

    pub fn update(&self, config: &RateLimitConfig) {
        self.enabled.store(config.enabled, Ordering::Relaxed);
        self.device_rate
            .store(config.per_device_per_minute, Ordering::Relaxed);
        self.ip_rate
            .store(config.per_ip_per_minute, Ordering::Relaxed);
    }

    pub async fn allow(&self, device_id: &str, ip: &str) -> Result<(), Duration> {
        if !self.enabled.load(Ordering::Relaxed) {
            return Ok(());
        }
        let device_rate = self.device_rate.load(Ordering::Relaxed);
        let ip_rate = self.ip_rate.load(Ordering::Relaxed);
        take(&self.devices, device_id, device_rate).await?;
        if let Err(retry) = take(&self.ips, ip, ip_rate).await {
            refund(&self.devices, device_id, device_rate).await;
            return Err(retry);
        }
        Ok(())
    }

    pub async fn cleanup(&self) {
        let cutoff = Instant::now() - Duration::from_secs(120);
        self.devices
            .lock()
            .await
            .retain(|_, bucket| bucket.last > cutoff);
        self.ips
            .lock()
            .await
            .retain(|_, bucket| bucket.last > cutoff);
    }
}

async fn take(
    buckets: &Mutex<HashMap<String, Bucket>>,
    key: &str,
    per_minute: u32,
) -> Result<(), Duration> {
    let mut buckets = buckets.lock().await;
    let now = Instant::now();
    let capacity = f64::from(per_minute.max(1));
    let bucket = buckets.entry(key.to_string()).or_insert(Bucket {
        tokens: capacity,
        last: now,
    });
    refill(bucket, now, capacity);
    if bucket.tokens >= 1.0 {
        bucket.tokens -= 1.0;
        return Ok(());
    }
    let rate_per_sec = capacity / 60.0;
    let wait = ((1.0 - bucket.tokens) / rate_per_sec).ceil() as u64;
    Err(Duration::from_secs(wait.max(1)))
}

async fn refund(buckets: &Mutex<HashMap<String, Bucket>>, key: &str, per_minute: u32) {
    let mut buckets = buckets.lock().await;
    if let Some(bucket) = buckets.get_mut(key) {
        bucket.tokens = (bucket.tokens + 1.0).min(f64::from(per_minute.max(1)));
    }
}

fn refill(bucket: &mut Bucket, now: Instant, capacity: f64) {
    let elapsed = now.saturating_duration_since(bucket.last).as_secs_f64();
    bucket.tokens = (bucket.tokens + elapsed * (capacity / 60.0)).min(capacity);
    bucket.last = now;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn allows_traffic_when_disabled() {
        let limiter = RateLimiter::new(&RateLimitConfig {
            enabled: false,
            per_device_per_minute: 1,
            per_ip_per_minute: 1,
        });
        limiter.allow("device", "127.0.0.1").await.unwrap();
        limiter.allow("device", "127.0.0.1").await.unwrap();
    }

    #[tokio::test]
    async fn rejects_a_second_request_at_one_per_minute() {
        let limiter = RateLimiter::new(&RateLimitConfig {
            enabled: true,
            per_device_per_minute: 1,
            per_ip_per_minute: 100,
        });
        limiter.allow("device", "10.0.0.1").await.unwrap();
        let retry = limiter.allow("device", "10.0.0.1").await.unwrap_err();
        assert!(retry >= Duration::from_secs(1));
    }
}
