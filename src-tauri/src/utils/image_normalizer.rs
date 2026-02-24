use image::{DynamicImage, GenericImageView};

pub fn normalize_image(img: DynamicImage) -> DynamicImage {
    // 1. Convert to RGB (removes alpha channel and potential CMYK issues)
    let rgb_img = img.to_rgb8();
    let dynamic_rgb = DynamicImage::ImageRgb8(rgb_img);
    
    // 2. Resize to fit within 256x256 while PRESERVING aspect ratio
    // Using thumbnail (not thumbnail_exact) to avoid distortion
    dynamic_rgb.thumbnail(256, 256)
}

pub fn get_dimensions(img: &DynamicImage) -> (u32, u32) {
    img.dimensions()
}
