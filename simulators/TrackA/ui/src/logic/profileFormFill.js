// Derives realistic form field values from a sampled personaProfile so session
// telemetry no longer uses placeholder "x" / fixed dates.

const SV_OPTIONS = ["ÖGK", "BVAEB", "SVS", "KFA", "Sonstige"];

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function birthDateFromAge(age, rng) {
  const year = new Date().getFullYear() - age;
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

function genderLabel(g) {
  if (g === "female") return "weiblich";
  if (g === "male") return "männlich";
  return "divers";
}

function splitName(personaName) {
  const parts = (personaName || "Max Mustermann").trim().split(/\s+/);
  return { vorname: parts[0], name: parts.slice(1).join(" ") || "Mustermann" };
}

function pickTarif(profile, rng) {
  const income = profile.demographics?.income_label;
  const drivers = profile.top_decision_drivers || [];
  const criteria = profile.top_purchase_criteria || [];
  const comfort = (profile.online_behavior || []).includes("likely_to_purchase_online_next_3y");

  if (drivers.includes("always_picks_cheapest") || income === "below_average_to_average") {
    return rng() < 0.85 ? "start" : "optimal";
  }
  if (criteria.includes("comprehensive_product") || income === "above_average") {
    return rng() < 0.65 ? "optimal" : "start";
  }
  if (!comfort && drivers.includes("personal_advisor_trust")) {
    return rng() < 0.25 ? "optplus" : rng() < 0.5 ? "optimal" : "start";
  }
  return rng() < 0.45 ? "start" : "optimal";
}

function pickAddons(profile, rng) {
  const intent = profile.insurance_behavior?.intended_purchases_next_3y || [];
  const addons = [];
  if (intent.includes("health") || (profile.life_events_and_plans?.planned_next_3_years || []).includes("more_sports")) {
    if (rng() < 0.4) addons.push("fit");
  }
  if ((profile.life_events_and_plans?.planned_next_3_years || []).includes("increased_preventive_checkups")) {
    if (rng() < 0.3) addons.push("vital");
  }
  return addons;
}

/** Deterministic form choices from profile + seeded rng. */
export function formFillFromProfile(profile, rng = Math.random) {
  const { vorname, name } = splitName(profile.persona_name);
  const age = profile.demographics?.age ?? 40;
  const gender = genderLabel(profile.demographics?.gender);
  const geburtsdatum = birthDateFromAge(age, rng);
  const tarif = pickTarif(profile, rng);
  const addons = pickAddons(profile, rng);

  const owned = profile.insurance_behavior?.owned_products || [];
  const hasHealth = owned.includes("health") || profile.insurance_behavior?.has_health_insurance;
  const privatVersichert7 = hasHealth && rng() < 0.35 ? "ja" : "nein";

  const svDigits = String(1000000000 + Math.floor(rng() * 8999999999)).slice(0, 10);
  const slug = vorname.toLowerCase().replace(/[^a-z]/g, "") || "user";

  return {
    coverage: {
      arzt: true,
      krankenhaus: rng() < 0.12 && (profile.demographics?.household_type || "").includes("children"),
    },
    insuredPerson: "myself",
    geburtsdatum,
    sozialversicherung: pick(rng, SV_OPTIONS),
    tarif,
    addons: Object.fromEntries(["fit", "eltern", "mental", "akut", "baby", "vital"].map((k) => [k, addons.includes(k)])),
    geschlecht: gender,
    vorname,
    name,
    svnummer: svDigits,
    email: `${slug}.${name.toLowerCase().replace(/[^a-z]/g, "") || "at"}@example.at`,
    telefon: `+43${660}${String(Math.floor(rng() * 1e7)).padStart(7, "0")}`,
    groesse: String(155 + Math.floor(rng() * 40)),
    gewicht: String(55 + Math.floor(rng() * 45)),
    leistungssport: (profile.life_events_and_plans?.planned_next_3_years || []).includes("more_sports") && rng() < 0.35 ? "ja" : "nein",
    schwangerschaft: profile.demographics?.gender === "female" && age < 45 && rng() < 0.08 ? "ja" : "nein",
    privatVersichert7,
    antraegeAbgelehnt: "nein",
    besondereAnnahme: "nein",
    beratungsort: profile.channel_preferences?.consultation === "via_advisor"
      ? pick(rng, ["Online Videoberatung", "Persönlich an einem UNIQA-Standort", "Per Telefon"])
      : "Online Videoberatung",
  };
}

/** Map GPT / agent JSON onto the form shape the simulator understands. */
export function normalizeAgentFormFill(raw) {
  if (!raw || typeof raw !== "object") return null;
  const addonKeys = ["fit", "eltern", "mental", "akut", "baby", "vital"];
  const addons = {};
  addonKeys.forEach((k) => { addons[k] = Array.isArray(raw.addons) ? raw.addons.includes(k) : !!raw.addons?.[k]; });
  return {
    coverage: raw.coverage || { arzt: true, krankenhaus: false },
    insuredPerson: raw.insuredPerson || "myself",
    geburtsdatum: raw.geburtsdatum,
    sozialversicherung: raw.sozialversicherung,
    tarif: raw.tarif,
    addons,
    geschlecht: raw.geschlecht,
    vorname: raw.vorname,
    name: raw.name,
    svnummer: String(raw.svnummer || "").replace(/\D/g, "").slice(0, 10),
    email: raw.email,
    telefon: raw.telefon,
    groesse: String(raw.groesse ?? ""),
    gewicht: String(raw.gewicht ?? ""),
    leistungssport: raw.leistungssport || "nein",
    schwangerschaft: raw.schwangerschaft || "nein",
    privatVersichert7: raw.privatVersichert7 || "nein",
    antraegeAbgelehnt: raw.antraegeAbgelehnt || "nein",
    besondereAnnahme: raw.besondereAnnahme || "nein",
    beratungsort: raw.beratungsort,
  };
}
