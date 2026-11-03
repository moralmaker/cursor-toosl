//! Exposes provider-independent search capabilities.
mod cache;
mod catalog;
mod engine;
mod federation;
mod fetch;
mod search_provider;

pub use cache::{WebCache, WebCacheEntry};
pub use engine::{HtmlEngine, JsonEngine, SearchEngine, SearchHit};
pub use federation::{SearchError, WebSearch};
pub(crate) use fetch::resolve_public_http_url;
pub use fetch::{FetchError, FetchedPage, WebFetch};
pub(crate) use search_provider::execute as execute_semble;
