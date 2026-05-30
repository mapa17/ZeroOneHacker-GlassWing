export const PAGE_NAMES = {
  0: "Absicherungsbereich",
  1: "Versicherte Person",
  2: "Geburtsdatum & Sozialversicherung",
  3: "Tarif-Auswahl",
  4: "Zusatzleistungen",
  5: "Persönliche Angaben",
  6: "Bisherige Versicherungen",
  7: "Beratungsort",
  8: "Ergebnis",
};

export const PII_FIELDS = new Set([
  "vorname", "name", "email", "telefon", "svnummer", "geburtsdatum", "arzt", "groesse", "gewicht",
]);

export const newSessionId = () => `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const msToReadable = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
};

export const freshAnalytics = () => ({
  pages: {}, buttons: {}, fields: {}, backPresses: [], events: [],
  hovers: [], abandons: [],
});

// Per-page dwell thresholds (ms) used to color the funnel + flag friction.
// Step 3 (Tarif) is the canonical 66% drop-off page, so it gets its own scale.
export const DWELL_THRESHOLDS = {
  default: { slow: 25000, high: 50000 },
  3: { slow: 20000, high: 45000 },
  5: { slow: 30000, high: 60000 },
  6: { slow: 20000, high: 45000 },
  8: { slow: 8000, high: 20000 },
};

export const dwellLevel = (step, ms) => {
  const t = DWELL_THRESHOLDS[step] || DWELL_THRESHOLDS.default;
  if (ms >= t.high) return "high";
  if (ms >= t.slow) return "slow";
  return "ok";
};

// Hover dwell below this is treated as an incidental pass-through, not intent.
export const HOVER_MIN_MS = 250;
