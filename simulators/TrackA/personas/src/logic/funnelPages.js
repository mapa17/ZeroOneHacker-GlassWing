// Self-contained description of the UNIQA online quote funnel, plus the four
// "stop conditions" that put a session OUT OF SCOPE for the drop-off coach.
//
// This module deliberately does NOT import product.js / form.js (which pull in
// lucide-react, a browser-only dep). It mirrors the relevant logic so the
// Node test runner has zero npm dependencies.
//
// Stop conditions (mirror evaluateOutcome() in src/logic/form.js — these route
// a real user to "Beratung" instead of an online purchase, so the coach stops):
//   step 0 · "Im Krankenhaus" (krankenhaus) selected      → out of scope
//   step 1 · "Andere Personen" (others) selected           → out of scope
//   step 3 · "Nur nach Beratung" tariff (optplus/premium)  → out of scope
//   step 6 · any health/insurance question answered "ja"   → out of scope

export const ONLINE_TARIFFS = ["start", "optimal"];
export const OFFLINE_TARIFFS = ["optplus", "premium"];

// Tariff metadata (mirrors product.js). `cov` = the annual benefit limits the
// persona literally sees in the comparison table ("–" means NOT covered), so they
// can weigh what each tariff gets them vs. what it leaves out.
export const TARIFFS = {
  start:   { name: "Start",     online: true,  premium: 42.84,  badge: "Online abschließbar",
    cov: { hoechst: "1.400 EUR", arzt: "1.120 EUR", medi: "280 EUR", thera: "–", heil: "–", augen: "–" } },
  optimal: { name: "Optimal",   online: true,  premium: 75.91,  badge: "Online abschließbar",
    cov: { hoechst: "2.800 EUR", arzt: "1.400 EUR", medi: "560 EUR", thera: "560 EUR", heil: "280 EUR", augen: "280 EUR" } },
  optplus: { name: "Opt. Plus", online: false, premium: 110.65, badge: "Nur nach Beratung",
    cov: { hoechst: "4.200 EUR", arzt: "2.100 EUR", medi: "840 EUR", thera: "840 EUR", heil: "420 EUR", augen: "420 EUR" } },
  premium: { name: "Premium",   online: false, premium: 160.44, badge: "Nur nach Beratung",
    cov: { hoechst: "8.400 EUR", arzt: "4.200 EUR", medi: "1.680 EUR", thera: "1.680 EUR", heil: "840 EUR", augen: "840 EUR" } },
};

// The rows of the tariff comparison table, in the order shown on screen.
export const COV_ROWS = [
  { id: "hoechst", label: "Jährliche Höchstleistung" },
  { id: "arzt",    label: "Arztleistungen (Schul-/Alternativmedizin, Telemedizin, keine Zahnmedizin)" },
  { id: "medi",    label: "Medikamente, Impfungen" },
  { id: "thera",   label: "Therapeutische Behandlungen (Psychotherapie, Physiotherapie)" },
  { id: "heil",    label: "Heilbehelfe, Hilfsmittel (inkl. Sehhilfen)" },
  { id: "augen",   label: "Refraktive Augen-OP (pro zwei Kalenderjahre)" },
];

export const ADDONS = {
  fit:    { name: "Fit fühlen",     price: 17.17, desc: "Aktiv bleiben und sich regelmäßig etwas Gutes tun." },
  eltern: { name: "Eltern werden",  price: 12.73, desc: "Rund um die Geburt gut umsorgt – unabhängig vom Lebensmodell." },
  mental: { name: "Mental wachsen", price: 25.76, desc: "Beratung bei Problemen oder Weiterentwicklung." },
  akut:   { name: "Akut Versorgt",  price: 12.79, desc: "Rasche Versorgung – abends, nachts, am Wochenende." },
  baby:   { name: "BabyOption",     price: 4.62,  desc: "Bei Kinderwunsch vorsorgen – Schutz ab Geburt." },
  vital:  { name: "VitalPlan",      price: 16.34, desc: "Coaches begleiten bei Gesundheitszielen." },
};

// The concrete bullet features shown under each coverage area on step 0.
export const COVERAGE_OPTION_FEATURES = {
  arzt: [
    "Kassen-, Wahl- oder Privatärzt:in wählen",
    "Schul- und Alternativmedizin",
    "Telemedizin – Arztbesuch bequem von Zuhause",
  ],
  krankenhaus: [
    "Öffentliches Spital oder Privatklinik wählen",
    "Komfort im Zweibettzimmer",
    "Operationstermin zeitlich flexibel planen",
  ],
};

export const SV_OPTIONS = ["ÖGK", "BVAEB", "SVS", "KFA", "Sonstige"];

