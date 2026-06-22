#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;
use std::sync::Mutex;
use chrono::Utc;
use uuid::Uuid;
use std::fs;
use tauri::api::process::Command;

// ─── State ───────────────────────────────────────────────────────────────────

struct AppState {
    db: Mutex<Connection>,
}

fn db_path() -> PathBuf {
    let mut path = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("Listne");
    std::fs::create_dir_all(&path).ok();
    path.push("listne.db");
    path
}

fn temp_dir() -> PathBuf {
    let mut path = dirs::cache_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    path.push("Listne");
    std::fs::create_dir_all(&path).ok();
    path
}

fn init_db(conn: &Connection) {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS license (
            key TEXT NOT NULL,
            validated_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meetings (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,
            duration_seconds INTEGER,
            transcript TEXT,
            summary TEXT,
            action_items TEXT,
            decisions TEXT,
            sidelined_ideas TEXT,
            follow_up_email TEXT,
            status TEXT NOT NULL DEFAULT 'pending'
        );
    ").expect("DB init failed");
}

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
struct LicenseResult {
    valid: bool,
    message: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct Meeting {
    id: String,
    title: String,
    created_at: String,
    duration_seconds: Option<i64>,
    transcript: Option<String>,
    summary: Option<String>,
    action_items: Option<String>,
    decisions: Option<String>,
    sidelined_ideas: Option<String>,
    follow_up_email: Option<String>,
    status: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
    format: String,
}

// ─── License Commands ─────────────────────────────────────────────────────────

#[tauri::command]
async fn activate_license(key: String, state: State<'_, AppState>) -> Result<LicenseResult, String> {
    let client = reqwest::Client::new();
    // Gumroad requires product_id (not product_permalink) for all products
    // created on or after Jan 9, 2023. Get this from: Content tab -> Insert ->
    // License key block -> the encoded string shown there (e.g. "TpGkk...==").
    let params_list = [
        ("product_id", "TpGkkMRvvrp59ZncM3YyYg=="),
        ("license_key", key.as_str()),
        ("increment_uses_count", "true"),
    ];
    let response = client
        .post("https://api.gumroad.com/v2/licenses/verify")
        .form(&params_list)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let success = body["success"].as_bool().unwrap_or(false);

    if success {
        let now = Utc::now();
        let expires = now + chrono::Duration::days(30);
        let db = state.db.lock().unwrap();
        db.execute("DELETE FROM license", []).ok();
        db.execute(
            "INSERT INTO license (key, validated_at, expires_at) VALUES (?1, ?2, ?3)",
            params![key, now.to_rfc3339(), expires.to_rfc3339()],
        ).map_err(|e| e.to_string())?;
        Ok(LicenseResult { valid: true, message: "License activated.".into() })
    } else {
        let msg = body["message"].as_str().unwrap_or("Invalid license key.").to_string();
        Ok(LicenseResult { valid: false, message: msg })
    }
}

#[tauri::command]
fn check_license(state: State<'_, AppState>) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    let result: Result<String, _> = db.query_row(
        "SELECT expires_at FROM license LIMIT 1",
        [],
        |row| row.get(0),
    );
    match result {
        Ok(expires_at) => {
            let expires = chrono::DateTime::parse_from_rfc3339(&expires_at)
                .map_err(|e| e.to_string())?;
            Ok(Utc::now() < expires)
        }
        Err(_) => Ok(false),
    }
}

// ─── Whisper Transcription ────────────────────────────────────────────────────

/// Receives raw audio bytes from the frontend (recorded or uploaded),
/// converts to 16-bit WAV (whisper-cli requires flac/mp3/ogg/wav — NOT mp4/webm/m4a),
/// then runs the bundled whisper-cli sidecar, and returns the transcript.
#[tauri::command]
async fn transcribe_audio(
    audio_bytes: Vec<u8>,
    extension: String,
    whisper_model: String, // e.g. "ggml-base.en.bin" — which bundled model to use
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use tauri::Manager;

    // Write the original audio to a temp file, whatever format it came in
    let mut input_path = temp_dir();
    let input_filename = format!("listne_input_{}.{}", Uuid::new_v4(), extension);
    input_path.push(&input_filename);
    fs::write(&input_path, &audio_bytes).map_err(|e| format!("Failed to write audio: {}", e))?;
    let input_path_str = input_path.to_string_lossy().to_string();

    // Convert to 16kHz mono WAV via ffmpeg — whisper-cli only accepts flac/mp3/ogg/wav,
    // and mp4/webm/m4a (what Zoom/Meet/browser recording actually produce) aren't supported directly.
    let mut wav_path = input_path.clone();
    wav_path.set_extension("wav");
    let wav_path_str = wav_path.to_string_lossy().to_string();

    // Resolve ffmpeg from bundled resources (not a sidecar — Tauri's externalBin
    // step was silently failing to include it, so it ships as a plain resource instead).
    let ffmpeg_path = app_handle
        .path_resolver()
        .resolve_resource("binaries/ffmpeg-aarch64-apple-darwin")
        .filter(|p| p.exists())
        .unwrap_or_else(|| PathBuf::from("binaries/ffmpeg-aarch64-apple-darwin"));

    if !ffmpeg_path.exists() {
        return Err(format!(
            "ffmpeg binary not found at {}. Make sure ffmpeg-aarch64-apple-darwin is in src-tauri/binaries/",
            ffmpeg_path.display()
        ));
    }

    // Resource files don't reliably keep their executable bit after bundling —
    // ensure it's set before we try to run it. No-op if already executable.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(&ffmpeg_path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&ffmpeg_path, perms).ok();
        }
    }

    let ffmpeg_output = std::process::Command::new(&ffmpeg_path)
        .args([
            "-y",                 // overwrite output if it exists
            "-i", input_path_str.as_str(),
            "-ar", "16000",       // 16kHz sample rate, what whisper expects
            "-ac", "1",           // mono
            "-c:a", "pcm_s16le",  // 16-bit PCM
            wav_path_str.as_str(),
        ])
        .output()
        .map_err(|e| format!("Failed to start ffmpeg at {}: {}", ffmpeg_path.display(), e))?;

    let ffmpeg_ok = ffmpeg_output.status.success();
    let ffmpeg_stderr = String::from_utf8_lossy(&ffmpeg_output.stderr).to_string();

    if !ffmpeg_ok {
        fs::remove_file(&input_path).ok();
        return Err(format!("Audio conversion failed: {}", ffmpeg_stderr));
    }

    let output_stem = wav_path.with_extension("").to_string_lossy().to_string();

    // Resolve the bundled model path. In a packaged build this resolves via
    // Tauri's resource resolver; in `tauri dev` that resolver often can't find
    // unbundled resources, so we fall back to the binaries/ folder directly.
    let model_resource_path = format!("binaries/{}", whisper_model);
    let model_path = app_handle
        .path_resolver()
        .resolve_resource(&model_resource_path)
        .filter(|p| p.exists())
        .unwrap_or_else(|| PathBuf::from(&model_resource_path));
    let model_path_str = model_path.to_string_lossy().to_string();

    if !model_path.exists() {
        return Err(format!(
            "Whisper model not found at {}. Make sure {} is in src-tauri/binaries/",
            model_path_str, whisper_model
        ));
    }

    let (mut rx, _child) = Command::new_sidecar("whisper-cli")
        .map_err(|e| format!("Sidecar not found: {}", e))?
        .args([
            "-f", wav_path_str.as_str(),
            "--output-txt",
            "--output-file", output_stem.as_str(),
            "-m", model_path_str.as_str(),
            "--language", "en",
            "--no-timestamps",
        ])
        .spawn()
        .map_err(|e| format!("Failed to start whisper: {}", e))?;

    // Drain stdout/stderr events until the process exits
    let mut stderr_buf = String::new();
    let mut stdout_buf = String::new();
    let mut exit_ok = false;

    while let Some(event) = rx.recv().await {
        match event {
            tauri::api::process::CommandEvent::Stderr(line) => {
                stderr_buf.push_str(&line);
                stderr_buf.push('\n');
            }
            tauri::api::process::CommandEvent::Stdout(line) => {
                stdout_buf.push_str(&line);
                stdout_buf.push('\n');
            }
            tauri::api::process::CommandEvent::Terminated(payload) => {
                exit_ok = payload.code == Some(0);
                break;
            }
            _ => {}
        }
    }

    if !exit_ok {
        fs::remove_file(&input_path).ok();
        fs::remove_file(&wav_path).ok();
        return Err(format!(
            "Whisper failed (exit not ok). stdout: {} | stderr: {}",
            stdout_buf, stderr_buf
        ));
    }

    // Read the output .txt file whisper-cli produced
    let txt_path = wav_path.with_extension("txt");
    let transcript = fs::read_to_string(&txt_path).map_err(|e| {
        format!(
            "Could not read transcript at {}: {}. whisper stdout: {} | whisper stderr: {} | wav existed: {} | wav_path: {} | output_stem passed to whisper: {}",
            txt_path.display(),
            e,
            stdout_buf,
            stderr_buf,
            wav_path.exists(),
            wav_path_str,
            output_stem
        )
    })?;

    // Cleanup temp files
    fs::remove_file(&input_path).ok();
    fs::remove_file(&wav_path).ok();
    fs::remove_file(&txt_path).ok();

    Ok(transcript.trim().to_string())
}

