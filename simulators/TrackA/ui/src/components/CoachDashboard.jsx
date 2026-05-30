import React, { useMemo, useState, useCallback } from "react";
import { Compass, Download, Camera, MessageCircle, TrendingUp, Activity } from "lucide-react";
import { PERSONAS, personaById } from "../data/personas.js";
import { analyzeSession } from "../logic/personaClassifier.js";
import { runLiveCoach, mapQuestionAnswer } from "../logic/liveCoachEngine.js";
import { msToReadable, PAGE_NAMES } from "../logs/constants.js";
import { C, Stat, Bar, ScoreBar } from "./ui.jsx";

export default function CoachDashboard({
  tick, livePulse, buildSnapshot, sessions, onCaptureSession, onClearSessions, downloadJSON, trackEvent,
}) {
  const [answers, setAnswers] = useState({});
  const answeredIds = useMemo(() => new Set(Object.keys(answers)), [answers]);

  const snap = buildSnapshot();
  const { signals, classification } = analyzeSession(snap);
  const coach = useMemo(
    () => runLiveCoach({ snap, answers, answeredIds }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [livePulse, tick, answers, snap.currentStep, snap.totalDurationMs, snap.summary?.selectedTarif,
      snap.summary?.cursorMoves, snap.summary?.hovers, snap.liveOnStep?.cursorMoves],
  );

  const { chances, stepLadder, liveSignals, suggestion, primaryQuestion } = coach;

  const onAnswer = useCallback((questionId, optionId, optionLabel) => {
    setAnswers((prev) => ({ ...prev, ...mapQuestionAnswer(questionId, optionId) }));
    trackEvent?.("coach_answer", { questionId, optionId, label: optionLabel });
  }, [trackEvent]);

  const pctColor = chances.adjustedPct >= 25 ? C.green : chances.adjustedPct >= 8 ? C.amber : C.red;

  return (
    <div data-tick={tick}>
      {/* header */}
      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Compass size={16} color={C.amber} />
          <span style={{ fontFamily: "Sora", fontWeight: 700, color: "#fff", fontSize: 14 }}>
            Live Coach · Schritt {chances.step} · direkte live400-Daten
          </span>
        </div>
        <div style={{ color: "#6b7691", fontSize: 11, fontFamily: "JetBrains Mono", marginBottom: 12 }}>
          {coach.source}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onCaptureSession}
            style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
              background: C.amber, color: C.lab, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Camera size={14} /> Sitzung erfassen
          </button>
          <button type="button" onClick={downloadJSON}
            style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.amber}`, cursor: "pointer", fontFamily: "inherit",
              background: "transparent", color: C.amber, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> JSON
          </button>
        </div>
      </div>

      {/* DIRECT: purchase chance at current step */}
      <div style={{ background: "#1a2236", border: `2px solid ${pctColor}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <TrendingUp size={18} color={pctColor} />
          <span style={{ color: "#9aa6c0", fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1 }}>
            KAUFCHANCE JETZT · SCHRITT {chances.step}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "Sora", fontWeight: 800, fontSize: 42, color: pctColor, lineHeight: 1 }}>
            {chances.adjustedPct}%
          </span>
          <span style={{ color: "#6b7691", fontSize: 13 }}>
            Abbruch-Risiko {chances.dropPct}%
          </span>
        </div>
        <div style={{ color: "#cdd6e6", fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
          {chances.dataSource}
        </div>
        <div style={{ color: "#6b7691", fontSize: 11, marginTop: 6 }}>
          Basis an Schritt {chances.step}: {chances.basePct}% ({chances.purchasedN}/{chances.sampleN} in live400)
        </div>
        {chances.adjustments.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #2a3348" }}>
            <div style={{ color: "#6b7691", fontSize: 10, fontFamily: "JetBrains Mono", marginBottom: 6 }}>LIVE-ANPASSUNG</div>
            {chances.adjustments.map((a, i) => (
              <div key={i} style={{ color: "#9aa6c0", fontSize: 12, marginBottom: 4 }}>
                → {a.label}: <strong style={{ color: "#fff" }}>{a.purchasePct}%</strong>
                {a.n ? ` (n=${a.n})` : ""}
              </div>
            ))}
          </div>
        )}
        {chances.topDropReason && (
          <div style={{ marginTop: 10, color: C.red, fontSize: 12 }}>
            Häufigster Abbruchgrund ab hier: {chances.topDropReason.label} ({chances.topDropReason.pct}%)
          </div>
        )}
      </div>

      {/* Step ladder — direct live400 funnel conversion */}
      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ color: "#9aa6c0", fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1, marginBottom: 12 }}>
          TRICHTER · KAUFQUOTE PRO SCHRITT (live400)
        </div>
        {stepLadder.map((r) => (
          <Bar key={r.step}
            label={`#${r.step} ${r.page}${r.current ? " ← Sie" : ""}`}
            value={`${r.purchasePct}% · ${r.purchased}/${r.reached}`}
            pct={r.purchasePct}
            color={r.current ? C.amber : r.purchasePct >= 25 ? C.green : r.purchasePct >= 8 ? "#6b7691" : C.red}
          />
        ))}
      </div>

      {/* ALWAYS: support at this step */}
      <div style={{ background: C.labPanel, border: `1px solid ${C.green}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ color: C.green, fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1, marginBottom: 6 }}>
          SUPPORT SCHRITT {chances.step} · IMMER
        </div>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{chances.support.title}</div>
        <div style={{ color: "#cdd6e6", fontSize: 12.5, lineHeight: 1.5, marginBottom: 8 }}>{chances.support.text}</div>
        <div style={{ color: C.amber, fontSize: 13, fontWeight: 600 }}>→ {chances.support.action}</div>
        <div style={{ marginTop: 10, padding: "8px 10px", background: "#1a2236", borderRadius: 8 }}>
          <span style={{ color: "#6b7691", fontSize: 11 }}>Empfehlung: </span>
          <span style={{ color: "#fff", fontSize: 12.5, fontWeight: 600 }}>{suggestion.label}</span>
          <div style={{ color: "#9aa6c0", fontSize: 11.5, marginTop: 4 }}>{suggestion.reason}</div>
        </div>
      </div>

      {/* LIVE tracking — updates on mouse move, hover, click */}
      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Activity size={14} color={C.amber} />
          <span style={{ color: "#9aa6c0", fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1 }}>
            LIVE · Maus &amp; Interaktion (pulse #{livePulse})
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Stat label="Seiten-Zeit" value={liveSignals.pageDwell} />
          <Stat label="Cursor (Schritt)" value={liveSignals.cursorOnStep} />
          <Stat label="Cursor (gesamt)" value={liveSignals.cursorMoves} />
          <Stat label="Distanz Schritt" value={`${liveSignals.cursorDistancePx} px`} />
          <Stat label="Maus-Position" value={
            liveSignals.cursorPositionPct
              ? `${liveSignals.cursorPositionPct.x}% · ${liveSignals.cursorPositionPct.y}%`
              : "—"
          } />
          <Stat label="Hover aktiv" value={liveSignals.activeHoverCount} />
          <Stat label="Klicks" value={liveSignals.clicks} />
          <Stat label="Engagement" value={liveSignals.engagement} />
          <Stat label="Beratung-Hover" value={liveSignals.advisoryHovers} />
          <Stat label="Gerade über Beratung" value={liveSignals.advisoryHoverActive ? "ja" : "nein"} />
        </div>
        {liveSignals.activeHovers.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: "#9aa6c0" }}>
            Aktiv: {liveSignals.activeHovers.map((h) => h.target).join(", ")}
          </div>
        )}
      </div>

      {/* Dynamic question (refines %) */}
      {primaryQuestion && (
        <div style={{ background: "#1a2236", border: `1px solid ${C.amber}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <MessageCircle size={15} color={C.amber} />
            <span style={{ color: C.amber, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono" }}>
              FRAGE (verfeinert die %)
            </span>
          </div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{primaryQuestion.title}</div>
          <div style={{ color: "#cdd6e6", fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>{primaryQuestion.body}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {primaryQuestion.options.map((opt) => (
              <button key={opt.id} type="button"
                onClick={() => onAnswer(primaryQuestion.id, opt.id, opt.label)}
                style={{
                  padding: "10px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  background: answers[primaryQuestion.id] === opt.id ? C.amber : "#252d42",
                  color: answers[primaryQuestion.id] === opt.id ? C.lab : "#cdd6e6",
                  border: `1px solid ${answers[primaryQuestion.id] === opt.id ? C.amber : "#3a4560"}`,
                  fontWeight: answers[primaryQuestion.id] === opt.id ? 700 : 500, fontSize: 13,
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {Object.keys(answers).length > 0 && (
        <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ color: "#9aa6c0", fontSize: 11, fontFamily: "JetBrains Mono", marginBottom: 8 }}>ANTWORTEN (in JSON)</div>
          {Object.entries(answers).map(([k, v]) => (
            <div key={k} style={{ color: "#cdd6e6", fontSize: 12 }}><span style={{ color: "#6b7691" }}>{k}:</span> {v}</div>
          ))}
        </div>
      )}

      {/* behavior type (secondary) */}
      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ color: "#9aa6c0", fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1, marginBottom: 12 }}>
          VERHALTENSTYP (Tracking)
        </div>
        {PERSONAS.map((p) => (
          <ScoreBar key={p.id} name={`${p.name.split(" ")[0]} · ${p.short}`}
            pct={classification.scores[p.id]} color={p.color}
            highlight={classification.match?.id === p.id} />
        ))}
      </div>

      {/* sessions table */}
      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.labLine}`, color: "#9aa6c0", fontSize: 11, fontFamily: "JetBrains Mono" }}>
          ERFASSTE SITZUNGEN ({sessions.length})
        </div>
        {sessions.length === 0 ? (
          <div style={{ color: "#4f5972", fontSize: 12, padding: 14 }}>Tracking + coach_answer landen im JSON-Export.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#6b7691" }}>
                  {["#", "Typ", "Abbruch"].map((h) => <th key={h} style={{ padding: "7px 10px", textAlign: "left" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => {
                  const mp = s.match ? personaById(s.match.id) : null;
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${C.labLine}`, color: "#cdd6e6" }}>
                      <td style={{ padding: "7px 10px" }}>{i + 1}</td>
                      <td style={{ padding: "7px 10px", color: mp?.color }}>{mp?.name.split(" ")[0] || "—"}</td>
                      <td style={{ padding: "7px 10px" }}>
                        {s.dropOff ? `#${s.dropOff.step}` : "OK"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
