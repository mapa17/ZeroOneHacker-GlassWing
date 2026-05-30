import React, { useState, useEffect, useRef, useCallback } from "react";
import { Beaker, FlaskConical, BarChart3 } from "lucide-react";
import { addon, tariff } from "./data/product.js";
import {
  freshForm, validateStep, evaluateOutcome, calcPremium, fmt, addonObj, canProceedFromStep,
} from "./logic/form.js";
import { hospitalExitFromOutcome, othersExitFromOutcome, nextStepAfter, backStepFrom } from "./logic/funnelRouting.js";
import { callClaude, safeParse, wait } from "./agent/api.js";
import { FILL_SYSTEM, fillUserFromProfile } from "./agent/prompts.js";
import { personaById } from "./data/personas.js";
import PERSONAS_JSON from "../personas/personas.json";
import { generateTrafficMix } from "./logic/personaProfileGenerator.js";
import { PAGE_NAMES } from "./logs/constants.js";
import { useTracking } from "./logs/useTracking.js";
import { analyzeSession, analysisForExport } from "./logic/personaClassifier.js";
import { C } from "./components/ui.jsx";
import FormFunnel from "./components/FormFunnel.jsx";
import AgentPanel from "./components/AgentPanel.jsx";
import DataLogsPanel from "./components/DataLogsPanel.jsx";
import CoachDashboard from "./components/CoachDashboard.jsx";
import StatsLab from "./components/StatsLab.jsx";

