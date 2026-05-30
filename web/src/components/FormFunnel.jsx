import React from "react";
import { Check, AlertTriangle, Info, ChevronRight, Loader2 } from "lucide-react";
import {
  SV_OPTIONS, TARIFFS, COV_ROWS, ADDONS, BERATUNG_ORTE,
  COVERAGE_OPTIONS, INSURED_PERSON_OPTIONS, tariff,
} from "../data/product.js";
import { fmt } from "../logic/form.js";
import {
  C, Pill, Field, YesNo, PhaseBreadcrumb, CovRow, Recap,
  headStyle, inputStyleErr,
} from "./ui.jsx";

export default function FormFunnel({
  step, form, stepErrors, runningId, premium, outcome,
  showPrice, hospitalExit, othersExit, canProceed, footerLabel, footerAction,
  update, toggleAddon, toggleCoverage, selectInsuredPerson, trackButton,
  back, cancel, trackHoverEnter, trackHoverLeave,
}) {
  const hov = (target, meta) => ({
    onMouseEnter: () => trackHoverEnter?.(target),
    onMouseLeave: () => trackHoverLeave?.(target, meta),
  });
  function renderStep() {
    switch (step) {
      case 0:
        return (
          <>
            <PhaseBreadcrumb active={0} />
            <h2 style={headStyle}>Wo möchten Sie abgesichert sein?</h2>
            <p style={{ color: C.ink, fontWeight: 700, marginBottom: 22, fontSize: 14 }}>
              Bitte wählen Sie eine oder mehrere Optionen.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {COVERAGE_OPTIONS.map((o) => {
                const Icon = o.icon;
                const on = form.coverage[o.key];
                return (
                  <button key={o.key} type="button" onClick={() => toggleCoverage(o.key)}
                    style={{ position: "relative", textAlign: "left", border: `1.5px solid ${on ? C.blue : C.line}`,
                      borderRadius: 12, padding: "22px 18px", cursor: "pointer", background: on ? C.sel : "#fff",
                      fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 14, minHeight: 260 }}>
                    <span style={{ position: "absolute", top: 12, right: 12, width: 22, height: 22, borderRadius: 4,
                      border: `2px solid ${on ? C.blue : "#bcc6d6"}`, background: on ? C.blue : "#fff",
                      display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      {on && <Check size={14} color="#fff" strokeWidth={3} />}
                    </span>
                    <Icon size={34} color={on ? C.blue : C.sub} style={{ alignSelf: "center" }} />
                    <div style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: 17, color: on ? C.blue : C.ink, textAlign: "center" }}>
                      {o.title}
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                      {o.features.map((f) => (
                        <li key={f} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: C.ink, lineHeight: 1.4 }}>
                          <Check size={14} color={C.green} style={{ flexShrink: 0, marginTop: 2 }} />{f}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
            {stepErrors.coverage && (
              <div style={{ color: C.red, fontSize: 13, marginTop: 12, fontWeight: 600 }}>{stepErrors.coverage}</div>
            )}
          </>
        );
      case 1:
        return (
          <>
            <PhaseBreadcrumb active={0} />
            <h2 style={headStyle}>Wer soll versichert werden?</h2>
            <p style={{ color: C.ink, fontWeight: 700, marginBottom: 22, fontSize: 14 }}>
              Bitte wählen Sie eine Option.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {INSURED_PERSON_OPTIONS.map((o) => {
                const Icon = o.icon;
                const on = form.insuredPerson === o.key;
                return (
                  <button key={o.key} type="button" onClick={() => selectInsuredPerson(o.key)}
                    style={{ position: "relative", border: `1.5px solid ${on ? C.blue : C.line}`, borderRadius: 12,
                      padding: "32px 18px", cursor: "pointer", background: on ? C.sel : "#fff", fontFamily: "inherit",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 16, minHeight: 220 }}>
                    <span style={{ position: "absolute", top: 12, right: 12, width: 20, height: 20, borderRadius: 999,
                      border: `2px solid ${on ? C.blue : "#bcc6d6"}`, background: "#fff",
                      display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      {on && <span style={{ width: 10, height: 10, borderRadius: 999, background: C.blue }} />}
                    </span>
                    <div style={{ width: 72, height: 72, borderRadius: 999, background: on ? C.sel : "#f4f7fc",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={36} color={on ? C.blue : C.sub} />
                    </div>
                    <div style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: 17, color: on ? C.blue : C.ink, textAlign: "center" }}>
                      {o.title}
                    </div>
                  </button>
                );
              })}
            </div>
            {stepErrors.insuredPerson && (
              <div style={{ color: C.red, fontSize: 13, marginTop: 12, fontWeight: 600 }}>{stepErrors.insuredPerson}</div>
            )}
          </>
        );
      case 2:
        return (
          <>
            <h2 style={headStyle}>Um eine voraussichtliche individuelle Prämie für Sie zu berechnen, benötigen wir:</h2>
            <p style={{ color: C.sub, marginBottom: 22 }}>Bitte füllen Sie alle Felder aus.</p>
            <Field label="Geburtsdatum" error={stepErrors.geburtsdatum}>
              <input style={inputStyleErr(stepErrors.geburtsdatum)} placeholder="TT.MM.JJJJ" value={form.geburtsdatum}
                onChange={(e) => update("geburtsdatum", e.target.value)} />
            </Field>
            <Field label="Sozialversicherung" error={stepErrors.sozialversicherung}>
              <select style={inputStyleErr(stepErrors.sozialversicherung)} value={form.sozialversicherung}
                onChange={(e) => update("sozialversicherung", e.target.value)}>
                <option value="">Bitte wählen</option>
                {SV_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </>
        );
      case 3:
        return (
          <>
            <h2 style={headStyle}>Welche Leistungen soll Ihre Privatarzt-Versicherung abdecken?</h2>
            <div style={{ background: "#EAF1FE", borderRadius: 10, padding: "14px 16px", display: "flex", gap: 10, marginBottom: 18 }}>
              <Info size={18} color={C.blue} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: C.ink }}>
                <b>Denken Sie an Ihren heutigen Bedarf, nicht an den in 20 Jahren.</b><br />
                Nach 3 Jahren Tarifwechsel ohne erneute Gesundheitsprüfung möglich.
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 560 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr repeat(4,1fr)", gap: 6 }}>
                  <div />
                  {TARIFFS.map((t) => (
                    <div key={t.key} style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: "Outfit", fontWeight: 700, fontSize: 16, color: C.ink }}>{t.name}</div>
                      <div style={{ marginTop: 4, display: "inline-block" }}
                        {...hov(t.online ? `online_badge_${t.key}` : `advisory_badge_${t.key}`,
                          { tarif: t.key, online: t.online })}>
                        <Pill color={t.online ? C.pink : "#9aa6b8"}>{t.online ? "Online" : "n. Beratung"}</Pill>
                      </div>
                    </div>
                  ))}
                  <CovRow label="Höchstbetrag / Jahr" sub="" k="hoechst" form={form} bold />
                  {COV_ROWS.map((r) => <CovRow key={r.id} label={r.label} sub={r.sub} k={r.id} form={form} />)}
                  <div style={{ gridColumn: "1 / -1", height: 1, background: C.line, margin: "6px 0" }} />
                  <div style={{ alignSelf: "center", fontWeight: 700, color: C.ink, fontSize: 13 }}>Voraussichtliche Prämie</div>
                  {TARIFFS.map((t) => (
                    <div key={t.key} style={{ textAlign: "center", fontWeight: 700, color: C.ink,
                      background: form.tarif === t.key ? C.sel : "transparent", borderRadius: 6, padding: "8px 0" }}>
                      {fmt(t.premium)}
                    </div>
                  ))}
                  <div />
                  {TARIFFS.map((t) => (
                    <button key={t.key} onClick={() => { trackButton(`tarif_select_${t.key}`); update("tarif", t.key); }}
                      {...hov(`tarif_card_${t.key}`, { tarif: t.key, online: t.online })}
                      style={{ margin: 4, padding: "9px 0", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                        border: `1.5px solid ${form.tarif === t.key ? C.blue : C.line}`,
                        background: form.tarif === t.key ? C.sel : "#fff", color: C.blue, fontWeight: 600,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      {form.tarif === t.key && <Check size={15} />}{form.tarif === t.key ? "Ausgewählt" : "Wählen"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {stepErrors.tarif && (
              <div style={{ color: C.red, fontSize: 13, marginTop: 12, fontWeight: 600 }}>{stepErrors.tarif}</div>
            )}
          </>
        );
      case 4:
        return (
          <>
            <h2 style={headStyle}>Wünschen Sie Extra-Schutz bei Ihrer Privatarzt-Versicherung?</h2>
            {ADDONS.map((a) => (
              <div key={a.key} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, color: C.ink }}>{a.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontWeight: 700, color: C.ink, fontSize: 14 }}>+{fmt(a.price)}</span>
                    <button onClick={() => toggleAddon(a.key)}
                      style={{ width: 44, height: 24, borderRadius: 999, border: "none", cursor: "pointer",
                        background: form.addons[a.key] ? C.blue : "#cdd6e3", position: "relative", transition: "all .15s" }}>
                      <span style={{ position: "absolute", top: 2, left: form.addons[a.key] ? 22 : 2,
                        width: 20, height: 20, borderRadius: 999, background: "#fff", transition: "all .15s" }} />
                    </button>
                  </div>
                </div>
                <div style={{ color: C.sub, fontSize: 13, marginTop: 6 }}>{a.desc}</div>
              </div>
            ))}
          </>
        );
      case 5:
        return (
          <>
            <h2 style={headStyle}>Angaben zu Ihrer Person</h2>
            <Field label="Geschlecht" error={stepErrors.geschlecht}>
              <div style={{ display: "flex", gap: 10, borderRadius: 8, padding: stepErrors.geschlecht ? 4 : 0,
                outline: stepErrors.geschlecht ? `1px solid ${C.red}` : "none" }}>
                {["männlich", "weiblich", "divers"].map((g) => (
                  <button key={g} type="button" onClick={() => update("geschlecht", g)}
                    style={{ flex: 1, padding: "10px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                      border: `1px solid ${form.geschlecht === g ? C.blue : stepErrors.geschlecht ? C.red : C.line}`,
                      background: form.geschlecht === g ? C.sel : "#fff", color: C.ink, fontSize: 14 }}>{g}</button>
                ))}
              </div>
            </Field>
            <Field label="Vorname" error={stepErrors.vorname}>
              <input style={inputStyleErr(stepErrors.vorname)} value={form.vorname} onChange={(e) => update("vorname", e.target.value)} />
            </Field>
            <Field label="Name" error={stepErrors.name}>
              <input style={inputStyleErr(stepErrors.name)} value={form.name} onChange={(e) => update("name", e.target.value)} />
            </Field>
            <Field label="Sozialversicherungsnummer" hint="10 Ziffern: laufende Nummer + Geburtsdatum (TTMMJJ)." error={stepErrors.svnummer}>
              <input style={inputStyleErr(stepErrors.svnummer)} value={form.svnummer} onChange={(e) => update("svnummer", e.target.value)} />
            </Field>
            <Field label="E-Mail" error={stepErrors.email}>
              <input style={inputStyleErr(stepErrors.email)} value={form.email} onChange={(e) => update("email", e.target.value)} />
            </Field>
            <Field label="Telefonnummer" error={stepErrors.telefon}>
              <input style={inputStyleErr(stepErrors.telefon)} value={form.telefon} onChange={(e) => update("telefon", e.target.value)} />
            </Field>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}><Field label="Größe (cm)" error={stepErrors.groesse}><input style={inputStyleErr(stepErrors.groesse)} value={form.groesse} onChange={(e) => update("groesse", e.target.value)} /></Field></div>
              <div style={{ flex: 1 }}><Field label="Gewicht (kg)" error={stepErrors.gewicht}><input style={inputStyleErr(stepErrors.gewicht)} value={form.gewicht} onChange={(e) => update("gewicht", e.target.value)} /></Field></div>
            </div>
            <Field label="Betreiben Sie Berufs- oder Leistungssport?">
              <YesNo value={form.leistungssport} onChange={(v) => update("leistungssport", v)} error={stepErrors.leistungssport} />
            </Field>
            <Field label="Besteht eine Schwangerschaft?">
              <YesNo value={form.schwangerschaft} onChange={(v) => update("schwangerschaft", v)} error={stepErrors.schwangerschaft} />
            </Field>
          </>
        );
      case 6:
        return (
          <>
            <h2 style={headStyle}>Bisherige Versicherungen</h2>
            <Field label="Sind Sie oder waren Sie in den letzten 7 Jahren privat krankenversichert?">
              <YesNo value={form.privatVersichert7} onChange={(v) => update("privatVersichert7", v)} error={stepErrors.privatVersichert7} />
            </Field>
            {form.privatVersichert7 === "ja" && (
              <div style={{ background: C.blue, color: "#fff", borderRadius: 10, padding: "14px 16px", marginBottom: 18, display: "flex", gap: 10 }}>
                <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 13 }}>
                  <b>Rücksprache mit Berater:in erforderlich</b><br />
                  Für Ihren Bedarf können wir leider keine Online-Berechnung anbieten – unsere Berater:innen erstellen Ihnen gerne ein unverbindliches Angebot.
                </div>
              </div>
            )}
            <Field label="Wurden Anträge abgelehnt oder Verträge durch den Versicherer gekündigt?">
              <YesNo value={form.antraegeAbgelehnt} onChange={(v) => update("antraegeAbgelehnt", v)} error={stepErrors.antraegeAbgelehnt} />
            </Field>
            <Field label="Wurden Anträge zu besonderen Annahmekonditionen angenommen?">
              <YesNo value={form.besondereAnnahme} onChange={(v) => update("besondereAnnahme", v)} error={stepErrors.besondereAnnahme} />
            </Field>
          </>
        );
      case 7:
        return (
          <>
            <h2 style={{ ...headStyle, textAlign: "center" }}>Wo soll die Beratung bevorzugt stattfinden?</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {BERATUNG_ORTE.map((o) => {
                const Icon = o.icon; const on = form.beratungsort === o.id;
                return (
                  <button key={o.id} type="button" onClick={() => update("beratungsort", o.id)}
                    style={{ position: "relative", border: `1.5px solid ${on ? C.blue : stepErrors.beratungsort ? C.red : "#cfe0f5"}`, borderRadius: 12,
                      padding: "26px 12px", cursor: "pointer", background: on ? C.sel : "#fff", fontFamily: "inherit",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    {o.neu && <span style={{ position: "absolute", top: 0, left: 0, background: C.blue, color: "#fff",
                      fontSize: 9, fontWeight: 700, padding: "2px 14px", transform: "rotate(-45deg) translate(-22px,2px)" }}>NEU</span>}
                    <Icon size={30} color={C.blue} />
                    <span style={{ color: C.ink, fontSize: 14, textAlign: "center" }}>{o.id}</span>
                  </button>
                );
              })}
            </div>
            {stepErrors.beratungsort && (
              <div style={{ color: C.red, fontSize: 13, marginTop: 12, fontWeight: 600, textAlign: "center" }}>{stepErrors.beratungsort}</div>
            )}
          </>
        );
      case 8: {
        const online = outcome.route === "online";
        const hospital = hospitalExit;
        const others = othersExit;
        return (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ width: 64, height: 64, borderRadius: 999, margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: online ? "#E6F6EF" : "#FDF1E6" }}>
              {online ? <Check size={32} color={C.green} /> : <AlertTriangle size={30} color={C.amber} />}
            </div>
            <h2 style={{ ...headStyle, textAlign: "center", marginBottom: 8 }}>
              {online ? "Online abschließbar" : hospital || others ? "Beratung erforderlich" : "Beratungsanfrage"}
            </h2>
            <p style={{ color: C.sub, marginBottom: 18 }}>
              {online ? "Dieses Profil kann den Tarif direkt online abschließen."
                      : hospital ? "Für Krankenhaus-Versicherung leiten wir Sie zur persönlichen Beratung weiter."
                      : others ? "Für Versicherungen anderer Personen leiten wir Sie zur persönlichen Beratung weiter."
                      : "Dieses Profil wird zur persönlichen Beratung geleitet."}
            </p>
            {!hospital && !others && (
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, textAlign: "left", maxWidth: 420, margin: "0 auto" }}>
                <Recap label="Tarif" value={tariff(form.tarif).name} />
                <Recap label="Zusätze" value={ADDONS.filter((a) => form.addons[a.key]).map((a) => a.name).join(", ") || "keine"} />
                <Recap label="Monatsprämie" value={fmt(premium)} strong />
                {!online && <Recap label="Beratung" value={form.beratungsort || "—"} />}
                {!online && (
                  <div style={{ marginTop: 10, fontSize: 12, color: C.sub }}>
                    Grund: {outcome.reasons.join("; ")}
                  </div>
                )}
              </div>
            )}
            {hospital && (
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, textAlign: "left", maxWidth: 420, margin: "0 auto" }}>
                <Recap label="Auswahl" value="Im Krankenhaus" />
                <div style={{ marginTop: 10, fontSize: 12, color: C.sub }}>
                  Der Krankenhaus-Pfad liegt außerhalb des Online-Abschlusses und wird an eine Berater:in übergeben.
                </div>
              </div>
            )}
            {others && (
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, textAlign: "left", maxWidth: 420, margin: "0 auto" }}>
                <Recap label="Auswahl" value="Andere Personen" />
                <div style={{ marginTop: 10, fontSize: 12, color: C.sub }}>
                  Versicherungen für andere Personen sind nicht online abschließbar und werden an eine Berater:in übergeben.
                </div>
              </div>
            )}
          </div>
        );
      }
      default: return null;
    }
  }

  return (
    <div style={{ background: C.formBg, borderRadius: 16, padding: 4, position: "relative" }}>
      {runningId && (
        <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5, background: C.blue, color: "#fff",
          borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Loader2 size={13} className="spin" /> Agent steuert…
        </div>
      )}
      <div style={{ background: "#fff", borderRadius: 14, padding: "24px 22px", minHeight: 480 }}>
        {step > 1 && step < 8 && (
          <div style={{ display: "flex", gap: 5, marginBottom: 18 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} style={{ height: 4, flex: 1, borderRadius: 4,
                background: i <= step ? C.blue : "#dde5f0" }} />
            ))}
          </div>
        )}
        {renderStep()}
        {Object.keys(stepErrors).length > 0 && (
          <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: "#FEF2F2",
            border: `1px solid ${C.red}`, color: C.red, fontSize: 13, fontWeight: 600 }}>
            Bitte füllen Sie alle Pflichtfelder aus, bevor Sie fortfahren.
          </div>
        )}
      </div>
      <div style={{ background: "#fff", borderRadius: 14, marginTop: 8, padding: "14px 18px",
        display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 -2px 10px rgba(0,0,0,.03)" }}>
        <div>
          <div style={{ fontWeight: 700, color: C.ink, fontSize: 13 }}>Unser Angebot</div>
          {showPrice ? (
            <div style={{ fontWeight: 800, color: C.ink, fontSize: 18 }}>{fmt(premium)}<span style={{ fontSize: 12, color: C.sub }}>/Monat</span></div>
          ) : (
            <div style={{ fontWeight: 600, color: C.sub, fontSize: 14 }}>Nach Ihren Angaben</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {step === 0 && (
            <button onClick={cancel} style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.blue}`,
              background: "#fff", color: C.blue, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Abbrechen</button>
          )}
          {step > 0 && step < 8 && (
            <button onClick={back} style={{ padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.blue}`,
              background: "#fff", color: C.blue, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Zurück</button>
          )}
          <button onClick={footerAction} disabled={!!runningId || !canProceed}
            {...hov("cta_weiter", { step, label: footerLabel })}
            style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: runningId || !canProceed ? "#9bb4d6" : C.blue,
              color: "#fff", fontWeight: 600, cursor: runningId || !canProceed ? "default" : "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 6 }}>
            {footerLabel}{step < 6 && <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