// Ordered pages the persona walks (steps 0-6). Step 7 (Beratungsort) and step 8
// (Ergebnis) are terminal — the coach never needs the persona to act there.
export const FUNNEL_PAGES = [
  {
    step: 0,
    name: "Absicherungsbereich",
    asks:
      "This is a PRIVATARZT (private outpatient doctor) insurance calculator — that is the product you came " +
      "here for: better/faster access to doctors, Wahlarzt/Privatarzt, telemedicine. The screen offers TWO " +
      "SEPARATE coverage areas and you should tick ONLY the one(s) you actually came to insure. These are " +
      "distinct products, NOT a checklist to complete: 'Bei Arztbesuchen' is the outpatient doctor cover most " +
      "people here are configuring; 'Im Krankenhaus' is a DIFFERENT product for private hospital/Sonderklasse " +
      "stays (private room, free choice of clinic) — only tick it if a private HOSPITAL stay is specifically " +
      "what you want to insure today. Do NOT tick 'Im Krankenhaus' just to 'be safe' or 'not leave anything " +
      "out'; a normal outpatient shopper selects only 'Bei Arztbesuchen'. (First time here — no further " +
      "explanation on screen beyond the two areas below.)",
    field: "coverage",
    options: [
      { key: "arzt", label: "Bei Arztbesuchen — ambulante Arztbesuche (Kassen-, Wahl- oder Privatärzt:in, Telemedizin). The outpatient cover most people here want." },
      { key: "krankenhaus", label: "Im Krankenhaus — a SEPARATE product for a private SPITALSAUFENTHALT (Sonderklasse, Zweibettzimmer). Only for people who specifically want to insure a private hospital stay." },
    ],
  },
  {
    step: 1,
    name: "Versicherte Person",
    asks: "Who should the insurance cover?",
    field: "insuredPerson",
    options: [
      { key: "myself", label: "Ich selbst" },
      { key: "others", label: "Andere Personen" },
    ],
  },
  {
    step: 2,
    name: "Geburtsdatum & Sozialversicherung",
    asks: "Confirm your date of birth and pick your statutory health insurer.",
    field: "sozialversicherung",
    options: SV_OPTIONS.map((k) => ({ key: k, label: k })),
  },
  {
    step: 3,
    name: "Tarif-Auswahl",
    asks: "You now see the four tariffs with their monthly prices for the first time. Choose the tariff that fits you.",
    field: "tarif",
    options: [
      { key: "start", label: "Start — €42,84/Monat · online abschließbar" },
      { key: "optimal", label: "Optimal — €75,91/Monat · online abschließbar" },
      { key: "optplus", label: "Opt. Plus — €110,65/Monat · nur nach Beratung" },
      { key: "premium", label: "Premium — €160,44/Monat · nur nach Beratung" },
    ],
  },
  {
    step: 4,
    name: "Zusatzleistungen",
    asks: "Optionally add extra coverage modules. You can also continue without any.",
    field: "addons",
    options: Object.entries(ADDONS).map(([k, v]) => ({ key: k, label: `${v.name} (+€${v.price}/mo)` })),
  },
  {
    step: 5,
    name: "Persönliche Angaben",
    asks: "Fill in your personal details (name, gender, height, weight, sports, pregnancy).",
    field: "personal",
    options: [],
  },
  {
    step: 6,
    name: "Bisherige Versicherungen",
    asks: "Answer three honest yes/no questions about your insurance/underwriting history.",
    field: "health",
    options: [
      { key: "privatVersichert7", label: "Privately health-insured in the last 7 years? (ja/nein)" },
      { key: "antraegeAbgelehnt", label: "Earlier applications declined / contract cancelled? (ja/nein)" },
      { key: "besondereAnnahme", label: "Accepted only on special terms? (ja/nein)" },
    ],
  },
];

export const PAGE_BY_STEP = Object.fromEntries(FUNNEL_PAGES.map((p) => [p.step, p]));
export const RESULT_STEP = 8;

/**
 * Evaluate whether the accumulated selections push the session OUT OF SCOPE.
 * Returns the FIRST stop condition encountered (by funnel order), or null.
 *
 * @param {object} sel — accumulated selections so far
 * @returns {{ outOfScope: true, reason: string, step: number, label: string } | null}
 */
export function checkOutOfScope(sel = {}) {
  if (sel.coverage?.krankenhaus) {
    return { outOfScope: true, reason: "hospital", step: 0, label: "Krankenhaus-Versicherung gewählt" };
  }
  if (sel.insuredPerson === "others") {
    return { outOfScope: true, reason: "others", step: 1, label: "Versicherung für andere Personen gewählt" };
  }
  if (sel.tarif && OFFLINE_TARIFFS.includes(sel.tarif)) {
    return { outOfScope: true, reason: "offlineTariff", step: 3, label: "Gewählter Tarif nur nach Beratung" };
  }
  if (sel.privatVersichert7 === "ja" || sel.antraegeAbgelehnt === "ja" || sel.besondereAnnahme === "ja") {
    const which = sel.privatVersichert7 === "ja"
      ? "In den letzten 7 Jahren privat versichert"
      : sel.antraegeAbgelehnt === "ja"
        ? "Frühere Anträge abgelehnt / Vertrag gekündigt"
        : "Annahme zu besonderen Konditionen";
    return { outOfScope: true, reason: "healthDeclaration", step: 6, label: which };
  }
  return null;
}

