#!/usr/bin/env node
// CLI interactive agent — step-by-step OpenAI loop with full trace logging + coach intercept.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { hasOpenAIKey } from "./gpt.mjs";
import { createFunnelEngine } from "../src/agent/funnelEngine.js";
import { describeStep } from "../src/agent/describeStep.js";
import { parseAction, retryPrompt } from "../src/agent/actionSchema.js";
import { applyAction } from "../src/agent/applyAction.js";
import { createInteractionLogger, summarizeMessages, buildModelView } from "../src/agent/interactionLogger.js";
import { chatCompletion, loadSystemPrompt } from "../src/agent/openaiClient.js";
import { runCoach } from "../src/agent/coachAdapter.js";
import { canProceedFromStep } from "../src/logic/form.js";
import { step2HintsFromProfile } from "../src/agent/profileStepHints.js";
import { analyzeInteractiveSession } from "../src/agent/sessionSnapshot.js";
import { writeInteractiveAnalysis, printAnalysisSummary } from "../src/agent/analyzeInteractiveRun.js";
import { classifyExitReason } from "../src/agent/exitClassification.js";
import { PAGE_NAMES } from "../src/logs/constants.js";
import { getOpenAIModel } from "./gpt.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const argVal = (flag, def = null) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const VERBOSE = args.includes("--verbose");
const FOCUSED_MODE = args.includes("--focused");
const RUN_ID = argVal("--run");
const LIMIT = argVal("--limit") ? parseInt(argVal("--limit"), 10) : Infinity;
const PROFILE_PATH = argVal("--profile");
const PROMPT_PATH = argVal("--prompt");

function resolveRunDir() {
  if (PROFILE_PATH) return null;
  const base = join(ROOT, "test-results");
  if (RUN_ID) return join(base, RUN_ID);
  if (!existsSync(base)) throw new Error("No test-results/ folder.");
  const runs = readdirSync(base).filter((d) => existsSync(join(base, d, "sessions"))).sort();
  if (!runs.length) throw new Error("No runs with sessions/ found.");
  return join(base, runs[runs.length - 1]);
}

function listProfilePairs(runDir) {
  const sessionsDir = join(runDir, "sessions");
  const promptsDir = join(runDir, "system-prompts");
  if (!existsSync(promptsDir)) {
    throw new Error(`Missing system-prompts/ in ${runDir}. Run: npm run persona:prompts -- --run ${basename(runDir)}`);
  }
  return readdirSync(sessionsDir)
    .filter((f) => f.endsWith(".json"))
    .slice(0, LIMIT)
    .map((f) => {
      const base = basename(f, ".json");
      const promptFile = join(promptsDir, `${base}.md`);
      if (!existsSync(promptFile)) {
        throw new Error(`Missing system prompt for ${f} — expected ${promptFile}`);
      }
      return { profileFile: join(sessionsDir, f), promptFile, base };
    });
}

async function callAgentWithRetry({ system, messages, step, logger, turnIndex, focusedMode }) {
  let retryCount = 0;
  let lastRaw = "";
  let parsed = null;
  let parseError = null;
  let latencyMs = 0;
  const apiAttempts = [];

  const runOnce = async (extraUser) => {
    const msgs = extraUser ? [...messages, { role: "user", content: extraUser }] : messages;
    const res = await chatCompletion({ system, messages: msgs, temperature: 0.75 });
    lastRaw = res.text;
    latencyMs += res.latencyMs;
    const result = parseAction(lastRaw, step, { focusedMode });
    if (result.ok) {
      parsed = result.action;
      parseError = null;
    } else {
      parsed = null;
      parseError = result.error;
    }
    apiAttempts.push({
      attempt: apiAttempts.length,
      messages: msgs.map((m) => ({ role: m.role, content: m.content })),
      extraUserMessage: extraUser || null,
      rawAssistantText: lastRaw,
      parseError: result.ok ? null : result.error,
    });
    return result.ok;
  };

  const ok = await runOnce();
  if (!ok) {
    retryCount = 1;
    const retryMsg = retryPrompt(parseError, step, { focusedMode });
    await runOnce(retryMsg);
  }

  logger.logTurnOutput(turnIndex, {
    rawAssistantText: lastRaw,
    parsedAction: parsed,
    parseError: parsed ? null : parseError,
    retryCount,
    latencyMs,
    apiAttempts,
  });

  return { parsed, parseError, raw: lastRaw, retryCount };
}

