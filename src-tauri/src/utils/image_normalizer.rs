use image::{DynamicImage, GenericImageView};

pub fn normalize_image(img: DynamicImage) -> DynamicImage {
    // 1. Convert to RGB (removes alpha channel and potential CMYK issues)
    let rgb_img = img.to_rgb8();
    let dynamic_rgb = DynamicImage::ImageRgb8(rgb_img);
    
    // 2. Resize to 256x256 (standardize for processing)
    // Using Triangle filter for speed/quality balance in normalization
    dynamic_rgb.thumbnail_exact(256, 256)
}

pub fn get_dimensions(img: &DynamicImage) -> (u32, u32) {
    img.dimensions()
}
