/**
 * CLI that writes {{GENERATED_CSS_PATH}} from the design token export
 * published at {{SOURCE_REPO_URL}}.
 *
 * TEMPLATE — fill in every {{PLACEHOLDER}} below before using. The parts
 * that don't vary per-project (fetch, validate, write, rollback guard) are
 * already filled in; only paths and the bridge import are project-specific.
 *
 * Only the parts that genuinely need Node live here - fetching, reading and
 * writing files, format validation, and the rollback guard. The transform
 * itself is in reference/core.js (verbatim, do not edit) so any live-preview
 * UI in the app can run the exact same code with no logic duplicated.
 */

const fs = require("fs");
const path = require("path");
const { resolveAll, exportedAt } = require("./core.js"); // path to your copy of reference/core.js
const { BRIDGE } = require("./tokenMap.js"); // your filled-in copy of tokenMap.template.js

const SOURCE_URL = "{{SOURCE_RAW_JSON_URL}}"; // e.g. https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}

const JSON_PATH = path.join(__dirname, "{{RELATIVE_PATH_TO}}", "design_token.json");
const CSS_PATH = path.join(__dirname, "{{RELATIVE_PATH_TO}}", "tokens.css");
// Tiny sibling of tokens.css: the committed snapshot's exportedAt only, so a
// live-preview UI can show "last synced" without bundling the full JSON.
const META_PATH = path.join(__dirname, "{{RELATIVE_PATH_TO}}", "tokens.meta.json");

/**
 * Confirms `doc` is a Tokens Brücke DTCG export before anything touches it.
 * Run on EVERY sync, not just setup — export settings can change without
 * anyone telling the consumer. See SKILL.md's "Source format" section for
 * why each check matters and what to tell the user when one fails.
 */
function assertSupportedFormat(doc) {
  const meta = doc && doc.$extensions && doc.$extensions["tokens-bruecke-meta"];
  if (!meta) {
    throw new Error(
      "This JSON doesn't match the format this skill supports (Tokens Brücke, DTCG mode).\n" +
        "Recommended: export using the Tokens Brücke Figma plugin (Figma Community -> search \"Tokens Brücke\"), with DTCG format enabled.",
    );
  }
  if (meta.useDTCG !== true) {
    throw new Error(
      "Export found, but useDTCG is not true - this looks like Tokens Brücke's legacy (non-DTCG) export mode, which this skill doesn't parse. Re-export with DTCG format enabled.",
    );
  }
  const required = ["Color", "+Theme", ".Brand"];
  const missing = required.filter((k) => !(k in doc));
  if (missing.length > 0) {
    throw new Error(
      `Export is missing expected collection(s): ${missing.join(", ")}. ` +
        "The token schema may have changed - verify against SKILL.md's documented shape before proceeding.",
    );
  }
}

function buildCss(doc, bridge) {
  const resolved = resolveAll(doc);
  const lines = [":root {"];
  for (const token of resolved) {
    const bridged = bridge[token.path];
    if (!bridged) continue; // not every token needs a consumer-facing name
    lines.push(`  --${bridged}: ${hexToChannels(token.light)};`);
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}

function hexToChannels(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

async function main() {
  if (process.argv.includes("--fetch")) {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }
    const body = await response.text();
    const incoming = JSON.parse(body); // parse before writing - a broken download never replaces a good snapshot
    assertSupportedFormat(incoming);

    // The designer sometimes shares a newer export directly (chat) without
    // pushing it to the source repo. Fetching would then silently roll the
    // snapshot back - refuse instead of producing a no-visible-symptom
    // regression.
    if (fs.existsSync(JSON_PATH) && !process.argv.includes("--force")) {
      const currentAt = exportedAt(JSON.parse(fs.readFileSync(JSON_PATH, "utf8")));
      const incomingAt = exportedAt(incoming);
      if (currentAt && incomingAt && Date.parse(incomingAt) < Date.parse(currentAt)) {
        throw new Error(
          `Refusing to roll the snapshot back.\n` +
            `  committed snapshot exported: ${currentAt}\n` +
            `  ${SOURCE_URL} serves: ${incomingAt}\n` +
            `The upstream repo is behind - ask the designer to push their latest export. Re-run with --force if you really mean to go back.`,
        );
      }
    }

    fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
    fs.writeFileSync(JSON_PATH, body);
    console.log(`Fetched ${SOURCE_URL}`);
  }

  const doc = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  assertSupportedFormat(doc);

  fs.writeFileSync(CSS_PATH, buildCss(doc, BRIDGE));
  console.log(`Wrote ${CSS_PATH}`);

  fs.writeFileSync(META_PATH, JSON.stringify({ exportedAt: exportedAt(doc) }, null, 2) + "\n");
  console.log(`Wrote ${META_PATH}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { SOURCE_URL, JSON_PATH, CSS_PATH };
