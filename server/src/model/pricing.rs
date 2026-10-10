//! Official per-million-token prices and matching for configured model ids.
//!
//! A configured model uses its custom price when one is saved. Otherwise the
//! model id is matched against this catalog. Unmatched usage stays unpriced.

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TokenPrice {
    pub input_cost_per_million: f64,
    pub output_cost_per_million: f64,
    pub cache_read_cost_per_million: f64,
    pub cache_write_cost_per_million: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PricedUsage {
    pub cost_usd: f64,
    pub unpriced_tokens: i64,
}

struct CatalogEntry {
    id: &'static str,
    price: TokenPrice,
}

const fn price(input: f64, output: f64, cache_read: f64, cache_write: f64) -> TokenPrice {
    TokenPrice {
        input_cost_per_million: input,
        output_cost_per_million: output,
        cache_read_cost_per_million: cache_read,
        cache_write_cost_per_million: cache_write,
    }
}

const CATALOG: &[CatalogEntry] = &[
    CatalogEntry {
        id: "claude-3-5-haiku",
        price: price(0.80, 4.0, 0.08, 1.0),
    },
    CatalogEntry {
        id: "claude-3-5-sonnet",
        price: price(3.0, 15.0, 0.30, 3.75),
    },
    CatalogEntry {
        id: "claude-fable-5",
        price: price(10.0, 50.0, 1.0, 12.5),
    },
    CatalogEntry {
        id: "claude-fable-5-1",
        price: price(10.0, 50.0, 0.25, 12.5),
    },
    CatalogEntry {
        id: "claude-haiku-4-5",
        price: price(1.0, 5.0, 0.10, 1.25),
    },
    CatalogEntry {
        id: "claude-haiku-5-5",
        price: price(0.10, 0.50, 0.01, 0.125),
    },
    CatalogEntry {
        id: "claude-opus-4",
        price: price(15.0, 75.0, 1.50, 18.75),
    },
    CatalogEntry {
        id: "claude-opus-4-1",
        price: price(15.0, 75.0, 1.50, 18.75),
    },
    CatalogEntry {
        id: "claude-opus-4-5",
        price: price(5.0, 25.0, 0.50, 6.25),
    },
    CatalogEntry {
        id: "claude-opus-4-6",
        price: price(5.0, 25.0, 0.50, 6.25),
    },
    CatalogEntry {
        id: "claude-opus-4-7",
        price: price(5.0, 25.0, 0.50, 6.25),
    },
    CatalogEntry {
        id: "claude-opus-4-8",
        price: price(5.0, 25.0, 0.50, 6.25),
    },
    CatalogEntry {
        id: "claude-opus-5",
        price: price(5.0, 25.0, 0.50, 6.25),
    },
    CatalogEntry {
        id: "claude-opus-5-5",
        price: price(4.0, 20.0, 0.20, 5.0),
    },
    CatalogEntry {
        id: "claude-sonnet-4",
        price: price(3.0, 15.0, 0.30, 3.75),
    },
    CatalogEntry {
        id: "claude-sonnet-4-5",
        price: price(3.0, 15.0, 0.30, 3.75),
    },
    CatalogEntry {
        id: "claude-sonnet-4-6",
        price: price(3.0, 15.0, 0.30, 3.75),
    },
    CatalogEntry {
        id: "claude-sonnet-5",
        price: price(2.0, 10.0, 0.20, 2.50),
    },
    CatalogEntry {
        id: "claude-sonnet-5-5",
        price: price(2.0, 10.0, 0.10, 2.50),
    },
    CatalogEntry {
        id: "deepseek-v3",
        price: price(0.28, 1.11, 0.028, 0.0),
    },
    CatalogEntry {
        id: "deepseek-v3.1",
        price: price(0.55, 1.67, 0.055, 0.0),
    },
    CatalogEntry {
        id: "deepseek-v3.2",
        price: price(0.28, 0.42, 0.028, 0.0),
    },
    CatalogEntry {
        id: "deepseek-v4-flash",
        price: price(0.3, 1.2, 0.006, 0.0),
    },
    CatalogEntry {
        id: "deepseek-v4-pro",
        price: price(1.32, 3.96, 0.044, 0.0),
    },
    CatalogEntry {
        id: "gemini-2.0-flash",
        price: price(0.10, 0.40, 0.025, 0.0),
    },
    CatalogEntry {
        id: "gemini-2.5-flash",
        price: price(0.30, 2.50, 0.03, 0.0),
    },
    CatalogEntry {
        id: "gemini-2.5-flash-lite",
        price: price(0.10, 0.40, 0.01, 0.0),
    },
    CatalogEntry {
        id: "gemini-2.5-pro",
        price: price(1.25, 10.0, 0.125, 0.0),
    },
    CatalogEntry {
        id: "gemini-3-flash-preview",
        price: price(0.50, 3.0, 0.05, 0.0),
    },
    CatalogEntry {
        id: "gemini-3-pro-preview",
        price: price(2.0, 12.0, 0.20, 0.0),
    },
    CatalogEntry {
        id: "gemini-3.1-flash-lite",
        price: price(0.25, 1.50, 0.025, 0.0),
    },
    CatalogEntry {
        id: "gemini-3.1-pro-preview",
        price: price(2.0, 12.0, 0.20, 0.0),
    },
    CatalogEntry {
        id: "gemini-3.5-flash",
        price: price(1.50, 9.0, 0.15, 0.0),
    },
    CatalogEntry {
        id: "gemini-3.5-flash-lite",
        price: price(0.30, 2.50, 0.03, 0.0),
    },
    CatalogEntry {
        id: "gemini-3.6-flash",
        price: price(0.75, 3.75, 0.075, 0.0),
    },
    CatalogEntry {
        id: "gemini-3.7-flash",
        price: price(0.75, 3.75, 0.075, 0.0),
    },
    CatalogEntry {
        id: "gemini-3.8-flash",
        price: price(0.75, 3.75, 0.075, 0.0),
    },
    CatalogEntry {
        id: "glm-4.6",
        price: price(0.6, 2.2, 0.11, 0.0),
    },
    CatalogEntry {
        id: "glm-4.7",
        price: price(0.6, 2.2, 0.11, 0.0),
    },
    CatalogEntry {
        id: "glm-5",
        price: price(1.0, 3.2, 0.2, 0.0),
    },
    CatalogEntry {
        id: "glm-5.1",
        price: price(1.4, 4.4, 0.26, 0.0),
    },
    CatalogEntry {
        id: "glm-5.2",
        price: price(1.4, 4.4, 0.26, 0.0),
    },
    CatalogEntry {
        id: "glm-5.3",
        price: price(1.4, 4.4, 0.26, 0.0),
    },
    CatalogEntry {
        id: "glm-5.3-flash",
        price: price(0.15, 0.50, 0.03, 0.0),
    },
    CatalogEntry {
        id: "gpt-4.1",
        price: price(2.0, 8.0, 0.50, 0.0),
    },
    CatalogEntry {
        id: "gpt-4.1-mini",
        price: price(0.40, 1.60, 0.10, 0.0),
    },
    CatalogEntry {
        id: "gpt-4.1-nano",
        price: price(0.10, 0.40, 0.025, 0.0),
    },
    CatalogEntry {
        id: "gpt-4o",
        price: price(2.50, 10.0, 1.25, 0.0),
    },
    CatalogEntry {
        id: "gpt-4o-mini",
        price: price(0.15, 0.60, 0.075, 0.0),
    },
    CatalogEntry {
        id: "gpt-5",
        price: price(1.25, 10.0, 0.125, 0.0),
    },
    CatalogEntry {
        id: "gpt-5-codex",
        price: price(1.25, 10.0, 0.125, 0.0),
    },
    CatalogEntry {
        id: "gpt-5-mini",
        price: price(0.25, 2.0, 0.025, 0.0),
    },
    CatalogEntry {
        id: "gpt-5-nano",
        price: price(0.05, 0.40, 0.005, 0.0),
    },
    CatalogEntry {
        id: "gpt-5.1",
        price: price(1.25, 10.0, 0.125, 0.0),
    },
    CatalogEntry {
        id: "gpt-5.1-codex",
        price: price(1.25, 10.0, 0.125, 0.0),
    },
    CatalogEntry {
        id: "gpt-5.2",
        price: price(1.75, 14.0, 0.175, 0.0),
    },
    CatalogEntry {
        id: "gpt-5.2-codex",
        price: price(1.75, 14.0, 0.175, 0.0),
    },
    CatalogEntry {
        id: "gpt-5.3-codex",
        price: price(1.75, 14.0, 0.175, 0.0),
    },
    CatalogEntry {
        id: "gpt-5.4",
        price: price(2.50, 15.0, 0.25, 0.0),
    },
    CatalogEntry {
        id: "gpt-5.4-mini",
        price: price(0.75, 4.50, 0.075, 0.0),
    },
    CatalogEntry {
        id: "gpt-5.4-nano",
        price: price(0.20, 1.25, 0.02, 0.0),
    },
    CatalogEntry {
        id: "gpt-5.5",
        price: price(5.0, 30.0, 0.50, 0.0),
    },
    CatalogEntry {
        id: "gpt-5.6",
        price: price(4.0, 20.0, 0.40, 5.0),
    },
    CatalogEntry {
        id: "grok-3",
        price: price(3.0, 15.0, 0.75, 0.0),
    },
    CatalogEntry {
        id: "grok-3-mini",
        price: price(0.25, 0.50, 0.075, 0.0),
    },
    CatalogEntry {
        id: "grok-4",
        price: price(3.0, 15.0, 0.75, 0.0),
    },
    CatalogEntry {
        id: "grok-4.3",
        price: price(1.25, 2.50, 0.20, 0.0),
    },
    CatalogEntry {
        id: "grok-4.5",
        price: price(2.0, 6.0, 0.30, 0.0),
    },
    CatalogEntry {
        id: "grok-4.6",
        price: price(2.0, 6.0, 0.50, 0.0),
    },
    CatalogEntry {
        id: "grok-4.7",
        price: price(2.0, 6.0, 0.50, 0.0),
    },
    CatalogEntry {
        id: "k3",
        price: price(3.0, 15.0, 0.30, 0.0),
    },
    CatalogEntry {
        id: "kimi-for-coding",
        price: price(0.95, 4.0, 0.19, 0.0),
    },
    CatalogEntry {
        id: "kimi-k2.5",
        price: price(0.60, 3.0, 0.10, 0.0),
    },
    CatalogEntry {
        id: "kimi-k2.6",
        price: price(0.95, 4.0, 0.16, 0.0),
    },
    CatalogEntry {
        id: "kimi-k2.7-code",
        price: price(0.95, 4.0, 0.19, 0.0),
    },
    CatalogEntry {
        id: "kimi-k3",
        price: price(3.0, 15.0, 0.30, 0.0),
    },
    CatalogEntry {
        id: "minimax-m2",
        price: price(0.30, 1.20, 0.03, 0.375),
    },
    CatalogEntry {
        id: "minimax-m2.5",
        price: price(0.30, 1.20, 0.03, 0.375),
    },
    CatalogEntry {
        id: "minimax-m2.7",
        price: price(0.30, 1.20, 0.06, 0.375),
    },
    CatalogEntry {
        id: "minimax-m3",
        price: price(0.30, 1.20, 0.06, 0.0),
    },
    CatalogEntry {
        id: "qwen3-32b",
        price: price(0.16, 0.64, 0.0, 0.0),
    },
    CatalogEntry {
        id: "qwen3-max",
        price: price(0.78, 3.90, 0.0, 0.0),
    },
    CatalogEntry {
        id: "qwen3.5-plus",
        price: price(0.26, 1.56, 0.052, 0.0),
    },
    CatalogEntry {
        id: "qwen3.7-max",
        price: price(2.50, 7.50, 0.25, 0.0),
    },
    CatalogEntry {
        id: "qwen3.7-plus",
        price: price(0.40, 1.60, 0.08, 0.0),
    },
    CatalogEntry {
        id: "qwen3.8-27b",
        price: price(0.50, 3.0, 0.10, 0.625),
    },
    CatalogEntry {
        id: "qwen3.8-max",
        price: price(2.0, 6.0, 0.25, 2.50),
    },
];

pub fn official_prices() -> impl Iterator<Item = (&'static str, TokenPrice)> {
    CATALOG.iter().map(|entry| (entry.id, entry.price))
}

pub fn official_price(model_id: &str) -> Option<TokenPrice> {
    let candidates = pricing_candidates(model_id);
    for candidate in &candidates {
        if let Some(entry) = CATALOG.iter().find(|entry| entry.id == candidate) {
            return Some(entry.price);
        }
    }
    for candidate in &candidates {
        if !prefix_match_allowed(candidate) {
            continue;
        }
        let matched = CATALOG
            .iter()
            .filter(|entry| {
                entry
                    .id
                    .strip_prefix(candidate.as_str())
                    .is_some_and(|rest| rest.starts_with('-'))
            })
            .min_by_key(|entry| entry.id.len());
        if let Some(entry) = matched {
            return Some(entry.price);
        }
    }
    None
}

pub fn price_usage(
    model_id: &str,
    custom: Option<TokenPrice>,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_write_tokens: i64,
) -> PricedUsage {
    let tokens = input_tokens
        .saturating_add(output_tokens)
        .saturating_add(cache_read_tokens)
        .saturating_add(cache_write_tokens);
    let Some(price) = custom.or_else(|| official_price(model_id)) else {
        return PricedUsage {
            cost_usd: 0.0,
            unpriced_tokens: tokens,
        };
    };
    let cost_usd = (input_tokens as f64 * price.input_cost_per_million
        + output_tokens as f64 * price.output_cost_per_million
        + cache_read_tokens as f64 * price.cache_read_cost_per_million
        + cache_write_tokens as f64 * price.cache_write_cost_per_million)
        / 1_000_000.0;
    PricedUsage {
        cost_usd,
        unpriced_tokens: 0,
    }
}

fn pricing_candidates(model_id: &str) -> Vec<String> {
    let cleaned = clean_model_id(model_id);
    if cleaned.is_empty() || matches!(cleaned.as_str(), "unknown" | "null" | "none") {
        return Vec::new();
    }
    let mut candidates = Vec::new();
    let mut queue = vec![cleaned];
    while let Some(candidate) = queue.pop() {
        if candidate.is_empty() || candidates.iter().any(|existing| existing == &candidate) {
            continue;
        }
        if let Some(stripped) = strip_date_suffix(&candidate) {
            queue.push(stripped);
        }
        if let Some(stripped) = strip_effort_suffix(&candidate) {
            queue.push(stripped);
        }
        if candidate.starts_with("claude-") && candidate.contains('.') {
            queue.push(candidate.replace('.', "-"));
        }
        candidates.push(candidate);
    }
    candidates
}

fn clean_model_id(model_id: &str) -> String {
    model_id
        .rsplit_once('/')
        .map_or(model_id, |(_, rest)| rest)
        .split(':')
        .next()
        .unwrap_or(model_id)
        .trim()
        .replace('@', "-")
        .to_ascii_lowercase()
}

fn strip_date_suffix(model_id: &str) -> Option<String> {
    let bytes = model_id.as_bytes();
    if bytes.len() > 11 {
        let start = bytes.len() - 11;
        let suffix = &bytes[start..];
        let iso = suffix[0] == b'-'
            && suffix[1..5].iter().all(u8::is_ascii_digit)
            && suffix[5] == b'-'
            && suffix[6..8].iter().all(u8::is_ascii_digit)
            && suffix[8] == b'-'
            && suffix[9..11].iter().all(u8::is_ascii_digit);
        if iso {
            return Some(model_id[..start].to_string());
        }
    }
    let (base, suffix) = model_id.rsplit_once('-')?;
    if base.is_empty() || !suffix.chars().all(|character| character.is_ascii_digit()) {
        return None;
    }
    if suffix.len() == 8 {
        return Some(base.to_string());
    }
    if suffix.len() == 6 {
        let month: u32 = suffix[2..4].parse().unwrap_or(0);
        let day: u32 = suffix[4..6].parse().unwrap_or(0);
        if (1..=12).contains(&month) && (1..=31).contains(&day) {
            return Some(base.to_string());
        }
    }
    None
}

fn strip_effort_suffix(model_id: &str) -> Option<String> {
    for suffix in ["-minimal", "-low", "-medium", "-high", "-xhigh"] {
        if let Some(stripped) = model_id.strip_suffix(suffix) {
            if !stripped.is_empty() {
                return Some(stripped.to_string());
            }
        }
    }
    None
}

fn prefix_match_allowed(model_id: &str) -> bool {
    let dashes = model_id.matches('-').count();
    if model_id.starts_with("claude-") {
        return dashes >= 3;
    }
    if [
        "gpt-",
        "gemini-",
        "deepseek-",
        "qwen",
        "glm-",
        "kimi-",
        "minimax-",
        "grok-",
    ]
    .iter()
    .any(|prefix| model_id.starts_with(prefix))
    {
        return dashes >= 2;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_dated_and_effort_ids_use_the_canonical_price() {
        let opus = official_price("claude-opus-4-7").unwrap();
        assert_eq!(
            official_price("anthropic/claude-opus-4-7-20260501").unwrap(),
            opus
        );
        assert_eq!(official_price("claude-opus-4-7-high").unwrap(), opus);
        assert_eq!(
            official_price("MiniMax-M3").unwrap().input_cost_per_million,
            0.30
        );
    }

    #[test]
    fn unknown_model_stays_unpriced_and_custom_price_wins() {
        let usage = price_usage("relay-private", None, 1_000_000, 0, 0, 0);
        assert_eq!(usage.cost_usd, 0.0);
        assert_eq!(usage.unpriced_tokens, 1_000_000);
        let custom = price(1.0, 2.0, 0.0, 0.0);
        let priced = price_usage("relay-private", Some(custom), 1_000_000, 1_000_000, 0, 0);
        assert_eq!(priced.cost_usd, 3.0);
        assert_eq!(priced.unpriced_tokens, 0);
    }
}
