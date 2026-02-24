use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Pedido {
    pub id: Option<u32>,
    pub numero: Option<String>,
    pub cliente: Option<String>,
    pub valor_total: Option<String>, // API returns string "230.00"
    pub status: Option<String>,
    pub data_entrada: Option<String>,
    pub data_entrega: Option<String>,
    pub vendedor: Option<String>,
    pub designer: Option<String>,
    pub items: Option<serde_json::Value>, // API uses 'items'
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
async fn buscar_pedidos(url: String) -> Result<Vec<Pedido>, String> {
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Erro de conexão: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Erro na API: {}", response.status()));
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Erro ao ler corpo da resposta: {}", e))?;

    println!("Corpo recebido (tamanho: {}):", body.len());

    let pedidos: Vec<Pedido> = serde_json::from_str(&body)
        .map_err(|e| format!("Erro ao decodificar JSON: {} | Verifique o terminal para o corpo completo.", e))?;

    Ok(pedidos)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![buscar_pedidos])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
