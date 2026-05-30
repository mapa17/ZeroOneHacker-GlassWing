import React from "react";
import { Compass, Zap, AlertTriangle, Download, Camera } from "lucide-react";
import { PERSONAS, personaById, DROPOFF_BENCHMARKS } from "../data/personas.js";
import { analyzeSession } from "../logic/personaClassifier.js";
import { dwellLevel, msToReadable, PAGE_NAMES } from "../logs/constants.js";
import { C, Stat, Bar, ScoreBar } from "./ui.jsx";

const LEVEL_COLOR = { ok: C.green, slow: C.amber, high: C.red };

export default function CoachDashboard({
  tick, buildSnapshot, sessions, onCaptureSession, onClearSessions, downloadJSON,
}) {
  const snap = buildSnapshot();
  const { signals, classification, funnel, dropOff } = analyzeSession(snap);
  const match = classification.match;
  const matchPersona = match ? personaById(match.id) : null;

  const reachedDwell = funnel.filter((f) => f.reached).map((f) => f.dwellMs);
  const maxDwell = Math.max(1, ...reachedDwell);

  return (
    <div data-tick={tick}>
      {/* header */}
      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Compass size={16} color={C.amber} />
          <span style={{ fontFamily: "Sora", fontWeight: 700, color: "#fff", fontSize: 14 }}>Conversion Coach · Persona-Erkennung</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCaptureSession}
            style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
              background: C.amber, color: C.lab, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Camera size={14} /> Sitzung erfassen
          </button>
          <button onClick={downloadJSON}
            style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.amber}`, cursor: "pointer", fontFamily: "inherit",
              background: "transparent", color: C.amber, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <Download size={14} /> JSON
          </button>
        </div>
      </div>

      {/* detected persona */}
      <div style={{ background: C.labPanel, border: `1px solid ${matchPersona ? matchPersona.color : C.labLine}`,
        borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <div style={{ color: "#6b7691", fontSize: 10.5, fontFamily: "JetBrains Mono", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>
          Erkannter Persona-Typ
        </div>
        {matchPersona ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "Sora", fontWeight: 800, color: "#fff", fontSize: 20 }}>{matchPersona.name}</span>
              <span style={{ color: matchPersona.color, fontWeight: 700, fontSize: 13, fontFamily: "JetBrains Mono" }}>
                {match.confidence}% Konfidenz
              </span>
            </div>
            <div style={{ color: matchPersona.color, fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>{matchPersona.segment}</div>
            <div style={{ color: "#9aa6c0", fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>{matchPersona.oneLiner}</div>
            <div style={{ marginTop: 12 }}>
              {match.reasons.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 4 }}>
                  <Zap size={13} color={matchPersona.color} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ color: "#cdd6e6", fontSize: 12.5, lineHeight: 1.4 }}>{r}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#1a2236" }}>
              <div style={{ color: "#6b7691", fontSize: 10.5, fontFamily: "JetBrains Mono", textTransform: "uppercase", marginBottom: 4 }}>
                Empfohlene Coach-Intervention
              </div>
              <div style={{ color: "#cdd6e6", fontSize: 12.5, lineHeight: 1.5 }}>{matchPersona.intervention}</div>
            </div>
          </>
        ) : (
          <div style={{ color: "#6b7691", fontSize: 13, lineHeight: 1.5 }}>
            Noch nicht genug Verhaltenssignale. Interagiere mit dem Formular (Tarife ansehen,
            zögern, zurückgehen) — der Typ wird live erkannt.
          </div>
        )}
      </div>

      {/* persona scores */}
      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ color: "#9aa6c0", fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1, marginBottom: 12 }}>
          PERSONA-WAHRSCHEINLICHKEIT
        </div>
        {PERSONAS.map((p) => (
          <ScoreBar key={p.id} name={`${p.name.split(" ")[0]} · ${p.short}`}
            pct={classification.scores[p.id]} color={p.color}
            highlight={match && match.id === p.id} />
        ))}
      </div>

      {/* funnel drop-off */}
      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ color: "#9aa6c0", fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1, marginBottom: 12 }}>
          FUNNEL · VERWEILDAUER &amp; ABBRUCH
        </div>
        {funnel.filter((f) => f.reached).map((f) => {
          const lvl = dwellLevel(f.step, f.dwellMs);
          return (
            <Bar key={f.step}
              label={`#${f.step} ${f.name}`}
              value={`${msToReadable(f.dwellMs)}${f.backOut ? ` · ↩${f.backOut}` : ""}${f.current ? " · aktiv" : ""}`}
              pct={(f.dwellMs / maxDwell) * 100}
              color={LEVEL_COLOR[lvl]}
              sub={lvl === "high" ? "hohe Verweildauer — Reibungspunkt" : null}
            />
          );
        })}
        {funnel.filter((f) => f.reached).length === 0 && (
          <div style={{ color: "#4f5972", fontSize: 12 }}>Noch keine Seiten besucht.</div>
        )}
      </div>

      {/* drop-off read */}
      {dropOff && (
        <div style={{ background: C.labPanel, border: `1px solid ${dropOff.inProgress ? C.labLine : C.red}`,
          borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={15} color={dropOff.inProgress ? C.amber : C.red} />
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>
              {dropOff.inProgress ? "Aktuelle Position" : "Abbruchpunkt"}
            </span>
          </div>
          <div style={{ color: "#cdd6e6", fontSize: 13 }}>
            <span style={{ color: "#6b7691", fontFamily: "JetBrains Mono" }}>#{dropOff.step} </span>{dropOff.page}
          </div>
          <div style={{ color: "#9aa6c0", fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{dropOff.reason}</div>
          {!dropOff.inProgress && (dropOff.step === 3 || dropOff.step >= 6) && (
            <div style={{ marginTop: 8, color: "#6b7691", fontSize: 11.5, lineHeight: 1.5 }}>
              UNIQA-Benchmark: {dropOff.step === 3
                ? `${Math.round(DROPOFF_BENCHMARKS.firstPriceScreen * 100)}% brechen an der ersten Preis-Seite ab.`
                : `${Math.round(DROPOFF_BENCHMARKS.finalPrice * 100)}% brechen am Endpreis ab.`}
            </div>
          )}
        </div>
      )}

      {/* friction signals */}
      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ color: "#9aa6c0", fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1, marginBottom: 12 }}>
          REIBUNGS-SIGNALE
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Stat label="Tarif-Verweildauer" value={signals.tarifDwellReadable} />
          <Stat label="Hesitation-Score" value={signals.hesitationScore} />
          <Stat label="Tarif-Wechsel" value={signals.tarifSwitches} />
          <Stat label="Tarife gehovert" value={signals.distinctTariffsHovered} />
          <Stat label="„Beratung“-Hovers" value={signals.advisoryHovers} />
          <Stat label="„Weiter“-Zögern" value={signals.ctaHesitations} />
          <Stat label="Zurück-Klicks" value={signals.totalBack} />
          <Stat label="Add-on-Churn" value={signals.addonChurn} />
        </div>
        {signals.overwhelmedTariff && (
          <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "#2a1d1d",
            border: `1px solid ${C.red}`, color: C.red, fontSize: 12, fontWeight: 600 }}>
            Überforderungs-Muster: lange auf der Tarif-Seite ohne eine Auswahl.
          </div>
        )}
      </div>

      {/* captured sessions */}
      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.labLine}`, color: "#9aa6c0",
          fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>ERFASSTE SITZUNGEN ({sessions.length})</span>
          {sessions.length > 0 && (
            <button onClick={onClearSessions}
              style={{ background: "transparent", border: "none", color: "#6b7691", cursor: "pointer",
                fontFamily: "inherit", fontSize: 11 }}>leeren</button>
          )}
        </div>
        {sessions.length === 0 ? (
          <div style={{ color: "#4f5972", fontSize: 12, padding: 14, lineHeight: 1.5 }}>
            Noch keine Sitzungen erfasst. Spiele das Formular als eine Persona durch und klicke
            „Sitzung erfassen“ — oder erreiche das Ergebnis (wird automatisch erfasst).
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#6b7691", textAlign: "left" }}>
                  {["#", "Typ", "Konf.", "Abbruch", "Score"].map((h) => (
                    <th key={h} style={{ padding: "7px 10px", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => {
                  const mp = s.match ? personaById(s.match.id) : null;
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${C.labLine}`, color: "#cdd6e6" }}>
                      <td style={{ padding: "7px 10px", fontFamily: "JetBrains Mono" }}>{i + 1}</td>
                      <td style={{ padding: "7px 10px", color: mp ? mp.color : "#6b7691", fontWeight: 600 }}>
                        {mp ? mp.name.split(" ")[0] : "—"}
                      </td>
                      <td style={{ padding: "7px 10px", fontFamily: "JetBrains Mono" }}>{s.match ? `${s.match.confidence}%` : "—"}</td>
                      <td style={{ padding: "7px 10px" }}>
                        {s.dropOff ? `#${s.dropOff.step} ${PAGE_NAMES[s.dropOff.step] || ""}` : "abgeschlossen"}
                      </td>
                      <td style={{ padding: "7px 10px", fontFamily: "JetBrains Mono" }}>{s.hesitationScore}</td>
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
