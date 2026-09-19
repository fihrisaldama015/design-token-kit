/**
 * TEMPLATE — a fragment to merge into your project's tailwind.config.js,
 * not a standalone file. Shows the pattern every generated token should
 * follow; copy the shape, not the literal keys below.
 *
 * Why "rgb(var(--x, fallback) / <alpha-value>)" and not just "var(--x)":
 *   - The channel-triplet format ("122 21 21", not "#7a1515") is what lets
 *     Tailwind inject <alpha-value> for modifiers like `bg-primary/20`.
 *   - The fallback value keeps the class usable even before the generated
 *     tokens.css loads (or if a project runs with the token pipeline
 *     toggled off) - always include one, matching the token's own default.
 *
 * One custom property, one property-specific Tailwind key. Do NOT reuse a
 * single --theme-color-x variable across textColor/backgroundColor/
 * borderColor - that's how two unrelated design properties end up sharing
 * one value and can't be changed independently later (a real regression
 * this pattern exists to prevent).
 */

module.exports = {
  theme: {
    extend: {
      textColor: {
        default: "rgb(var(--theme-color-text-default, 3 7 18) / <alpha-value>)",
        body: "rgb(var(--theme-color-text-body, 107 114 128) / <alpha-value>)",
        primary: "rgb(var(--theme-color-text-primary, 122 21 21) / <alpha-value>)",
      },
      backgroundColor: {
        surface: "rgb(var(--theme-color-background-surface, 255 255 255) / <alpha-value>)",
        "primary-default": "rgb(var(--theme-color-background-primary-default, 122 21 21) / <alpha-value>)",
      },
      borderColor: {
        default: "rgb(var(--theme-color-border-default, 156 163 175) / <alpha-value>)",
        primary: "rgb(var(--theme-color-border-primary, 122 21 21) / <alpha-value>)",
      },
    },
  },
};
