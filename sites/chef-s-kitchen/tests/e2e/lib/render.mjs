// Render a Report into markdown (the primary, human-facing deliverable) plus a
// machine-readable JSON sibling.
import { writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const SEV_LABEL = { blocker: "BLOCKER", broken: "BROKEN", warning: "WARNING" };

function rel(artifactsDir, p) {
  if (!p) return "";
  try {
    return relative(artifactsDir, p);
  } catch {
    return p;
  }
}

export function renderMarkdown(report, { mode, generatedAt }) {
  const s = report.summary();
  const L = [];
  L.push(`# Chef's Depot — E2E Report`);
  L.push("");
  L.push(`- **Run:** \`${report.runId}\``);
  L.push(`- **Base URL:** ${report.base}`);
  L.push(`- **Mode:** ${mode}`);
  L.push(`- **Generated:** ${generatedAt}`);
  L.push(
    `- **Result:** ${s.passed} passed · ${report.issues.length} issue(s) ` +
      `(${report.blockers.length} blocker/broken) · ${s.skipped} skipped · ${s.total} checks`
  );
  L.push("");

  // ── Issues ──────────────────────────────────────────────────────────────
  L.push(`## Issues found`);
  L.push("");
  if (report.issues.length === 0) {
    L.push(`No issues found across ${s.total} checks. 🎉`);
  } else {
    // Blockers/broken first, then warnings.
    const ordered = [...report.issues].sort((a, b) => {
      const rank = (x) => (x.status === "fail" ? (x.severity === "blocker" ? 0 : 1) : 2);
      return rank(a) - rank(b);
    });
    for (const i of ordered) {
      const sev = SEV_LABEL[i.severity] || (i.status === "warn" ? "WARNING" : "BROKEN");
      L.push(`### \`${sev}\` — [${i.flow}] ${i.name}`);
      if (i.route) L.push(`- **Route:** \`${i.route}\``);
      if (i.error) L.push(`- **Error:** ${i.error}`);
      for (const n of i.notes) L.push(`- ${n}`);
      const shot = rel(report.artifactsDir, i.screenshot);
      if (shot) L.push(`- **Screenshot:** \`${shot}\``);
      L.push("");
    }
  }
  L.push("");

  // ── Skipped ─────────────────────────────────────────────────────────────
  L.push(`## Skipped / not verified`);
  L.push("");
  if (report.skips.length === 0) {
    L.push(`Nothing skipped.`);
  } else {
    for (const sk of report.skips) {
      L.push(`- **[${sk.flow}] ${sk.name}**${sk.route ? ` (\`${sk.route}\`)` : ""} — ${sk.reason}`);
    }
  }
  L.push("");

  // ── Coverage ────────────────────────────────────────────────────────────
  L.push(`## Coverage`);
  L.push("");
  L.push(`| Flow | Check | Route | Status | ms | Screenshot |`);
  L.push(`| --- | --- | --- | --- | ---: | --- |`);
  for (const st of report.steps) {
    const icon = st.status === "pass" ? "✅" : st.status === "warn" ? "⚠️" : "❌";
    const shot = rel(report.artifactsDir, st.screenshot);
    L.push(
      `| ${st.flow} | ${st.name} | ${st.route ? `\`${st.route}\`` : ""} | ${icon} ${st.status} | ${st.durationMs} | ${shot ? `\`${shot}\`` : ""} |`
    );
  }
  L.push("");

  // ── Teardown ────────────────────────────────────────────────────────────
  L.push(`## Teardown (data cleanup)`);
  L.push("");
  if (!report.teardown) {
    L.push(`No teardown ran (smoke-only mode or \`--keep\`).`);
  } else if (report.teardown.error) {
    L.push(`⚠️ Teardown error: ${report.teardown.error}`);
  } else {
    const t = report.teardown;
    L.push(`Rows deleted, scoped to test customers (\`${t.emailLike}\`):`);
    L.push("");
    L.push(`| Table | Rows |`);
    L.push(`| --- | ---: |`);
    for (const [k, v] of Object.entries(t.counts || {})) L.push(`| ${k} | ${v} |`);
    L.push("");
    L.push(`Remaining test customers after teardown: **${t.remaining}** (expected 0).`);
  }
  L.push("");

  return L.join("\n");
}

export function writeReport(report, { mode, generatedAt }) {
  const md = renderMarkdown(report, { mode, generatedAt });
  const mdPath = join(report.artifactsDir, "report.md");
  const jsonPath = join(report.artifactsDir, "report.json");
  writeFileSync(mdPath, md);
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        runId: report.runId,
        base: report.base,
        mode,
        generatedAt,
        summary: report.summary(),
        steps: report.steps,
        skips: report.skips,
        teardown: report.teardown,
      },
      null,
      2
    )
  );
  return { mdPath, jsonPath };
}
