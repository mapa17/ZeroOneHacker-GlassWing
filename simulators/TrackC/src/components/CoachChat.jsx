import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, Send } from "lucide-react";
import { C } from "./ui.jsx";

/**
 * Coach chat window (web). Shows the coach's messages (advisor warnings) as a running
 * conversation and lets the user send messages back to the coach. Two-way replies to
 * user messages are a future feature — for now user messages are just recorded.
 */
export default function CoachChat({ messages, loading, onSend }) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const submit = (e) => {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft("");
  };

  return (
    <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 14,
      marginBottom: 14, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.labLine}`, display: "flex", alignItems: "center", gap: 8 }}>
        <MessageCircle size={16} color={C.amber} />
        <span style={{ fontFamily: "Sora", fontWeight: 700, color: "#fff", fontSize: 14 }}>Coach-Chat</span>
      </div>

      <div ref={scrollRef} style={{ maxHeight: 320, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.length === 0 && !loading ? (
          <div style={{ color: "#4f5972", fontSize: 12.5, lineHeight: 1.5 }}>
            Der Coach beobachtet Ihre Auswahl und meldet sich bei Bedarf.
            Sie können dem Coach auch selbst schreiben.
          </div>
        ) : (
          messages.map((m, i) => {
            const coach = m.role === "coach";
            return (
              <div key={i} style={{ alignSelf: coach ? "flex-start" : "flex-end", maxWidth: "85%",
                background: coach ? "#1a2236" : C.amber, color: coach ? "#cdd6e6" : C.lab,
                borderRadius: 10, padding: "8px 11px", fontSize: 12.5, lineHeight: 1.45 }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, marginBottom: 2, fontFamily: "JetBrains Mono" }}>
                  {coach ? "COACH" : "DU"}{m.step != null ? ` · Schritt ${m.step}` : ""}
                </div>
                {m.text}
              </div>
            );
          })
        )}
        {loading && (
          <div style={{ alignSelf: "flex-start", color: "#4f5972", fontSize: 12, fontStyle: "italic", padding: "4px 2px" }}>
            Coach denkt nach…
          </div>
        )}
      </div>

      <form onSubmit={submit} style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${C.labLine}` }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nachricht an den Coach…"
          style={{ flex: 1, background: "#0f1626", border: `1px solid ${C.labLine}`, borderRadius: 8,
            padding: "8px 10px", color: "#fff", fontSize: 13, outline: "none" }} />
        <button type="submit" aria-label="Senden"
          style={{ background: C.amber, color: C.lab, border: "none", borderRadius: 8, padding: "0 12px",
            cursor: "pointer", display: "flex", alignItems: "center", fontWeight: 700 }}>
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
