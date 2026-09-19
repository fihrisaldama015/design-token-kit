/** Channel triplet, e.g. "122 21 21" - how tokens.css stores colors since
    the move to `rgb(var(--x) / <alpha-value>)`. Not a valid CSS color on
    its own, so it must be wrapped in rgb(...) before being handed to the
    browser for parsing, or every token would read as unsupported. */
const TRIPLET = /^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/;

let colorProbeEl = null;
function getColorProbe() {
  if (!colorProbeEl) {
    colorProbeEl = document.createElement("div");
    colorProbeEl.style.cssText = "position:fixed;top:-9999px;left:-9999px;pointer-events:none;";
    document.body.appendChild(colorProbeEl);
  }
  return colorProbeEl;
}

/** Resolves a raw custom-property value (triplet or any CSS color syntax)
    to the browser's normalized "rgb(r, g, b)"/"rgba(...)" form, or null if
    the browser can't parse it as a color at all (e.g. a spacing token). */
function resolveToRgbString(raw) {
  const probe = getColorProbe();
  const value = TRIPLET.test(raw.trim()) ? `rgb(${raw.trim()})` : raw;
  probe.style.color = "";
  probe.style.color = value;
  if (!probe.style.color) return null;
  return getComputedStyle(probe).color;
}

function rgbStringToHex(rgb) {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return "#" + match.slice(1, 4).map((n) => (+n).toString(16).padStart(2, "0")).join("");
}

function hexToTriplet(hex) {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/**
 * tokens.css's 3-tier aliasing chain, e.g.
 *   --color-gray-950 (raw palette) <- --brand-neutral-950 (brand alias)
 *   <- --theme-color-text-default (semantic - what Tailwind classes
 *   actually consume, e.g. `text-default`).
 * Only the semantic tier is wired to any class in the app; --brand- and
 * --color- tokens are internal plumbing one or two hops removed from anything
 * visibly "used" - so they sort after, not before, the tier someone
 * trying a colour actually wants first. Ties within a tier fall back to
 * plain alphabetical.
 */
export function tokenTier(name) {
  if (name.startsWith("--theme-")) return 0;
  if (name.startsWith("--brand-")) return 1;
  return 2;
}

/**
 * Every :root/html custom property (from buildTokenVarWhitelist) whose
 * CURRENT value resolves to an actual color, as { name, hex }. "Current"
 * depends on which :root rules are in effect right now - a token declared
 * only under `:root[data-tokens="on"]` returns nothing here while that
 * attribute is off, same as it renders nothing in the app itself.
 */
export function listColorTokens(styleSheets = document.styleSheets) {
  const rootStyle = getComputedStyle(document.documentElement);
  const out = [];
  buildTokenVarWhitelist(styleSheets).forEach((name) => {
    const raw = rootStyle.getPropertyValue(name).trim();
    if (!raw) return;
    const rgb = resolveToRgbString(raw);
    if (!rgb) return;
    const hex = rgbStringToHex(rgb);
    if (!hex) return;
    out.push({ name, hex });
  });
  out.sort((a, b) => tokenTier(a.name) - tokenTier(b.name) || a.name.localeCompare(b.name));
  return out;
}

/** The value `name` is declared with in the STYLESHEET, ignoring any
    inline override already sitting on <html> - lets applyTokenOverride
    know whether to write back a triplet or an ordinary CSS color. */
function declaredTokenValue(name) {
  const root = document.documentElement;
  const inline = root.style.getPropertyValue(name);
  if (!inline) return getComputedStyle(root).getPropertyValue(name).trim();
  root.style.removeProperty(name);
  const sheetValue = getComputedStyle(root).getPropertyValue(name).trim();
  root.style.setProperty(name, inline);
  return sheetValue;
}

/**
 * Live-overrides a token as an INLINE custom property on <html>, so it wins
 * over any stylesheet declaration (including the `:root[data-tokens="on"]`
 * gate) without editing a file. Written in the SAME shape the token is
 * declared in - getting this wrong is the whole trap: these tokens are
 * consumed as `rgb(var(--x) / <alpha-value>)`, so writing a bare hex into
 * one produces `rgb(#ff0000 / 1)`, an invalid color that silently falls
 * back instead of visibly changing. Nothing is persisted: this lives only
 * on the in-memory inline style and disappears on reload, exactly like
 * editing a value in devtools.
 */
export function applyTokenOverride(name, hex) {
  const declared = declaredTokenValue(name);
  const value = TRIPLET.test(declared) ? hexToTriplet(hex) : hex;
  if (!value) return;
  document.documentElement.style.setProperty(name, value);
}

export function resetTokenOverride(name) {
  document.documentElement.style.removeProperty(name);
}

/**
 * Scans every reachable stylesheet for rules whose selector includes
 * ":root" and collects every custom property (--x) declared there. This is
 * the runtime source of truth for "is this a token var" - always in sync
 * with whatever tokens.css currently contains, no separate list to
 * maintain by hand.
 */
export function buildTokenVarWhitelist(styleSheets = document.styleSheets) {
  const names = new Set();

  for (const sheet of styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin stylesheet - browser blocks reading .cssRules. Skip it.
      continue;
    }
    if (!rules) continue;

    for (const rule of rules) {
      if (!rule.selectorText || !rule.selectorText.includes(":root")) continue;
      if (!rule.style) continue;

      for (let i = 0; i < rule.style.length; i++) {
        const prop = rule.style[i];
        if (prop.startsWith("--")) names.add(prop);
      }
    }
  }

  return names;
}

