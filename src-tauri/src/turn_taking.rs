// src-tauri/src/turn_taking.rs
// Psychological Turn-Taking Model (Formula 3) calculations.

#[derive(serde::Deserialize, Clone)]
pub struct Bot {
    pub id: i64,
    pub name: String,
    pub personality: Option<String>,
    #[allow(dead_code)]
    pub scenario: Option<String>,
}

#[derive(serde::Deserialize, Clone)]
pub struct Message {
    pub sender_name: String,
    pub sender_type: String,
    pub content: String,
}

fn is_word_match(text: &str, word: &str) -> bool {
    let text_lower = text.to_lowercase();
    let word_lower = word.to_lowercase();

    let mut start = 0;
    while let Some(pos) = text_lower[start..].find(&word_lower) {
        let abs_pos = start + pos;
        let before_ok = abs_pos == 0
            || !text_lower
                .chars()
                .nth(abs_pos - 1)
                .unwrap_or(' ')
                .is_alphanumeric();
        let end_pos = abs_pos + word_lower.len();
        let after_ok = end_pos == text_lower.len()
            || !text_lower
                .chars()
                .nth(end_pos)
                .unwrap_or(' ')
                .is_alphanumeric();

        if before_ok && after_ok {
            return true;
        }
        start = abs_pos + 1;
    }
    false
}

fn get_comfort_level(bio: &str, other: &str, assertiveness: f32) -> f32 {
    let bio = bio.to_lowercase();
    let other = other.to_lowercase();

    if bio.contains(&format!("best friend with {}", other))
        || bio.contains(&format!("best friends with {}", other))
        || bio.contains(&format!("best friend of {}", other))
        || bio.contains(&format!("best friends of {}", other))
        || bio.contains(&format!("closest to {}", other))
    {
        return 0.95;
    }
    if bio.contains(&format!("dating {}", other))
        || bio.contains(&format!("in a relationship with {}", other))
    {
        return 0.90;
    }
    if bio.contains(&format!("childhood friend with {}", other))
        || bio.contains(&format!("childhood friend of {}", other))
        || bio.contains(&format!("childhood friend {}", other))
    {
        return 0.85;
    }
    if bio.contains(&format!("friend with {}", other))
        || bio.contains(&format!("friends with {}", other))
        || bio.contains(&format!("friend of {}", other))
        || bio.contains(&format!("friends of {}", other))
        || bio.contains(&format!("likes {}", other))
    {
        return 0.80;
    }
    if bio.contains(&format!("terrified of {}", other))
        || bio.contains(&format!("afraid of {}", other))
        || bio.contains(&format!("fears {}", other))
    {
        return 0.15;
    }
    if bio.contains(&format!("enemy with {}", other))
        || bio.contains(&format!("enemies with {}", other))
        || bio.contains(&format!("enemy of {}", other))
        || bio.contains(&format!("enemies of {}", other))
        || bio.contains(&format!("hates {}", other))
    {
        return 0.10;
    }
    if bio.contains(&format!("rival with {}", other))
        || bio.contains(&format!("rivals with {}", other))
        || bio.contains(&format!("rival of {}", other))
        || bio.contains(&format!("rivals of {}", other))
        || bio.contains(&format!("competitive with {}", other))
    {
        return 0.20;
    }
    if bio.contains(&format!("looks up to {}", other))
        || bio.contains(&format!("admires {}", other))
    {
        return 0.50;
    }
    if bio.contains(&format!("boss of {}", other))
        || bio.contains(&format!("{} is the leader", other))
    {
        if assertiveness < 0.3 {
            return 0.10;
        } else {
            return 0.30;
        }
    }
    if bio.contains(&format!("acquaintance with {}", other))
        || bio.contains(&format!("acquaintances with {}", other))
        || bio.contains(&format!("acquaintance of {}", other))
        || bio.contains(&format!("acquaintances of {}", other))
    {
        return 0.60;
    }
    if bio.contains(&format!("does not know {}", other))
        || bio.contains(&format!("stranger to {}", other))
    {
        return 0.45;
    }

    0.45
}

