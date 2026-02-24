use std::path::Path;
use std::fs::File;
use std::io::Write;
use crate::models::image_index::ImageIndex;

pub fn save_index(index: &ImageIndex, storage_path: &Path) -> Result<(), String> {
    let json_path = storage_path.join("index.json");
    let json = serde_json::to_string_pretty(index)
        .map_err(|e| format!("Failed to serialize index: {}", e))?;
    
    let mut file = File::create(json_path)
        .map_err(|e| format!("Failed to create index file: {}", e))?;
    
    file.write_all(json.as_bytes())
        .map_err(|e| format!("Failed to write index: {}", e))?;
    
    Ok(())
}
