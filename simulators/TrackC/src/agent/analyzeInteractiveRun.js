import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { PAGE_NAMES } from "../logs/constants.js";
import { classifyExitReason } from "./exitClassification.js";

const DROP_STEPS = [0, 1, 2, 3, 4, 5, 6, 7];
const SKIP_FILES = new Set(["summary.json", "analysis.json"]);

function pct(count, total) {
  return total ? Math.round((count / total) * 1000) / 10 : 0;
}

function isSessionSummaryFile(name) {
  if (!name.endsWith(".json")) return false;
  if (SKIP_FILES.has(name)) return false;
  if (name.endsWith(".trace.json")) return false;
  return true;
}

/** Normalize legacy summaries and apply deferral reclassification for analysis. */
function normalizeSessionOutcome(data) {
  const completed = !!data.completed;
  const advisorForward = data.advisorForward ?? false;
  let abandoned = data.abandoned ?? false;
  let paused = data.paused ?? false;
  let exitType = data.exitType ?? null;
  let exitClassification = data.exitClassification ?? null;
  let dropStep = data.dropStep ?? null;
  let pauseStep = data.pauseStep ?? null;
  let leaveReason = data.leaveReason ?? null;
  let pauseReason = data.pauseReason ?? null;
  let reclassifiedInAnalysis = false;

  if (!completed && !abandoned && !paused && dropStep != null && leaveReason) {
    const classification = classifyExitReason(leaveReason);
    if (classification === "deferral") {
      paused = true;
      pauseStep = dropStep;
      pauseReason = leaveReason;
      exitType = "paused";
      exitClassification = "deferral_reclassified_in_analysis";
      dropStep = null;
      leaveReason = null;
      reclassifiedInAnalysis = true;
    } else {
      abandoned = true;
      exitType = "abandoned";
      exitClassification = exitClassification || "hard_leave";
    }
  }

  if (completed) {
    exitType = exitType || "completed";
  } else if (advisorForward && !exitType) {
    exitType = "advisor_forward";
  } else if (paused && !exitType) {
    exitType = "paused";
  } else if (abandoned && !exitType) {
    exitType = "abandoned";
  }

  return {
    completed,
    advisorForward,
    advisorReasons: data.advisorReasons ?? [],
    abandoned,
    paused,
    exitType,
    exitClassification,
    dropStep,
    pauseStep,
    leaveReason,
    pauseReason,
    dwellTurnCount: data.dwellTurnCount ?? 0,
    reclassifiedInAnalysis,
  };
}

/** Load per-persona interactive session summaries from a directory. */
export function loadInteractiveSessions(dir) {
  if (!existsSync(dir)) throw new Error(`Directory not found: ${dir}`);
  return readdirSync(dir)
    .filter(isSessionSummaryFile)
    .map((f) => {
      const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
      const outcome = normalizeSessionOutcome(data);
      return {
        file: f,
        base: basename(f, ".json"),
        sessionId: data.sessionId,
        ...outcome,
        personaId: data.personaProfile?.persona_id ?? null,
        archetype: data.personaProfile?.archetype_name ?? null,
        personaName: data.personaProfile?.persona_name ?? null,
      };
    });
}

function aggregateReasons(entries, reasonKey = "leaveReason") {
  const byReason = new Map();
  for (const e of entries) {
    const reason = e[reasonKey] || "(no reason)";
    if (!byReason.has(reason)) {
      byReason.set(reason, { reason, count: 0, sessions: [] });
    }
    const row = byReason.get(reason);
    row.count += 1;
    row.sessions.push(e.base);
  }
  return [...byReason.values()].sort((a, b) => b.count - a.count);
}

