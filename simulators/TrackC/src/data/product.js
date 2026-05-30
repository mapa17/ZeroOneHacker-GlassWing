import { User, Users, Phone, Video, Building2, Home } from "lucide-react";

export const C = {
  blue: "#0B4A91", blueDark: "#08376B", pink: "#D6006E",
  sel: "#EAF1FE", ink: "#15233B", sub: "#5b6b82", line: "#e4e9f0",
  formBg: "#F4F7FC", lab: "#0e1320", labPanel: "#161d2e",
  labLine: "#27314a", amber: "#E0A042", green: "#3FB984", red: "#E2685C",
};

export const SV_OPTIONS = ["ÖGK", "BVAEB", "SVS", "KFA", "Sonstige"];

export const TARIFFS = [
  { key: "start",   name: "Start",     badge: "Online abschließbar", online: true,  premium: 42.84,
    cov: { hoechst: "1.400 EUR", arzt: "1.120 EUR", medi: "280 EUR", thera: "–", heil: "–", augen: "–" } },
  { key: "optimal", name: "Optimal",   badge: "Online abschließbar", online: true,  premium: 75.91,
    cov: { hoechst: "2.800 EUR", arzt: "1.400 EUR", medi: "560 EUR", thera: "560 EUR", heil: "280 EUR", augen: "280 EUR" } },
  { key: "optplus", name: "Opt. Plus", badge: "Nur nach Beratung",   online: false, premium: 110.65,
    cov: { hoechst: "4.200 EUR", arzt: "2.100 EUR", medi: "840 EUR", thera: "840 EUR", heil: "420 EUR", augen: "420 EUR" } },
  { key: "premium", name: "Premium",   badge: "Nur nach Beratung",   online: false, premium: 160.44,
    cov: { hoechst: "8.400 EUR", arzt: "4.200 EUR", medi: "1.680 EUR", thera: "1.680 EUR", heil: "840 EUR", augen: "840 EUR" } },
];
export const tariff = (k) => TARIFFS.find((t) => t.key === k) || TARIFFS[1];

export const COV_ROWS = [
  { id: "arzt",  label: "Arztleistungen", sub: "Schul- und Alternativmedizin, Telemedizin, keine Zahnmedizin" },
  { id: "medi",  label: "Medikamente, Impfungen", sub: "" },
  { id: "thera", label: "Therapeutische Behandlungen", sub: "Psychotherapie, Physiotherapie" },
  { id: "heil",  label: "Heilbehelfe, Hilfsmittel", sub: "inkl. Sehhilfen" },
  { id: "augen", label: "Zusätzlich für refraktive Augen-OP", sub: "pro zwei Kalenderjahre" },
];

export const ADDONS = [
  { key: "fit",    name: "Fit fühlen",     price: 17.17, desc: "Aktiv bleiben und sich regelmäßig etwas Gutes tun." },
  { key: "eltern", name: "Eltern werden",  price: 12.73, desc: "Rund um die Geburt gut umsorgt – unabhängig vom Lebensmodell." },
  { key: "mental", name: "Mental wachsen", price: 25.76, desc: "Beratung bei Problemen oder Weiterentwicklung." },
  { key: "akut",   name: "Akut Versorgt",  price: 12.79, desc: "Rasche Versorgung – abends, nachts, am Wochenende." },
  { key: "baby",   name: "BabyOption",     price: 4.62,  desc: "Bei Kinderwunsch vorsorgen – Schutz ab Geburt." },
  { key: "vital",  name: "VitalPlan",      price: 16.34, desc: "Coaches begleiten bei Gesundheitszielen." },
];
export const addon = (k) => ADDONS.find((a) => a.key === k);

// The only Beratungsort that still counts as an online completion (step 7).
export const BERATUNG_ORT_ONLINE = "Online Videoberatung";

export const BERATUNG_ORTE = [
  { id: BERATUNG_ORT_ONLINE, icon: Video, neu: true },
  { id: "Persönlich an einem UNIQA-Standort", icon: Building2 },
  { id: "Per Telefon", icon: Phone },
  { id: "Persönlich zu Hause", icon: Home },
];

export const COVERAGE_OPTIONS = [
  {
    key: "arzt", title: "Bei Arztbesuchen", icon: User,
    features: [
      "Kassen-, Wahl- oder Privatärzt:in wählen",
      "Schul- und Alternativmedizin",
      "Telemedizin – Arztbesuch bequem von Zuhause",
    ],
  },
  {
    key: "krankenhaus", title: "Im Krankenhaus", icon: Building2,
    features: [
      "Öffentliches Spital oder Privatklinik wählen",
      "Komfort im Zweibettzimmer",
      "Operationstermin zeitlich flexibel planen",
    ],
  },
];

export const INSURED_PERSON_OPTIONS = [
  { key: "myself", title: "Ich selbst", icon: User },
  { key: "others", title: "Andere Personen", icon: Users },
];

export const FUNNEL_PHASES = ["Angaben", "Produkt", "Empfehlung", "Abschluss"];
