pub fn calculate_score(distance: u32, bit_count: u32) -> f32 {
    if bit_count == 0 { return 0.0; }
    let score = 100.0 - ((distance as f32 / bit_count as f32) * 100.0);
    score.max(0.0)
}

pub fn is_approved(score: f32, threshold: f32) -> bool {
    score >= threshold
}
