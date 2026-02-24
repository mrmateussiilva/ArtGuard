use crate::models::image_index::{ImageIndex, ImageMetadata};
use crate::indexer::hasher::Hashes;
use crate::validator::scorer::calculate_score;

pub struct MatchResult {
    pub metadata: ImageMetadata,
    pub score: f32,
    pub match_type: String, // "exact" or "perceptual"
}

pub fn find_match(index: &ImageIndex, target_hashes: &Hashes) -> Option<MatchResult> {
    // 1. Try exact match via SHA256
    if let Some(meta) = index.images.iter().find(|m| m.sha256 == target_hashes.sha256) {
        return Some(MatchResult {
            metadata: meta.clone(),
            score: 100.0,
            match_type: "exact".to_string(),
        });
    }

    // 2. Try perceptual match via pHash
    let target_phash = u64::from_str_radix(&target_hashes.phash, 16).ok()?;
    
    let mut best_match: Option<(ImageMetadata, f32)> = None;

    for meta in &index.images {
        if let Ok(meta_phash) = u64::from_str_radix(&meta.phash, 16) {
            let distance = (target_phash ^ meta_phash).count_ones();
            let score = calculate_score(distance, 64); // 8x8 = 64 bits

            match best_match {
                None => best_match = Some((meta.clone(), score)),
                Some((_, best_score)) if score > best_score => {
                    best_match = Some((meta.clone(), score));
                }
                _ => {}
            }
        }
    }

    best_match.map(|(metadata, score)| MatchResult {
        metadata,
        score,
        match_type: "perceptual".to_string(),
    })
}
