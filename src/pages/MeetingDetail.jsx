import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { invoke } from "../lib/tauri";
import {
  ArrowLeft, CheckSquare, Lightbulb, Scale, Mail, FileText,
  Copy, CheckCheck, Loader2, User, Clock
} from "lucide-react";

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 text-vault-text-dim hover:text-vault-text text-xs transition-colors">
      {copied ? <CheckCheck size={12} className="text-vault-green" /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Panel({ icon: Icon, title, color = "accent", children, extra }) {
  const colors = {
    accent: "text-vault-accent border-vault-accent/20 bg-vault-accent/5",
    green: "text-vault-green border-vault-green/20 bg-vault-green/5",
    amber: "text-vault-amber border-vault-amber/20 bg-vault-amber/5",
    indigo: "text-indigo-400 border-indigo-400/20 bg-indigo-400/5",
  };
  return (
    <div className="bg-vault-surface border border-vault-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-vault-border">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg border ${colors[color]}`}>
            <Icon size={13} />
          </div>
          <span className="text-sm font-medium text-vault-text">{title}</span>
        </div>
        {extra}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function safeParse(str, fallback = []) {
  try { return JSON.parse(str) || fallback; }
  catch { return fallback; }
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }) +
    " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function MeetingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("insights"); // insights | transcript

  useEffect(() => {
    invoke("get_meeting", { id }).then(m => { setMeeting(m); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <Loader2 size={20} className="text-vault-accent animate-spin" />
    </div>
  );

  if (!meeting) return (
    <div className="px-8 py-8">
      <p className="text-vault-text-dim">Meeting not found.</p>
    </div>
  );

  const actionItems = safeParse(meeting.action_items);
  const decisions = safeParse(meeting.decisions);
  const sidelinedIdeas = safeParse(meeting.sidelined_ideas);

  return (
    <div className="px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1.5 text-vault-text-dim hover:text-vault-text text-sm mb-4 transition-colors"
        >
          <ArrowLeft size={14} /> All meetings
        </button>
        <h1 className="font-mono font-semibold text-xl text-vault-text mb-1">{meeting.title}</h1>
        <p className="text-vault-text-dim text-sm">{formatDate(meeting.created_at)}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-vault-surface border border-vault-border rounded-lg p-1 w-fit">
        {["insights", "transcript"].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t ? "bg-vault-accent text-white" : "text-vault-text-dim hover:text-vault-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "insights" && (
        <div className="space-y-4">
          {/* Summary */}
          {meeting.summary && (
            <Panel icon={FileText} title="Summary" color="accent">
              <p className="text-vault-text text-sm leading-relaxed">{meeting.summary}</p>
            </Panel>
          )}

          {/* Action items */}
          <Panel
            icon={CheckSquare}
            title="Action Items"
            color="green"
            extra={<span className="font-mono text-xs text-vault-text-dim">{actionItems.length} tasks</span>}
          >
            {actionItems.length === 0 ? (
              <p className="text-vault-text-dim text-sm">No action items found.</p>
            ) : (
              <div className="space-y-3">
                {actionItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded border border-vault-border flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-vault-text text-sm">{item.task}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {item.owner && (
                          <span className="flex items-center gap-1 text-vault-text-dim text-xs">
                            <User size={10} /> {item.owner}
                          </span>
                        )}
                        {item.due && (
                          <span className="flex items-center gap-1 text-vault-text-dim text-xs">
                            <Clock size={10} /> {item.due}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Decisions */}
          <Panel
            icon={Scale}
            title="Decisions Made"
            color="indigo"
            extra={<span className="font-mono text-xs text-vault-text-dim">{decisions.length} decisions</span>}
          >
            {decisions.length === 0 ? (
              <p className="text-vault-text-dim text-sm">No decisions found.</p>
            ) : (
              <div className="space-y-3">
                {decisions.map((d, i) => (
                  <div key={i} className="border-l-2 border-indigo-400/40 pl-4">
                    <p className="text-vault-text text-sm font-medium">{d.decision}</p>
                    {d.context && <p className="text-vault-text-dim text-xs mt-0.5">{d.context}</p>}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Sidelined Ideas — THE USP */}
          <Panel
            icon={Lightbulb}
            title="Sidelined Ideas"
            color="amber"
            extra={
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono bg-vault-amber/10 text-vault-amber px-1.5 py-0.5 rounded border border-vault-amber/20">
                  rescued
                </span>
                <span className="font-mono text-xs text-vault-text-dim">{sidelinedIdeas.length} ideas</span>
              </div>
            }
          >
            {sidelinedIdeas.length === 0 ? (
              <p className="text-vault-text-dim text-sm">No sidelined ideas detected.</p>
            ) : (
              <div className="space-y-4">
                {sidelinedIdeas.map((idea, i) => (
                  <div key={i} className="bg-vault-amber/5 border border-vault-amber/15 rounded-lg p-4">
                    <p className="text-vault-text text-sm font-medium mb-1">"{idea.idea}"</p>
                    <div className="flex items-center gap-3 text-xs text-vault-text-dim mb-2">
                      {idea.raised_by && <span className="flex items-center gap-1"><User size={10} /> {idea.raised_by}</span>}
                    </div>
                    {idea.context && <p className="text-vault-text-dim text-xs">{idea.context}</p>}
                    {idea.why_sidelined && (
                      <p className="text-vault-amber text-xs mt-1.5 font-medium">Why it got dropped: {idea.why_sidelined}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Follow-up email */}
          {meeting.follow_up_email && (
            <Panel
              icon={Mail}
              title="Follow-up Email Draft"
              color="accent"
              extra={<CopyButton text={meeting.follow_up_email} />}
            >
              <pre className="text-vault-text text-sm leading-relaxed whitespace-pre-wrap font-sans">
                {meeting.follow_up_email}
              </pre>
            </Panel>
          )}
        </div>
      )}

      {tab === "transcript" && (
        <div className="bg-vault-surface border border-vault-border rounded-xl p-5">
          {meeting.transcript ? (
            <pre className="text-vault-text-dim text-sm leading-relaxed whitespace-pre-wrap font-mono text-xs">
              {meeting.transcript}
            </pre>
          ) : (
            <p className="text-vault-text-dim text-sm">No transcript available.</p>
          )}
        </div>
      )}
    </div>
  );
}
