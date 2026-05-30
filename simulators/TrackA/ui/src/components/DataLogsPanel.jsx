import React from "react";
import { Info, RotateCcw } from "lucide-react";
import { msToReadable } from "../logs/constants.js";
import { C, Stat } from "./ui.jsx";

export default function DataLogsPanel({
  tick, buildSnapshot, snapshotText, copyJSON, downloadJSON, onResetTracking,
}) {
  const snap = buildSnapshot();
  const pageEntries = Object.keys(snap.pages)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => ({ step: k, ...snap.pages[k] }));
  const btnEntries = Object.entries(snap.buttons).sort((a, b) => b[1] - a[1]);

  const cursor = snap.cursor || { totalMoves: 0, totalDistancePx: 0, byStep: {} };
  const cursorSteps = Object.keys(cursor.byStep).sort((a, b) => Number(a) - Number(b));
  // aggregate hovers per target so the "cursor tracking" is legible at a glance
  const hoverAgg = {};
  (snap.hovers || []).forEach((h) => {
    const a = hoverAgg[h.target] || { count: 0, dwellMs: 0 };
    a.count += 1; a.dwellMs += h.dwellMs || 0;
    hoverAgg[h.target] = a;
  });
  const hoverEntries = Object.entries(hoverAgg).sort((a, b) => b[1].dwellMs - a[1].dwellMs);

  return (
    <div data-tick={tick}>
      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Info size={16} color={C.amber} />
          <span style={{ fontFamily: "Sora", fontWeight: 700, color: "#fff", fontSize: 14 }}>Daten-Logs · User Tracking</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <Stat label="Sitzungsdauer" value={msToReadable(snap.totalDurationMs)} />
          <Stat label="Aktuelle Seite" value={snap.currentPage} />
          <Stat label="Klicks gesamt" value={snap.summary.totalButtonClicks} />
          <Stat label="„Zurück“-Klicks" value={snap.summary.backButtonClicks} />
          <Stat label="Felder benutzt" value={snap.summary.fieldsInteracted} />
          <Stat label="Cursor-Bewegung" value={`${cursor.totalMoves}× · ${(cursor.totalDistancePx / 1000).toFixed(1)}k px`} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={copyJSON}
            style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
              background: C.amber, color: C.lab, fontWeight: 700 }}>JSON kopieren</button>
          <button onClick={downloadJSON}
            style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${C.amber}`, cursor: "pointer", fontFamily: "inherit",
              background: "transparent", color: C.amber, fontWeight: 700 }}>JSON herunterladen</button>
          <button onClick={onResetTracking}
            style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.labLine}`, cursor: "pointer", fontFamily: "inherit",
              background: "transparent", color: "#9aa6c0", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.labLine}`, color: "#9aa6c0",
          fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1 }}>ZEIT PRO SEITE</div>
        <div style={{ padding: 4 }}>
          {pageEntries.length === 0 && <div style={{ color: "#4f5972", fontSize: 12, padding: 12 }}>—</div>}
          {pageEntries.map((p) => (
            <div key={p.step} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 10px", borderRadius: 8, background: p.current ? "#1f283e" : "transparent" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "#cdd6e6", fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  <span style={{ color: "#6b7691", fontFamily: "JetBrains Mono" }}>#{p.step} </span>{p.name}
                </div>
                <div style={{ color: "#6b7691", fontSize: 11 }}>{p.enters}× besucht{p.current ? " · aktiv" : ""}</div>
              </div>
              <span style={{ color: p.current ? C.amber : C.green, fontFamily: "JetBrains Mono", fontSize: 12.5, fontWeight: 600 }}>
                {msToReadable(p.totalTimeMs)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.labLine}`, color: "#9aa6c0",
          fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1 }}>BUTTON-KLICKS</div>
        <div style={{ padding: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {btnEntries.length === 0 && <div style={{ color: "#4f5972", fontSize: 12, padding: 6 }}>—</div>}
          {btnEntries.map(([k, n]) => (
            <span key={k} style={{ background: "#222b40", color: "#9fb0cc", fontSize: 11, padding: "3px 9px",
              borderRadius: 999, fontFamily: "JetBrains Mono" }}>{k} · <b style={{ color: C.amber }}>{n}</b></span>
          ))}
        </div>
      </div>

      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.labLine}`, color: "#9aa6c0",
          fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1 }}>ZURÜCK-KLICKS (VERLASS-SIGNAL)</div>
        <div style={{ padding: 8 }}>
          {snap.backPresses.length === 0 && <div style={{ color: "#4f5972", fontSize: 12, padding: 6 }}>—</div>}
          {snap.backPresses.map((b, i) => (
            <div key={i} style={{ padding: "8px 10px", borderRadius: 8, marginBottom: 4, background: "#1a2236" }}>
              <div style={{ color: "#cdd6e6", fontSize: 12.5 }}>
                <span style={{ color: "#6b7691", fontFamily: "JetBrains Mono" }}>#{b.step} </span>{b.pageName}
              </div>
              <div style={{ color: "#6b7691", fontSize: 11, marginTop: 4, fontFamily: "JetBrains Mono" }}>
                {b.timeOnPageReadable} auf Seite · {b.sessionElapsedReadable} seit Start
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.labLine}`, color: "#9aa6c0",
          fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1 }}>
          CURSOR-BEWEGUNG PRO SEITE
        </div>
        <div style={{ padding: 8 }}>
          {cursorSteps.length === 0 && <div style={{ color: "#4f5972", fontSize: 12, padding: 6 }}>noch keine Bewegung erfasst</div>}
          {cursorSteps.map((s) => {
            const c = cursor.byStep[s];
            return (
              <div key={s} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px" }}>
                <span style={{ color: "#cdd6e6", fontSize: 12.5 }}>
                  <span style={{ color: "#6b7691", fontFamily: "JetBrains Mono" }}>#{s} </span>{snap.pages[s]?.name || ""}
                </span>
                <span style={{ color: "#9aa6c0", fontSize: 11.5, fontFamily: "JetBrains Mono" }}>
                  {c.moves} Bew. · {(c.distancePx / 1000).toFixed(1)}k px
                </span>
              </div>
            );
          })}
          <div style={{ color: "#6b7691", fontSize: 10.5, padding: "6px 10px 2px", lineHeight: 1.4 }}>
            Erfasst Maus-Bewegung pro Schritt (Anzahl + zurückgelegte Distanz) — zeigt „bewegt sich, klickt aber nicht“ als Zögern-Signal.
          </div>
        </div>
      </div>

      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.labLine}`, color: "#9aa6c0",
          fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1 }}>
          HOVER / CURSOR-VERWEILEN ({snap.summary.hovers})
        </div>
        <div style={{ padding: 8 }}>
          {hoverEntries.length === 0 && <div style={{ color: "#4f5972", fontSize: 12, padding: 6 }}>—</div>}
          {hoverEntries.map(([target, a]) => (
            <div key={target} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px" }}>
              <span style={{ color: "#cdd6e6", fontSize: 12.5, fontFamily: "JetBrains Mono" }}>{target}</span>
              <span style={{ color: "#9aa6c0", fontSize: 11.5, fontFamily: "JetBrains Mono" }}>
                {a.count}× · {msToReadable(a.dwellMs)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: C.lab, border: `1px solid ${C.labLine}`, borderRadius: 12 }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.labLine}`, color: "#9aa6c0",
          fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1 }}>JSON DATEN-LOG (LIVE)</div>
        <pre style={{ margin: 0, maxHeight: 360, overflow: "auto", padding: 12, fontFamily: "JetBrains Mono",
          fontSize: 11, lineHeight: 1.5, color: "#9fd3b8", whiteSpace: "pre" }}>
{snapshotText()}
        </pre>
      </div>
    </div>
  );
}