fn calculate_ocean_traits(bio_lower: &str) -> (f32, f32, f32, f32, f32) {
    let compute = |weights: &[(&str, f32)], initial: f32| -> f32 {
        let mut sum = initial;
        for &(kw, weight) in weights {
            if bio_lower.contains(kw) {
                sum += weight;
            }
        }
        sum.clamp(0.0, 1.0)
    };

    let extraversion = compute(
        &[
            ("shy", -0.4),
            ("timid", -0.4),
            ("quiet", -0.4),
            ("reserved", -0.4),
            ("withdrawn", -0.4),
            ("introverted", -0.4),
            ("loner", -0.6),
            ("keeps to themself", -0.6),
            ("reclusive", -0.6),
            ("talkative", 0.4),
            ("chatty", 0.4),
            ("outgoing", 0.4),
            ("sociable", 0.4),
            ("gregarious", 0.4),
            ("life of the party", 0.5),
            ("loud", 0.5),
            ("boisterous", 0.5),
            ("extroverted", 0.5),
            ("speaks rarely", -0.3),
            ("only talks when necessary", -0.3),
            ("friendly and approachable", 0.2),
        ],
        0.5,
    );

    let initial_assert = if bio_lower.contains("shy") { 0.3 } else { 0.5 };
    let assertiveness = compute(
        &[
            ("meek", -0.4),
            ("submissive", -0.4),
            ("pushover", -0.4),
            ("will not speak up", -0.4),
            ("aggressive", 0.4),
            ("dominant", 0.4),
            ("commands attention", 0.4),
            ("bossy", 0.4),
            ("assertive", 0.3),
            ("confident", 0.3),
            ("speaks their mind", 0.3),
            ("bold", 0.3),
            ("hesitant", -0.2),
            ("indecisive", -0.2),
            ("waits for others", -0.2),
            ("natural leader", 0.5),
            ("takes charge", 0.5),
        ],
        initial_assert,
    );

    let agreeableness = compute(
        &[
            ("kind", 0.3),
            ("warm", 0.3),
            ("compassionate", 0.3),
            ("gentle", 0.3),
            ("caring", 0.3),
            ("cooperative", 0.2),
            ("good listener", 0.2),
            ("polite", 0.2),
            ("cold", -0.3),
            ("harsh", -0.3),
            ("rude", -0.3),
            ("blunt", -0.3),
            ("competitive", -0.3),
            ("argumentative", -0.2),
            ("hostile", -0.2),
            ("mean", -0.2),
            ("sarcastic", -0.2),
            ("sweet", 0.2),
            ("soft-spoken", 0.2),
        ],
        0.5,
    );

    let neuroticism = compute(
        &[
            ("anxious", 0.4),
            ("nervous", 0.4),
            ("worried", 0.4),
            ("insecure", 0.4),
            ("self-conscious", 0.4),
            ("calm", -0.3),
            ("laid-back", -0.3),
            ("unflappable", -0.3),
            ("relaxed", -0.3),
            ("moody", 0.3),
            ("temperamental", 0.3),
            ("volatile", 0.3),
            ("dramatic", 0.3),
            ("easily stressed", 0.4),
            ("panics", 0.4),
            ("stoic", -0.2),
            ("emotionless", -0.2),
        ],
        0.5,
    );

    let openness = compute(
        &[
            ("curious", 0.4),
            ("imaginative", 0.4),
            ("creative", 0.4),
            ("unconventional", 0.4),
            ("adventurous", 0.3),
            ("open-minded", 0.3),
            ("philosophical", 0.3),
            ("traditional", -0.3),
            ("conservative", -0.3),
            ("set in their ways", -0.3),
            ("stubborn", -0.3),
            ("loves new ideas", 0.5),
            ("explorer", 0.5),
            ("practical", -0.2),
            ("down-to-earth", -0.2),
        ],
        0.5,
    );

    (
        extraversion,
        assertiveness,
        agreeableness,
        neuroticism,
        openness,
    )
}

