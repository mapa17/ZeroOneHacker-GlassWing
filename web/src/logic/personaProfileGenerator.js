// Shared PersonaSampler — used by CLI scripts, test runners, and the browser Agent tab.
// Draws a concrete person from a UNIQA segment by sampling personas/personas.json.

export const FIRST_NAMES = [
  "Anna", "Laura", "Julia", "Sarah", "Lena", "Eva", "Maria", "Sophie", "Katharina", "Elena",
  "Michael", "Thomas", "Daniel", "Markus", "Stefan", "Andreas", "Lukas", "Florian", "Christian", "Martin",
];
export const LAST_NAMES = [
  "Bauer", "Hofer", "Mayer", "Gruber", "Huber", "Wagner", "Fischer", "Koch",
  "Wimmer", "Steiner", "Moser", "Berger", "Pichler", "Reiter", "Lang", "Wolf",
];

export function makeRng(seed) {
  if (seed == null) return Math.random;
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class PersonaSampler {
  constructor(data, rng = Math.random) {
    this.data = data;
    this.personas = data.personas;
    this.rng = rng;
  }

  _randint(min, max) { return Math.floor(this.rng() * (max - min + 1)) + min; }
  _choice(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  _sample(arr, k) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.min(k, copy.length));
  }

  sampleFromDistribution(distribution) {
    if (!distribution) return [];
    const out = [];
    for (const [item, probability] of Object.entries(distribution)) {
      if (typeof probability !== "number") continue;
      const prob = probability > 1 ? probability / 100 : probability;
      if (this.rng() < prob) out.push(item);
    }
    return out;
  }

  sampleSingleFromDistribution(distribution) {
    if (!distribution) return null;
    const items = [];
    const weights = [];
    for (const [k, v] of Object.entries(distribution)) {
      if (typeof v !== "number") continue;
      items.push(k);
      weights.push(v / 100);
    }
    if (!items.length) return null;
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this.rng() * total;
    for (let i = 0; i < items.length; i++) {
      if ((r -= weights[i]) <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  sampleBooleanFromPercentage(percentage) {
    if (percentage == null || typeof percentage !== "number") return false;
    const probability = percentage > 1 ? percentage / 100 : percentage;
    return this.rng() < probability;
  }

  generatePersonName() {
    return `${this._choice(FIRST_NAMES)} ${this._choice(LAST_NAMES)}`;
  }

  sampleDemographics(segment) {
    const d = segment.demographics || {};
    const ageDist = d.age_distribution_pct || {};
    let ageGroup = Object.keys(ageDist).length ? this.sampleSingleFromDistribution(ageDist) : "30_39";
    if (typeof ageGroup !== "string") ageGroup = "30_39";
    const ageRanges = {
      "18_29": this._randint(18, 29), "30_39": this._randint(30, 39),
      "40_49": this._randint(40, 49), "50_59": this._randint(50, 59),
      "60_75": this._randint(60, 75),
    };
    const age = ageRanges[ageGroup] ?? this._randint(30, 50);
    const genderOptions = [];
    if ((d.female_pct || 0) > 0) genderOptions.push(...Array(Math.round(d.female_pct)).fill("female"));
    if ((d.male_pct || 0) > 0) genderOptions.push(...Array(Math.round(d.male_pct)).fill("male"));
    if ((d.diverse_pct || 0) > 0) genderOptions.push(...Array(Math.round(d.diverse_pct)).fill("diverse"));
    const gender = genderOptions.length ? this._choice(genderOptions) : "female";
    return {
      age, age_group: ageGroup, gender,
      urbanity: this.sampleSingleFromDistribution(d.urbanity || {}),
      household_type: this.sampleSingleFromDistribution(d.household || {}),
      education: this.rng() < ((d.education?.with_matura_pct || 0) / 100) ? "with_matura" : "without_matura",
      income_monthly_eur: d.income_monthly_eur ?? 3500,
      income_label: d.income_label ?? "average",
    };
  }

  sampleFinancialAssets(segment) {
    return this.sampleFromDistribution(segment.financial_assets_pct || {});
  }

  sampleInsuranceHoldings(segment) {
    const insurance = segment.insurance_behavior || {};
    const ownedProducts = this.sampleFromDistribution(insurance.current_holdings_pct || {});
    const intendedPurchases = this.sampleFromDistribution(insurance.new_purchase_likelihood_3y_pct || {});
    return {
      products_owned_count: ownedProducts.length,
      owned_products: ownedProducts,
      intended_purchases_next_3y: intendedPurchases,
      monthly_insurance_spend_eur: insurance.monthly_insurance_spend_eur ?? 200,
      has_health_insurance: ownedProducts.includes("health"),
      switch_willingness: insurance.switch_willingness_pct ?? 10,
      advisor_type: this.sampleSingleFromDistribution(insurance.advisor_type_pct || {}),
    };
  }

  sampleDecisionDrivers(segment) {
    const drivers = this.sampleFromDistribution(segment.decision_drivers_pct || {});
    return drivers.length ? this._sample(drivers, Math.min(5, drivers.length)) : [];
  }

  samplePurchaseCriteria(segment) {
    const criteria = this.sampleFromDistribution(segment.purchase_criteria_pct || {});
    return criteria.length ? this._sample(criteria, Math.min(5, criteria.length)) : [];
  }

  sampleInformationChannels(segment) {
    return this.sampleFromDistribution(segment.information_channels_pct || {});
  }

  sampleLifeEvents(segment) {
    return {
      experienced_last_5_years: this.sampleFromDistribution(segment.life_events_last_5_years_pct || {}),
      planned_next_3_years: this.sampleFromDistribution(segment.life_plans_next_3_years_pct || {}),
    };
  }

  sampleChannelPreferences(segment) {
    const prefs = segment.channel_preference_per_journey_step_pct_dominant_channel || {};
    const out = {};
    for (const [step, stepData] of Object.entries(prefs)) {
      if (stepData && typeof stepData === "object" && "channel" in stepData) out[step] = stepData.channel;
    }
    return out;
  }

  sampleOnlineBehavior(segment) {
    const ob = segment.online_behavior || {};
    const selected = [];
    const behaviorMap = {
      ever_purchased_insurance_online_pct: "ever_purchased_insurance_online",
      likely_to_purchase_online_next_3y_pct: "likely_to_purchase_online_next_3y",
      customer_portal_registered_pct: "customer_portal_registered",
      customer_portal_active_last_12_months_pct: "customer_portal_active_last_12_months",
    };
    for (const [src, out] of Object.entries(behaviorMap)) {
      if (this.sampleBooleanFromPercentage(ob[src] ?? 0)) selected.push(out);
    }
    const productDist = {};
    for (const item of ob.top_products_likely_for_online_purchase || []) {
      if (item && typeof item === "object" && "product" in item) productDist[item.product] = item.pct ?? 0;
    }
    this.sampleFromDistribution(productDist).forEach((p) => selected.push(`top_product:${p}`));
    return selected;
  }

  generatePersona(segmentId) {
    if (!this.personas[segmentId]) {
      throw new Error(`Invalid segment_id. Must be one of ${Object.keys(this.personas).join(", ")}`);
    }
    const segment = this.personas[segmentId];
    const archetype = segment.persona_archetype || {};
    const behaviors = segment.behavior_and_attitudes || [];
    return {
      persona_id: segmentId,
      persona_name: this.generatePersonName(),
      segment_name: segment.name_short || "Unknown",
      archetype_name: archetype.name || "Unknown",
      sample_id: this._randint(10000, 99999),
      generated_at: new Date().toISOString().slice(0, 10),
      demographics: this.sampleDemographics(segment),
      financial_assets: this.sampleFinancialAssets(segment),
      insurance_behavior: this.sampleInsuranceHoldings(segment),
      top_decision_drivers: this.sampleDecisionDrivers(segment),
      top_purchase_criteria: this.samplePurchaseCriteria(segment),
      preferred_information_channels: this.sampleInformationChannels(segment),
      life_events_and_plans: this.sampleLifeEvents(segment),
      channel_preferences: this.sampleChannelPreferences(segment),
      online_behavior: this.sampleOnlineBehavior(segment),
      typical_quote: archetype.typical_quote || "",
      behavioral_summary: behaviors.length ? this._choice(behaviors) : "",
    };
  }

  generateMultiple(segmentId, count = 1) {
    return Array.from({ length: count }, () => this.generatePersona(segmentId));
  }
}

/** Pick a segment id weighted by online_funnel_traffic_share. */
export function pickSegmentByTraffic(rng, trafficShare = {}) {
  const entries = [
    ["segment_1", trafficShare.segment_1 ?? 0.3],
    ["segment_2", trafficShare.segment_2 ?? 0.5],
    ["segment_3", trafficShare.segment_3 ?? 0.2],
  ];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [seg, w] of entries) {
    if ((r -= w) <= 0) return seg;
  }
  return entries[0][0];
}

/** Generate N profiles split by traffic share (browser + scripts). */
export function generateTrafficMix(count, personasJson, seed = Date.now()) {
  const traffic = personasJson.shared_context?.online_funnel_traffic_share || {};
  const sampler = new PersonaSampler(personasJson);
  return Array.from({ length: count }, (_, i) => {
    const rng = makeRng(seed + i * 7919);
    sampler.rng = rng;
    const segmentId = pickSegmentByTraffic(rng, traffic);
    return { segmentId, profile: sampler.generatePersona(segmentId) };
  });
}
