import React from "react";
import { Sparkles, Play, Loader2, User } from "lucide-react";
import { tariff } from "../data/product.js";
import { C, Tag } from "./ui.jsx";

export default function AgentPanel({
  personas, count, setCount, generating, runningId, err,
  log, logRef, results,
  generatePersonas, runAll, runPersona,
}) {
  return (
    <div>
      <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Sparkles size={16} color={C.amber} />
          <span style={{ fontFamily: "Sora", fontWeight: 700, color: "#fff", fontSize: 14 }}>UNIQA Segment-Personas</span>
        </div>
        <div style={{ color: "#7e8aa3", fontSize: 11, marginBottom: 10, lineHeight: 1.4 }}>
          Aus personas.json (Traffic 30/50/20). Agent füllt Formular passend zum Profil.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#9aa6c0", fontSize: 13 }}>Anzahl</span>
          <input type="number" min={1} max={10} value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(10, +e.target.value || 1)))}
            style={{ width: 56, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.labLine}`,
              background: C.lab, color: "#fff", fontFamily: "JetBrains Mono" }} />
          <button onClick={generatePersonas} disabled={generating || !!runningId}
            style={{ flex: 1, padding: "9px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
              background: C.amber, color: C.lab, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {generating ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
            {generating ? "generiert…" : "Segment-Personas laden"}
          </button>
        </div>
        {personas.length > 0 && (
          <button onClick={runAll} disabled={!!runningId}
            style={{ width: "100%", marginTop: 10, padding: "9px", borderRadius: 8, border: `1px solid ${C.amber}`,
              background: "transparent", color: C.amber, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Play size={14} /> Alle nacheinander ausführen
          </button>
        )}
        {err && <div style={{ marginTop: 10, color: C.red, fontSize: 12 }}>{err}</div>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, maxHeight: 280, overflowY: "auto" }}>
        {personas.map((p) => (
          <div key={p.id} style={{ background: C.labPanel, border: `1px solid ${runningId === p.id ? C.amber : C.labLine}`,
            borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <User size={15} color={C.amber} />
                <span style={{ color: "#fff", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>{p.name}, {p.age}</span>
              </div>
              <button onClick={() => runPersona(p)} disabled={!!runningId}
                style={{ padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit",
                  background: runningId === p.id ? "#9bb4d6" : C.blue, color: "#fff", fontSize: 12, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                {runningId === p.id ? <Loader2 size={12} className="spin" /> : <Play size={12} />} Ausführen
              </button>
            </div>
            <div style={{ color: "#9aa6c0", fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>{p.summary}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              {p.segmentLabel && <Tag>{p.segmentLabel}</Tag>}
              {(p.drivers || []).slice(0, 2).map((d) => <Tag key={d}>{d.replace(/_/g, " ")}</Tag>)}
              {(p.onlineBehavior || []).includes("likely_to_purchase_online_next_3y") && <Tag>online-affin</Tag>}
            </div>
          </div>
        ))}
        {personas.length === 0 && !generating && (
          <div style={{ color: "#5d6883", fontSize: 13, textAlign: "center", padding: 20 }}>
            Noch keine Personas. Oben generieren, dann ausführen.
          </div>
        )}
      </div>

      <div style={{ background: C.lab, border: `1px solid ${C.labLine}`, borderRadius: 12, marginBottom: 14 }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.labLine}`, color: "#9aa6c0",
          fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1 }}>AGENT LOG</div>
        <div ref={logRef} style={{ maxHeight: 200, overflowY: "auto", padding: 10, fontFamily: "JetBrains Mono", fontSize: 11.5 }}>
          {log.length === 0 && <div style={{ color: "#4f5972" }}>—</div>}
          {log.map((l, i) => (
            <div key={i} style={{ marginBottom: 4, lineHeight: 1.5,
              color: l.kind === "ok" ? C.green : l.kind === "warn" ? C.amber : l.kind === "err" ? C.red : l.kind === "head" ? "#fff" : "#9aa6c0" }}>
              <span style={{ color: "#4f5972" }}>{l.t} </span>{l.text}
            </div>
          ))}
        </div>
      </div>

      {results.length > 0 && (
        <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.labLine}`, color: "#9aa6c0",
            fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: 1, display: "flex", justifyContent: "space-between" }}>
            <span>ERGEBNISSE</span>
            <span>{results.filter((r) => r.route === "online").length} online · {results.filter((r) => r.route === "beratung").length} Beratung</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#6b7691", textAlign: "left" }}>
                  {["Persona", "Segment", "Tarif", "€/M", "Add", "Route"].map((h) => (
                    <th key={h} style={{ padding: "7px 10px", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.labLine}`, color: "#cdd6e6" }}>
                    <td style={{ padding: "7px 10px" }}>{r.name}</td>
                    <td style={{ padding: "7px 10px", fontSize: 11 }}>{r.segment || "—"}</td>
                    <td style={{ padding: "7px 10px" }}>{tariff(r.tarif).name}</td>
                    <td style={{ padding: "7px 10px", fontFamily: "JetBrains Mono" }}>{r.premium.toFixed(2).replace(".", ",")}</td>
                    <td style={{ padding: "7px 10px" }}>{r.addons}</td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ color: r.route === "online" ? C.green : C.amber, fontWeight: 600 }}>
                        {r.route === "online" ? "online" : "Beratung"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