fn parse_character_status(bio_lower: &str) -> i32 {
    let status_dict = [
        ("king", 10),
        ("queen", 10),
        ("emperor", 10),
        ("god", 10),
        ("ruler", 10),
        ("lord", 9),
        ("duke", 9),
        ("general", 9),
        ("high priest", 9),
        ("captain", 8),
        ("chief", 8),
        ("master", 8),
        ("knight", 7),
        ("officer", 7),
        ("elder", 7),
        ("average citizen", 5),
        ("villager", 5),
        ("merchant", 5),
        ("servant", 3),
        ("butler", 3),
        ("assistant", 3),
        ("slave", 1),
        ("prisoner", 1),
        ("outcast", 1),
    ];

    let mut tokens = Vec::new();
    let mut start = 0;
    while let Some(pos) = bio_lower[start..].find('[') {
        let abs_open = start + pos;
        if let Some(close_pos) = bio_lower[abs_open..].find(']') {
            let abs_close = abs_open + close_pos;
            let bracket_content = &bio_lower[abs_open + 1..abs_close];
            if bracket_content.starts_with("tags:") || bracket_content.starts_with("personality:") {
                let list_str = bracket_content.split(':').nth(1).unwrap_or("");
                for token in list_str.split(',') {
                    tokens.push(token.trim().to_string());
                }
            }
            start = abs_close + 1;
        } else {
            break;
        }
    }

    for &(kw, score) in &status_dict {
        if tokens.contains(&kw.to_string()) {
            return score;
        }
    }

    for &(kw, score) in &status_dict {
        if bio_lower.contains(kw) {
            return score;
        }
    }

    5
}

struct CharacterTraits {
    extraversion: f32,
    assertiveness: f32,
    agreeableness: f32,
    #[allow(dead_code)]
    neuroticism: f32,
    #[allow(dead_code)]
    impulsivity: f32,
    silence_discomfort: f32,
    slc: f32,
    status: i32,
}

fn parse_character_bio(bio: &str) -> CharacterTraits {
    let bio_lower = bio.to_lowercase();
    let (extraversion, assertiveness, agreeableness, neuroticism, _) =
        calculate_ocean_traits(&bio_lower);
    CharacterTraits {
        extraversion,
        assertiveness,
        agreeableness,
        neuroticism,
        impulsivity: (extraversion + 1.0 - agreeableness) / 2.0,
        silence_discomfort: 0.7 * extraversion + 0.3 * neuroticism,
        slc: neuroticism,
        status: parse_character_status(&bio_lower),
    }
}

fn get_keyword_relevance(msg_text: &str, bio_text: &str) -> f32 {
    if msg_text.trim().is_empty() || bio_text.trim().is_empty() {
        return 0.5;
    }

    let bio = bio_text.to_lowercase();
    let clean_text: String = msg_text
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect();

    let words: Vec<&str> = clean_text
        .split_whitespace()
        .filter(|w| w.len() >= 3)
        .collect();

    let mut unique_words = std::collections::HashSet::new();
    for w in words {
        unique_words.insert(w);
    }

    let mut overlap = 0;
    for &w in &unique_words {
        if bio.contains(w) {
            overlap += 1;
        }
    }

    let score = 0.5 + (overlap as f32) * 0.15;
    score.clamp(0.5, 1.0)
}

