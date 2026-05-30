// UNIQA retail segmentation personas — machine-readable profile used across the
// app (Coach classifier, the simulation/test engine, and the statistics lab).
//
// Every number here is sourced from personas/personas.json (UNIQA Retail
// Segmentation, n=4004). The `sim` block translates each segment's
// `online_funnel_behavior_hypotheses` into concrete, testable probabilities so
// we can generate realistic synthetic sessions and measure drop-off.

// Shared funnel context (personas.json → shared_context).
export const FUNNEL_CONTEXT = {
  marketTotalPersons: 6500000,
  onlineConversionBaseline: 0.056, // 5.6% — current real online conversion
  trafficShare: { judith: 0.30, franz: 0.50, peter: 0.20 }, // S1/S2/S3 online-funnel share
  baselineDropOffs: {
    initialPrice: 0.66, // 66% leave at the first tariff screen  (our step 3)
    additionalCoverage: 0.24, // 24% leave at add-on selection   (our step 4)
    finalPrice: 0.78, // 78% leave at the final price            (our step 6→result)
  },
};

// Backwards-compatible alias used by the Coach dashboard.
export const DROPOFF_BENCHMARKS = {
  firstPriceScreen: FUNNEL_CONTEXT.baselineDropOffs.initialPrice,
  finalPrice: FUNNEL_CONTEXT.baselineDropOffs.finalPrice,
};

