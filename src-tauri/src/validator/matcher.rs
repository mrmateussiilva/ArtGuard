use crate::models::image_index::{ImageIndex, ImageMetadata};
use crate::indexer::hasher::Hashes;
use crate::validator::scorer::calculate_score;
use log::{debug, error, info, warn};

pub struct MatchResult {
    pub metadata: ImageMetadata,
    pub score: f32,
    pub match_type: String, // "exact" or "perceptual"
}

/// Minimum perceptual match score (0-100) to consider a match. Callers can override via `find_match_with_min_score`.
const DEFAULT_MIN_MATCH_SCORE: f32 = 50.0;

pub fn find_match(index: &ImageIndex, target_hashes: &Hashes) -> Option<MatchResult> {
    find_match_with_min_score(index, target_hashes, DEFAULT_MIN_MATCH_SCORE)
}

pub fn find_match_with_min_score(
    index: &ImageIndex,
    target_hashes: &Hashes,
    min_score: f32,
) -> Option<MatchResult> {
    debug!(
        "Buscando match para SHA256: {}...{}",
        &target_hashes.sha256[..8.min(target_hashes.sha256.len())],
        &target_hashes.sha256[target_hashes.sha256.len().saturating_sub(8)..]
    );
    debug!("Target pHash: {}", target_hashes.phash);
    debug!("Índice contém {} imagens", index.images.len());

    // 1. Try exact match via SHA256
    if let Some(meta) = index.images.iter().find(|m| m.sha256 == target_hashes.sha256) {
        info!("SHA256 exato encontrado: {}", meta.name);
        return Some(MatchResult {
            metadata: meta.clone(),
            score: 100.0,
            match_type: "exact".to_string(),
        });
    }
    debug!("SHA256 não encontrado, tentando pHash...");

    // 2. Try perceptual match via pHash
    let target_phash = match u64::from_str_radix(&target_hashes.phash, 16) {
        Ok(v) => v,
        Err(e) => {
            error!("Erro ao parsear pHash target '{}': {}", target_hashes.phash, e);
            return None;
        }
    };

    let mut best_match: Option<(ImageMetadata, f32, u32)> = None;

    for meta in &index.images {
        if let Ok(meta_phash) = u64::from_str_radix(&meta.phash, 16) {
            let distance = (target_phash ^ meta_phash).count_ones();
            let score = calculate_score(distance, 64); // 8x8 = 64 bits

            if score >= min_score {
                debug!(
                    "{} → distância: {}/64, score: {:.1}%",
                    meta.name, distance, score
                );
            }

            match best_match {
                None => best_match = Some((meta.clone(), score, distance)),
                Some((_, best_score, _)) if score > best_score => {
                    best_match = Some((meta.clone(), score, distance));
                }
                _ => {}
            }
        }
    }

    match best_match {
        Some((metadata, score, distance)) if score >= min_score => {
            info!(
                "Melhor match: {} (Score: {:.1}%, Distância: {})",
                metadata.name, score, distance
            );
            Some(MatchResult {
                metadata,
                score,
                match_type: "perceptual".to_string(),
            })
        }
        Some((metadata, score, _)) => {
            warn!(
                "Melhor candidato {} descartado (Score: {:.1}% < {}%)",
                metadata.name, score, min_score
            );
            None
        }
        None => {
            debug!("Nenhum candidato encontrado no índice");
            None
        }
    }
}