fn check_direct_address(user_text: &str, last_msg: Option<&Message>, bots: &[Bot]) -> Option<i64> {
    let check = |text: &str, target_bots: &[Bot]| -> Option<i64> {
        if text.trim().is_empty() {
            return None;
        }
        for bot in target_bots {
            let name_tokens: Vec<&str> = bot.name.split_whitespace().collect();
            let mut check_names = vec![bot.name.as_str()];
            for token in name_tokens {
                if token.len() >= 3 {
                    check_names.push(token);
                }
            }

            for name in check_names {
                if is_word_match(text, name) {
                    return Some(bot.id);
                }
            }
        }
        None
    };

    if let Some(winner) = check(user_text, bots) {
        return Some(winner);
    }

    if let Some(msg) = last_msg {
        if !msg.content.trim().is_empty() {
            let eligible_bots: Vec<Bot> = bots
                .iter()
                .filter(|b| b.name.to_lowercase() != msg.sender_name.to_lowercase())
                .cloned()
                .collect();
            return check(&msg.content, &eligible_bots);
        }
    }

    None
}

fn filter_incapacitated_bots(bots: &[Bot], scene_state: &Option<serde_json::Value>) -> Vec<Bot> {
    let terms = [
        "unconscious",
        "fainted",
        "asleep",
        "sleeping",
        "knocked out",
    ];

    let state_map = match scene_state {
        Some(serde_json::Value::Object(map)) => Some(map),
        _ => None,
    };

    bots.iter()
        .filter(|bot| {
            if let Some(map) = state_map {
                let bot_id_str = bot.id.to_string();
                if let Some(serde_json::Value::Object(state)) = map.get(&bot_id_str) {
                    let action = state
                        .get("action")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_lowercase();
                    let mood = state
                        .get("mood")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_lowercase();

                    let is_incap = terms
                        .iter()
                        .any(|term| action.contains(term) || mood.contains(term));
                    if is_incap {
                        return false;
                    }
                }
            }
            true
        })
        .cloned()
        .collect()
}

fn softmax(scores: &[f32], temperature: f32) -> Vec<f32> {
    let t = temperature.max(0.05);
    if scores.is_empty() {
        return Vec::new();
    }
    let max_s = scores.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let exps: Vec<f32> = scores.iter().map(|s| ((s - max_s) / t).exp()).collect();
    let sum: f32 = exps.iter().sum();
    if sum == 0.0 {
        return vec![1.0 / (scores.len() as f32); scores.len()];
    }
    exps.iter().map(|e| e / sum).collect()
}

fn calculate_candidate_score(
    bot: &Bot,
    other_names: &[String],
    last_msg: Option<&Message>,
    user_text: &str,
    tau: f32,
    status_s: i32,
    scene_state: &Option<serde_json::Value>,
) -> f32 {
    let personality = bot.personality.as_deref().unwrap_or("");
    let traits = parse_character_bio(personality);

    let mut comfort_vals = Vec::new();
    for name in other_names {
        if name.to_lowercase() != bot.name.to_lowercase() {
            comfort_vals.push(get_comfort_level(personality, name, traits.assertiveness));
        }
    }

    let min_c = if comfort_vals.is_empty() {
        0.45
    } else {
        comfort_vals.iter().copied().fold(f32::INFINITY, f32::min)
    };
    let sum_c: f32 = comfort_vals.iter().sum();
    let avg_c = if comfort_vals.is_empty() {
        0.45
    } else {
        sum_c / (comfort_vals.len() as f32)
    };

    let comfort_penalty = traits.slc * (1.0 - min_c) + (1.0 - traits.slc) * (1.0 - avg_c);
    let comfort_multiplier = (1.0 - comfort_penalty).max(0.1);

    let willingness = traits.extraversion * traits.assertiveness * comfort_multiplier;

    let content_to_check = if !user_text.trim().is_empty() {
        user_text
    } else {
        last_msg.map(|m| m.content.as_str()).unwrap_or("")
    };
    let engagement = get_keyword_relevance(content_to_check, personality).max(0.5);

    let silence_boost = if tau >= 1.5 {
        1.0 + traits.silence_discomfort * (tau - 1.5) * 0.5
    } else {
        1.0
    };

    let is_selected = if let Some(msg) = last_msg {
        if msg.sender_name.to_lowercase() == bot.name.to_lowercase() {
            100.0
        } else {
            1.0
        }
    } else {
        1.0
    };

    let status_diff = (status_s as f32 - traits.status as f32) / 10.0;
    let status_diff = status_diff.clamp(0.0, 1.0);

    let deference_penalty = traits.agreeableness * (1.0 - traits.assertiveness) * status_diff;
    let deference_penalty = deference_penalty.clamp(0.0, 0.9);

    let mut score =
        willingness * engagement * silence_boost * is_selected * (1.0 - deference_penalty);

    let mut proximity_boost = 0.0;
    let state_map = match scene_state {
        Some(serde_json::Value::Object(map)) => Some(map),
        _ => None,
    };
    if let Some(map) = state_map {
        let bot_id_str = bot.id.to_string();
        if let Some(serde_json::Value::Object(state)) = map.get(&bot_id_str) {
            let location = state
                .get("location")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            if !location.is_empty() && location != "main room" {
                let search_in = format!(
                    "{} {}",
                    user_text,
                    last_msg.map(|m| m.content.as_str()).unwrap_or("")
                )
                .to_lowercase();
                if search_in.contains(&location) {
                    proximity_boost = 1.5;
                }
            }
        }
    }

    score += proximity_boost;
    score
}