export const PERSONAS = [
  {
    id: "judith",
    segmentId: "segment_1",
    name: "Judith Berger",
    segment: "Segment 1 · Die aufsteigenden Hybriden",
    short: "Hybrid",
    color: "#3FB984",
    age: 43,
    quote: "Ich recherchiere lieber selbst online — aber für wichtige Entscheidungen will ich jemanden, dem ich vertraue.",
    oneLiner:
      "Recherchiert online, will aber einen Menschen ihres Vertrauens, bevor sie etwas Wichtiges abschließt.",
    dropOff: "Tarif-Seite (Beratungs-Mauer) oder Endpreis (Preis-Sprung)",
    intervention:
      "Fachbegriffe in einfacher Sprache erklären, Preis begründen und eine Beratung als Option (nicht als Zwang) anbieten.",
    fingerprint: [
      "Frühe Schritte zügig, deutliche Verlangsamung auf der Tarif-Seite",
      "Hovert über Fachbegriffe und über die „Nur nach Beratung“-Tarife",
      "Vergleicht mehrere Tarife (1–3 Wechsel), entscheidet überlegt",
      "Recoverable: wollte kaufen, wurde unterbrochen — nicht verloren",
    ],
    stats: {
      marketSharePct: 15, trafficSharePct: 30,
      onlineEverPct: 34, onlineLikely3yPct: 22,
      switchWillingnessPct: 7, kvIntentPct: 18,
      nps: 17, incomeEur: 4042, monthlyInsuranceSpendEur: 230.6,
    },
    funnel: {
      primaryDropStep: 3,
      primaryDropLabel: "Erste Preis-Anzeige (Tarif-Auswahl)",
      behavioralSignals: [
        "Lange Verweildauer auf der Preis-Vergleichstabelle",
        "Wiederholtes Tarif-Hovern/Klicken ohne finale Auswahl",
        "Zurück-Navigation nach „Nur nach Beratung“ bei Opt. Plus / Premium",
        "Öffnet vermutlich einen externen Vergleichs-Tab",
      ],
      intendedOutcome: "Wollte online recherchieren, aber später mit Berater:in abschließen",
      bestInterventions: [
        "Markt-Vergleich einblenden („Optimal liegt unter 80% vergleichbarer Privatarzt-Tarife“)",
        "Preis psychologisch rahmen (€68/Monat ≈ €2,20/Tag)",
        "Begriffs-Erklärungen beim Hovern anbieten",
        "Sanfter Übergang zur Beratungs-Buchung — zählt als Conversion",
      ],
    },
    sim: {
      // Calibrated so the traffic-weighted funnel reproduces the documented
      // UNIQA drop-offs (66% initial price / 24% add-ons / 78% final price → ~5.6%
      // online conversion). Judith concentrates her loss at the first price screen.
      continueProb: { 0: 0.98, 1: 0.98, 2: 0.97, 3: 0.33, 4: 0.77, 5: 0.93, 6: 0.30 },
      dwell: { 0: 5000, 1: 3000, 2: 8000, 3: 38000, 4: 14000, 5: 26000, 6: 8000 },
      dwellSdPct: 0.35,
      tarifHoversMean: 3, advisoryHoverProb: 0.8,
      tarifSwitchesMean: 2, backProbStep3: 0.5, backProbStep4: 0.25, backProbEarly: 0.1,
      ctaHesitationProb: 0.5, bothCoverageProb: 0.1,
      addonChurnMean: 1.5, cursorMult: 1.3,
      tarifWeights: { start: 0.25, optimal: 0.6, optplus: 0.1, premium: 0.05 },
    },
  },
  {
    id: "franz",
    segmentId: "segment_2",
    name: "Franz Huber",
    segment: "Segment 2 · Die Online Affinen",
    short: "Online-affin",
    color: "#4D8AF0",
    age: 40,
    quote: "Ich will alles online erledigen — schnell, einfach und transparent.",
    oneLiner:
      "Digital-first, keine Geduld für Reibung. Will online kaufen — schnell, transparent, ohne Berater:in.",
    dropOff: "Endpreis (Preis weicht von der Schätzung ab) oder Beratungs-Mauer",
    intervention:
      "Endpreis früh zeigen, Abweichungen klar begründen, mit Daten überzeugen — und ihn in Ruhe abschließen lassen.",
    fingerprint: [
      "Rast durch alle Schritte, sehr kurze Verweildauern",
      "Entscheidet sich schnell und sicher (kaum Tarif-Wechsel)",
      "Reagiert allergisch auf „Nur nach Beratung“",
      "Bricht spät ab — beim Endpreis, nach Cancel/Continue-Zögern",
    ],
    stats: {
      marketSharePct: 17, trafficSharePct: 50,
      onlineEverPct: 64, onlineLikely3yPct: 43,
      switchWillingnessPct: 16, kvIntentPct: 16,
      nps: 1, incomeEur: 3692, monthlyInsuranceSpendEur: 166.8,
    },
    funnel: {
      primaryDropStep: 6,
      primaryDropLabel: "Endpreis nach Gesundheitsfragen",
      behavioralSignals: [
        "Schnelles Durchlaufen der frühen Schritte",
        "Vergleichs-Tab-Wechsel (sichtbare Sitzungslücken)",
        "Bleibt am Endpreis hängen, wenn er über der Erwartung liegt",
        "Klickt evtl. „Abbrechen“, wenn das Preis-Leistungs-Verhältnis ungünstig wirkt",
      ],
      intendedOutcome: "Will online abschließen, wenn das Preis-Leistungs-Verhältnis stimmt",
      bestInterventions: [
        "Wert begründen, wenn der Endpreis von der Schätzung abweicht",
        "Günstigeren Vergleichstarif mit klarem Feature-Vergleich zeigen",
        "Pause-und-Weiter-Funktion anbieten (Fortschritt speichern, ohne Berater)",
        "Keinen Berater-Übergang aufdrängen — dieses Segment lehnt das ab",
      ],
    },
    sim: {
      // Franz still races through the early steps (his signature), but the real
      // funnel shows even price-savvy users bounce at the first price reveal;
      // remaining ones are then filtered hard at the final price.
      continueProb: { 0: 0.99, 1: 0.99, 2: 0.98, 3: 0.38, 4: 0.80, 5: 0.94, 6: 0.21 },
      dwell: { 0: 2500, 1: 1500, 2: 3000, 3: 12000, 4: 6000, 5: 14000, 6: 4000 },
      dwellSdPct: 0.3,
      tarifHoversMean: 2, advisoryHoverProb: 0.6,
      tarifSwitchesMean: 1, backProbStep3: 0.1, backProbStep4: 0.1, backProbEarly: 0.03,
      ctaHesitationProb: 0.7, bothCoverageProb: 0.05,
      addonChurnMean: 1, cursorMult: 0.8,
      tarifWeights: { start: 0.3, optimal: 0.7, optplus: 0, premium: 0 },
    },
  },
  {
    id: "peter",
    segmentId: "segment_3",
    name: "Peter Wagner",
    segment: "Segment 3 · Die Kundenservice Affinen",
    short: "Service-affin",
    color: "#E0A042",
    age: 35,
    quote: "Ich will mich damit nicht beschäftigen — sag mir einfach, was ich brauche.",
    oneLiner:
      "Will nicht mit Versicherung kämpfen — wünscht sich, dass ihm jemand einfach sagt, was er braucht.",
    dropOff: "Tarif-Seite — früher als die anderen, an der Komplexität selbst",
    intervention:
      "Bildschirm vereinfachen („Die meisten in Ihrer Situation wählen Optimal …“) und früh einen Rückruf anbieten.",
    fingerprint: [
      "Zögert schon bei Schritt 0 (prüft beide Absicherungs-Optionen)",
      "Lange Verweildauer auf der Tarif-Seite OHNE eine Auswahl zu treffen",
      "Mehrfaches Zurück-Navigieren, überfordert von Zahlen/Begriffen",
      "Bricht früh ab; echter Gewinn ist ein warmer Übergang zum Rückruf",
    ],
    stats: {
      marketSharePct: 14, trafficSharePct: 20,
      onlineEverPct: 39, onlineLikely3yPct: 29,
      switchWillingnessPct: 24, kvIntentPct: 13,
      nps: -6, incomeEur: 3557, monthlyInsuranceSpendEur: 167.3,
    },
    funnel: {
      primaryDropStep: 2,
      primaryDropLabel: "Frühe Schritte / erste Preis-Anzeige",
      behavioralSignals: [
        "Frühe Überforderung: lange Verweildauer auf den ersten Formularschritten",
        "Mehrfache Zurück-Navigation",
        "Felder zögerlich oder fehlerhaft ausgefüllt",
        "Abbruch vor der Tarif-Auswahl — „das ist zu viel, ich rufe an“",
      ],
      intendedOutcome: "Wollte gar nicht online abschließen — kam über Suche, bevorzugt Telefon/persönlich",
      bestInterventions: [
        "Überforderung früh erkennen (hohe Zeit-auf-Aufgabe bei geringem Fortschritt)",
        "Kundenservice-Übergabe proaktiv und warm anbieten",
        "Formularfelder drastisch vereinfachen, wenn Überforderung erkannt wird",
        "Telefon-Rückruf anbieten — Conversion = qualifizierter Servicekontakt",
      ],
    },
    sim: {
      // Peter sheds early (overwhelm before the tariff page) and again at the
      // first price screen — the bulk of his loss happens before health questions.
      continueProb: { 0: 0.85, 1: 0.88, 2: 0.80, 3: 0.27, 4: 0.74, 5: 0.86, 6: 0.31 },
      dwell: { 0: 12000, 1: 6000, 2: 14000, 3: 55000, 4: 16000, 5: 30000, 6: 10000 },
      dwellSdPct: 0.4,
      tarifHoversMean: 4, advisoryHoverProb: 0.5,
      tarifSwitchesMean: 0, backProbStep3: 0.7, backProbStep4: 0.3, backProbEarly: 0.4,
      ctaHesitationProb: 0.3, bothCoverageProb: 0.6,
      addonChurnMean: 0, cursorMult: 1.8,
      tarifWeights: { start: 0.6, optimal: 0.4, optplus: 0, premium: 0 },
    },
  },
];

export const personaById = (id) => PERSONAS.find((p) => p.id === id);
