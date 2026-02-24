use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub fn scan_directory(path: &Path) -> Vec<PathBuf> {
    let extensions = ["tiff", "tif", "png", "jpg", "jpeg"];
    
    WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            if !e.file_type().is_file() { return false; }
            let ext = e.path().extension()
                .and_then(|s| s.to_str())
                .map(|s| s.to_lowercase());
            
            if let Some(ext) = ext {
                extensions.contains(&ext.as_str())
            } else {
                false
            }
        })
        .map(|e| e.path().to_path_buf())
        .collect()
}
