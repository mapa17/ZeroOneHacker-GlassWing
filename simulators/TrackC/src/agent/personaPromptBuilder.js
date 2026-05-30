import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const PERSONAS_DIR = join(ROOT, "personas");

export const SEGMENT_TO_MD = { segment_1: "judith.md", segment_2: "franz.md", segment_3: "peter.md" };
export const ARCHETYPE_TO_MD = { "Judith Berger": "judith.md", "Franz Huber": "franz.md", "Peter Wagner": "peter.md" };

export function resolvePersonaMd(profile) {
  const byArchetype = ARCHETYPE_TO_MD[profile.archetype_name];
  const bySegment = SEGMENT_TO_MD[profile.persona_id];
  const file = byArchetype || bySegment;
  if (!file) {
    throw new Error(`Cannot map persona for archetype "${profile.archetype_name}" / id "${profile.persona_id}"`);
  }
  return join(PERSONAS_DIR, file);
}

export function fillPromptTemplate(template, markdown, profileJsonText) {
  return template
    .replace("[MARKDOWN_CONTENT]", markdown)
    .replace("[JSON_CONTENT]", profileJsonText);
}

export function buildFilledTemplate(profile, templatePath = join(PERSONAS_DIR, "persona_prompt_template.md")) {
  const mdPath = resolvePersonaMd(profile);
  const template = readFileSync(templatePath, "utf8");
  const markdown = readFileSync(mdPath, "utf8");
  const profileJsonText = JSON.stringify(profile, null, 2);
  return fillPromptTemplate(template, markdown, profileJsonText);
}

export function loadPersonaMarkdown(profile) {
  return readFileSync(resolvePersonaMd(profile), "utf8");
}

export function templateExists(path) {
  return existsSync(path);
}