// ─── System Detection ─────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
struct WhisperModelInfo {
    id: String,        // e.g. "base.en"
    filename: String,  // e.g. "ggml-base.en.bin"
    label: String,      // e.g. "Base (Fast)"
    size_mb: u32,
    recommended: bool,
}

#[tauri::command]
fn get_recommended_whisper_models() -> Result<Vec<WhisperModelInfo>, String> {
    // Total physical RAM in bytes, via sysctl on macOS (no extra crate needed).
    let total_ram_gb: f64 = {
        #[cfg(target_os = "macos")]
        {
            let output = std::process::Command::new("sysctl")
                .args(["-n", "hw.memsize"])
                .output()
                .map_err(|e| e.to_string())?;
            let bytes_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let bytes: u64 = bytes_str.parse().unwrap_or(8_000_000_000);
            bytes as f64 / 1_073_741_824.0 // bytes -> GiB
        }
        #[cfg(not(target_os = "macos"))]
        {
            8.0 // conservative fallback for non-mac targets
        }
    };

    let recommended_tier = if total_ram_gb >= 28.0 {
        "medium.en"
    } else if total_ram_gb >= 14.0 {
        "small.en"
    } else {
        "base.en"
    };

    let models = vec![
        WhisperModelInfo {
            id: "base.en".to_string(),
            filename: "ggml-base.en.bin".to_string(),
            label: "Base — Fast".to_string(),
            size_mb: 142,
            recommended: recommended_tier == "base.en",
        },
        WhisperModelInfo {
            id: "small.en".to_string(),
            filename: "ggml-small.en.bin".to_string(),
            label: "Small — Balanced".to_string(),
            size_mb: 466,
            recommended: recommended_tier == "small.en",
        },
        WhisperModelInfo {
            id: "medium.en".to_string(),
            filename: "ggml-medium.en.bin".to_string(),
            label: "Medium — Most Accurate".to_string(),
            size_mb: 1500,
            recommended: recommended_tier == "medium.en",
        },
    ];

    Ok(models)
}

