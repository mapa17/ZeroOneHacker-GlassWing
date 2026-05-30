import { TARIFFS, ADDONS, tariff } from "../data/product.js";

export const freshAddons = () => ({
  fit: false, eltern: false, mental: false, akut: false, baby: false, vital: false,
});

export const addonObj = (arr) => {
  const o = freshAddons();
  (arr || []).forEach((k) => { if (k in o) o[k] = true; });
  return o;
};

export const calcPremium = (tarifKey, addons) =>
  tariff(tarifKey).premium + ADDONS.reduce((s, a) => s + (addons[a.key] ? a.price : 0), 0);

export const fmt = (n) => n.toFixed(2).replace(".", ",") + " EUR";

export const filled = (v) => String(v ?? "").trim().length > 0;

export function validateStep(step, form) {
  const errors = {};
  switch (step) {
    case 0:
      if (!form.coverage.arzt && !form.coverage.krankenhaus)
        errors.coverage = "Bitte wählen Sie mindestens eine Option.";
      break;
    case 1:
      if (!form.insuredPerson) errors.insuredPerson = "Bitte wählen Sie eine Option.";
      break;
    case 2:
      if (!filled(form.geburtsdatum)) errors.geburtsdatum = "Bitte geben Sie Ihr Geburtsdatum ein.";
      else if (!/^\d{2}\.\d{2}\.\d{4}$/.test(form.geburtsdatum.trim()))
        errors.geburtsdatum = "Bitte verwenden Sie das Format TT.MM.JJJJ.";
      if (!filled(form.sozialversicherung)) errors.sozialversicherung = "Bitte wählen Sie Ihre Sozialversicherung.";
      break;
    case 3:
      if (!form.tarif) errors.tarif = "Bitte wählen Sie einen Tarif.";
      break;
    case 5:
      if (!filled(form.geschlecht)) errors.geschlecht = "Bitte wählen Sie ein Geschlecht.";
      if (!filled(form.vorname)) errors.vorname = "Bitte geben Sie Ihren Vornamen ein.";
      if (!filled(form.name)) errors.name = "Bitte geben Sie Ihren Namen ein.";
      if (!filled(form.svnummer)) errors.svnummer = "Bitte geben Sie Ihre SV-Nummer ein.";
      else if (!/^\d{10}$/.test(form.svnummer.replace(/\s/g, "")))
        errors.svnummer = "Die SV-Nummer muss 10 Ziffern haben.";
      if (!filled(form.email)) errors.email = "Bitte geben Sie Ihre E-Mail ein.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
        errors.email = "Bitte geben Sie eine gültige E-Mail ein.";
      if (!filled(form.telefon)) errors.telefon = "Bitte geben Sie Ihre Telefonnummer ein.";
      if (!filled(form.groesse)) errors.groesse = "Bitte geben Sie Ihre Größe ein.";
      if (!filled(form.gewicht)) errors.gewicht = "Bitte geben Sie Ihr Gewicht ein.";
      if (!filled(form.leistungssport)) errors.leistungssport = "Bitte wählen Sie eine Option.";
      if (!filled(form.schwangerschaft)) errors.schwangerschaft = "Bitte wählen Sie eine Option.";
      break;
    case 6:
      if (!filled(form.privatVersichert7)) errors.privatVersichert7 = "Bitte wählen Sie eine Option.";
      if (!filled(form.antraegeAbgelehnt)) errors.antraegeAbgelehnt = "Bitte wählen Sie eine Option.";
      if (!filled(form.besondereAnnahme)) errors.besondereAnnahme = "Bitte wählen Sie eine Option.";
      break;
    case 7:
      if (!filled(form.beratungsort)) errors.beratungsort = "Bitte wählen Sie einen Beratungsort.";
      break;
    default:
      break;
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/** Same gate as the web form Continue button (App.jsx canProceed). */
export function canProceedFromStep(step, form) {
  return step === 8 || validateStep(step, form).valid;
}

/** Format validateStep errors for LLM prompts (German messages as shown in UI). */
export function formatValidationBlock(errors) {
  if (!errors || Object.keys(errors).length === 0) return null;
  return Object.entries(errors)
    .map(([field, msg]) => `- ${field}: ${msg}`)
    .join("\n");
}

export function evaluateOutcome(o) {
  const reasons = [];
  if (o.coverage?.krankenhaus) reasons.push("Krankenhaus-Versicherung gewählt");
  if (o.insuredPerson === "others") reasons.push("Versicherung für andere Personen gewählt");
  if (!tariff(o.tarif).online) reasons.push("Gewählter Tarif nur nach Beratung");
  if (o.privatVersichert7 === "ja") reasons.push("In den letzten 7 Jahren privat versichert");
  if (o.antraegeAbgelehnt === "ja") reasons.push("Frühere Anträge abgelehnt / Vertrag gekündigt");
  if (o.besondereAnnahme === "ja") reasons.push("Annahme zu besonderen Konditionen");
  return { route: reasons.length ? "beratung" : "online", reasons };
}

/**
 * Terminal status for a session that reached the outcome page (step 8).
 *  - "completed": stayed on the online path to the end (route "online").
 *  - "advisor_forward": any advisor-routed session — Krankenhaus/other-person early
 *    jumps, non-online tariff, prior-insurance triggers, or any step-7 Beratungsort
 *    choice (including "Online Videoberatung"). Only the pure online path completes.
 * Reaching step 8 is therefore not the same as completing.
 */
export function terminalStatus(form) {
  return evaluateOutcome(form).route === "online" ? "completed" : "advisor_forward";
}

/** True only for genuine online completions (see terminalStatus). */
export const isOnlineCompletion = (form) => terminalStatus(form) === "completed";

export const freshForm = () => ({
  coverage: { arzt: false, krankenhaus: false },
  insuredPerson: "",
  geburtsdatum: "", sozialversicherung: "",
  tarif: "optimal", addons: freshAddons(),
  geschlecht: "", vorname: "", name: "", svnummer: "",
  email: "", telefon: "", groesse: "", gewicht: "",
  leistungssport: "", schwangerschaft: "", arzt: "", keinArzt: true,
  privatVersichert7: "", antraegeAbgelehnt: "", besondereAnnahme: "",
  beratungsort: "",
});
