import React, { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, Send, ChevronDown, Loader2 } from "lucide-react";
import { requestCoachReply } from "../logic/coachChatEngine.js";
import { detectProactiveReason, resetStepCoachState, buildDynamicStepHint } from "../logic/coachProactive.js";
import { mapQuestionAnswer } from "../logic/liveCoachEngine.js";
import { PAGE_NAMES } from "../logs/constants.js";
import { C } from "./ui.jsx";

const STEP_SCREEN = {
  0: "Zwei große Karten: „Bei Arztbesuchen“ und „Im Krankenhaus“.",
  1: "Wer versichert werden soll: „Ich selbst“ oder „Andere Personen“.",
  2: "Geburtsdatum und Sozialversicherung (ÖGK, BVAEB, …).",
  3: "Vier Tarife in Karten: Start, Optimal (online), Opt. Plus & Premium (nur Beratung).",
  4: "Optionale Zusatzmodule (Fit, Eltern, Mental, …).",
  5: "Persönliche Daten: Name, Kontakt, Größe/Gewicht, Sport, Schwangerschaft.",
  6: "Drei Ja/Nein-Fragen zu Vorversicherung und Gesundheit.",
  7: "Beratungsort wählen (Video, Telefon, …).",
  8: "Ergebnis: Online abschließbar oder Beratung nötig.",
};

function ChatBubble({ role, text }) {
  const isCoach = role === "coach";
  return (
    <div data-coach-message={isCoach ? "coach" : "user"}
      style={{
        alignSelf: isCoach ? "flex-start" : "flex-end",
        maxWidth: "92%",
        padding: "10px 12px",
        borderRadius: isCoach ? "14px 14px 14px 4px" : "14px 14px 4px 14px",
        background: isCoach ? "#fff" : C.blue,
        color: isCoach ? C.ink : "#fff",
        fontSize: 13.5,
        lineHeight: 1.45,
        boxShadow: isCoach ? "0 2px 8px rgba(0,0,0,.08)" : "none",
      }}>
      {text}
    </div>
  );
}

