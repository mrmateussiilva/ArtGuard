use crate::models::image_index::{ImageIndex, ImageMetadata};
use crate::indexer::scanner::scan_directory;
use crate::indexer::hasher::generate_hashes;
use crate::indexer::writer::save_index;
use crate::utils::dpi::read_dpi_from_path;
use rayon::prelude::*;
use std::path::Path;
use std::time::SystemTime;

#[tauri::command]
pub async fn index_storage(storage_path: String) -> Result<String, String> {
    let path = Path::new(&storage_path);
    if !path.exists() {
        return Err("Storage path does not exist".to_string());
    }

    // Load existing index if any to check for modified_at (for expansion)
    // For now, let's focus on the clean indexing as requested.
    
    let files = scan_directory(path);
    let total_files = files.len();

    let images: Vec<ImageMetadata> = files.into_par_iter().filter_map(|p| {
        if let Ok((hashes, width, height)) = generate_hashes(&p) {
            let metadata = std::fs::metadata(&p).ok();
            let modified = metadata.as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            
            let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
            let format = p.extension().and_then(|s| s.to_str()).unwrap_or("unknown").to_string();
            let (dpi_x, dpi_y) = read_dpi_from_path(&p).map(|(x, y)| (Some(x), Some(y))).unwrap_or((None, None));

            Some(ImageMetadata {
                phash: hashes.phash,
                sha256: hashes.sha256,
                name: p.file_name().and_then(|s| s.to_str()).unwrap_or("unknown").to_string(),
                path: p,
                width,
                height,
                dpi_x,
                dpi_y,
                format,
                size_bytes: size,
                modified_at: modified,
            })
        } else {
            None
        }
    }).collect();

    let mut index = ImageIndex::new();
    index.images = images;

    save_index(&index, path)?;

    Ok(format!("Successfully indexed {} images", total_files))
}
