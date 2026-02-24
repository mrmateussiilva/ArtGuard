use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageMetadata {
    pub phash: String,
    pub sha256: String,
    pub name: String,
    pub path: PathBuf,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size_bytes: u64,
    pub modified_at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageIndex {
    pub version: String,
    pub generated_at: u64,
    pub images: Vec<ImageMetadata>,
}

impl ImageIndex {
    pub fn new() -> Self {
        Self {
            version: "1.0".to_string(),
            generated_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            images: Vec::new(),
        }
    }
}
