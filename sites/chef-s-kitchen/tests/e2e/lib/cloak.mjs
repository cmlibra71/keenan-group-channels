// Re-export the cloakbrowser helpers from the globally-installed skill.
//
// The skill ships its own node_modules (the Playwright-API stealth Chromium),
// so we import its lib.mjs by ABSOLUTE path and let Node resolve the
// `cloakbrowser` dependency from the skill's own node_modules. That keeps this
// checked-in test suite free of any browser dependency of its own.
//
// If the skill is not installed at this path, fail loudly with guidance.
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SKILL_LIB = join(homedir(), ".claude", "skills", "cloakbrowser", "scripts", "lib.mjs");

if (!existsSync(SKILL_LIB)) {
  throw new Error(
    `cloakbrowser skill not found at ${SKILL_LIB}.\n` +
      `Install it (it is a global Claude Code skill) before running the E2E suite.`
  );
}

const lib = await import(SKILL_LIB);

export const open = lib.open;
export const withPage = lib.withPage;
export const profileDir = lib.profileDir;
