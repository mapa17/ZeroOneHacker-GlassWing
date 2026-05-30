// Funnel gate analysis + benchmark comparison for simulated and real session exports.

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export function sessionDropStep(snap) {
  if (snap.completed || snap.currentStep === 8) return null;
  return snap.abandons?.[0]?.step ?? snap.currentStep ?? null;
}

export function stepReached(snap, step) {
  if (snap.completed) return true;
  const drop = sessionDropStep(snap);
  return drop != null ? drop >= step : false;
}

/** Gate drop rate: of those who reached step N, what % dropped AT step N. */
export function funnelGateStats(sessions) {
  const reach = {};
  const dropAt = {};
  for (const step of [0, 1, 2, 3, 4, 5, 6, 8]) {
    reach[step] = sessions.filter((s) => stepReached(s, step)).length;
    dropAt[step] = sessions.filter((s) => sessionDropStep(s) === step).length;
  }
  const gateDropPct = {};
  for (const step of [3, 4, 6]) {
    gateDropPct[step] = pct(dropAt[step], reach[step]);
  }
  return {
    total: sessions.length,
    completed: sessions.filter((s) => s.completed || s.currentStep === 8).length,
    conversionPct: pct(sessions.filter((s) => s.completed || s.currentStep === 8).length, sessions.length),
    reach,
    dropAt,
    gateDropPct,
  };
}

export function compareToBenchmarks(stats, benchmarks) {
  const b = benchmarks || {};
  const gates = [
    { key: "initialPrice_step3", step: 3, benchmark: (b.initialPrice ?? 0.66) * 100 },
    { key: "additionalCoverage_step4", step: 4, benchmark: (b.additionalCoverage ?? 0.24) * 100 },
    { key: "finalPrice_step6", step: 6, benchmark: (b.finalPrice ?? 0.78) * 100 },
  ];
  const conversionBenchmark = (b.conversion ?? 0.056) * 100;

  const report = {
    conversion: {
      simulatedPct: stats.conversionPct,
      benchmarkPct: conversionBenchmark,
      deltaPct: Math.round((stats.conversionPct - conversionBenchmark) * 10) / 10,
      withinTolerance: Math.abs(stats.conversionPct - conversionBenchmark) <= 2,
    },
    gates: {},
  };

  gates.forEach(({ key, step, benchmark }) => {
    const sim = stats.gateDropPct[step] ?? 0;
    report.gates[key] = {
      step,
      simulatedDropPct: sim,
      benchmarkDropPct: benchmark,
      deltaPct: Math.round((sim - benchmark) * 10) / 10,
      withinTolerance: Math.abs(sim - benchmark) <= 5,
    };
  });

  report.allWithinTolerance =
    report.conversion.withinTolerance &&
    Object.values(report.gates).every((g) => g.withinTolerance);

  return report;
}

/** Build a visitor plan from personas.json traffic share. */
export function visitorPlanFromTraffic(total, personasList, trafficShare) {
  const plan = [];
  let assigned = 0;
  personasList.forEach((p, idx) => {
    const share = trafficShare[p.segmentId] ?? 0;
    const count = idx === personasList.length - 1 ? total - assigned : Math.round(total * share);
    assigned += count;
    plan.push({ persona: p, count, share });
  });
  return plan;
}
