import { useState, useEffect } from "react";
import { invoke } from "../lib/tauri";
import {
  CheckCircle2, Circle, Loader2, ExternalLink, ChevronDown, ChevronUp,
  Cpu, Mic2, Zap
} from "lucide-react";

const MODELS = [
  { id: "gemma3:4b", label: "Gemma 3 4B", desc: "Fast, great for most meetings. ~2.5GB download.", recommended: true },
  { id: "llama3.1:8b", label: "Llama 3.1 8B", desc: "More accurate, needs ~5GB RAM free.", recommended: false },
  { id: "mistral:7b", label: "Mistral 7B", desc: "Strong reasoning. ~4GB download.", recommended: false },
];

function Step({ number, title, done, active, children }) {
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active]);

  return (
    <div className={`border rounded-xl transition-colors ${done ? "border-vault-green/30 bg-vault-green/5" : active ? "border-vault-accent/40 bg-vault-accent/5" : "border-vault-border bg-vault-surface"}`}>
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-mono font-semibold ${
          done ? "bg-vault-green/20 text-vault-green" : active ? "bg-vault-accent/20 text-vault-accent" : "bg-vault-muted/30 text-vault-text-dim"
        }`}>
          {done ? <CheckCircle2 size={16} /> : number}
        </div>
        <div className="flex-1">
          <p className={`text-sm font-medium ${done ? "text-vault-green" : active ? "text-vault-text" : "text-vault-text-dim"}`}>{title}</p>
        </div>
        {open ? <ChevronUp size={15} className="text-vault-text-dim" /> : <ChevronDown size={15} className="text-vault-text-dim" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-vault-border/50 pt-4">{children}</div>}
    </div>
  );
}

export default function Setup() {
  const [ollamaStatus, setOllamaStatus] = useState("checking"); // checking | running | missing
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("gemma3:4b");
  const [pullingModel, setPullingModel] = useState(false);
  const [modelPulled, setModelPulled] = useState(false);
  const [whisperModels, setWhisperModels] = useState([]);
  const [selectedWhisperModel, setSelectedWhisperModel] = useState(null);

  useEffect(() => {
    checkOllama();
    invoke("get_recommended_whisper_models").then(list => {
      setWhisperModels(list);
      const saved = localStorage.getItem("listne_whisper_model");
      const recommended = list.find(m => m.recommended);
      const initial = saved || (recommended ? recommended.filename : list[0]?.filename);
      setSelectedWhisperModel(initial);
      if (!saved && initial) localStorage.setItem("listne_whisper_model", initial);
    });
  }, []);

  async function checkOllama() {
    setOllamaStatus("checking");
    const ok = await invoke("check_ollama");
    setOllamaStatus(ok ? "running" : "missing");
    if (ok) {
      const ms = await invoke("list_ollama_models");
      setModels(ms);
    }
  }

  const ollamaDone = ollamaStatus === "running";
  const modelDone = models.some(m => m.startsWith(selectedModel.split(":")[0])) || modelPulled;
  const allDone = ollamaDone && modelDone;

  return (
    <div className="px-8 py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="font-mono font-semibold text-xl text-vault-text mb-1">Setup</h1>
        <p className="text-vault-text-dim text-sm">Get your local AI running. This takes ~5 minutes and only happens once.</p>
      </div>

      {allDone && (
        <div className="mb-6 flex items-center gap-3 bg-vault-green/10 border border-vault-green/30 rounded-xl px-5 py-4">
          <CheckCircle2 size={18} className="text-vault-green" />
          <div>
            <p className="text-vault-green font-medium text-sm">You're all set.</p>
            <p className="text-vault-text-dim text-xs mt-0.5">Your AI runs 100% on your machine. No data leaves your device.</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {/* Step 1 — Install Ollama */}
        <Step number="1" title="Install Ollama (the AI engine)" done={ollamaDone} active={!ollamaDone}>
          <p className="text-vault-text-dim text-sm mb-4">
            Ollama is a free, open-source program that runs AI models on your computer. Think of it as the engine — you install it once and it stays in the background.
          </p>

          {ollamaStatus === "checking" && (
            <div className="flex items-center gap-2 text-vault-text-dim text-sm">
              <Loader2 size={14} className="animate-spin" />
              Checking if Ollama is installed...
            </div>
          )}

          {ollamaStatus === "running" && (
            <div className="flex items-center gap-2 text-vault-green text-sm font-medium">
              <CheckCircle2 size={15} />
              Ollama is running. 
            </div>
          )}

          {ollamaStatus === "missing" && (
            <div className="space-y-4">
              <div className="bg-vault-bg rounded-lg border border-vault-border p-4 space-y-2">
                <p className="text-vault-text text-sm font-medium">How to install:</p>
                <ol className="space-y-2 text-sm text-vault-text-dim">
                  <li className="flex gap-2"><span className="text-vault-accent font-mono">1.</span> Click the button below to go to Ollama's website</li>
                  <li className="flex gap-2"><span className="text-vault-accent font-mono">2.</span> Click the big "Download" button on their page</li>
                  <li className="flex gap-2"><span className="text-vault-accent font-mono">3.</span> Open the downloaded file and follow the installer</li>
                  <li className="flex gap-2"><span className="text-vault-accent font-mono">4.</span> Come back here and click "Check again"</li>
                </ol>
              </div>
              <div className="flex gap-3">
                <a
                  href="https://ollama.com/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-vault-accent hover:bg-vault-accent-dim text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
                >
                  <ExternalLink size={14} />
                  Download Ollama
                </a>
                <button
                  onClick={checkOllama}
                  className="flex items-center gap-2 border border-vault-border hover:border-vault-accent/40 text-vault-text-dim hover:text-vault-text text-sm px-4 py-2.5 rounded-lg transition-colors"
                >
                  <Loader2 size={14} />
                  Check again
                </button>
              </div>
            </div>
          )}
        </Step>

        {/* Step 2 — Download AI model */}
        <Step number="2" title="Download an AI model" done={modelDone} active={ollamaDone && !modelDone}>
          <p className="text-vault-text-dim text-sm mb-4">
            The AI model is what reads your transcript and generates insights. It downloads once and lives on your machine forever — no internet needed after that.
          </p>

          {!ollamaDone ? (
            <p className="text-vault-text-dim text-sm italic">Complete step 1 first.</p>
          ) : (
            <div className="space-y-4">
              {/* Model picker */}
              <div className="space-y-2">
                {MODELS.map(m => (
                  <label
                    key={m.id}
                    className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                      selectedModel === m.id
                        ? "border-vault-accent/50 bg-vault-accent/5"
                        : "border-vault-border hover:border-vault-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="model"
                      value={m.id}
                      checked={selectedModel === m.id}
                      onChange={() => setSelectedModel(m.id)}
                      className="mt-0.5 accent-[#5B6CFF]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-vault-text">{m.label}</span>
                        {m.recommended && (
                          <span className="text-[10px] font-mono bg-vault-accent/10 text-vault-accent px-1.5 py-0.5 rounded">recommended</span>
                        )}
                      </div>
                      <p className="text-vault-text-dim text-xs mt-0.5">{m.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {modelDone ? (
                <div className="flex items-center gap-2 text-vault-green text-sm font-medium">
                  <CheckCircle2 size={15} />
                  Model ready.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-vault-bg border border-vault-border rounded-lg p-4 text-sm text-vault-text-dim space-y-1">
                    <p className="font-medium text-vault-text">To download the model:</p>
                    <p>1. Open Terminal (Mac: press Cmd+Space, type "Terminal") or Command Prompt on Windows</p>
                    <p>2. Copy and paste this command, then press Enter:</p>
                    <div className="font-mono bg-vault-muted/20 border border-vault-border rounded px-3 py-2 text-vault-accent text-xs mt-2 select-all">
                      ollama pull {selectedModel}
                    </div>
                    <p className="mt-2">3. Wait for it to finish (a progress bar will appear), then click "Check again" below.</p>
                  </div>
                  <button
                    onClick={async () => {
                      const ms = await invoke("list_ollama_models");
                      setModels(ms);
                      if (ms.some(m => m.startsWith(selectedModel.split(":")[0]))) {
                        setModelPulled(true);
                      }
                    }}
                    className="flex items-center gap-2 border border-vault-border hover:border-vault-accent/40 text-vault-text-dim hover:text-vault-text text-sm px-4 py-2.5 rounded-lg transition-colors"
                  >
                    <Loader2 size={14} />
                    Check again
                  </button>
                </div>
              )}
            </div>
          )}
        </Step>

        {/* Step 3 — Transcription quality */}
        <Step number="3" title="Transcription quality" done={!!selectedWhisperModel} active={modelDone}>
          <p className="text-vault-text-dim text-sm mb-4">
            Listne transcribes audio locally using Whisper — already built into the app, nothing to install. Pick how accurate you want it; based on your Mac's memory, we've pre-selected the best option below.
          </p>

          {whisperModels.length === 0 ? (
            <div className="flex items-center gap-2 text-vault-text-dim text-sm">
              <Loader2 size={14} className="animate-spin" /> Checking your system...
            </div>
          ) : (
            <div className="space-y-2">
              {whisperModels.map(m => (
                <label
                  key={m.filename}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                    selectedWhisperModel === m.filename
                      ? "border-vault-accent/50 bg-vault-accent/5"
                      : "border-vault-border hover:border-vault-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="whisper-model"
                    value={m.filename}
                    checked={selectedWhisperModel === m.filename}
                    onChange={() => {
                      setSelectedWhisperModel(m.filename);
                      localStorage.setItem("listne_whisper_model", m.filename);
                    }}
                    className="mt-0.5 accent-[#5B6CFF]"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-vault-text">{m.label}</span>
                      {m.recommended && (
                        <span className="text-[10px] font-mono bg-vault-accent/10 text-vault-accent px-1.5 py-0.5 rounded">
                          recommended for your Mac
                        </span>
                      )}
                    </div>
                    <p className="text-vault-text-dim text-xs mt-0.5">~{m.size_mb}MB · already included, no download needed</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </Step>
      </div>

      {/* Privacy note */}
      <div className="mt-8 flex items-start gap-3 bg-vault-surface border border-vault-border rounded-xl px-5 py-4">
        <Cpu size={16} className="text-vault-text-dim mt-0.5 flex-shrink-0" />
        <p className="text-vault-text-dim text-xs leading-relaxed">
          Everything runs on your machine. Your transcripts, your meeting content, your analysis — none of it is sent to any server. Not ours, not anyone's.
        </p>
      </div>
    </div>
  );
}
