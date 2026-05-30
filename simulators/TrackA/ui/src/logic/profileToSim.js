// Maps a sampled personaProfile (from personas.json distributions) onto the
// behavioural simulation parameters. This is what makes a 66-year-old Judith
// with low online comfort behave differently from a 28-year-old Franz who
// buys insurance online regularly.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clampProb = (p) => clamp(p, 0.05, 0.99);

function onlineComfortScore(profile) {
  const ob = profile.online_behavior || [];
  let s = 2.5;
  if (ob.includes("ever_purchased_insurance_online")) s += 0.8;
  if (ob.includes("likely_to_purchase_online_next_3y")) s += 1.2;
  if (ob.includes("customer_portal_registered")) s += 0.4;
  if (ob.includes("customer_portal_active_last_12_months")) s += 0.3;
  const purchase = profile.channel_preferences?.purchase;
  if (purchase === "self_online") s += 0.6;
  if (purchase === "via_advisor" || purchase === "customer_service") s -= 0.8;
  return clamp(s, 1, 5);
}

function hasDriver(profile, key) {
  return (profile.top_decision_drivers || []).includes(key)
    || (profile.top_purchase_criteria || []).includes(key);
}

/** Deep-merge profile-derived tweaks onto the segment's base `sim` block. */
export function buildSimFromProfile(baseSim, profile) {
  const sim = JSON.parse(JSON.stringify(baseSim));
  const comfort = onlineComfortScore(profile);
  const comfortNorm = (comfort - 1) / 4; // 0..1

  const switchW = profile.insurance_behavior?.switch_willingness ?? 10;
  const age = profile.demographics?.age ?? 40;
  const income = profile.demographics?.income_monthly_eur ?? 3500;
  const incomeLabel = profile.demographics?.income_label ?? "average";

  // Online comfort → faster early steps, higher late-step survival for digital buyers
  const speedMult = 1.35 - comfortNorm * 0.55; // low comfort = slower (up to 1.35× dwell)
  Object.keys(sim.dwell).forEach((k) => {
    sim.dwell[k] = Math.round(sim.dwell[k] * speedMult);
  });

  // Older users linger on personal-data step and move cursor more on complex pages
  if (age >= 55) {
    sim.dwell[5] = Math.round(sim.dwell[5] * 1.35);
    sim.dwell[2] = Math.round(sim.dwell[2] * 1.15);
    sim.cursorMult *= 1.2;
  } else if (age <= 32 && comfortNorm > 0.5) {
    sim.dwell[0] = Math.round(sim.dwell[0] * 0.85);
    sim.dwell[1] = Math.round(sim.dwell[1] * 0.8);
  }

  // Price / comparison sensitivity
  if (hasDriver(profile, "price_performance_ratio") || hasDriver(profile, "price_performance")) {
    sim.dwell[3] = Math.round(sim.dwell[3] * 1.25);
    sim.tarifHoversMean += 1;
    sim.tarifSwitchesMean += 0.5;
  }
  if (hasDriver(profile, "compares_multiple_offers")) {
    sim.tarifSwitchesMean += 1;
    sim.tarifHoversMean += 1;
  }
  if (hasDriver(profile, "personal_advisor_trust")) {
    sim.advisoryHoverProb = clamp(sim.advisoryHoverProb + 0.15, 0, 1);
  }

  // Switch willingness (segment stat, 7–24%)
  sim.tarifSwitchesMean = Math.max(0, sim.tarifSwitchesMean + (switchW - 12) / 20);

  // Income → tariff leaning
  if (incomeLabel === "above_average" || income >= 4000) {
    sim.tarifWeights = { ...sim.tarifWeights, optimal: (sim.tarifWeights.optimal || 0.5) + 0.15, start: Math.max(0.1, (sim.tarifWeights.start || 0.3) - 0.1) };
  } else if (income < 3600) {
    sim.tarifWeights = { ...sim.tarifWeights, start: (sim.tarifWeights.start || 0.4) + 0.15, optimal: Math.max(0.2, (sim.tarifWeights.optimal || 0.5) - 0.1) };
  }

  // Uncertainty at step 0 — household / partnership types that suggest family planning
  const hh = profile.demographics?.household_type || "";
  if (hh.includes("children") || hh.includes("four_person") || hh.includes("five_plus")) {
    sim.bothCoverageProb = clamp(sim.bothCoverageProb + 0.15, 0, 0.85);
  }

  // Continue probabilities: online-comfort drives late-funnel survival
  const lateBoost = (comfortNorm - 0.5) * 0.12;
  const earlyPenalty = (1 - comfortNorm) * 0.06;
  [3, 4, 5, 6].forEach((step) => {
    sim.continueProb[step] = clampProb(sim.continueProb[step] + lateBoost - (step <= 2 ? 0 : 0));
  });
  [0, 1, 2].forEach((step) => {
    sim.continueProb[step] = clampProb(sim.continueProb[step] - earlyPenalty * (step === 0 ? 0.5 : 1));
  });

  // Low online comfort → more back navigation and CTA hesitation
  sim.backProbStep3 = clamp(sim.backProbStep3 + (1 - comfortNorm) * 0.12, 0, 0.85);
  sim.backProbEarly = clamp(sim.backProbEarly + (1 - comfortNorm) * 0.15, 0, 0.7);
  sim.ctaHesitationProb = clamp(sim.ctaHesitationProb + (1 - comfortNorm) * 0.2, 0, 0.95);

  // Intended health purchase → more addon churn on step 4
  const intent = profile.insurance_behavior?.intended_purchases_next_3y || [];
  if (intent.includes("health")) sim.addonChurnMean += 1;

  return { sim, meta: { onlineComfort: comfort, age, switchWillingness: switchW } };
}
