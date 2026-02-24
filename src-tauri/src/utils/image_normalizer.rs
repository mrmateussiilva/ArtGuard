use image::{DynamicImage, GenericImageView, imageops::FilterType};

pub fn normalize_image(img: DynamicImage) -> DynamicImage {
    // 1. Convert to RGB (removes alpha channel and potential CMYK issues)
    let rgb_img = img.to_rgb8();
    let dynamic_rgb = DynamicImage::ImageRgb8(rgb_img);
    
    // 2. Resize to 256x256 using HIGH QUALITY filter (Lanczos3)
    // Preserving aspect ratio is good, but for pHash specifically, 
    // standardization is often done to a fixed grid. 
    // However, keeping proportions helps avoid feature distortion.
    // Let's use resize with Lanczos3 which is much more robust than thumbnail's Nearest.
    dynamic_rgb.resize(256, 256, FilterType::Lanczos3)
}