fn choose_weighted_winner(scored_candidates: &[(i64, String, f32)]) -> i64 {
    let scores: Vec<f32> = scored_candidates.iter().map(|c| c.2).collect();
    let probs = softmax(&scores, 0.5);

    let mut buf = [0u8; 4];
    let _ = getrandom::getrandom(&mut buf);
    let rand = (u32::from_ne_bytes(buf) as f64 / u32::MAX as f64) as f32;

    let mut cumulative_sum = 0.0;
    for (i, candidate) in scored_candidates.iter().enumerate() {
        cumulative_sum += probs[i];
        if rand <= cumulative_sum {
            return candidate.0;
        }
    }
    scored_candidates[scored_candidates.len() - 1].0
}

#[tauri::command]
pub fn run_efficient_selector_rust(
    message_content: String,
    bots: Vec<Bot>,
    messages: Vec<Message>,
    scene_state: Option<serde_json::Value>,
    tau: f32,
) -> Result<Option<i64>, String> {
    if bots.is_empty() {
        return Ok(None);
    }
    if bots.len() == 1 {
        return Ok(Some(bots[0].id));
    }

    let user_text = message_content.trim();
    let last_msg = messages.last();

    if let Some(winner) = check_direct_address(user_text, last_msg, &bots) {
        return Ok(Some(winner));
    }

    let mut participant_names = std::collections::HashSet::new();
    for bot in &bots {
        participant_names.insert(bot.name.clone());
    }
    for msg in &messages {
        participant_names.insert(msg.sender_name.clone());
    }
    let other_names: Vec<String> = participant_names.into_iter().collect();

    let mut status_s = 5;
    if let Some(msg) = last_msg {
        if msg.sender_type == "character" {
            if let Some(speaker_bot) = bots
                .iter()
                .find(|b| b.name.to_lowercase() == msg.sender_name.to_lowercase())
            {
                let personality = speaker_bot.personality.as_deref().unwrap_or("");
                status_s = parse_character_status(&personality.to_lowercase());
            }
        }
    }

    let active_candidates = filter_incapacitated_bots(&bots, &scene_state);
    if active_candidates.is_empty() {
        return Ok(None);
    }

    let mut scored_candidates = Vec::new();
    for bot in &active_candidates {
        let score = calculate_candidate_score(
            bot,
            &other_names,
            last_msg,
            user_text,
            tau,
            status_s,
            &scene_state,
        );
        scored_candidates.push((bot.id, bot.name.clone(), score));
    }

    scored_candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

    if scored_candidates.is_empty() {
        return Ok(None);
    }

    if scored_candidates[0].2 < 0.05 {
        return Ok(None);
    }

    let winner_id = choose_weighted_winner(&scored_candidates);
    Ok(Some(winner_id))
}
