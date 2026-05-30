import React, { useState, useEffect, useCallback } from "react";
import { BarChart3, Play, Loader2, Activity, Target, Users } from "lucide-react";
import { runSimulation } from "../logic/personaStats.js";
import { PERSONAS, personaById, FUNNEL_CONTEXT } from "../data/personas.js";
import { PAGE_NAMES, msToReadable } from "../logs/constants.js";
import { C, KPI, Bar, Donut } from "./ui.jsx";

const FUNNEL_STEPS = [0, 1, 2, 3, 4, 5, 6, 8];
const PRED_COLS = ["judith", "franz", "peter", "none"];

const Panel = ({ title, icon: Icon, children, style }) => (
  <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 14, padding: 16, ...style }}>
    {title && (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {Icon && <Icon size={15} color={C.amber} />}
        <span style={{ fontFamily: "Sora", fontWeight: 700, color: "#fff", fontSize: 14 }}>{title}</span>
      </div>
    )}
    {children}
  </div>
);

function matrixCellColor(value, correct, isNone) {
  const a = Math.min(0.85, value / 100 + 0.08);
  if (isNone) return `rgba(224,160,66,${a})`;
  return correct ? `rgba(63,185,132,${a})` : `rgba(226,104,92,${a})`;
}

export default function StatsLab() {
  const [runsPerPersona, setRunsPerPersona] = useState(60);
  const [seed, setSeed] = useState(1);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback((rpp, sd) => {
    setRunning(true);
    // defer so the spinner can paint before the synchronous batch runs
    setTimeout(() => {
      setResult(runSimulation({ runsPerPersona: rpp, seed: sd }));
      setRunning(false);
    }, 30);
  }, []);

  useEffect(() => { run(runsPerPersona, seed); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const conv = result?.overall.trafficWeightedConversionPct ?? 0;
  const baseline = result?.overall.baselineConversionPct ?? 5.6;

  return (
    <div>
      {/* controls */}
      <Panel title="Persona-Test-Labor" icon={BarChart3} style={{ marginBottom: 14 }}>
        <div style={{ color: "#9aa6c0", fontSize: 12.5, lineHeight: 1.6, marginBottom: 14 }}>
          Simuliert Sitzungen je Persona auf Basis der UNIQA-Segmentierungsdaten
          (<code style={{ color: C.amber, fontFamily: "JetBrains Mono" }}>personas/personas.json</code>, n=4004) und prüft,
          ob der Coach-Klassifikator den Typ korrekt erkennt und wo die Personas abbrechen. Alle Werte in %.
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ color: "#9aa6c0", fontSize: 12 }}>
            <div style={{ marginBottom: 5 }}>Läufe pro Persona: <b style={{ color: "#fff" }}>{runsPerPersona}</b></div>
            <input type="range" min={10} max={300} step={10} value={runsPerPersona}
              onChange={(e) => setRunsPerPersona(+e.target.value)} style={{ width: 200 }} />
          </label>
          <label style={{ color: "#9aa6c0", fontSize: 12 }}>
            <div style={{ marginBottom: 5 }}>Seed</div>
            <input type="number" value={seed} onChange={(e) => setSeed(+e.target.value || 1)}
              style={{ width: 70, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.labLine}`,
                background: C.lab, color: "#fff", fontFamily: "JetBrains Mono" }} />
          </label>
          <button onClick={() => run(runsPerPersona, seed)} disabled={running}
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
              background: C.amber, color: C.lab, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
            {running ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
            {running ? "simuliert…" : "Simulation starten"}
          </button>
        </div>
      </Panel>

      {!result ? (
        <Panel><div style={{ color: "#6b7691", fontSize: 13, padding: 10 }}>Noch keine Ergebnisse.</div></Panel>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
            <KPI label="Simulierte Sitzungen" value={result.overall.totalSessions} />
            <KPI label="Klassifikations-Genauigkeit" value={result.overall.accuracyPct} unit="%"
              color={result.overall.accuracyPct >= 80 ? C.green : C.amber}
              sub="Anteil korrekt erkannter Persona-Typen" />
            <KPI label="Sim. Online-Conversion" value={conv} unit="%"
              color={C.blue}
              sub={`Traffic-gewichtet · UNIQA-Baseline ${baseline}%`} />
            <KPI label="Personas getestet" value={PERSONAS.length}
              sub="Judith · Franz · Peter (Segmente 1–3)" />
          </div>

          {/* funnel + traffic share */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 12, marginBottom: 14 }}>
            <Panel title="Funnel · Erreichte Schritte (traffic-gewichtet)" icon={Activity}>
              {FUNNEL_STEPS.map((s) => {
                const reached = result.overall.weightedReachedPct[s];
                const benchSub = s === 3 ? `UNIQA: ${Math.round(FUNNEL_CONTEXT.baselineDropOffs.initialPrice * 100)}% brechen hier ab`
                  : s === 4 ? `UNIQA: ${Math.round(FUNNEL_CONTEXT.baselineDropOffs.additionalCoverage * 100)}% Abbruch bei Zusatz`
                  : s === 6 ? `UNIQA: ${Math.round(FUNNEL_CONTEXT.baselineDropOffs.finalPrice * 100)}% brechen am Endpreis ab`
                  : null;
                return (
                  <Bar key={s} label={`#${s} ${PAGE_NAMES[s]}`} value={`${reached}%`}
                    pct={reached} color={s === 8 ? C.green : reached >= 60 ? C.blue : reached >= 30 ? C.amber : C.red}
                    sub={benchSub} />
                );
              })}
            </Panel>
            <Panel title="Traffic-Anteil (Segmente)" icon={Users}>
              <Donut
                size={130}
                segments={PERSONAS.map((p) => ({
                  value: FUNNEL_CONTEXT.trafficShare[p.id] * 100, color: p.color,
                  label: `${p.name.split(" ")[0]} · ${p.short}`,
                }))}
                centerSub="UNIQA-Schätzung Online-Funnel"
              />
            </Panel>
          </div>

          {/* per-persona breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 14 }}>
            {PERSONAS.map((p) => {
              const d = result.perPersona[p.id];
              return (
                <Panel key={p.id} style={{ borderColor: p.color }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: "Sora", fontWeight: 800, color: "#fff", fontSize: 16 }}>{p.name.split(" ")[0]}</span>
                    <span style={{ color: p.color, fontSize: 12, fontWeight: 700 }}>{p.short}</span>
                  </div>
                  <div style={{ color: "#6b7691", fontSize: 11, marginBottom: 12 }}>{p.segment}</div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                    <MiniStat label="Erkannt" value={`${d.accuracyPct}%`} color={d.accuracyPct >= 80 ? C.green : C.amber} />
                    <MiniStat label="Abschluss" value={`${d.completionPct}%`} color={C.blue} />
                    <MiniStat label="Ø Hesitation" value={d.avgHesitation} />
                    <MiniStat label="Ø Tarif-Zeit" value={msToReadable(d.avgTarifDwellMs)} />
                    <MiniStat label="Überfordert" value={`${d.overwhelmedPct}%`} color={d.overwhelmedPct > 30 ? C.red : "#cdd6e6"} />
                    <MiniStat label="„Beratung“-Hover" value={`${d.advisoryHoverPct}%`} />
                  </div>

                  <div style={{ color: "#6b7691", fontSize: 10.5, fontFamily: "JetBrains Mono", textTransform: "uppercase", marginBottom: 6 }}>
                    Primärer Abbruch (Hypothese: {PAGE_NAMES[p.funnel.primaryDropStep]})
                  </div>
                  {FUNNEL_STEPS.filter((s) => s !== 8 && d.dropByStep[s] > 0).map((s) => (
                    <Bar key={s} label={`#${s} ${PAGE_NAMES[s]}`} value={`${d.dropByStep[s]}%`}
                      pct={d.dropByStep[s]} color={s === p.funnel.primaryDropStep ? p.color : "#5d6883"} />
                  ))}
                </Panel>
              );
            })}
          </div>

          {/* confusion matrix */}
          <Panel title="Konfusionsmatrix · erkannter vs. tatsächlicher Typ (%)" icon={Target}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "8px 10px", textAlign: "left", color: "#6b7691", fontWeight: 600 }}>tatsächlich ↓ / erkannt →</th>
                    {PRED_COLS.map((c) => (
                      <th key={c} style={{ padding: "8px 10px", color: c === "none" ? "#9aa6c0" : personaById(c).color, fontWeight: 700 }}>
                        {c === "none" ? "unklar" : personaById(c).name.split(" ")[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERSONAS.map((p) => (
                    <tr key={p.id}>
                      <td style={{ padding: "8px 10px", color: p.color, fontWeight: 700 }}>{p.name.split(" ")[0]}</td>
                      {PRED_COLS.map((c) => {
                        const v = result.perPersona[p.id].predictedPct[c];
                        return (
                          <td key={c} style={{ padding: "8px 10px", textAlign: "center", fontFamily: "JetBrains Mono",
                            color: "#fff", background: matrixCellColor(v, c === p.id, c === "none"),
                            borderRadius: 6, fontWeight: c === p.id ? 800 : 500 }}>
                            {v}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ color: "#6b7691", fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
              Grüne Diagonale = korrekt erkannt. Rot = Verwechslung. Gelb = zu wenig Signal für eine sichere Zuordnung.
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value, color = "#fff" }) {
  return (
    <div style={{ background: "#1a2236", borderRadius: 8, padding: "7px 9px" }}>
      <div style={{ color: "#6b7691", fontSize: 9.5, fontFamily: "JetBrains Mono", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color, fontSize: 14, fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
