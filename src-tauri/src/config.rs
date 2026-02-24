use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ValidationConfig {
    pub threshold_approved: f32,
    pub threshold_attention: f32,
    pub min_dpi: u32,
    pub accepted_formats: Vec<String>,
    pub hash_algorithm: String,
    pub hash_size: u32,
    pub normalize_size: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub api_url: String,
    pub storage_path: String,
    pub validation: ValidationConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            api_url: "http://localhost:8000/pedidos/".to_string(),
            storage_path: "".to_string(),
            validation: ValidationConfig {
                threshold_approved: 90.0,
                threshold_attention: 70.0,
                min_dpi: 150,
                accepted_formats: vec![
                    "png".to_string(),
                    "jpg".to_string(),
                    "jpeg".to_string(),
                    "tiff".to_string(),
                    "webp".to_string(),
                ],
                hash_algorithm: "Mean".to_string(),
                hash_size: 8,
                normalize_size: 256,
            },
        }
    }
}

pub fn get_config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("Falha ao obter diretório de config: {}", e))?;
    
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| format!("Falha ao criar diretório de config: {}", e))?;
    }
    
    path.push("artguard_config.json");
    Ok(path)
}

pub fn load_config(path: &Path) -> AppConfig {
    if !path.exists() {
        return AppConfig::default();
    }

    let content = fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&content).unwrap_or_else(|_| AppConfig::default())
}

pub fn save_config(path: &Path, config: &AppConfig) -> Result<(), String> {
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Falha ao serializar config: {}", e))?;
    
    fs::write(path, content).map_err(|e| format!("Falha ao gravar config no disco: {}", e))?;
    Ok(())
}
