//! Operações em imagens: recorte em partes e desenho de texto em região.

use image::{DynamicImage, GenericImageView, ImageFormat, Rgba};
use imageproc::drawing::draw_text_mut;
use rusttype::Scale;
use std::path::Path;

/// Região de recorte em pixels: (x, y, width, height).
#[derive(serde::Deserialize)]
pub struct CropRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// Recorta a imagem em várias partes e salva cada uma em output_dir.
/// Retorna a lista de caminhos dos arquivos gerados (output_basename_0.ext, output_basename_1.ext, ...).
#[tauri::command]
pub async fn crop_image_into_parts(
    source_path: String,
    output_dir: String,
    regions: Vec<CropRegion>,
    output_basename: String,
) -> Result<Vec<String>, String> {
    if regions.is_empty() {
        return Ok(vec![]);
    }
    let path = Path::new(&source_path);
    let img = image::open(path).map_err(|e| format!("Erro ao abrir imagem: {}", e))?;
    let (w, h) = img.dimensions();
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let format = match ext.as_str() {
        "jpg" | "jpeg" => ImageFormat::Jpeg,
        "png" => ImageFormat::Png,
        "webp" => ImageFormat::WebP,
        "bmp" => ImageFormat::Bmp,
        _ => ImageFormat::Png,
    };

    let out = Path::new(&output_dir);
    if !out.exists() {
        std::fs::create_dir_all(out).map_err(|e| format!("Erro ao criar pasta: {}", e))?;
    }

    let mut saved = Vec::with_capacity(regions.len());
    for (i, r) in regions.iter().enumerate() {
        if r.x + r.width > w || r.y + r.height > h {
            return Err(format!(
                "Região {} fora dos limites da imagem ({}x{}): x={} y={} w={} h={}",
                i, w, h, r.x, r.y, r.width, r.height
            ));
        }
        let rgb = img.to_rgb8();
        let sub = rgb.view(r.x, r.y, r.width, r.height).to_image();
        let out_img = DynamicImage::ImageRgb8(sub);
        let name = format!("{}_{}.{}", output_basename, i, ext);
        let out_path = out.join(&name);
        out_img.save_with_format(&out_path, format)
            .map_err(|e| format!("Erro ao salvar parte {}: {}", i, e))?;
        saved.push(out_path.to_string_lossy().into_owned());
    }
    Ok(saved)
}

/// Escreve texto em uma região da imagem (canto superior esquerdo em x, y).
/// Salva o resultado em output_path. Cor padrão: preto.
#[tauri::command]
pub async fn draw_text_on_image(
    source_path: String,
    output_path: String,
    text: String,
    x: u32,
    y: u32,
    _width: u32,
    _height: u32,
    font_path: String,
    font_size: f32,
) -> Result<(), String> {
    let font_data =
        std::fs::read(&font_path).map_err(|e| format!("Erro ao ler fonte {}: {}", font_path, e))?;
    let font =
        rusttype::Font::try_from_vec(font_data).ok_or_else(|| "Fonte inválida ou formato não suportado".to_string())?;

    let path = Path::new(&source_path);
    let img = image::open(path).map_err(|e| format!("Erro ao abrir imagem: {}", e))?;
    let mut rgba = img.to_rgba8();

    let scale = Scale::uniform(font_size);
    let color = Rgba([0u8, 0u8, 0u8, 255u8]);
    draw_text_mut(&mut rgba, color, x, y, scale, &font, &text);

    let out_img = DynamicImage::ImageRgba8(rgba);
    out_img
        .save(&output_path)
        .map_err(|e| format!("Erro ao salvar imagem: {}", e))?;
    Ok(())
}
