use std::path::{Path, PathBuf};
use img_hash::{HasherConfig, HashAlg, ImageHash};
use walkdir::WalkDir;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SimilarImageResult {
    pub file_path: PathBuf,
    pub distance: u32,
    pub similarity_score: f32,
}

pub fn generate_hash(path: &Path) -> Result<ImageHash, String> {
    let img = image::open(path).map_err(|e| format!("Falha ao abrir imagem: {}", e))?;
    let hasher = HasherConfig::new()
        .hash_alg(HashAlg::Gradient)
        .hash_size(8, 8)
        .to_hasher();
    
    Ok(hasher.hash_image(&img))
}

pub fn compare_hashes(h1: &ImageHash, h2: &ImageHash) -> u32 {
    h1.dist(h2)
}

pub fn find_most_similar(
    reference_path: &Path, 
    storage_path: &Path, 
    threshold: u32
) -> Option<SimilarImageResult> {
    let ref_hash = match generate_hash(reference_path) {
        Ok(hash) => hash,
        Err(e) => {
            println!("Erro ao gerar hash da referência: {}", e);
            return None;
        }
    };

    let mut best_match: Option<(PathBuf, u32)> = None;
    let extensions = ["tif", "tiff", "png", "jpg", "jpeg"];

    for entry in WalkDir::new(storage_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        
        if path.is_file() {
            let ext = path.extension()
                .and_then(|s| s.to_str())
                .map(|s| s.to_lowercase());

            if let Some(ext) = ext {
                if extensions.contains(&ext.as_str()) {
                    if let Ok(current_hash) = generate_hash(path) {
                        let distance = compare_hashes(&ref_hash, &current_hash);
                        
                        if distance <= threshold {
                            match best_match {
                                None => best_match = Some((path.to_path_buf(), distance)),
                                Some((_, best_dist)) if distance < best_dist => {
                                    best_match = Some((path.to_path_buf(), distance));
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }

    best_match.map(|(path, distance)| {
        // Simple similarity score: (hash_bits - distance) / hash_bits
        // Hash size is 8x8 = 64 bits
        let bit_count = 64.0;
        let score = (bit_count - distance as f32) / bit_count * 100.0;
        
        SimilarImageResult {
            file_path: path,
            distance,
            similarity_score: score,
        }
    })
}
