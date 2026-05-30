import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const TEST_RUN_RE = /^test(\d+)$/;

/** Parse "test12" → 12, or null if not a numbered test run folder. */
export function parseTestRunNumber(runId) {
  const m = String(runId).match(TEST_RUN_RE);
  return m ? parseInt(m[1], 10) : null;
}

/** Next available run id: test1, test2, … based on existing test-results/ folders. */
export function nextTestRunId(testResultsDir) {
  if (!existsSync(testResultsDir)) return "test1";
  let max = 0;
  for (const name of readdirSync(testResultsDir)) {
    const n = parseTestRunNumber(name);
    if (n != null && n > max) max = n;
  }
  return `test${max + 1}`;
}

/** Run folders that contain a sessions/ subfolder, newest testN last. */
export function listTestRunIds(testResultsDir) {
  if (!existsSync(testResultsDir)) return [];
  return readdirSync(testResultsDir)
    .filter((d) => existsSync(join(testResultsDir, d, "sessions")))
    .sort((a, b) => {
      const na = parseTestRunNumber(a);
      const nb = parseTestRunNumber(b);
      if (na != null && nb != null) return na - nb;
      if (na != null) return -1;
      if (nb != null) return 1;
      return a.localeCompare(b);
    });
}

export function latestTestRunId(testResultsDir) {
  const runs = listTestRunIds(testResultsDir);
  return runs.length ? runs[runs.length - 1] : null;
}
