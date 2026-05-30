import React from "react";
import { Check } from "lucide-react";
import { C, TARIFFS, FUNNEL_PHASES } from "../data/product.js";

export function Pill({ children, color }) {
  return <span style={{ background: color, color: "#fff", fontSize: 11, fontWeight: 700,
    padding: "3px 9px", borderRadius: 999 }}>{children}</span>;
}

export function Field({ label, children, hint, error }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 700, color: C.ink, marginBottom: 6, fontSize: 14 }}>{label}</div>
      {children}
      {error && <div style={{ color: C.red, fontSize: 12, marginTop: 6 }}>{error}</div>}
      {hint && !error && <div style={{ color: C.sub, fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

export const inputStyle = { width: "100%", padding: "11px 12px", border: `1px solid ${C.line}`,
  borderRadius: 8, fontSize: 15, color: C.ink, outline: "none", fontFamily: "inherit", background: "#fff" };

export const inputStyleErr = (err) => ({ ...inputStyle, borderColor: err ? C.red : C.line });

export function YesNo({ value, onChange, error }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 10, borderRadius: 8, padding: error ? 4 : 0,
        outline: error ? `1px solid ${C.red}` : "none" }}>
        {["ja", "nein"].map((v) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            style={{ flex: 1, padding: "10px 12px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${value === v ? C.blue : error ? C.red : C.line}`, background: value === v ? C.sel : "#fff",
              display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: C.ink, fontFamily: "inherit" }}>
            <span style={{ width: 16, height: 16, borderRadius: 999, border: `2px solid ${value === v ? C.blue : "#bcc6d6"}`,
              display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {value === v && <span style={{ width: 8, height: 8, borderRadius: 999, background: C.blue }} />}
            </span>{v}
          </button>
        ))}
      </div>
      {error && <div style={{ color: C.red, fontSize: 12, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

export function PhaseBreadcrumb({ active }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, fontSize: 13, marginBottom: 10, flexWrap: "wrap" }}>
        {FUNNEL_PHASES.map((phase, i) => (
          <React.Fragment key={phase}>
            {i > 0 && <span style={{ color: "#bcc6d6" }}>&gt;</span>}
            <span style={{ fontWeight: i === active ? 800 : 500, color: i === active ? C.ink : C.sub }}>{phase}</span>
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {FUNNEL_PHASES.map((_, i) => (
          <div key={i} style={{ height: 4, flex: 1, borderRadius: 4, background: i <= active ? C.blue : "#dde5f0" }} />
        ))}
      </div>
    </div>
  );
}

export function CovRow({ label, sub, k, form, bold }) {
  return (
    <>
      <div style={{ alignSelf: "center", padding: "8px 0" }}>
        <div style={{ fontWeight: bold ? 700 : 600, color: C.ink, fontSize: 13 }}>{label}</div>
        {sub && <div style={{ color: C.sub, fontSize: 11, lineHeight: 1.3 }}>{sub}</div>}
      </div>
      {TARIFFS.map((t) => (
        <div key={t.key} style={{ textAlign: "center", alignSelf: "center", fontSize: 13, color: C.ink,
          background: form.tarif === t.key ? C.sel : "transparent", borderRadius: 6, padding: "8px 0",
          fontWeight: bold ? 700 : 400 }}>
          {t.cov[k]}
        </div>
      ))}
    </>
  );
}

export function Tag({ children }) {
  return <span style={{ background: "#222b40", color: "#9fb0cc", fontSize: 10.5, padding: "2px 8px",
    borderRadius: 999, fontFamily: "JetBrains Mono" }}>{children}</span>;
}

export function Stat({ label, value }) {
  return (
    <div style={{ background: "#1a2236", border: `1px solid ${C.labLine}`, borderRadius: 10, padding: "9px 11px" }}>
      <div style={{ color: "#6b7691", fontSize: 10.5, fontFamily: "JetBrains Mono", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

export function Recap({ label, value, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
      <span style={{ color: C.sub, fontSize: 13 }}>{label}</span>
      <span style={{ color: C.ink, fontSize: 13, fontWeight: strong ? 800 : 600 }}>{value}</span>
    </div>
  );
}

export const headStyle = { fontFamily: "Outfit", fontWeight: 800, color: C.ink, fontSize: 26, lineHeight: 1.15, marginBottom: 18 };

// Horizontal bar for the funnel / dwell charts in the Coach dashboard.
export function Bar({ label, sub, pct, value, color = C.blue, muted }) {
  return (
    <div style={{ marginBottom: 8, opacity: muted ? 0.45 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ color: "#cdd6e6", fontSize: 12 }}>{label}</span>
        <span style={{ color: "#9aa6c0", fontSize: 11.5, fontFamily: "JetBrains Mono" }}>{value}</span>
      </div>
      <div style={{ height: 8, borderRadius: 6, background: "#222b40", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%",
          background: color, borderRadius: 6, transition: "width .3s" }} />
      </div>
      {sub && <div style={{ color: "#6b7691", fontSize: 10.5, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Persona confidence row with a colored fill + percentage.
export function ScoreBar({ name, pct, color, highlight }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: highlight ? "#fff" : "#cdd6e6", fontSize: 13, fontWeight: highlight ? 700 : 500 }}>{name}</span>
        <span style={{ color, fontSize: 13, fontWeight: 700, fontFamily: "JetBrains Mono" }}>{pct}%</span>
      </div>
      <div style={{ height: 10, borderRadius: 6, background: "#1a2236", overflow: "hidden",
        outline: highlight ? `1px solid ${color}` : "none" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%",
          background: color, borderRadius: 6, transition: "width .3s" }} />
      </div>
    </div>
  );
}

// Large KPI tile for the statistics lab (value + label + optional delta/context).
export function KPI({ label, value, unit, sub, color = "#fff", accent = C.amber }) {
  return (
    <div style={{ background: C.labPanel, border: `1px solid ${C.labLine}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ color: "#6b7691", fontSize: 10.5, fontFamily: "JetBrains Mono", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 6 }}>
        <span style={{ color, fontSize: 28, fontWeight: 800, fontFamily: "Sora" }}>{value}</span>
        {unit && <span style={{ color: accent, fontSize: 15, fontWeight: 700 }}>{unit}</span>}
      </div>
      {sub && <div style={{ color: "#9aa6c0", fontSize: 11.5, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

// Compact SVG donut for share/split visualisations. `segments` = [{value,color,label}].
export function Donut({ segments, size = 120, thickness = 16, centerLabel, centerSub }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1a2236" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * circ;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color}
              strokeWidth={thickness} strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} />
          );
          offset += len;
          return el;
        })}
        {centerLabel && (
          <text x={size / 2} y={size / 2} transform={`rotate(90 ${size / 2} ${size / 2})`}
            textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="20" fontWeight="800" fontFamily="Sora">
            {centerLabel}
          </text>
        )}
      </svg>
      <div>
        {segments.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "#cdd6e6", fontSize: 12 }}>{s.label}</span>
            <span style={{ color: "#9aa6c0", fontSize: 11.5, fontFamily: "JetBrains Mono", marginLeft: "auto" }}>
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
        {centerSub && <div style={{ color: "#6b7691", fontSize: 11, marginTop: 4 }}>{centerSub}</div>}
      </div>
    </div>
  );
}

export { C };