async function runOnePersona({ profileFile, promptFile, base, outDir, focusedMode }) {
  const profile = JSON.parse(readFileSync(profileFile, "utf8"));
  const systemPromptText = loadSystemPrompt(readFileSync(promptFile, "utf8"));
  const sessionId = `interactive_${base}`;

  const logger = createInteractionLogger({
    sessionId,
    profileFile: basename(profileFile),
    systemPromptFile: basename(promptFile),
    model: getOpenAIModel(),
    systemPromptText,
    focusedMode,
  });

  const engine = createFunnelEngine();
  const messages = [];
  let coachState = null;
  let turnIndex = 0;
  let abandoned = false;
  let paused = false;
  let dropStep = null;
  let pauseStep = null;
  let leaveReason = null;
  let pauseReason = null;
  let exitType = null;
  let exitClassification = null;
  let dwellTurnCount = 0;
  let pendingValidationErrors = null;
  const MAX_TURNS = 40;

  while (engine.step < 8 && !abandoned && !paused && turnIndex < MAX_TURNS) {
    const premium = engine.getPremium();
    const canProceed = canProceedFromStep(engine.step, engine.form);
    const currentValidation = engine.validateCurrentStep();
    const validationErrorsForPrompt = pendingValidationErrors
      || (!canProceed ? currentValidation.errors : null);

    const userMessage = describeStep({
      step: engine.step,
      form: engine.form,
      coachState,
      premium,
      profile,
      validationErrors: validationErrorsForPrompt,
      canProceed,
      focusedMode,
    });

    const apiMessages = [...messages, { role: "user", content: userMessage }];

    logger.logTurnInput(turnIndex, {
      funnelStep: engine.step,
      pageName: PAGE_NAMES[engine.step],
      userMessage,
      conversationTurnCount: messages.length,
      priorMessagesSummary: summarizeMessages(messages),
      pageView: {
        funnelStep: engine.step,
        pageName: PAGE_NAMES[engine.step],
        premium,
        form: engine.snapshotForm(),
        coachState,
        canProceed,
        validationErrors: validationErrorsForPrompt,
        profileHints: engine.step === 2 ? step2HintsFromProfile(profile, engine.form) : null,
        focusedMode,
      },
      modelView: buildModelView(systemPromptText, apiMessages),
    });

    const { parsed, parseError, raw } = await callAgentWithRetry({
      system: systemPromptText,
      messages: apiMessages,
      step: engine.step,
      logger,
      turnIndex,
      focusedMode,
    });

    messages.push({ role: "user", content: userMessage });
    messages.push({ role: "assistant", content: raw });

    const formBefore = engine.snapshotForm();
    const stepBefore = engine.step;

    if (!parsed || parseError) {
      logger.logStateEffect(turnIndex, {
        actionApplied: null,
        formBefore,
        formAfter: formBefore,
        stepBefore,
        stepAfter: stepBefore,
        validationErrors: { _parse: parseError },
        abandoned: false,
      });
      turnIndex++;
      continue;
    }

    if (parsed.action === "continue_thinking") {
      dwellTurnCount++;
      logger.logStateEffect(turnIndex, {
        actionApplied: { ...parsed, appliedMeta: { type: "continue_thinking", note: parsed.note || null } },
        formBefore,
        formAfter: formBefore,
        stepBefore,
        stepAfter: stepBefore,
        validationErrors: {},
        abandoned: false,
        dwelling: true,
        dwellNote: parsed.note || null,
      });
      if (VERBOSE) console.log(`    ${logger.formatTurnSummary(turnIndex)} THINK`);
      turnIndex++;
      continue;
    }

    if (parsed.action === "pause") {
      paused = true;
      pauseStep = engine.step;
      pauseReason = parsed.reason;
      exitType = "paused";
      exitClassification = "deferral";
      logger.logStateEffect(turnIndex, {
        actionApplied: parsed,
        formBefore,
        formAfter: engine.snapshotForm(),
        stepBefore,
        stepAfter: stepBefore,
        validationErrors: {},
        abandoned: false,
        paused: true,
        pauseReason,
      });
      if (VERBOSE) console.log(`    ${logger.formatTurnSummary(turnIndex)} PAUSE`);
      turnIndex++;
      break;
    }

    if (parsed.action === "leave") {
      const classification = classifyExitReason(parsed.reason);
      if (classification === "deferral") {
        paused = true;
        pauseStep = engine.step;
        pauseReason = parsed.reason;
        exitType = "paused";
        exitClassification = "deferral_reclassified_from_leave";
        logger.logStateEffect(turnIndex, {
          actionApplied: { ...parsed, reclassifiedToPause: true },
          formBefore,
          formAfter: engine.snapshotForm(),
          stepBefore,
          stepAfter: stepBefore,
          validationErrors: {},
          abandoned: false,
          paused: true,
          pauseReason,
          reclassifiedFromLeave: true,
        });
        if (VERBOSE) console.log(`    ${logger.formatTurnSummary(turnIndex)} PAUSE (from leave)`);
      } else {
        abandoned = true;
        dropStep = engine.step;
        leaveReason = parsed.reason;
        exitType = "abandoned";
        exitClassification = "hard_leave";
        logger.logStateEffect(turnIndex, {
          actionApplied: parsed,
          formBefore,
          formAfter: engine.snapshotForm(),
          stepBefore,
          stepAfter: stepBefore,
          validationErrors: {},
          abandoned: true,
          leaveReason,
        });
        if (VERBOSE) console.log(`    ${logger.formatTurnSummary(turnIndex)} LEAVE`);
      }
      turnIndex++;
      break;
    }

    const applied = applyAction(engine, parsed);

    if (parsed.action === "back") {
      pendingValidationErrors = null;
      logger.logStateEffect(turnIndex, {
        actionApplied: { ...parsed, appliedMeta: applied },
        formBefore,
        formAfter: engine.snapshotForm(),
        stepBefore,
        stepAfter: engine.step,
        validationErrors: {},
        abandoned: false,
      });
      if (VERBOSE) console.log(`    ${logger.formatTurnSummary(turnIndex)}`);
      turnIndex++;
      continue;
    }

    const validation = engine.validateCurrentStep();
    if (!validation.valid) {
      pendingValidationErrors = validation.errors;
      logger.logStateEffect(turnIndex, {
        actionApplied: { ...parsed, appliedMeta: applied },
        formBefore,
        formAfter: engine.snapshotForm(),
        stepBefore,
        stepAfter: stepBefore,
        validationErrors: validation.errors,
        abandoned: false,
      });
      if (VERBOSE) console.log(`    ${logger.formatTurnSummary(turnIndex)} validation failed`);
      turnIndex++;
      continue;
    }

    pendingValidationErrors = null;
    const advance = engine.advanceStep();
    const stepAfter = engine.step;

    if (stepBefore === 4 && stepAfter === 5) {
      const turnsSoFar = logger.getTurns();
      const { snap, signals, classification } = analyzeInteractiveSession({
        sessionId,
        engine,
        turns: turnsSoFar,
        abandoned: false,
        dropStep: null,
      });
      const coachResult = runCoach({
        snapshot: snap,
        premium: engine.getPremium(),
      });
      coachState = coachResult.intercept;
      logger.logCoachEvent({
        input: {
          form: engine.snapshotForm(),
          premium: engine.getPremium(),
          personaScores: classification.scores,
          signals,
          coachStubReason: coachResult.reason,
        },
        output: {
          coachIntercept: coachResult.intercept,
          pageModifications: coachResult.pageModifications,
        },
      });
      if (VERBOSE) console.log(`    ${logger.formatCoachSummary(logger.toJSON().coachEvents.at(-1))}`);
    }

    logger.logStateEffect(turnIndex, {
      actionApplied: { ...parsed, appliedMeta: applied },
      formBefore,
      formAfter: engine.snapshotForm(),
      stepBefore,
      stepAfter,
      validationErrors: {},
      abandoned: false,
      advance,
    });

    if (VERBOSE) console.log(`    ${logger.formatTurnSummary(turnIndex)}`);
    turnIndex++;

    if (engine.completed) break;
  }

  const completed = engine.completed && !abandoned && !paused;
  logger.setOutcome({
    completed,
    abandoned,
    paused,
    exitType: exitType || (completed ? "completed" : null),
    exitClassification,
    dropStep: abandoned ? dropStep : null,
    pauseStep: paused ? pauseStep : null,
    finalStep: engine.step,
    leaveReason,
    pauseReason,
    dwellTurnCount,
  });

  const { snap, classification } = analyzeInteractiveSession({
    sessionId,
    engine,
    turns: logger.getTurns(),
    abandoned,
    dropStep,
  });

  const traceJsonPath = join(outDir, `${base}.trace.json`);
  const traceMdPath = join(outDir, `${base}.trace.md`);
  const summaryPath = join(outDir, `${base}.json`);

  writeFileSync(traceJsonPath, JSON.stringify(logger.toJSON(), null, 2));
  writeFileSync(traceMdPath, logger.toMarkdownTrace());

  const summary = {
    sessionId,
    personaProfile: profile,
    systemPromptFile: basename(promptFile),
    traceFiles: { json: basename(traceJsonPath), markdown: basename(traceMdPath) },
    turnCount: logger.getTurns().length,
    dwellTurnCount,
    coachEventCount: logger.toJSON().coachEvents.length,
    coachIntercept: coachState,
    finalForm: engine.snapshotForm(),
    completed,
    abandoned,
    paused,
    exitType: exitType || (completed ? "completed" : null),
    exitClassification,
    dropStep: abandoned ? dropStep : null,
    pauseStep: paused ? pauseStep : null,
    leaveReason,
    pauseReason,
    focusedMode,
    personaAnalysis: classification,
    snapshot: snap,
  };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  return {
    base,
    completed,
    abandoned,
    paused,
    exitType: exitType || (completed ? "completed" : null),
    exitClassification,
    dropStep: abandoned ? dropStep : null,
    pauseStep: paused ? pauseStep : null,
    dropPage: abandoned && dropStep != null ? PAGE_NAMES[dropStep] : "",
    pausePage: paused && pauseStep != null ? PAGE_NAMES[pauseStep] : "",
    leaveReason: leaveReason || "",
    pauseReason: pauseReason || "",
    personaId: profile.persona_id || "",
    coachFired: !!coachState,
    turnCount: logger.getTurns().length,
    dwellTurnCount,
    predicted: classification.match?.id || "none",
  };
}