#[tauri::command]
async fn check_ollama() -> Result<bool, String> {
    let client = reqwest::Client::new();
    match client.get("http://localhost:11434/api/tags").send().await {
        Ok(r) => Ok(r.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn list_ollama_models() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("http://localhost:11434/api/tags")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let models = body["models"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
        .collect();
    Ok(models)
}

#[tauri::command]
async fn analyze_transcript(transcript: String, model: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();

    let prompt = format!(
        r#"You are an expert meeting analyst. Analyze the following meeting transcript and respond ONLY with valid JSON in this exact structure:

{{
  "summary": "2-3 sentence overview of the meeting",
  "action_items": [
    {{"task": "...", "owner": "...", "due": "..."}}
  ],
  "decisions": [
    {{"decision": "...", "context": "..."}}
  ],
  "sidelined_ideas": [
    {{"idea": "...", "raised_by": "...", "context": "...", "why_sidelined": "..."}}
  ],
  "follow_up_email": "Full draft of a follow-up email summarizing the meeting"
}}

For sidelined_ideas, identify EVERY idea, suggestion, or topic that was raised but NOT resolved, assigned, or followed up on. These are the gems that typically get forgotten.

TRANSCRIPT:
{}

Respond ONLY with the JSON object. No preamble, no explanation."#,
        transcript
    );

    let req_model_for_error = model.clone();
    let req = OllamaRequest {
        model,
        prompt,
        stream: false,
        format: "json".to_string(),
    };

    let resp = client
        .post("http://localhost:11434/api/generate")
        .json(&req)
        .send()
        .await
        .map_err(|e| format!("Could not reach Ollama. Is it running? ({})", e))?;

    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(|e| {
        format!("Ollama returned a response we couldn't read ({}): {}", status, e)
    })?;

    // Ollama returns errors as {"error": "..."} with no "response" field — catch that
    // explicitly instead of silently falling back to an empty object, which previously
    // caused every insight panel to show "0 items" with no indication anything failed.
    if let Some(err_msg) = body.get("error").and_then(|e| e.as_str()) {
        return Err(format!(
            "Ollama couldn't analyze this meeting: {}. This usually means the model isn't installed — try running 'ollama pull {}' in Terminal, or pick a different model in Setup.",
            err_msg, req_model_for_error
        ));
    }

    if !status.is_success() {
        return Err(format!(
            "Ollama returned an error (HTTP {}). Check that Ollama is running and the model is installed.",
            status
        ));
    }

    let raw = body.get("response").and_then(|r| r.as_str()).ok_or_else(|| {
        "Ollama's response was missing the expected content. The model may have failed to generate a reply — try again, or try a different model.".to_string()
    })?;

    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    serde_json::from_str(cleaned)
        .map_err(|e| format!("JSON parse error: {} — Raw: {}", e, cleaned))
}

// ─── Meeting Commands ─────────────────────────────────────────────────────────

#[tauri::command]
fn create_meeting(title: String, state: State<'_, AppState>) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let db = state.db.lock().unwrap();
    db.execute(
        "INSERT INTO meetings (id, title, created_at, status) VALUES (?1, ?2, ?3, 'pending')",
        params![id, title, now],
    ).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
fn save_analysis(
    id: String,
    transcript: String,
    summary: String,
    action_items: String,
    decisions: String,
    sidelined_ideas: String,
    follow_up_email: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.execute(
        "UPDATE meetings SET transcript=?1, summary=?2, action_items=?3, decisions=?4, sidelined_ideas=?5, follow_up_email=?6, status='done' WHERE id=?7",
        params![transcript, summary, action_items, decisions, sidelined_ideas, follow_up_email, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_meetings(state: State<'_, AppState>) -> Result<Vec<Meeting>, String> {
    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare("SELECT id, title, created_at, duration_seconds, transcript, summary, action_items, decisions, sidelined_ideas, follow_up_email, status FROM meetings ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let meetings = stmt.query_map([], |row| {
        Ok(Meeting {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            duration_seconds: row.get(3)?,
            transcript: row.get(4)?,
            summary: row.get(5)?,
            action_items: row.get(6)?,
            decisions: row.get(7)?,
            sidelined_ideas: row.get(8)?,
            follow_up_email: row.get(9)?,
            status: row.get(10)?,
        })
    })
    .map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(meetings)
}

#[tauri::command]
fn get_meeting(id: String, state: State<'_, AppState>) -> Result<Option<Meeting>, String> {
    let db = state.db.lock().unwrap();
    let result = db.query_row(
        "SELECT id, title, created_at, duration_seconds, transcript, summary, action_items, decisions, sidelined_ideas, follow_up_email, status FROM meetings WHERE id=?1",
        params![id],
        |row| Ok(Meeting {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            duration_seconds: row.get(3)?,
            transcript: row.get(4)?,
            summary: row.get(5)?,
            action_items: row.get(6)?,
            decisions: row.get(7)?,
            sidelined_ideas: row.get(8)?,
            follow_up_email: row.get(9)?,
            status: row.get(10)?,
        }),
    );
    match result {
        Ok(m) => Ok(Some(m)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn delete_meeting(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.execute("DELETE FROM meetings WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Main ─────────────────────────────────────────────────────────────────────

fn main() {
    let conn = Connection::open(db_path()).expect("Failed to open database");
    init_db(&conn);

    tauri::Builder::default()
        .manage(AppState { db: Mutex::new(conn) })
        .invoke_handler(tauri::generate_handler![
            activate_license,
            check_license,
            transcribe_audio,
            get_recommended_whisper_models,
            check_ollama,
            list_ollama_models,
            analyze_transcript,
            create_meeting,
            save_analysis,
            list_meetings,
            get_meeting,
            delete_meeting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