/** First var(--x...) reference in a raw CSS value, ignoring any fallback. */
export function extractVarName(rawValue) {
  if (typeof rawValue !== "string") return null;
  const match = /var\(\s*(--[a-zA-Z0-9-]+)/.exec(rawValue);
  return match ? match[1] : null;
}

/**
 * True for the literal keyword "transparent" or any rgba()/hsla() value
 * whose alpha channel is exactly 0 - a color that paints nothing,
 * regardless of its RGB/HSL channels. Browsers normalize a stylesheet
 * rule's `background-color: transparent` (e.g. Tailwind Preflight's
 * button reset) to "rgba(0, 0, 0, 0)" when read back via CSSOM, so both
 * forms need to be recognized.
 */
function isFullyTransparent(rawValue) {
  if (typeof rawValue !== "string") return false;
  const value = rawValue.trim().toLowerCase();
  if (value === "transparent") return true;
  const match = /^(?:rgba|hsla)\(\s*[\d.%]+[,\s]+[\d.%]+[,\s]+[\d.%]+[,\s/]+([\d.]+)\s*\)$/.exec(value);
  return match ? parseFloat(match[1]) === 0 : false;
}

/**
 * Approximates CSS specificity as [idCount, classAttrPseudoCount, typeCount]
 * for a SINGLE selector (no top-level commas). Good enough for the
 * selectors this app actually writes (class-based Tailwind utilities,
 * occasional #id or element selectors) - it does not attempt to handle
 * :not()/:is() argument specificity per the full spec.
 */
function specificityOf(selectorText) {
  const ids = (selectorText.match(/#[\w-]+/g) || []).length;
  const classesAttrsPseudo = (
    selectorText.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+(\([^)]*\))?/g) || []
  ).length;
  const types = (selectorText.match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
  return [ids, classesAttrsPseudo, types];
}

/**
 * Splits a selector list on top-level commas (not inside `()`/`[]`, so a
 * comma inside e.g. `:where(a, b)` or an attribute value isn't treated as a
 * separator). CSS rules routinely group unrelated selectors together with
 * commas - e.g. Tailwind Preflight's
 * `button, input:where([type='button']), input:where([type='reset']), ...`
 * - and specificity must be computed per matching alternative, not for the
 * whole grouped string (see specificityForMatch).
 */
function splitSelectorList(selectorText) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of selectorText) {
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;

    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * The specificity actually used when `selectorText` matches `element` -
 * per CSS semantics, a grouped selector list (`a, b, c { ... }`) is cascaded
 * as if each alternative were its own rule, so only the specificity of
 * whichever alternative matched applies, never the combined text. Returns
 * null if none of the alternatives match (shouldn't happen for a candidate
 * that already passed `element.matches(wholeSelectorText)`, but selectors
 * this browser/jsdom can't evaluate are skipped rather than thrown).
 *
 * This is what fixes a real bug: naively scoring the whole
 * `button, input:where([type='button']), ...` string counted brackets from
 * EVERY alternative, inflating a plain `button` match's specificity past a
 * genuine `.some-class` rule and making Preflight's `background-color:
 * transparent` reset win over an actual bg-* utility.
 */
// Interaction pseudo-classes are deliberately excluded from the audit
// entirely (never even attempted against the element), not just scored
// low: this tool inspects an element by physically hovering the mouse
// over it, so a rule like `.hover\:bg-gray-50:hover` genuinely IS the
// applicable declaration at that exact instant per real CSS semantics -
// but that's an accident of how inspection works, not the thing being
// audited. A hover/focus/active style is transient interaction feedback,
// not part of "does this element's real implementation use the right
// token" - reporting it would make every hover-styled element look like
// it's using whatever color its hover state happens to reference.
const INTERACTION_PSEUDO_CLASS = /:(hover|focus(-visible|-within)?|active|visited)\b/i;

function specificityForMatch(element, selectorText) {
  for (const alternative of splitSelectorList(selectorText)) {
    if (INTERACTION_PSEUDO_CLASS.test(alternative)) continue;

    let matches = false;
    try {
      matches = element.matches(alternative);
    } catch {
      continue;
    }
    if (matches) return specificityOf(alternative);
  }
  return null;
}

function isHigherSpecificity(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

function isEqualSpecificity(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export const AUDITED_PROPERTIES = [
  "background-color",
  "color",
  "border-color",
  "font-size",
  "font-weight",
  "line-height",
  "font-family",
];

/**
 * The 3 color properties, as opposed to the 4 typography ones - the
 * "semantic" status tier (see auditProperty) is scoped to these only, per
 * explicit scope decision: typography's Figma export doesn't have a
 * brand/semantic aliasing layer yet (see the spec's "Scope"), so there's
 * no meaningful semantic-vs-token distinction to draw there yet.
 */
export const COLOR_PROPERTIES = new Set(["background-color", "color", "border-color"]);

/**
 * Every rule across `styleSheets` that declares `property`, pre-computed
 * once as {selectorText, value, important, specificity, order}. This is the
 * expensive-ish pass (checks every rule in the document) - the point of
 * buildPropertyIndex is to run it ONCE per property, not once per property
 * PER ELEMENT (see that function's own comment for why that distinction
 * matters).
 */
function collectPropertyCandidates(property, styleSheets) {
  const candidates = [];
  let order = 0;

  for (const sheet of styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (!rules) continue;

    for (const rule of rules) {
      order += 1;
      if (!rule.selectorText || !rule.style) continue;

      const raw = rule.style.getPropertyValue(property);
      if (!raw) continue;

      candidates.push({
        selectorText: rule.selectorText,
        value: raw.trim(),
        important: rule.style.getPropertyPriority(property) === "important",
        order,
      });
    }
  }

  return candidates;
}

/**
 * Builds a per-property index of every stylesheet rule that declares one of
 * AUDITED_PROPERTIES, once. Auditing N elements against the whole
 * stylesheet independently (the original implementation) is
 * O(elements x 7 properties x ALL rules in the document) -
 * `element.matches()` against every Tailwind utility rule, most of which
 * don't even touch that property. On a real page (thousands of Tailwind
 * rules, hundreds/thousands of elements) that was tens of millions of
 * `matches()` calls and the actual cause of the multi-second freeze before
 * anything painted (SWT20-398). Indexing once up front and matching each
 * element only against the rules that could possibly apply drops this to
 * O(elements x 7 x rules-that-declare-that-property) - a much smaller set.
 */
export function buildPropertyIndex(styleSheets = document.styleSheets) {
  const index = new Map();
  for (const property of AUDITED_PROPERTIES) {
    index.set(property, collectPropertyCandidates(property, styleSheets));
  }
  return index;
}

function resolveCandidates(property, styleSheetsOrIndex) {
  if (styleSheetsOrIndex instanceof Map) {
    return styleSheetsOrIndex.get(property) || [];
  }
  return collectPropertyCandidates(property, styleSheetsOrIndex);
}

// Cascade tiers, highest-priority first. Inline style outranks every
// selector-based rule that isn't !important (correct per the CSS cascade -
// inline style has higher specificity than any selector), but an
// !important stylesheet rule still wins over it.
const TIER_IMPORTANT = 2;
const TIER_INLINE = 1;
const TIER_NORMAL = 0;

/**
 * Finds which candidate wins the cascade for `property` on `element` -
 * either a matching stylesheet rule or the element's own inline `style`
 * attribute - and returns { value, selector } where value is the RAW
 * (unresolved) declaration, e.g. "var(--color-primary, 122 21 21)", never a
 * resolved rgb()/hex, and selector is the winning rule's selectorText (or
 * null for inline style). Reading the source declaration (not
 * getComputedStyle) is what lets the caller tell a token-driven color from
 * a hardcoded one that merely renders the same - see spec "Why raw
 * declaration instead of computed style".
 *
 * `styleSheetsOrIndex` accepts either a raw styleSheets collection (slow
 * path: walks every rule in the document for this one property, fine for a
 * single ad-hoc call or a small test fixture) or a prebuilt Map from
 * buildPropertyIndex (fast path: reuses the pre-filtered candidate list -
 * use this whenever auditing more than a handful of elements).
 */
function findWinningCandidate(element, property, styleSheetsOrIndex = document.styleSheets) {
  let winner = null;

  const consider = (candidate) => {
    if (!winner) {
      winner = candidate;
      return;
    }
    if (candidate.tier !== winner.tier) {
      if (candidate.tier > winner.tier) winner = candidate;
      return;
    }
    // Same tier: for TIER_NORMAL, compare specificity then source order.
    // TIER_INLINE only ever has one candidate (the element's own style),
    // so this branch is only reachable for TIER_NORMAL/TIER_IMPORTANT.
    if (isHigherSpecificity(candidate.specificity, winner.specificity)) {
      winner = candidate;
    } else if (isEqualSpecificity(candidate.specificity, winner.specificity)) {
      winner = candidate; // later source order wins a tie
    }
  };

  const candidates = resolveCandidates(property, styleSheetsOrIndex);
  for (const candidate of candidates) {
    const specificity = specificityForMatch(element, candidate.selectorText);
    if (specificity === null) continue; // no alternative in this rule actually matches

    consider({
      value: candidate.value,
      selector: candidate.selectorText,
      tier: candidate.important ? TIER_IMPORTANT : TIER_NORMAL,
      specificity,
      order: candidate.order,
    });
  }

  if (element.style) {
    const raw = element.style.getPropertyValue(property);
    if (raw) {
      consider({ value: raw.trim(), selector: null, tier: TIER_INLINE, specificity: [0, 0, 0], order: 0 });
    }
  }

  return winner;
}

/** Same as findWinningCandidate, but returns just the raw value (or null). */
export function findWinningDeclaration(element, property, styleSheetsOrIndex = document.styleSheets) {
  const winner = findWinningCandidate(element, property, styleSheetsOrIndex);
  return winner ? winner.value : null;
}

/** Whether `element` has a border a person could actually see. */
function hasVisibleBorder(element) {
  const width = parseFloat(getComputedStyle(element).borderTopWidth);
  return !Number.isNaN(width) && width > 0;
}

/**
 * Audits a single CSS property on `element` against the token whitelist.
 * `styleSheetsOrIndex` - see findWinningCandidate: pass a buildPropertyIndex
 * Map when auditing many elements (hover + page scan both do).
 */
export function auditProperty(element, property, whitelist, styleSheetsOrIndex = document.styleSheets) {
  // Skip border-color entirely on an element with no visible border - a
  // token or hardcoded value declared on a border nobody can see isn't a
  // meaningful compliance signal (matches TRMS's DesignTokenInspector).
  if (property === "border-color" && !hasVisibleBorder(element)) {
    return { property, status: "no-color", value: null, selector: null };
  }

  const winner = findWinningCandidate(element, property, styleSheetsOrIndex);
  if (!winner) {
    return { property, status: "no-color", value: null, selector: null };
  }

  // CSS-wide keywords ("inherit" especially - Tailwind Preflight sets
  // `font-family: inherit; font-weight: inherit; color: inherit;` on
  // button/input/select/textarea) don't declare an actual value - they defer
  // to the ancestor's, so this element still has no color/typography
  // opinion of its own. Treating that as "hardcoded" flagged form controls
  // as "not using a token" for a value they never set in the first place.
  if (["inherit", "initial", "unset"].includes(winner.value.trim().toLowerCase())) {
    return { property, status: "no-color", value: null, selector: null };
  }

  // Tailwind Preflight also sets `font-size: 100%` on button/input/select/
  // textarea - functionally identical to `font-size: inherit` (render at
  // whatever the ancestor's font-size computes to), just spelled as a
  // percentage instead of the inherit keyword. Same false-positive as the
  // inherit/initial/unset check above: this element never declared its own
  // font-size, so it shouldn't read as "hardcoded, not using a token".
  if (property === "font-size" && winner.value.trim() === "100%") {
    return { property, status: "no-color", value: null, selector: null };
  }

  // A fully-transparent color ("transparent", or any rgba()/hsla() with a
  // zero alpha channel) paints nothing - same reasoning as the border-color
  // check above, just for background-color/color. Tailwind Preflight's own
  // `button, [type='button'] { background-color: transparent }` reset is
  // the most common source (the browser normalizes the winning
  // declaration's read-back value to "rgba(0, 0, 0, 0)"), so without this,
  // every native <button>/<input> with no explicit bg-* class gets flagged
  // "hardcoded" for a value it never deliberately set, same false-positive
  // class as the inherit/initial/unset case above.
  if (COLOR_PROPERTIES.has(property) && isFullyTransparent(winner.value)) {
    return { property, status: "no-color", value: null, selector: null };
  }

  const varName = extractVarName(winner.value);
  if (varName && whitelist.has(varName)) {
    // "semantic" is a step above plain "token": a var name starting with
    // --theme- comes from the +Theme collection - the highest layer of
    // abstraction in the token file (theme -> brand -> primitive alias
    // chain), meaning the design system's own intent (e.g. "this is a
    // danger background") rather than just "this happens to reference a
    // token var" (which a primitive like --color-gray-500 or an old
    // Tailwind-bridge var like --color-custom-gray also satisfies, without
    // carrying that semantic meaning). Scoped to color properties only for
    // now - see COLOR_PROPERTIES.
    if (COLOR_PROPERTIES.has(property) && varName.startsWith("--theme-")) {
      return { property, status: "semantic", value: winner.value, selector: winner.selector };
    }
    return { property, status: "token", value: winner.value, selector: winner.selector };
  }
  return { property, status: "hardcoded", value: winner.value, selector: winner.selector };
}

/** Audits every AUDITED_PROPERTIES entry on `element`, in order. */
export function auditElement(element, whitelist, styleSheetsOrIndex = document.styleSheets) {
  return AUDITED_PROPERTIES.map((property) =>
    auditProperty(element, property, whitelist, styleSheetsOrIndex),
  );
}

// How many elements to audit before yielding a frame back to the browser.
// Even with the per-property index, a real page can have thousands of
// elements - yielding periodically keeps clicks/hover/paint responsive
// during the scan instead of one long synchronous block.
const SCAN_BATCH_SIZE = 150;

function yieldToMainThread() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Page-wide version of auditElement: scans every visible descendant of
 * `root`, tallying audited PROPERTIES (not elements - one element can
 * contribute to more than one bucket, e.g. a semantic background +
 * hardcoded text) into semantic/token/unmatched, and keeping which
 * elements landed in each bucket so the caller can flag them on the page.
 * Mirrors TRMS's DesignTokenInspector scanPage(), split a level further to
 * separate "semantic" from plain "token" (see auditProperty). Async and
 * chunked (see SCAN_BATCH_SIZE) - callers that don't care about
 * responsiveness can still just `await` it.
 */
export async function scanPageCoverage(whitelist, root = document.body, styleSheetsOrIndex = document.styleSheets) {
  let semantic = 0;
  let token = 0;
  let unmatched = 0;
  const semanticElements = [];
  const tokenElements = [];
  const unmatchedElements = [];
  // Per-token hit count, color properties only (background/text/border) -
  // this is what lets the "Try a Colour" list sort by "what's actually
  // driving pixels on THIS page" instead of a static alphabetical dump.
  const tokenUsage = {};

  const all = Array.from(root.querySelectorAll("*"));

  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.closest("[data-color-checker-ui]")) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const results = auditElement(el, whitelist, styleSheetsOrIndex);
    let elSemantic = false;
    let elToken = false;
    let elUnmatched = false;
    results.forEach((result) => {
      if (result.status === "semantic") {
        semantic += 1;
        elSemantic = true;
      } else if (result.status === "token") {
        token += 1;
        elToken = true;
      } else if (result.status === "hardcoded") {
        unmatched += 1;
        elUnmatched = true;
      }
      if (COLOR_PROPERTIES.has(result.property) && (result.status === "semantic" || result.status === "token")) {
        const varName = extractVarName(result.value);
        if (varName) tokenUsage[varName] = (tokenUsage[varName] || 0) + 1;
      }
    });
    if (elSemantic) semanticElements.push(el);
    if (elToken) tokenElements.push(el);
    if (elUnmatched) unmatchedElements.push(el);

    if (i > 0 && i % SCAN_BATCH_SIZE === 0) {
      await yieldToMainThread();
    }
  }

  return { semantic, token, unmatched, semanticElements, tokenElements, unmatchedElements, tokenUsage };
}
