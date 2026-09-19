/**
 * Platform-neutral parser for this repo's Figma/Tokens Studio export
 * (design_token.json). Ported from imt-fe's src/utils/designTokenCore.js,
 * which already kept this part free of fs/DOM/CSS assumptions - it ran in
 * both a Node CLI and the browser there. Moved here because this repo, not
 * any one consumer, is meant to be the single place every platform (web
 * today, mobile later) pulls a built artifact from.
 *
 * Deliberately does NOT know about any consumer's own naming (Tailwind
 * classes, Swift/Kotlin identifiers, etc.) - that stays a per-consumer
 * "bridge" file, same as imt-fe's tokenMap.js today. This module only
 * resolves the export down to {figmaPath, hex, modes} - renderers in
 * ./renderers/* turn that into each platform's native syntax.
 */

const KEPT_COLLECTIONS = new Set(["Color", ".Brand", "+Theme"]);

/** Turns a token path into a slug usable as a CSS custom property / identifier base. */
function slugify(tokenPath) {
  return String(tokenPath)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Flattens the token document into the colour tokens worth emitting, in
 * document order (a generator that reshuffles output turns every sync into
 * an unreviewable diff).
 */
function collectColorTokens(doc) {
  const tokens = [];
  const seen = new Map();

  const walk = (node, segments) => {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$extensions") continue;
      if (!value || typeof value !== "object") continue;

      const segs = [...segments, key];

      if ("$value" in value) {
        if (value.$type !== "color") continue;

        const tokenPath = segs.join(".");
        const slug = slugify(tokenPath);
        if (seen.has(slug)) {
          throw new Error(
            `Token name collision: "${tokenPath}" and "${seen.get(slug)}" both map to --${slug}`,
          );
        }
        seen.set(slug, tokenPath);

        const mode = value.$extensions && value.$extensions.mode;
        tokens.push({
          path: tokenPath,
          slug,
          value: value.$value,
          modes: mode && Object.keys(mode).length > 0 ? mode : null,
        });
        continue;
      }

      walk(value, segs);
    }
  };

  for (const [collection, node] of Object.entries(doc)) {
    if (!KEPT_COLLECTIONS.has(collection)) continue;
    walk(node, [collection]);
  }

  return tokens;
}

/** Reads the alias target out of a "{Some.Token.Path}" value, or null. */
function aliasTarget(value) {
  if (typeof value !== "string") return null;
  const match = /^\{(.+)\}$/.exec(value.trim());
  return match ? match[1] : null;
}

/** #rrggbb -> "r g b" channel triplet (needed by rgb(var(--x) / <alpha-value>) consumers). */
function hexToChannels(hex) {
  if (typeof hex !== "string") return null;
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

/**
 * Resolves a token's value for a given mode ("Light" or "Dark") down to a
 * plain #rrggbb, following {alias} chains. This is the one step every
 * renderer needs and every renderer except CSS needs it fully resolved (CSS
 * alone is allowed to keep a live var() reference instead of a literal).
 */
function resolveHex(tokensByPath, token, mode = "Light") {
  let current = token;
  let value = current.modes ? current.modes[mode] : current.value;
  let guard = 0;
  while (true) {
    const alias = aliasTarget(value);
    if (!alias) break;
    current = tokensByPath.get(alias);
    if (!current) throw new Error(`Unresolved alias: "${alias}" (from ${token.path})`);
    value = current.modes ? current.modes[mode] : current.value;
    if (++guard > 20) throw new Error(`Alias loop resolving ${token.path}`);
  }
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

/**
 * Convenience: collect + resolve every color token to its Light (and, when
 * different, Dark) hex value in one pass. This is the shape every renderer
 * in ./renderers actually consumes.
 */
function resolveAll(doc) {
  const tokens = collectColorTokens(doc);
  const byPath = new Map(tokens.map((t) => [t.path, t]));

  const resolved = [];
  for (const token of tokens) {
    const light = resolveHex(byPath, token, "Light");
    if (light === null) continue; // unsupported value (e.g. non-hex), skip rather than emit garbage
    const dark = token.modes ? resolveHex(byPath, token, "Dark") : null;
    resolved.push({
      path: token.path,
      slug: token.slug,
      light,
      dark: dark && dark !== light ? dark : null,
    });
  }
  return resolved;
}

/** The export timestamp the Figma plugin stamps into the document. */
function exportedAt(doc) {
  const meta = doc && doc.$extensions && doc.$extensions["tokens-bruecke-meta"];
  return (meta && meta.createdAt) || null;
}

module.exports = {
  KEPT_COLLECTIONS,
  slugify,
  collectColorTokens,
  aliasTarget,
  hexToChannels,
  resolveHex,
  resolveAll,
  exportedAt,
};
