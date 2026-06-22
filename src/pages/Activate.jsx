import { useState } from "react";
import { invoke } from "../lib/tauri";
import { Shield, KeyRound, Loader2, CheckCircle, XCircle } from "lucide-react";

export default function Activate({ onActivated }) {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState(null); // null | "loading" | "success" | "error"
  const [message, setMessage] = useState("");

  async function handleActivate() {
    if (!key.trim()) return;
    setStatus("loading");
    try {
      const result = await invoke("activate_license", { key: key.trim() });
      if (result.valid) {
        setStatus("success");
        setTimeout(onActivated, 800);
      } else {
        setStatus("error");
        setMessage(result.message);
      }
    } catch (e) {
      setStatus("error");
      setMessage("Could not connect to activation server. Check your internet and try again.");
    }
  }

  return (
    <div className="h-full bg-vault-bg flex flex-col items-center justify-center px-6">
      {/* Icon */}
      <div className="w-14 h-14 rounded-2xl bg-vault-accent/10 border border-vault-accent/20 flex items-center justify-center mb-6">
        <Shield size={24} className="text-vault-accent" />
      </div>

      {/* Heading */}
      <h1 className="font-mono font-semibold text-vault-text text-2xl mb-1">Welcome to Listne</h1>
      <p className="text-vault-text-dim text-sm mb-8 text-center max-w-sm">
        Enter your license key from Gumroad to get started.
      </p>

      {/* Input */}
      <div className="w-full max-w-sm space-y-3">
        <div className="relative">
          <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-text-dim" />
          <input
            type="text"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={key}
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleActivate()}
            className="w-full bg-vault-surface border border-vault-border rounded-lg pl-9 pr-4 py-3 text-sm font-mono text-vault-text placeholder:text-vault-muted focus:outline-none focus:border-vault-accent transition-colors"
          />
        </div>

        <button
          onClick={handleActivate}
          disabled={status === "loading" || status === "success"}
          className="w-full bg-vault-accent hover:bg-vault-accent-dim disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
        >
          {status === "loading" && <Loader2 size={15} className="animate-spin" />}
          {status === "success" && <CheckCircle size={15} />}
          {status === "loading" ? "Activating..." : status === "success" ? "Activated!" : "Activate License"}
        </button>

        {status === "error" && (
          <div className="flex items-start gap-2 bg-vault-red/10 border border-vault-red/20 rounded-lg px-4 py-3">
            <XCircle size={15} className="text-vault-red mt-0.5 flex-shrink-0" />
            <p className="text-vault-red text-sm">{message}</p>
          </div>
        )}
      </div>

      <p className="mt-8 text-vault-text-dim text-xs">
        Don't have a license?{" "}
        <a
          href="https://gumroad.com/l/listne"
          target="_blank"
          rel="noopener noreferrer"
          className="text-vault-accent hover:underline"
        >
          Get Listne on Gumroad
        </a>
      </p>

      {/* DEV ONLY — remove before shipping to customers */}
      {import.meta.env.DEV && (
        <button
          onClick={onActivated}
          className="mt-6 text-[11px] font-mono text-vault-muted hover:text-vault-text-dim border border-vault-border hover:border-vault-accent/30 px-3 py-1.5 rounded-md transition-colors"
        >
          ⚙ Skip activation (dev mode only)
        </button>
      )}
    </div>
  );
}
