#!/usr/bin/env node
/**
 * Builds every platform target from design_token.json into dist/.
 * `npm run build` (or `node bin/build.js`) - no flags yet, this is the
 * prototype: one export, one mode (Light as primary), all targets.
 */
const fs = require("fs");
const path = require("path");

const { resolveAll, exportedAt } = require("../src/core.js");
const { renderCss } = require("../src/renderers/css.js");
const { renderJson } = require("../src/renderers/json.js");
const { renderSwift } = require("../src/renderers/swift.js");
const { renderAndroidXml } = require("../src/renderers/android.js");

const ROOT = path.join(__dirname, "..");
const JSON_PATH = path.join(ROOT, "design_token.json");
const DIST = path.join(ROOT, "dist");

function write(relPath, content) {
  const full = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  console.log(`  wrote dist/${relPath}`);
}

function main() {
  const doc = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const resolved = resolveAll(doc);

  console.log(`Source export: ${exportedAt(doc) || "(no timestamp found)"}`);
  console.log(`Resolved ${resolved.length} color tokens. Building targets:`);

  write("css/tokens.css", renderCss(resolved));
  write("json/tokens.json", renderJson(resolved));
  write("ios/DesignTokenColor.swift", renderSwift(resolved));
  write("android/colors.xml", renderAndroidXml(resolved));

  console.log("Done.");
}

main();
