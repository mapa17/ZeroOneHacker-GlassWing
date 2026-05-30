import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  Compass, MessageCircle, ThumbsUp, ThumbsDown, X, ChevronDown,
  TrendingUp, TrendingDown, Minus, Sparkles,
} from "lucide-react";
import { analyzeSession } from "../logic/personaClassifier.js";
import { runLiveCoach, mapQuestionAnswer } from "../logic/liveCoachEngine.js";
import { personaById } from "../data/personas.js";
import { C } from "./ui.jsx";
import IMPACT from "../data/coachImpact.json";

// Floating on-screen helper. Sits over the real funnel like an assistant, reads
// the live tracking signals every pulse, shows a behaviour-based personality
// read + a purchase prediction, offers contextual help, and asks the user
// whether it actually helped — so we can measure the coach's real effect.
export default function CoachHelper({ tick, livePulse, buildSnapshot, trackEvent, step }) {
  const [open, setOpen] = useState(true);
  const [answers, setAnswers] = useState({});
  const [feedback, setFeedback] = useState({ up: 0, down: 0, last: null });
  const answeredIds = useMemo(() => new Set(Object.keys(answers)), [answers]);
  const prevPctRef = useRef(null);

  const snap = buildSnapshot();
  const { classification } = analyzeSession(snap);
  const coach = useMemo(
    () => runLiveCoach({ snap, answers, answeredIds }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [livePulse, tick, answers, snap.currentStep, snap.totalDurationMs, snap.summary?.selectedTarif,
      snap.summary?.cursorMoves, snap.summary?.hovers, snap.liveOnStep?.cursorMoves],
  );

  const { chances, suggestion, primaryQuestion, liveSignals } = coach;
  const pct = chances.adjustedPct;

  // live delta so the prediction visibly reacts to mouse/interaction
  const prev = prevPctRef.current;
  const delta = prev == null ? 0 : pct - prev;
  useEffect(() => { prevPctRef.current = pct; }, [pct]);

  const onAnswer = useCallback((qId, optId, label) => {
    setAnswers((prev) => ({ ...prev, ...mapQuestionAnswer(qId, optId) }));
    trackEvent?.("coach_answer", { questionId: qId, optionId: optId, label });
  }, [trackEvent]);

  const sendFeedback = useCallback((helpful) => {
    setFeedback((f) => ({
      up: f.up + (helpful ? 1 : 0),
      down: f.down + (helpful ? 0 : 1),
      last: helpful ? "up" : "down",
    }));
    trackEvent?.("coach_feedback", {
      helpful, step: chances.step, suggestion: suggestion.label,
      predictedPct: pct, message: chances.support.action,
    });
  }, [trackEvent, chances.step, chances.support.action, suggestion.label, pct]);

  const pctColor = pct >= 25 ? C.green : pct >= 8 ? C.amber : C.red;
  const match = classification.match;
  const persona = match ? personaById(match.id) : null;

  // one-line "what I see you doing" read from behaviour + personality
  const behaviourLine = persona
    ? `Verhalten wie ${persona.name.split(" ")[0]} (${persona.short}) · ${match.confidence}%`
    : "Lese Ihr Verhalten noch …";
  const seeingLine = match?.reasons?.[0]
    || `${liveSignals.engagement} Engagement · ${liveSignals.pace} Tempo`;

  const helpedTotal = feedback.up + feedback.down;
  const helpfulRate = helpedTotal ? Math.round((feedback.up / helpedTotal) * 100) : null;

  const Trend = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const trendColor = delta > 0 ? C.green : delta < 0 ? C.red : "#6b7691";

  // ── collapsed bubble ───────────────────────────────────────────────────────
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label="Coach öffnen"
        style={{
          position: "fixed", right: 22, bottom: 22, zIndex: 9999,
          width: 64, height: 64, borderRadius: "50%", border: "none", cursor: "pointer",
          background: pctColor, color: "#fff", boxShadow: "0 8px 28px rgba(0,0,0,.35)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          fontFamily: "inherit", gap: 1,
        }}>
        <Compass size={18} />
        <span style={{ fontFamily: "Sora", fontWeight: 800, fontSize: 15, lineHeight: 1 }}>{pct}%</span>
      </button>
    );
  }

  // ── expanded helper ────────────────────────────────────────────────────────
  return (
    <div data-tick={tick}
      style={{
        position: "fixed", right: 22, bottom: 22, zIndex: 9999, width: 340,
        maxHeight: "82vh", overflowY: "auto", borderRadius: 16,
        background: "#11182a", border: `1px solid ${C.labLine}`,
        boxShadow: "0 16px 44px rgba(0,0,0,.45)", fontFamily: "Outfit, sans-serif",
      }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "12px 14px",
        borderBottom: `1px solid ${C.labLine}`, position: "sticky", top: 0,
        background: "#11182a", zIndex: 2,
      }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: C.amber, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Compass size={17} color={C.lab} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Sora", fontWeight: 800, color: "#fff", fontSize: 14, lineHeight: 1 }}>UNIQA Coach</div>
          <div style={{ color: "#6b7691", fontSize: 10.5, fontFamily: "JetBrains Mono", marginTop: 2 }}>
            Schritt {chances.step} · live pulse #{livePulse}
          </div>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Minimieren"
          style={{ background: "transparent", border: "none", color: "#6b7691", cursor: "pointer", padding: 4 }}>
          <ChevronDown size={18} />
        </button>
      </div>

      <div style={{ padding: 14 }}>
        {/* prediction */}
        <div style={{ background: "#1a2236", border: `2px solid ${pctColor}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ color: "#9aa6c0", fontSize: 10, fontFamily: "JetBrains Mono", letterSpacing: 1, marginBottom: 6 }}>
            KAUFCHANCE JETZT
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: "Sora", fontWeight: 800, fontSize: 38, color: pctColor, lineHeight: 1 }}>{pct}%</span>
            <span style={{ display: "flex", alignItems: "center", gap: 3, color: trendColor, fontSize: 12, fontWeight: 700 }}>
              <Trend size={14} />{delta !== 0 ? `${delta > 0 ? "+" : ""}${delta}` : "stabil"}
            </span>
            <span style={{ marginLeft: "auto", color: "#6b7691", fontSize: 11 }}>Abbruch {chances.dropPct}%</span>
          </div>
          <div style={{ color: "#8794ad", fontSize: 10.5, marginTop: 6 }}>
            Basis Schritt {chances.step}: {chances.basePct}% ({chances.purchasedN}/{chances.sampleN} live400)
          </div>
        </div>

        {/* what I see you doing — personality read */}
        <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 11, padding: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Sparkles size={13} color={C.amber} />
            <span style={{ color: "#9aa6c0", fontSize: 10, fontFamily: "JetBrains Mono", letterSpacing: 1 }}>WAS ICH SEHE</span>
          </div>
          <div style={{ color: persona?.color || "#fff", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{behaviourLine}</div>
          <div style={{ color: "#cdd6e6", fontSize: 11.5, lineHeight: 1.45 }}>{seeingLine}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {[
              `${liveSignals.engagement} Engagement`,
              `${liveSignals.pace} Tempo`,
              `${liveSignals.cursorOnStep} Cursor`,
              liveSignals.advisoryHoverActive ? "über Beratungs-Tarif" : null,
            ].filter(Boolean).map((t, i) => (
              <span key={i} style={{ background: "#232c43", color: "#9aa6c0", fontSize: 10, padding: "3px 8px", borderRadius: 999 }}>{t}</span>
            ))}
          </div>
        </div>

        {/* contextual help */}
        <div style={{ background: "#15243a", border: `1px solid ${C.green}`, borderRadius: 11, padding: 12, marginBottom: 12 }}>
          <div style={{ color: C.green, fontSize: 10, fontFamily: "JetBrains Mono", letterSpacing: 1, marginBottom: 5 }}>SO HELFE ICH</div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>{chances.support.title}</div>
          <div style={{ color: "#cdd6e6", fontSize: 12, lineHeight: 1.45, marginBottom: 8 }}>{chances.support.text}</div>
          <div style={{ color: C.amber, fontSize: 12.5, fontWeight: 600 }}>→ {suggestion.label}</div>
          <div style={{ color: "#8794ad", fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>{suggestion.reason}</div>
        </div>

        {/* refining question */}
        {primaryQuestion && (
          <div style={{ background: "#1a2236", border: `1px solid ${C.amber}`, borderRadius: 11, padding: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <MessageCircle size={13} color={C.amber} />
              <span style={{ color: C.amber, fontSize: 10, fontWeight: 700, fontFamily: "JetBrains Mono" }}>KURZE FRAGE</span>
            </div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{primaryQuestion.title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {primaryQuestion.options.map((opt) => (
                <button key={opt.id} type="button" onClick={() => onAnswer(primaryQuestion.id, opt.id, opt.label)}
                  style={{
                    padding: "9px 11px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    background: answers[primaryQuestion.id] === opt.id ? C.amber : "#252d42",
                    color: answers[primaryQuestion.id] === opt.id ? C.lab : "#cdd6e6",
                    border: `1px solid ${answers[primaryQuestion.id] === opt.id ? C.amber : "#3a4560"}`,
                    fontWeight: answers[primaryQuestion.id] === opt.id ? 700 : 500, fontSize: 12.5,
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* did it help? — measures the coach's real effect */}
        <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 11, padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#cdd6e6", fontSize: 12.5, fontWeight: 600, flex: 1 }}>Hilft Ihnen das?</span>
            <button type="button" onClick={() => sendFeedback(true)} aria-label="Hilfreich"
              style={{
                display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                background: feedback.last === "up" ? C.green : "#232c43",
                color: feedback.last === "up" ? "#fff" : "#9aa6c0",
                border: `1px solid ${feedback.last === "up" ? C.green : "#3a4560"}`,
              }}>
              <ThumbsUp size={13} /> Ja
            </button>
            <button type="button" onClick={() => sendFeedback(false)} aria-label="Nicht hilfreich"
              style={{
                display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                background: feedback.last === "down" ? C.red : "#232c43",
                color: feedback.last === "down" ? "#fff" : "#9aa6c0",
                border: `1px solid ${feedback.last === "down" ? C.red : "#3a4560"}`,
              }}>
              <ThumbsDown size={13} /> Nein
            </button>
          </div>
          {helpfulRate != null && (
            <div style={{ color: "#8794ad", fontSize: 10.5, marginTop: 8 }}>
              Hilfsquote diese Sitzung: {helpfulRate}% ({feedback.up}/{helpedTotal}) · landet im JSON-Log
            </div>
          )}
        </div>

        {/* projected impact — answers "will it help people?" */}
        <div style={{ marginTop: 12, padding: "10px 12px", background: "#15243a", borderRadius: 10, border: `1px dashed ${C.green}` }}>
          <div style={{ color: "#9aa6c0", fontSize: 10, fontFamily: "JetBrains Mono", marginBottom: 4 }}>
            PROJIZIERTE WIRKUNG (n={IMPACT.totals.sessions})
          </div>
          <div style={{ color: "#cdd6e6", fontSize: 12, lineHeight: 1.45 }}>
            Conversion <strong style={{ color: "#fff" }}>{IMPACT.conversion.baselinePct}%</strong>
            <span style={{ color: C.green, margin: "0 6px" }}>→ {IMPACT.conversion.projectedWithCoachPct}%</span>
            <span style={{ color: C.green, fontWeight: 700 }}>(+{IMPACT.conversion.upliftPp} pp)</span>
          </div>
          <div style={{ color: "#6b7691", fontSize: 10, marginTop: 4 }}>
            ~{IMPACT.totals.expectedRecovered} gerettete Abschlüsse · Modellannahme, per A/B-Test zu validieren
          </div>
        </div>
      </div>
    </div>
  );
}
