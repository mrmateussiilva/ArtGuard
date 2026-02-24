use std::path::Path;
use sha2::{Sha256, Digest};
use img_hash::{HasherConfig, HashAlg};
use image::DynamicImage;
use crate::utils::image_normalizer::normalize_image;

pub struct Hashes {
    pub phash: String,
    pub sha256: String,
}

pub fn generate_hashes(path: &Path) -> Result<(Hashes, u32, u32), String> {
    let img = image::open(path).map_err(|e| format!("Failed to open image: {}", e))?;
    let (width, height) = (img.width(), img.height());

    // 1. SHA256 of the original file bytes
    let bytes = std::fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let sha256 = format!("{:x}", hasher.finalize());

    // 2. Normalize and generate pHash
    let normalized = normalize_image(img);
    let phash_generator = HasherConfig::new()
        .hash_alg(HashAlg::Mean)
        .hash_size(8, 8) // 64 bits as requested
        .to_hasher();
    
    let hash = phash_generator.hash_image(&normalized);
    let phash = format!("{:x}", hash);

    Ok((Hashes { phash, sha256 }, width, height))
}
