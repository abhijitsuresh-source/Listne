import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "../lib/tauri";
import { Mic, Upload, Clock, CheckCircle2, Loader2, Trash2, ChevronRight } from "lucide-react";

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function StatusBadge({ status }) {
  if (status === "done") return (
    <span className="flex items-center gap-1 text-vault-green text-xs font-mono">
      <CheckCircle2 size={11} /> done
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-vault-amber text-xs font-mono">
      <Loader2 size={11} className="animate-spin" /> processing
    </span>
  );
}

export default function Dashboard() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const ms = await invoke("list_meetings");
    setMeetings(ms);
    setLoading(false);
  }

  async function deleteMeeting(e, id) {
    e.stopPropagation();
    await invoke("delete_meeting", { id });
    setMeetings(m => m.filter(x => x.id !== id));
  }

  return (
    <div className="px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-mono font-semibold text-xl text-vault-text">Meetings</h1>
          <p className="text-vault-text-dim text-sm mt-0.5">{meetings.length} recorded</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/record?mode=upload")}
            className="flex items-center gap-2 border border-vault-border hover:border-vault-accent/40 text-vault-text-dim hover:text-vault-text text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <Upload size={14} /> Upload audio
          </button>
          <button
            onClick={() => navigate("/record")}
            className="flex items-center gap-2 bg-vault-accent hover:bg-vault-accent-dim text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Mic size={14} /> Record meeting
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 text-vault-text-dim text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading...
        </div>
      ) : meetings.length === 0 ? (
        <div className="border border-dashed border-vault-border rounded-2xl p-16 flex flex-col items-center justify-center text-center">
          <Mic size={28} className="text-vault-muted mb-4" />
          <p className="text-vault-text font-medium text-sm mb-1">No meetings yet</p>
          <p className="text-vault-text-dim text-sm mb-6">Record a meeting or upload an audio file to get started.</p>
          <button
            onClick={() => navigate("/record")}
            className="bg-vault-accent hover:bg-vault-accent-dim text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            Start your first recording
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {meetings.map(m => (
            <div
              key={m.id}
              onClick={() => navigate(`/meeting/${m.id}`)}
              className="flex items-center gap-4 bg-vault-surface hover:bg-vault-border/30 border border-vault-border rounded-xl px-5 py-4 cursor-pointer transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-vault-text text-sm font-medium truncate">{m.title}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-vault-text-dim text-xs">
                    <Clock size={10} /> {formatDate(m.created_at)}
                  </span>
                  <StatusBadge status={m.status} />
                </div>
              </div>
              {m.action_items && (() => {
                try {
                  const items = JSON.parse(m.action_items);
                  return <span className="text-vault-text-dim text-xs font-mono">{items.length} actions</span>;
                } catch { return null; }
              })()}
              <button
                onClick={(e) => deleteMeeting(e, m.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-vault-red/10 rounded-lg transition-all"
              >
                <Trash2 size={14} className="text-vault-red" />
              </button>
              <ChevronRight size={14} className="text-vault-text-dim" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