export default function App() {
  const [view, setView] = useState("tool"); // "tool" = funnel harness · "stats" = statistics lab
  const [mode, setMode] = useState("agent");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(freshForm());
  const [personas, setPersonas] = useState([]);
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [runningId, setRunningId] = useState(null);
  const [log, setLog] = useState([]);
  const [results, setResults] = useState([]);
  const [err, setErr] = useState("");
  const [stepErrors, setStepErrors] = useState({});
  const [sessions, setSessions] = useState([]);
  const runningRef = useRef(false);
  const logRef = useRef(null);
  const completedCapturedRef = useRef(false);

  const premium = calcPremium(form.tarif, form.addons);
  const outcome = evaluateOutcome(form);
  const showPrice = step >= 3 && step < 8;
  const hospitalExit = hospitalExitFromOutcome(form);
  const othersExit = othersExitFromOutcome(form);

  // Embed the persona analysis into every exported JSON so the file itself
  // explains who the user is and why — answers "how does it identify the user".
  const decorate = useCallback((base) => ({ ...base, personaAnalysis: analysisForExport(base) }), []);

  const {
    tick, trackEvent, trackButton, trackBackPress, trackField,
    trackHoverEnter, trackHoverLeave, trackAbandon,
    buildSnapshot, snapshotText, downloadJSON, resetTracking, stepEnterRef,
  } = useTracking({ step, form, mode, outcome, premium, decorate });

  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Sora:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(l);
  }, []);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  useEffect(() => { setStepErrors({}); }, [step]);

  const recordSession = (snap) => {
    const { signals, classification, dropOff } = analyzeSession(snap);
    setSessions((prev) => [...prev, {
      sessionId: snap.sessionId,
      match: classification.match,
      dropOff,
      hesitationScore: signals.hesitationScore,
      snapshot: snap,
    }]);
  };

  // Manual capture: if the run hasn't completed, mark the current step as the
  // abandonment point so it shows up as a concrete drop-off (not "in progress").
  const captureSession = () => {
    const snap = buildSnapshot();
    const completed = snap.currentStep === 8 || (snap.events || []).some((e) => e.type === "funnel_complete");
    if (!completed) {
      const st = snap.currentStep;
      snap.abandons = [...(snap.abandons || []), { step: st, page: PAGE_NAMES[st] }];
      trackAbandon(st);
    }
    recordSession(snap);
  };

  const clearSessions = () => setSessions([]);

  // Auto-capture a completed run once when the result page is reached.
  useEffect(() => {
    if (step === 8) {
      if (!completedCapturedRef.current) {
        completedCapturedRef.current = true;
        recordSession(buildSnapshot());
      }
    } else {
      completedCapturedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const addLog = (text, kind = "info") =>
    setLog((l) => [...l, { text, kind, t: new Date().toLocaleTimeString("de-AT") }]);

  const clearFieldError = (key) =>
    setStepErrors((e) => { if (!e[key]) return e; const n = { ...e }; delete n[key]; return n; });

  const update = (f, v) => { trackField(f, v); clearFieldError(f); setForm((s) => ({ ...s, [f]: v })); };

  const toggleAddon = (k) => {
    const nv = !form.addons[k];
    trackButton(`addon_toggle_${k}`, { state: nv ? "on" : "off" });
    setForm((s) => ({ ...s, addons: { ...s.addons, [k]: !s.addons[k] } }));
  };

  const toggleCoverage = (k) => {
    const nv = !form.coverage[k];
    trackButton(`coverage_toggle_${k}`, { state: nv ? "on" : "off" });
    trackField(`coverage_${k}`, nv ? "on" : "off");
    clearFieldError("coverage");
    setForm((s) => ({ ...s, coverage: { ...s.coverage, [k]: !s.coverage[k] } }));
  };

  const selectInsuredPerson = (key) => {
    trackButton(`insured_person_${key}`);
    trackField("insuredPerson", key);
    clearFieldError("insuredPerson");
    setForm((s) => ({ ...s, insuredPerson: key }));
  };

  const changeMode = (m) => { trackButton(`mode_switch_${m}`); setMode(m); };

  const copyJSON = () => {
    try {
      navigator.clipboard?.writeText(snapshotText());
      addLog("✓ Daten-Log in Zwischenablage kopiert.", "ok");
    } catch (e) {}
  };

  const next = () => {
    if (step < 8) {
      const { valid, errors } = validateStep(step, form);
      if (!valid) {
        setStepErrors(errors);
        trackEvent("validation_failed", { step, page: PAGE_NAMES[step], fields: Object.keys(errors) });
        return;
      }
      setStepErrors({});
    }
    trackButton("next", { from: step });
    setStep(nextStepAfter(step, form));
  };

  const back = () => {
    const fromStep = stepEnterRef.current.step;
    trackBackPress(fromStep, Date.now() - stepEnterRef.current.at);
    setStepErrors({});
    setStep(backStepFrom(step, form));
  };

  const reset = () => { trackButton("reset", { from: step }); setStepErrors({}); setForm(freshForm()); setStep(0); };

  const cancel = () => {
    trackButton("cancel", { from: step, page: PAGE_NAMES[step], timeOnPageMs: Date.now() - stepEnterRef.current.at });
    reset();
  };

  async function generatePersonas() {
    trackButton("generate_personas", { count });
    setErr(""); setGenerating(true);
    addLog(`Generiere ${count} UNIQA-Segment-Personas (Traffic-Mix 30/50/20)…`, "head");
    try {
      const seed = Date.now();
      const mix = generateTrafficMix(count, PERSONAS_JSON, seed);
      const list = mix.map(({ segmentId, profile }, i) => ({
          id: `${seed}-${i}`,
          segmentId,
          profile,
          name: profile.persona_name,
          age: profile.demographics?.age,
          segmentLabel: profile.segment_name,
          archetypeName: profile.archetype_name,
          summary: profile.behavioral_summary || profile.typical_quote,
          drivers: profile.top_decision_drivers || [],
          onlineBehavior: profile.online_behavior || [],
        }));
      setPersonas(list);
      addLog(`✓ ${list.length} Personas aus personas.json (S1 ${list.filter((p) => p.segmentId === "segment_1").length} · S2 ${list.filter((p) => p.segmentId === "segment_2").length} · S3 ${list.filter((p) => p.segmentId === "segment_3").length}).`, "ok");
    } catch (e) {
      setErr("Persona-Generierung fehlgeschlagen: " + e.message);
      addLog("✖ " + e.message, "err");
    } finally { setGenerating(false); }
  }

  async function runPersona(p) {
    if (runningRef.current) return;
    trackButton("run_persona", { persona: p.name, age: p.age, segment: p.segmentId });
    runningRef.current = true; setRunningId(p.id); setErr(""); setMode("agent");
    addLog(`▶ Lauf: ${p.name} (${p.age}, ${p.segmentLabel || p.segmentId}) — ${p.summary || ""}`, "head");
    let d;
    try {
      const archetype = personaById(
        p.segmentId === "segment_1" ? "judith" : p.segmentId === "segment_2" ? "franz" : "peter"
      );
      const txt = await callClaude(FILL_SYSTEM, fillUserFromProfile(p.profile, archetype?.name));
      d = safeParse(txt);
    } catch (e) {
      addLog("✖ " + e.message, "err"); setErr(e.message);
      runningRef.current = false; setRunningId(null); return;
    }
    const apply = (patch) => setForm((prev) => ({ ...prev, ...patch }));
    setForm(freshForm()); setStep(0); await wait(450);

    apply({ coverage: { arzt: true, krankenhaus: false } });
    addLog(`⓪  Absicherung: Bei Arztbesuchen`); await wait(600); setStep(1);

    apply({ insuredPerson: "myself" });
    addLog(`①  Versicherte Person: Ich selbst`); await wait(600); setStep(2);

    apply({ geburtsdatum: d.geburtsdatum, sozialversicherung: d.sozialversicherung });
    addLog(`②  Geb. ${d.geburtsdatum} · SV ${d.sozialversicherung}`); await wait(700); setStep(3);

    apply({ tarif: d.tarif });
    addLog(`③  Tarif: ${tariff(d.tarif).name} — ${d.notes?.tarif || ""}`); await wait(750); setStep(4);

    apply({ addons: addonObj(d.addons) });
    addLog(`④  Zusätze: ${(d.addons || []).map((k) => addon(k)?.name || k).join(", ") || "keine"} — ${d.notes?.addons || ""}`);
    await wait(750); setStep(5);

    apply({
      geschlecht: d.geschlecht, vorname: d.vorname, name: d.name, svnummer: String(d.svnummer || ""),
      email: d.email, telefon: d.telefon, groesse: String(d.groesse || ""), gewicht: String(d.gewicht || ""),
      leistungssport: d.leistungssport, schwangerschaft: d.schwangerschaft,
      keinArzt: !!d.keinArzt, arzt: d.arzt || "",
    });
    addLog(`⑤  ${d.vorname} ${d.name} · ${d.groesse}cm/${d.gewicht}kg · Sport:${d.leistungssport} · SS:${d.schwangerschaft}`);
    await wait(800); setStep(6);

    apply({ privatVersichert7: d.privatVersichert7, antraegeAbgelehnt: d.antraegeAbgelehnt, besondereAnnahme: d.besondereAnnahme });
    addLog(`⑥  privat(7J):${d.privatVersichert7} · abgelehnt:${d.antraegeAbgelehnt} · besondere:${d.besondereAnnahme} — ${d.notes?.vorversicherung || ""}`);
    await wait(800);

    const oc = evaluateOutcome({
      coverage: { arzt: true, krankenhaus: false },
      insuredPerson: "myself",
      tarif: d.tarif, privatVersichert7: d.privatVersichert7,
      antraegeAbgelehnt: d.antraegeAbgelehnt, besondereAnnahme: d.besondereAnnahme,
    });
    if (oc.route === "beratung") {
      setStep(7); apply({ beratungsort: d.beratungsort });
      addLog(`⑦  Beratungsort: ${d.beratungsort}`); await wait(750); setStep(8);
    } else { setStep(8); }

    const pr = calcPremium(d.tarif, addonObj(d.addons));
    if (oc.route === "online")
      addLog(`✓ ONLINE abschließbar — ${fmt(pr)}/Monat`, "ok");
    else
      addLog(`⚠ BERATUNG erforderlich — ${oc.reasons.join("; ")}`, "warn");

    setResults((r) => [...r, {
      id: p.id, name: p.name, age: p.age, segment: p.segmentLabel, tarif: d.tarif, premium: pr,
      addons: (d.addons || []).length, route: oc.route, reasons: oc.reasons,
    }]);
    runningRef.current = false; setRunningId(null);
  }

  async function runAll() {
    trackButton("run_all", { count: personas.length });
    for (const p of personas) { await runPersona(p); await wait(400); }
  }

  const footerLabel = step === 6 ? (outcome.route === "beratung" ? "Zur Beratungsanfrage" : "Weiter")
    : step === 8 ? "Neu starten" : step === 7 ? "Anfrage senden" : "Weiter";
  const footerAction = step === 8 ? reset : next;
  const canProceed = canProceedFromStep(step, form);

  return (
    <div style={{ background: C.lab, minHeight: "100vh", padding: "18px", fontFamily: "Outfit, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: C.amber, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Beaker size={22} color={C.lab} />
          </div>
          <div>
            <div style={{ fontFamily: "Sora", fontWeight: 800, color: "#fff", fontSize: 18 }}>Privatarzt · Form Test Harness</div>
            <div style={{ color: "#7e8aa3", fontSize: 12, fontFamily: "JetBrains Mono" }}>UNIQA quote funnel clone · LLM persona agents</div>
          </div>
          <div style={{ display: "flex", background: C.labPanel, borderRadius: 999, padding: 4, border: `1px solid ${C.labLine}`, marginLeft: 8 }}>
            {[
              { id: "tool", label: "Funnel-Tool", icon: FlaskConical },
              { id: "stats", label: "Statistik-Labor", icon: BarChart3 },
            ].map((v) => (
              <button key={v.id} onClick={() => setView(v.id)}
                style={{ padding: "7px 14px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontWeight: 700, fontSize: 13, background: view === v.id ? "#2a3450" : "transparent",
                  color: view === v.id ? "#fff" : "#9aa6c0", display: "flex", alignItems: "center", gap: 6 }}>
                <v.icon size={14} />{v.label}
              </button>
            ))}
          </div>
        </div>
        {view === "tool" && (
          <div style={{ display: "flex", background: C.labPanel, borderRadius: 999, padding: 4, border: `1px solid ${C.labLine}` }}>
            {["manual", "agent", "coach", "data"].map((m) => (
              <button key={m} onClick={() => changeMode(m)}
                style={{ padding: "7px 16px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontWeight: 600, fontSize: 13, background: mode === m ? C.amber : "transparent",
                  color: mode === m ? C.lab : "#9aa6c0" }}>
                {m === "manual" ? "Manuell" : m === "agent" ? "Agenten" : m === "coach" ? "Coach" : "Daten"}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "stats" && <StatsLab />}

      <div style={{ display: view === "tool" ? "grid" : "none", gridTemplateColumns: "minmax(0,1fr) minmax(0,420px)", gap: 16, alignItems: "start" }}
           className="harness-grid">
        <FormFunnel
          step={step} form={form} stepErrors={stepErrors} runningId={runningId}
          premium={premium} outcome={outcome} showPrice={showPrice}
          hospitalExit={hospitalExit} othersExit={othersExit}
          canProceed={canProceed} footerLabel={footerLabel} footerAction={footerAction}
          update={update} toggleAddon={toggleAddon} toggleCoverage={toggleCoverage}
          selectInsuredPerson={selectInsuredPerson} trackButton={trackButton}
          back={back} cancel={cancel}
          trackHoverEnter={trackHoverEnter} trackHoverLeave={trackHoverLeave}
        />

        <div style={{ display: mode === "agent" ? "block" : "none" }}>
          <AgentPanel
            personas={personas} count={count} setCount={setCount}
            generating={generating} runningId={runningId} err={err}
            log={log} logRef={logRef} results={results}
            generatePersonas={generatePersonas} runAll={runAll} runPersona={runPersona}
          />
        </div>

        <div style={{ display: mode === "coach" ? "block" : "none" }}>
          {mode === "coach" && (
            <CoachDashboard
              tick={tick}
              buildSnapshot={buildSnapshot}
              sessions={sessions}
              onCaptureSession={captureSession}
              onClearSessions={clearSessions}
              downloadJSON={downloadJSON}
            />
          )}
        </div>

        <div style={{ display: mode === "data" ? "block" : "none" }}>
          {mode === "data" && (
            <DataLogsPanel
              tick={tick}
              buildSnapshot={buildSnapshot}
              snapshotText={snapshotText}
              copyJSON={copyJSON}
              downloadJSON={downloadJSON}
              onResetTracking={() => resetTracking(step)}
            />
          )}
        </div>
      </div>

      <style>{`
        .spin { animation: sp 1s linear infinite; }
        @keyframes sp { to { transform: rotate(360deg); } }
        @media (max-width: 900px) { .harness-grid { grid-template-columns: 1fr !important; } }
        select, input, button { font-family: inherit; }
      `}</style>
    </div>
  );
}