/** Aggregate hard drops vs pauses by funnel step. */
export function analyzeInteractiveSessions(sessions, { runId = null } = {}) {
  const totalSessions = sessions.length;
  const completedCount = sessions.filter((s) => s.completed).length;
  const advisorForwardCount = sessions.filter((s) => s.advisorForward).length;
  const hardDrops = sessions.filter((s) => s.abandoned);
  const pausedSessions = sessions.filter((s) => s.paused);
  const abandonedCount = hardDrops.length;
  const pausedCount = pausedSessions.length;
  const reclassifiedCount = sessions.filter((s) => s.reclassifiedInAnalysis).length;

  const dropByStep = {};
  const pauseByStep = {};
  for (const step of DROP_STEPS) {
    const atDrop = hardDrops.filter((s) => s.dropStep === step);
    dropByStep[String(step)] = {
      count: atDrop.length,
      pct: pct(atDrop.length, totalSessions),
      pageName: PAGE_NAMES[step] || `Step ${step}`,
      reasons: aggregateReasons(atDrop, "leaveReason"),
    };
    const atPause = pausedSessions.filter((s) => s.pauseStep === step);
    pauseByStep[String(step)] = {
      count: atPause.length,
      pct: pct(atPause.length, totalSessions),
      pageName: PAGE_NAMES[step] || `Step ${step}`,
      reasons: aggregateReasons(atPause, "pauseReason"),
    };
  }

  const allLeaveReasons = hardDrops.map((s) => ({
    step: s.dropStep,
    pageName: PAGE_NAMES[s.dropStep] || `Step ${s.dropStep}`,
    reason: s.leaveReason,
    exitClassification: s.exitClassification,
    sessionId: s.sessionId,
    base: s.base,
    personaId: s.personaId,
    archetype: s.archetype,
    personaName: s.personaName,
  }));

  const allPauseReasons = pausedSessions.map((s) => ({
    step: s.pauseStep,
    pageName: PAGE_NAMES[s.pauseStep] || `Step ${s.pauseStep}`,
    reason: s.pauseReason,
    exitClassification: s.exitClassification,
    reclassifiedInAnalysis: s.reclassifiedInAnalysis,
    sessionId: s.sessionId,
    base: s.base,
    personaId: s.personaId,
    archetype: s.archetype,
    personaName: s.personaName,
  }));

  const bySegment = {};
  for (const s of sessions) {
    const seg = s.personaId || "unknown";
    if (!bySegment[seg]) {
      bySegment[seg] = {
        total: 0,
        abandoned: 0,
        paused: 0,
        dropByStep: Object.fromEntries(DROP_STEPS.map((st) => [String(st), 0])),
        pauseByStep: Object.fromEntries(DROP_STEPS.map((st) => [String(st), 0])),
      };
    }
    bySegment[seg].total += 1;
    if (s.abandoned) {
      bySegment[seg].abandoned += 1;
      if (bySegment[seg].dropByStep[String(s.dropStep)] != null) {
        bySegment[seg].dropByStep[String(s.dropStep)] += 1;
      }
    }
    if (s.paused) {
      bySegment[seg].paused += 1;
      if (bySegment[seg].pauseByStep[String(s.pauseStep)] != null) {
        bySegment[seg].pauseByStep[String(s.pauseStep)] += 1;
      }
    }
  }

  const totalDwellTurns = sessions.reduce((sum, s) => sum + (s.dwellTurnCount || 0), 0);

  return {
    runId,
    generatedAt: new Date().toISOString(),
    totalSessions,
    completedCount,
    advisorForwardCount,
    abandonedCount,
    pausedCount,
    reclassifiedCount,
    completionPct: pct(completedCount, totalSessions),
    advisorForwardPct: pct(advisorForwardCount, totalSessions),
    hardDropPct: pct(abandonedCount, totalSessions),
    pausePct: pct(pausedCount, totalSessions),
    avgDwellTurns: totalSessions ? Math.round((totalDwellTurns / totalSessions) * 10) / 10 : 0,
    dropByStep,
    pauseByStep,
    allLeaveReasons,
    allPauseReasons,
    bySegment,
  };
}

export function dropoffsToCsv(analysis) {
  const header = "step,pageName,hard_drop_count,hard_drop_pct,sample_reasons";
  const rows = DROP_STEPS.map((step) => {
    const d = analysis.dropByStep[String(step)];
    const samples = (d.reasons || []).slice(0, 3).map((r) => r.reason.replace(/"/g, '""')).join(" | ");
    return [step, `"${d.pageName}"`, d.count, d.pct, `"${samples}"`].join(",");
  });
  return [header, ...rows].join("\n");
}

export function pausesToCsv(analysis) {
  const header = "step,pageName,pause_count,pause_pct,sample_reasons";
  const rows = DROP_STEPS.map((step) => {
    const d = analysis.pauseByStep[String(step)];
    const samples = (d.reasons || []).slice(0, 3).map((r) => r.reason.replace(/"/g, '""')).join(" | ");
    return [step, `"${d.pageName}"`, d.count, d.pct, `"${samples}"`].join(",");
  });
  return [header, ...rows].join("\n");
}

export function printAnalysisSummary(analysis) {
  console.log("\n  Hard drops by step (permanent leave only):");
  let anyDrop = false;
  for (const step of DROP_STEPS) {
    const d = analysis.dropByStep[String(step)];
    if (d.count === 0) continue;
    anyDrop = true;
    console.log(`    step ${step} (${d.pageName}): ${d.count} (${d.pct}%)`);
    for (const r of d.reasons.slice(0, 3)) {
      console.log(`      · "${r.reason}" ×${r.count}`);
    }
  }
  if (!anyDrop) {
    console.log("    (no hard leave actions recorded)");
  }

  console.log("\n  Pauses / deferrals by step:");
  let anyPause = false;
  for (const step of DROP_STEPS) {
    const d = analysis.pauseByStep[String(step)];
    if (d.count === 0) continue;
    anyPause = true;
    console.log(`    step ${step} (${d.pageName}): ${d.count} (${d.pct}%)`);
    for (const r of d.reasons.slice(0, 3)) {
      console.log(`      · "${r.reason}" ×${r.count}`);
    }
  }
  if (!anyPause) {
    console.log("    (no pause/deferral actions recorded)");
  }

  if (analysis.reclassifiedCount) {
    console.log(`\n  Legacy leave reasons reclassified as pause: ${analysis.reclassifiedCount}`);
  }

  console.log(
    `\n  completed: ${analysis.completedCount}/${analysis.totalSessions} (${analysis.completionPct}%)`
    + ` · advisor_forward: ${analysis.advisorForwardCount} (${analysis.advisorForwardPct}%)`
    + ` · hard drops: ${analysis.abandonedCount} (${analysis.hardDropPct}%)`
    + ` · paused: ${analysis.pausedCount} (${analysis.pausePct}%)`
    + ` · avg dwell turns: ${analysis.avgDwellTurns}`,
  );
}

/** Analyze directory and write analysis.json + dropoffs.csv + pauses.csv. */
export function writeInteractiveAnalysis(dir, { runId = null } = {}) {
  const sessions = loadInteractiveSessions(dir);
  const analysis = analyzeInteractiveSessions(sessions, { runId });
  writeFileSync(join(dir, "analysis.json"), JSON.stringify(analysis, null, 2));
  writeFileSync(join(dir, "dropoffs.csv"), dropoffsToCsv(analysis));
  writeFileSync(join(dir, "pauses.csv"), pausesToCsv(analysis));
  return analysis;
}