export default function CoachChat({
  livePulse, buildSnapshot, trackEvent, step,
  form, premium, outcome, stepErrors,
}) {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inFlightRef = useRef(false);
  const visitedStepsRef = useRef(new Set());
  const proactiveStateRef = useRef({});
  const checkTimerRef = useRef(null);
  const mountedRef = useRef(false);
  const prevStepRef = useRef(0);
  const callCoachRef = useRef(null);

  const pushLocal = useCallback((text, trigger) => {
    if (!text?.trim()) return;
    setMessages((m) => [...m, { id: `${Date.now()}-l`, role: "coach", text, quickReplies: [], trigger }]);
  }, []);

  const pushCoach = useCallback((parsed, trigger) => {
    const text = [parsed.message, parsed.question].filter(Boolean).join(" ");
    if (!text.trim()) return;
    setMessages((m) => [...m, {
      id: `${Date.now()}-c`,
      role: "coach",
      text,
      quickReplies: parsed.quickReplies || [],
      trigger,
    }]);
    trackEvent?.("coach_message", {
      step,
      mood: parsed.mood,
      struggle: parsed.struggle,
      trigger,
      purchasePctDev: parsed._dev?.purchasePct,
    });
  }, [step, trackEvent]);

  const callCoach = useCallback(async (userMessage, trigger, contextNote = "", historyOverride = null) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError("");
    try {
      const history = (historyOverride ?? messages).map((m) => ({
        role: m.role === "coach" ? "assistant" : "user",
        text: m.text,
      }));
      const snap = buildSnapshot();
      const parsed = await requestCoachReply({
        snap,
        answers,
        chatHistory: history,
        userMessage,
        stepScreen: STEP_SCREEN[step] || PAGE_NAMES[step],
        contextNote,
        form,
        premium,
        outcome,
        stepErrors,
        step,
      });
      pushCoach(parsed, trigger);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [messages, answers, buildSnapshot, step, pushCoach, form, premium, outcome, stepErrors]);

  // Keep a fresh reference so the debounced proactive timer never fires a stale call.
  useEffect(() => { callCoachRef.current = callCoach; }, [callCoach]);

  // Initial welcome once
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    visitedStepsRef.current.add(0);
    pushLocal(
      "Hallo! Ich bin Ihr UNIQA-Helfer — ich schaue mit, wo Sie im Formular sind, und helfe bei Fragen. Schreiben Sie einfach, wenn Sie unsicher sind.",
      "welcome",
    );
  }, [pushLocal]);

  // Static, selection-aware hint — once per step per session. Also handles restart.
  useEffect(() => {
    const prev = prevStepRef.current;
    prevStepRef.current = step;

    // Funnel restarted (Ergebnis → früher Schritt): clear chat & start fresh.
    if (prev === 8 && step < prev) {
      visitedStepsRef.current = new Set();
      proactiveStateRef.current = {};
      setMessages([]);
      setError("");
    }

    resetStepCoachState(proactiveStateRef.current, step);

    if (visitedStepsRef.current.has(step)) return;
    visitedStepsRef.current.add(step);

    const hint = buildDynamicStepHint(form, step, premium, buildSnapshot());
    if (hint) pushLocal(hint, "step_hint");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Proactive LLM only on meaningful signals — checked slowly, not on every mouse move
  useEffect(() => {
    if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
    checkTimerRef.current = setTimeout(() => {
      // Don't consume a trigger while a request is in flight — retry on next pulse.
      if (inFlightRef.current) return;
      const snap = buildSnapshot();
      const reason = detectProactiveReason(snap, proactiveStateRef.current);
      if (reason) {
        callCoachRef.current?.(
          null,
          reason,
          `Proaktiv eingreifen wegen: ${reason}. Kurz helfen, nicht wiederholen was schon im Chat steht.`,
        );
      }
    }, 2500);

    return () => { if (checkTimerRef.current) clearTimeout(checkTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePulse]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const sendUser = useCallback(async (text) => {
    const t = (text || input).trim();
    if (!t || inFlightRef.current) return;
    setInput("");
    const userMsg = { id: `${Date.now()}-u`, role: "user", text: t };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    trackEvent?.("coach_user_message", { step, text: t.slice(0, 200) });
    await callCoach(t, "user_reply", "", nextHistory);
  }, [input, messages, step, trackEvent, callCoach]);

  const onQuickReply = (label) => {
    const mapped = mapQuestionAnswer("quick", label.toLowerCase().includes("beratung") ? "advisor" : "budget");
    setAnswers((a) => ({ ...a, ...mapped, lastQuick: label }));
    sendUser(label);
  };

  const lastCoach = [...messages].reverse().find((m) => m.role === "coach");
  const quickReplies = lastCoach?.quickReplies?.length ? lastCoach.quickReplies : [];

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label="Chat öffnen"
        data-coach-toggle="open"
        style={{
          position: "fixed", right: 22, bottom: 22, zIndex: 9999,
          width: 58, height: 58, borderRadius: "50%", border: "none", cursor: "pointer",
          background: C.blue, color: "#fff", boxShadow: "0 8px 28px rgba(11,74,145,.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        <MessageCircle size={26} />
      </button>
    );
  }

  return (
    <div data-coach-chat="open"
      style={{
        position: "fixed", right: 22, bottom: 22, zIndex: 9999, width: 360,
        height: 480, maxHeight: "78vh", borderRadius: 16, overflow: "hidden",
        background: "#f4f7fc", border: `1px solid ${C.line}`,
        boxShadow: "0 16px 48px rgba(0,0,0,.18)", fontFamily: "Outfit, sans-serif",
        display: "flex", flexDirection: "column",
      }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
        background: C.blue, color: "#fff",
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,.15)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <MessageCircle size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Sora", fontWeight: 800, fontSize: 15 }}>UNIQA Helfer</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>{PAGE_NAMES[step] || `Schritt ${step}`}</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} data-coach-toggle="minimize"
          style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}>
          <ChevronDown size={20} />
        </button>
      </div>

      <div ref={scrollRef} data-coach-messages
        style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m) => <ChatBubble key={m.id} role={m.role} text={m.text} />)}
        {loading && (
          <div style={{ alignSelf: "flex-start", color: C.sub, fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
            <Loader2 size={14} className="spin" /> denkt nach …
          </div>
        )}
        {error && <div style={{ color: C.red, fontSize: 11 }}>{error}</div>}
      </div>

      {quickReplies.length > 0 && (
        <div style={{ padding: "0 12px 8px", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {quickReplies.map((q) => (
            <button key={q} type="button" data-coach-quick={q} onClick={() => onQuickReply(q)}
              style={{
                padding: "6px 10px", borderRadius: 999, border: `1px solid ${C.blue}`,
                background: "#fff", color: C.blue, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
              }}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.line}`, background: "#fff", display: "flex", gap: 8 }}>
        <input data-coach-input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendUser(); } }}
          placeholder="Nachricht …"
          style={{
            flex: 1, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.line}`,
            fontSize: 14, fontFamily: "inherit", outline: "none",
          }}
        />
        <button type="button" data-coach-send onClick={() => sendUser()} disabled={loading || !input.trim()}
          style={{
            width: 42, height: 42, borderRadius: 10, border: "none", cursor: "pointer",
            background: input.trim() ? C.blue : C.line, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
