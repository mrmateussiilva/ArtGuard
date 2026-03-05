//! Leitura de DPI/resolução a partir de metadados de imagem (EXIF para JPEG/TIFF, pHYs para PNG).

use std::path::Path;

/// Retorna (dpi_x, dpi_y) se encontrado nos metadados do arquivo.
pub fn read_dpi_from_path(path: &Path) -> Option<(f32, f32)> {
    let bytes = std::fs::read(path).ok()?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase());
    read_dpi_from_bytes(&bytes, ext.as_deref())
}

/// Retorna (dpi_x, dpi_y) se encontrado. format_hint: "jpg", "png", "tiff", etc.
pub fn read_dpi_from_bytes(bytes: &[u8], format_hint: Option<&str>) -> Option<(f32, f32)> {
    match format_hint {
        Some("png") => read_dpi_png(bytes),
        Some("jpg") | Some("jpeg") | Some("tiff") | Some("tif") => read_dpi_exif(bytes),
        _ => {
            // Detectar pelo magic
            if bytes.len() >= 8 {
                if &bytes[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
                    return read_dpi_png(bytes);
                }
                if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xD8 {
                    return read_dpi_exif(bytes);
                }
                if (bytes[0..4] == [0x49, 0x49, 0x2A, 0x00])
                    || (bytes[0..4] == [0x4D, 0x4D, 0x00, 0x2A])
                {
                    return read_dpi_exif(bytes);
                }
            }
            read_dpi_exif(bytes).or_else(|| read_dpi_png(bytes))
        }
    }
}

/// DPI a partir de EXIF (JPEG/TIFF). Tags 282 (XResolution), 283 (YResolution), 296 (ResolutionUnit).
fn read_dpi_exif(bytes: &[u8]) -> Option<(f32, f32)> {
    let exif = rexif::parse_buffer(bytes).ok()?;
    let mut x_res = None::<f32>;
    let mut y_res = None::<f32>;
    let mut unit = 2u16; // default: inches

    for entry in &exif.entries {
        match entry.tag {
            rexif::ExifTag::XResolution => {
                x_res = entry.value.to_f64(0).map(|f| f as f32);
            }
            rexif::ExifTag::YResolution => {
                y_res = entry.value.to_f64(0).map(|f| f as f32);
            }
            rexif::ExifTag::ResolutionUnit => {
                if let rexif::TagValue::U16(v) = &entry.value {
                    if let Some(&u) = v.first() {
                        unit = u;
                    }
                }
            }
            _ => {}
        }
    }

    let x = x_res?;
    let y = y_res?;
    // ResolutionUnit: 1 = no unit, 2 = inches (DPI), 3 = cm (DPCM)
    let (dpi_x, dpi_y) = match unit {
        3 => (x * 2.54, y * 2.54), // DPCM -> DPI
        _ => (x, y),
    };
    Some((dpi_x, dpi_y))
}

/// DPI a partir do chunk pHYs do PNG (pixels per meter -> DPI).
fn read_dpi_png(bytes: &[u8]) -> Option<(f32, f32)> {
    const PNG_SIG_LEN: usize = 8;
    if bytes.len() < PNG_SIG_LEN + 12 {
        return None;
    }
    if &bytes[0..PNG_SIG_LEN] != [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        return None;
    }
    let mut pos = PNG_SIG_LEN;
    while pos + 12 <= bytes.len() {
        let length = u32::from_be_bytes([bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]]) as usize;
        let chunk_type = &bytes[pos + 4..pos + 8];
        pos += 8;
        if chunk_type == b"pHYs" && length >= 9 {
            let x_ppm = u32::from_be_bytes([bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]]) as f32;
            let y_ppm = u32::from_be_bytes([bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]]) as f32;
            let _unit = bytes[pos + 8]; // 0 = unknown, 1 = meter
            // 1 inch = 0.0254 m => 1 m = 1/0.0254 inches => pixels per inch = ppm * 0.0254
            let dpi_x = x_ppm * 0.0254;
            let dpi_y = y_ppm * 0.0254;
            return Some((dpi_x, dpi_y));
        }
        pos += length + 4; // skip data + CRC
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_png_phys() {
        // Minimal PNG with pHYs 300, 300 (pixels per meter) -> 300*0.0254 = 7.62 DPI (tiny test value)
        let mut png = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        png.extend_from_slice(&(9u32.to_be_bytes())); // length
        png.extend_from_slice(b"pHYs");
        png.extend_from_slice(&(300u32.to_be_bytes())); // x
        png.extend_from_slice(&(300u32.to_be_bytes())); // y
        png.push(1); // meter
        png.extend_from_slice(&[0u8; 4]); // crc
        let (x, y) = read_dpi_png(&png).unwrap();
        assert!((x - 7.62).abs() < 0.01);
        assert!((y - 7.62).abs() < 0.01);
    }
}