async function main() {
  if (!hasOpenAIKey()) {
    console.error("✖ No OPENAI_API_KEY found (.env or env).");
    process.exit(1);
  }

  let pairs;
  let outDir;
  let runDir = null;

  if (PROFILE_PATH) {
    if (!PROMPT_PATH) {
      console.error("✖ --profile requires --prompt");
      process.exit(1);
    }
    pairs = [{ profileFile: PROFILE_PATH, promptFile: PROMPT_PATH, base: basename(PROFILE_PATH, ".json") }];
    outDir = join(dirname(PROFILE_PATH), "..", "interactive-sessions");
  } else {
    runDir = resolveRunDir();
    outDir = join(runDir, "interactive-sessions");
    pairs = listProfilePairs(runDir);
  }

  mkdirSync(outDir, { recursive: true });

  console.log(`\n▶ Interactive agent loop`);
  console.log(`  personas : ${pairs.length}`);
  console.log(`  focused  : ${FOCUSED_MODE ? "on (online-only on steps 0–6)" : "off"}`);
  console.log(`  output   : ${outDir}\n`);

  const csvRows = [
    ["base", "completed", "exitType", "abandoned", "paused", "dropStep", "dropPage", "pauseStep", "pausePage", "leaveReason", "pauseReason", "personaId", "turnCount", "dwellTurnCount", "coachFired", "predicted"].join(","),
  ];
  const results = [];

  for (const pair of pairs) {
    process.stdout.write(`  ${pair.base.padEnd(34)} `);
    try {
      const r = await runOnePersona({ ...pair, outDir, focusedMode: FOCUSED_MODE });
      results.push(r);
      csvRows.push([
        r.base,
        r.completed,
        r.exitType || "",
        r.abandoned,
        r.paused,
        r.dropStep ?? "",
        `"${(r.dropPage || "").replace(/"/g, '""')}"`,
        r.pauseStep ?? "",
        `"${(r.pausePage || "").replace(/"/g, '""')}"`,
        `"${(r.leaveReason || "").replace(/"/g, '""')}"`,
        `"${(r.pauseReason || "").replace(/"/g, '""')}"`,
        r.personaId,
        r.turnCount,
        r.dwellTurnCount ?? 0,
        r.coachFired,
        r.predicted,
      ].join(","));
      const status = r.completed ? "✓ completed" : r.paused ? `⏸ pause @ ${r.pauseStep ?? "?"}` : `⚠ drop @ ${r.dropStep ?? "?"}`;
      console.log(status);
    } catch (e) {
      console.log("✖");
      console.warn(`     ${e.message}`);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    focusedMode: FOCUSED_MODE,
    total: results.length,
    completed: results.filter((r) => r.completed).length,
    abandoned: results.filter((r) => r.abandoned).length,
    paused: results.filter((r) => r.paused).length,
    coachFired: results.filter((r) => r.coachFired).length,
    avgTurns: results.length
      ? Math.round(results.reduce((s, r) => s + r.turnCount, 0) / results.length)
      : 0,
    avgDwellTurns: results.length
      ? Math.round(results.reduce((s, r) => s + (r.dwellTurnCount || 0), 0) / results.length * 10) / 10
      : 0,
  };

  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(outDir, "index.csv"), csvRows.join("\n"));

  const runIdForAnalysis = runDir ? basename(runDir) : null;
  const analysis = writeInteractiveAnalysis(outDir, { runId: runIdForAnalysis });
  printAnalysisSummary(analysis);

  console.log(`\n  ✓ ${results.length} interactive sessions`);
  console.log(`  completed: ${summary.completed}/${summary.total} · paused: ${summary.paused} · hard drops: ${summary.abandoned} · coach fired: ${summary.coachFired}`);
  console.log(`    → ${outDir}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
