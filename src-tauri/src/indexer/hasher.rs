use std::path::Path;
use sha2::{Sha256, Digest};
use img_hash::{HasherConfig, HashAlg};
use image::GenericImageView;
use crate::utils::image_normalizer::normalize_image;

pub struct Hashes {
    pub phash: String,
    pub sha256: String,
}

pub fn generate_hashes(path: &Path) -> Result<(Hashes, u32, u32), String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;
    generate_hashes_from_memory(&bytes)
}

pub fn generate_hashes_from_memory(bytes: &[u8]) -> Result<(Hashes, u32, u32), String> {
    let img = image::load_from_memory(bytes).map_err(|e| {
        let prefix = if bytes.len() >= 8 { format!("{:02x?}", &bytes[..8]) } else { format!("{:02x?}", bytes) };
        format!("Failed to decode image (len: {}, bytes: {}): {}", bytes.len(), prefix, e)
    })?;
    let (width, height) = (img.width(), img.height());

    // 1. SHA256
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let sha256 = format!("{:x}", hasher.finalize());

    // 2. Normalize and generate pHash
    let normalized = normalize_image(img);
    let phash_generator = HasherConfig::new()
        .hash_alg(HashAlg::Gradient) // Gradient is more robust than Mean
        .hash_size(8, 8)
        .to_hasher();
    
    let hash = phash_generator.hash_image(&normalized);
    let phash = hash.as_bytes().iter().map(|b| format!("{:02x}", b)).collect::<String>();

    Ok((Hashes { phash, sha256 }, width, height))
}
