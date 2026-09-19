/**
 * Flat JSON - the most portable output: React Native, Flutter (via a small
 * loader), or any other JS/asset-reading consumer can use this directly
 * without a build step of their own.
 */

/** "+Theme.color.text.default" -> "themeColorTextDefault" */
function toCamel(tokenPath) {
  const parts = tokenPath.replace(/^\+/, "").split(/[.\s]+/);
  return parts.map((p, i) => (i === 0 ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase())).join("");
}

function renderJson(resolved) {
  const light = {};
  const dark = {};
  for (const t of resolved) {
    const key = toCamel(t.path);
    light[key] = t.light;
    if (t.dark) dark[key] = t.dark;
  }
  return JSON.stringify({ light, dark }, null, 2) + "\n";
}

module.exports = { renderJson, toCamel };
