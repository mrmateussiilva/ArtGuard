use crate::models::image_index::{ImageIndex, ImageMetadata};
use crate::indexer::hasher::Hashes;
use crate::validator::scorer::calculate_score;

pub struct MatchResult {
    pub metadata: ImageMetadata,
    pub score: f32,
    pub match_type: String, // "exact" or "perceptual"
}

pub fn find_match(index: &ImageIndex, target_hashes: &Hashes) -> Option<MatchResult> {
    println!("[ArtGuard][Matcher] Buscando match para SHA256: {}...{}", &target_hashes.sha256[..8], &target_hashes.sha256[target_hashes.sha256.len()-8..]);
    println!("[ArtGuard][Matcher] Target pHash: {}", target_hashes.phash);
    println!("[ArtGuard][Matcher] Índice contém {} imagens", index.images.len());

    // 1. Try exact match via SHA256
    if let Some(meta) = index.images.iter().find(|m| m.sha256 == target_hashes.sha256) {
        println!("[ArtGuard][Matcher] ✅ SHA256 EXATO encontrado: {}", meta.name);
        return Some(MatchResult {
            metadata: meta.clone(),
            score: 100.0,
            match_type: "exact".to_string(),
        });
    }
    println!("[ArtGuard][Matcher] SHA256 não encontrado, tentando pHash...");

    // 2. Try perceptual match via pHash
    let target_phash = match u64::from_str_radix(&target_hashes.phash, 16) {
        Ok(v) => v,
        Err(e) => {
            println!("[ArtGuard][Matcher] ❌ Erro ao parsear pHash target '{}': {}", target_hashes.phash, e);
            return None;
        }
    };
    
    let mut best_match: Option<(ImageMetadata, f32, u32)> = None;

    for meta in &index.images {
        if let Ok(meta_phash) = u64::from_str_radix(&meta.phash, 16) {
            let distance = (target_phash ^ meta_phash).count_ones();
            let score = calculate_score(distance, 64); // 8x8 = 64 bits

            if score >= 50.0 {
                println!("[ArtGuard][Matcher] 📊 {} → distância: {}/64, score: {:.1}%", meta.name, distance, score);
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

    // Only return matches above a minimum threshold of 50%
    match best_match {
        Some((metadata, score, distance)) if score >= 50.0 => {
            println!("[ArtGuard][Matcher] 🏆 Melhor match: {} (Score: {:.1}%, Distância: {})", metadata.name, score, distance);
            Some(MatchResult {
                metadata,
                score,
                match_type: "perceptual".to_string(),
            })
        }
        Some((metadata, score, _)) => {
            println!("[ArtGuard][Matcher] ⚠️ Melhor candidato {} descartado (Score: {:.1}% < 50%)", metadata.name, score);
            None
        }
        None => {
            println!("[ArtGuard][Matcher] ❌ Nenhum candidato encontrado no índice");
            None
        }
    }
}
