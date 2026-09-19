/**
 * TEMPLATE — the one file in this pipeline that encodes a design judgment
 * rather than a mechanical rule. Every other file in this skill is either
 * copy-verbatim (reference/) or fill-in-the-placeholder (other templates).
 * This one you write by hand, once per project, and revisit whenever the
 * design team adds a new semantic token.
 *
 * Maps a Figma token's dot-path (from the "+Theme" collection only - see
 * SKILL.md, that's the sole consumer-facing tier) to the CSS custom
 * property name YOUR app's Tailwind config expects.
 *
 * Example, from a real project:
 *   "+Theme.text.default"   -> "theme-color-text-default"
 *   "+Theme.background.primary.default" -> "theme-color-background-primary-default"
 *
 * A token with no entry here is simply not emitted - not every Figma token
 * needs to exist as a consumer-facing class. Under-mapping is safe; leave a
 * token out until something actually needs it rather than mapping
 * speculatively.
 */

const BRIDGE = {
  // "+Theme.text.default": "theme-color-text-default",
};

module.exports = { BRIDGE };
