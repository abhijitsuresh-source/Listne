# Listne

Private AI meeting intelligence. Runs 100% locally — no data leaves your machine.

## What it does

- Record meetings from mic or upload audio (MP3, MP4, M4A, WAV, WebM)
- Transcribes automatically with bundled Whisper (no terminal, no Python)
- Analyzes with a local LLM via Ollama (Gemma, Llama, Mistral)
- Surfaces: summary, action items + owners, decisions made, sidelined ideas
- Generates a follow-up email draft
- License key gate via Gumroad

---

## Prerequisites (dev only)

1. **Rust** — https://rustup.rs
2. **Node.js 18+** — https://nodejs.org
3. **Tauri CLI** — `cargo install tauri-cli`
4. **Ollama** — https://ollama.com/download → then `ollama pull gemma3:4b`

---

## IMPORTANT: Add whisper-cli sidecar binaries before building

Tauri sidecars must be named with the target triple suffix.
Place binaries in `src-tauri/binaries/`:

### macOS (Apple Silicon)
```
src-tauri/binaries/whisper-cli-aarch64-apple-darwin
```
Download: https://github.com/ggerganov/whisper.cpp/releases/latest
→ grab `whisper-cli-macos-arm64` (or build from source: `make`)

### macOS (Intel)
```
src-tauri/binaries/whisper-cli-x86_64-apple-darwin
```

### Windows
```
src-tauri/binaries/whisper-cli-x86_64-pc-windows-msvc.exe
```
Download: https://github.com/ggerganov/whisper.cpp/releases/latest
→ grab `whisper-cli-windows-x64.exe`

### Linux
```
src-tauri/binaries/whisper-cli-x86_64-unknown-linux-gnu
```

### Whisper model (required)
Also download the `base.en` model file and place at:
```
src-tauri/binaries/ggml-base.en.bin
```
Download: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin (~142MB)

The model path needs to be passed to whisper-cli. Update `main.rs` → `transcribe_audio` 
to add `--model` with the resolved path via `tauri::api::path::resource_dir()`.

---

## Dev setup

```bash
npm install
npm run tauri dev
```

---

## Build for distribution

```bash
npm run tauri build
```

Outputs:
- macOS: `src-tauri/target/release/bundle/dmg/Listne.dmg`
- Windows: `src-tauri/target/release/bundle/msi/Listne.msi`
- Linux: `src-tauri/target/release/bundle/appimage/Listne.AppImage`

---

## Gumroad setup

1. Create a product, set permalink to `listne`
2. Enable license keys
3. Upload the platform binary as the downloadable

---

## User flow (zero terminal)

1. Buy on Gumroad → get license key
2. Download + open app
3. Paste license key → activated
4. App guides through Ollama install (one button, plain English)
5. Record or upload audio → one click → transcript + insights appear automatically