export const OUT_OF_SCOPE_REASONS = {
  hospital: "Im Krankenhaus gewählt (Beratung nötig)",
  others: "Andere Personen versichert (Beratung nötig)",
  offlineTariff: "Tarif nur nach Beratung (Opt. Plus / Premium)",
  healthDeclaration: "Gesundheits-/Vorversicherungsfrage mit „ja“ beantwortet",
};

// Categorised reasons a persona abandons the ONLINE path (in scope). The persona
// emits the closest code; the report aggregates these by income band, age band and
// segment so "the price is too high" becomes a quantified, segmented insight.
export const DROP_REASON_CODES = {
  price_vs_income: "Preis zu hoch fürs Einkommen/Budget",
  weak_value: "Unklarer Gegenwert fürs Geld (Preis-Leistung)",
  complexity_overwhelm: "Zu kompliziert / zu viele Optionen",
  not_sure_applies: "Unsicher, welche Option überhaupt passt",
  advisory_wall: "Passender Tarif nur nach Beratung verfügbar",
  want_to_compare: "Will zuerst woanders vergleichen",
  prefer_human: "Lieber persönliche Beratung / Telefon",
  data_privacy_fatigue: "Zu viele persönliche Daten / Formular zu lang",
  final_price_commitment: "Zögern beim finalen Gesamtpreis (Abschluss/Commitment)",
  no_felt_need: "Kein akuter Bedarf / kann warten",
  other: "Sonstiges",
};

export const calcPremium = (tarifKey, addons = {}) => {
  const base = (TARIFFS[tarifKey] || TARIFFS.optimal).premium;
  const extra = Object.entries(addons)
    .filter(([, on]) => on)
    .reduce((s, [k]) => s + (ADDONS[k]?.price || 0), 0);
  return Math.round((base + extra) * 100) / 100;
};

// ---- "what is literally on this screen" --------------------------------------
// Rendered into the persona prompt so they react to the ACTUAL content (option
// names, tariff benefits, what is / isn't covered) rather than a vague summary.

export function tariffComparisonText() {
  const keys = ["start", "optimal", "optplus", "premium"];
  const head = keys
    .map((k) => `${TARIFFS[k].name} — €${TARIFFS[k].premium}/Monat · ${TARIFFS[k].online ? "online abschließbar" : "nur nach Beratung"}`)
    .join("\n  ");
  const rows = COV_ROWS.map((r) => {
    const cells = keys.map((k) => `${TARIFFS[k].name}: ${TARIFFS[k].cov[r.id] ?? "–"}`).join("  |  ");
    return `  • ${r.label}\n      ${cells}`;
  });
  return [
    "The four tariffs (left to right):",
    `  ${head}`,
    "",
    'What each tariff covers per year ("–" means this is NOT included in that tariff):',
    ...rows,
  ].join("\n");
}

/** Human-readable description of exactly what the persona sees on this screen. */
export function screenContent(step) {
  if (step === 0) {
    const blocks = ["arzt", "krankenhaus"]
      .map((k) => {
        const title = k === "arzt" ? "Bei Arztbesuchen (outpatient doctor cover)" : "Im Krankenhaus (SEPARATE private hospital-stay cover)";
        return `“${title}”:\n  - ${COVERAGE_OPTION_FEATURES[k].join("\n  - ")}`;
      })
      .join("\n");
    return blocks + "\nTick only what you came to insure — most outpatient shoppers select just “Bei Arztbesuchen”.";
  }
  if (step === 1) {
    return "“Ich selbst” (you are the insured person)\n“Andere Personen” (you insure someone else)";
  }
  if (step === 3) {
    return tariffComparisonText();
  }
  if (step === 4) {
    return Object.values(ADDONS)
      .map((a) => `“${a.name}” (+€${a.price}/Monat): ${a.desc}`)
      .join("\n");
  }
  return null;
}

// -------- deterministic PII helpers (from the sampled profile) --------------

export function birthDateFromAge(age, rng = Math.random) {
  const year = new Date().getFullYear() - age;
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

export function genderLabel(g) {
  if (g === "female") return "weiblich";
  if (g === "male") return "männlich";
  return "divers";
}

export function splitName(personaName) {
  const parts = (personaName || "Max Mustermann").trim().split(/\s+/);
  return { vorname: parts[0], name: parts.slice(1).join(" ") || "Mustermann" };
}

/** Build the deterministic personal-data block (step 5) from the profile. */
export function personalDataFromProfile(profile, rng = Math.random) {
  const { vorname, name } = splitName(profile.persona_name);
  const slug = vorname.toLowerCase().replace(/[^a-z]/g, "") || "user";
  const nameSlug = name.toLowerCase().replace(/[^a-z]/g, "") || "at";
  return {
    vorname,
    name,
    geschlecht: genderLabel(profile.demographics?.gender),
    svnummer: String(1000000000 + Math.floor(rng() * 8999999999)).slice(0, 10),
    email: `${slug}.${nameSlug}@example.at`,
    telefon: `+43660${String(Math.floor(rng() * 1e7)).padStart(7, "0")}`,
    groesse: String(155 + Math.floor(rng() * 40)),
    gewicht: String(55 + Math.floor(rng() * 45)),
  };
}
