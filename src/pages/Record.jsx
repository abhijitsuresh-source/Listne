import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { invoke } from "../lib/tauri";
import {
  Mic, Square, Upload, FileAudio, Loader2, ChevronRight,
  AlertCircle, CheckCircle2, Wand2
} from "lucide-react";

const STEPS = ["record", "transcribe", "analyze", "done"];

function stepIndex(s) { return STEPS.indexOf(s); }

export default function Record() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [title, setTitle] = useState("");
  const [model, setModel] = useState("gemma3:4b");
  const [models, setModels] = useState([]);
  const [step, setStep] = useState("record");
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [meetingId, setMeetingId] = useState(null);
  const [error, setError] = useState("");
  const [transcribeProgress, setTranscribeProgress] = useState("");

  const mediaRecorder = useRef(null);
  const chunks = useRef([]);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    invoke("list_ollama_models").then(ms => {
      setModels(ms);
      if (ms.length > 0) setModel(ms[0]);
    });
  }, []);

  useEffect(() => {
    if (recording) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [recording]);

  function formatTime(s) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      mediaRecorder.current = new MediaRecorder(stream);
      mediaRecorder.current.ondataavailable = e => chunks.current.push(e.data);
      mediaRecorder.current.onstop = () => {
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.current.start();
      setRecording(true);
      setElapsed(0);
    } catch (e) {
      setError("Could not access microphone. Check your system permissions.");
    }
  }

  function stopRecording() {
    mediaRecorder.current?.stop();
    setRecording(false);
  }

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) { setAudioFile(file); setAudioBlob(null); }
  }

  // Convert a Blob or File to Uint8Array for Tauri
  async function blobToBytes(blob) {
    const buf = await blob.arrayBuffer();
    return Array.from(new Uint8Array(buf));
  }

  function getExtension(blob, file) {
    if (file) {
      const parts = file.name.split(".");
      return parts[parts.length - 1] || "mp3";
    }
    // recorded audio is webm
    return "webm";
  }

  async function handleProcessAudio() {
    const source = audioBlob || audioFile;
    if (!source) return;

    setStep("transcribe");
    setError("");
    setTranscribeProgress("Preparing audio...");

    try {
      const bytes = await blobToBytes(source);
      const ext = getExtension(audioBlob, audioFile);

      setTranscribeProgress("Transcribing with Whisper... (this may take a minute)");
      const whisperModel = localStorage.getItem("listne_whisper_model") || "ggml-base.en.bin";
      const result = await invoke("transcribe_audio", {
        audioBytes: bytes,
        extension: ext,
        whisperModel,
      });
      setTranscript(result);
      setTranscribeProgress("");

      // Auto-proceed to analysis
      await runAnalysis(result);
    } catch (e) {
      setError("Transcription failed: " + e);
      setStep("record");
      setTranscribeProgress("");
    }
  }

  async function runAnalysis(transcriptText) {
    setStep("analyze");
    setError("");
    try {
      const id = await invoke("create_meeting", { title: title || "Untitled Meeting" });
      setMeetingId(id);

      const analysis = await invoke("analyze_transcript", {
        transcript: transcriptText,
        model,
      });

      await invoke("save_analysis", {
        id,
        transcript: transcriptText,
        summary: analysis.summary || "",
        actionItems: JSON.stringify(analysis.action_items || []),
        decisions: JSON.stringify(analysis.decisions || []),
        sidelinedIdeas: JSON.stringify(analysis.sidelined_ideas || []),
        followUpEmail: analysis.follow_up_email || "",
      });

      setStep("done");
    } catch (e) {
      setError("Analysis failed: " + e);
      setStep("transcribe");
    }
  }

  const hasAudio = audioBlob || audioFile;

  return (
    <div className="px-8 py-8 max-w-2xl">
      <h1 className="font-mono font-semibold text-xl text-vault-text mb-1">New Meeting</h1>
      <p className="text-vault-text-dim text-sm mb-8">Record or upload — everything else is automatic.</p>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {["Record", "Transcribe", "Analyze"].map((s, i) => {
          const current = stepIndex(step);
          const done = i < current || step === "done";
          const active = i === current && step !== "done";
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-xs font-mono ${done ? "text-vault-green" : active ? "text-vault-accent" : "text-vault-text-dim"}`}>
                {done ? <CheckCircle2 size={12} /> : <div className={`w-1.5 h-1.5 rounded-full ${active ? "bg-vault-accent animate-pulse" : "bg-vault-muted"}`} />}
                {s}
              </div>
              {i < 2 && <div className="w-6 h-px bg-vault-border" />}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-vault-red/10 border border-vault-red/20 rounded-lg px-4 py-3 mb-5">
          <AlertCircle size={14} className="text-vault-red mt-0.5" />
          <p className="text-vault-red text-sm">{error}</p>
        </div>
      )}

      {/* ── Step: Record ─────────────────────────────── */}
      {step === "record" && (
        <div className="space-y-5">
          {/* Title + model */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-vault-text-dim mb-1.5">Meeting title</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Q2 planning sync"
                className="w-full bg-vault-surface border border-vault-border rounded-lg px-3 py-2 text-sm text-vault-text placeholder:text-vault-muted focus:outline-none focus:border-vault-accent"
              />
            </div>
            {models.length > 0 && (
              <div>
                <label className="block text-xs text-vault-text-dim mb-1.5">AI model</label>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full bg-vault-surface border border-vault-border rounded-lg px-3 py-2 text-sm text-vault-text focus:outline-none focus:border-vault-accent"
                >
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Record panel */}
          <div className="bg-vault-surface border border-vault-border rounded-xl p-6 flex flex-col items-center gap-4">
            {recording ? (
              <>
                <div className="w-16 h-16 rounded-full bg-vault-red/10 border border-vault-red/30 flex items-center justify-center animate-pulse">
                  <Mic size={24} className="text-vault-red" />
                </div>
                <p className="font-mono text-2xl text-vault-text">{formatTime(elapsed)}</p>
                <p className="text-vault-text-dim text-sm">Recording in progress</p>
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 bg-vault-red/10 hover:bg-vault-red/20 border border-vault-red/30 text-vault-red text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                >
                  <Square size={13} /> Stop
                </button>
              </>
            ) : audioBlob ? (
              <>
                <CheckCircle2 size={26} className="text-vault-green" />
                <p className="text-vault-text text-sm font-medium">Recorded — {formatTime(elapsed)}</p>
                <audio controls src={URL.createObjectURL(audioBlob)} className="w-full" />
                <button onClick={() => { setAudioBlob(null); setElapsed(0); }} className="text-vault-text-dim text-xs hover:text-vault-text underline">Record again</button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-vault-accent/10 border border-vault-accent/20 flex items-center justify-center">
                  <Mic size={24} className="text-vault-accent" />
                </div>
                <p className="text-vault-text-dim text-sm">Record from your microphone</p>
                <button
                  onClick={startRecording}
                  className="bg-vault-accent hover:bg-vault-accent-dim text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                >
                  Start recording
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-vault-border" />
            <span className="text-vault-text-dim text-xs font-mono">or upload</span>
            <div className="flex-1 h-px bg-vault-border" />
          </div>

          {/* Upload panel */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
              audioFile ? "border-vault-green/50 bg-vault-green/5" : "border-vault-border hover:border-vault-accent/40"
            }`}
          >
            <input ref={fileInputRef} type="file" accept="audio/*,video/*" onChange={handleFileUpload} className="hidden" />
            {audioFile ? (
              <>
                <CheckCircle2 size={22} className="text-vault-green" />
                <p className="text-vault-text text-sm font-medium">{audioFile.name}</p>
                <p className="text-vault-text-dim text-xs">Click to change</p>
              </>
            ) : (
              <>
                <FileAudio size={22} className="text-vault-text-dim" />
                <p className="text-vault-text text-sm">Drop audio file or click to browse</p>
                <p className="text-vault-text-dim text-xs">MP3, MP4, M4A, WAV — Zoom or Meet recordings work</p>
              </>
            )}
          </div>

          <button
            onClick={handleProcessAudio}
            disabled={!hasAudio}
            className="w-full bg-vault-accent hover:bg-vault-accent-dim disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Wand2 size={14} /> Transcribe & Analyze
          </button>
        </div>
      )}

      {/* ── Step: Transcribe ─────────────────────────────── */}
      {step === "transcribe" && (
        <div className="flex flex-col items-center py-16 gap-4">
          <Loader2 size={28} className="text-vault-accent animate-spin" />
          <p className="text-vault-text font-medium">Transcribing audio</p>
          <p className="text-vault-text-dim text-sm text-center max-w-xs">
            {transcribeProgress || "Whisper is processing your audio locally. No audio leaves your machine."}
          </p>
        </div>
      )}

      {/* ── Step: Analyze ─────────────────────────────── */}
      {step === "analyze" && (
        <div className="flex flex-col items-center py-16 gap-4">
          <Loader2 size={28} className="text-vault-accent animate-spin" />
          <p className="text-vault-text font-medium">Analyzing your meeting</p>
          <p className="text-vault-text-dim text-sm text-center max-w-xs">
            Your local AI is reading the transcript. Takes 20–60 seconds.
          </p>
        </div>
      )}

      {/* ── Step: Done ─────────────────────────────── */}
      {step === "done" && (
        <div className="flex flex-col items-center py-12 gap-5">
          <div className="w-16 h-16 rounded-full bg-vault-green/10 border border-vault-green/30 flex items-center justify-center">
            <CheckCircle2 size={28} className="text-vault-green" />
          </div>
          <div className="text-center">
            <p className="text-vault-text font-medium text-lg mb-1">Done</p>
            <p className="text-vault-text-dim text-sm">Your insights are ready.</p>
          </div>
          <button
            onClick={() => navigate(`/meeting/${meetingId}`)}
            className="bg-vault-accent hover:bg-vault-accent-dim text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            View insights <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
