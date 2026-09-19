---
name: sync-tokens
description: Use when a project needs to pull Figma-exported design tokens (colors) into its codebase as CSS custom properties consumed by Tailwind (or a similar utility-CSS setup), or when setting up the pipeline that keeps that in sync going forward
---

# Sync Tokens

## Overview

Turns a Figma variables export into CSS custom properties a codebase actually consumes, and sets up how future exports reach the codebase again. Two repos are involved, always: a **source repo** (holds the raw export, versioned) and a **consumer repo** (the app that renders with those colors). They are never directly coupled — the consumer always *pulls* on demand; automation, if any, is just something that triggers that pull for you.

## When to Use

- A project wants to replace hand-picked Tailwind colors with values that trace back to Figma
- An existing token pipeline needs a second consumer app wired up
- The source export changed and the consumer's CSS needs regenerating
- Debugging why a color in the app doesn't match Figma (check whether the pipeline ran, not just the CSS)

**Not for:** auditing whether a page's *markup* actually uses the resulting tokens — that's the `color-checker` skill. Not for porting whole pages/components from a prototype — that's `slice-component`.

## Source format: Tokens Brücke (DTCG)

This skill only supports exports from the **Tokens Brücke** Figma plugin, in DTCG mode. Confirm before parsing anything — a different plugin or export mode produces a differently-shaped JSON this skill does not understand.

**How to tell:** the document has a `$extensions["tokens-bruecke-meta"]` key at the root:

```json
"$extensions": {
  "tokens-bruecke-meta": {
    "useDTCG": true,
    "spec": "https://www.designtokens.org/tr/2025.10/format/",
    "colorMode": "hex",
    "variableCollections": ["Color", "+Theme", ".Brand", ...],
    "createdAt": "2026-09-03T05:36:05.594Z"
  }
}
```

Validate, in order, before doing anything else:
1. `$extensions["tokens-bruecke-meta"]` exists.
2. `useDTCG === true` inside it (Tokens Brücke can also export a legacy non-DTCG shape this skill does not parse).
3. Top-level keys include at least `Color`, `+Theme`, `.Brand` (case-sensitive).

If any check fails, stop and tell the user:

> This JSON doesn't match the format this skill supports (Tokens Brücke, DTCG mode). I can't reliably parse it — proceeding risks generating garbage tokens or silently emitting zero. Recommended: export using the **Tokens Brücke** Figma plugin (Figma Community → search "Tokens Brücke"), with DTCG format enabled. If you're intentionally using a different plugin/format, this skill doesn't support that shape yet — it needs a new parser, not a config change.

Run this check on **every** sync, not just the first — a designer can swap export settings later without anyone noticing until the output is wrong.

**JSON shape**, once confirmed:
- Top level = Figma variable collections. Only three are walked for color: `Color` (raw palette, literal `#hex` values), `.Brand` (aliases into `Color`), `+Theme` (semantic tier — the only one an app's classes should ever reference directly; carries `Light`/`Dark` mode variants).
- Every leaf: `{"$type": "color", "$value": "#hex" | "{Collection.path}", "$extensions": {"mode": {"Light": ..., "Dark": ...}}}`. A `{Path}` value is an alias — resolve recursively (see `reference/core.js`'s `resolveHex`, 20-hop loop guard) until it lands on a literal hex.

## Workflow

1. **Ask up front how updates should reach the consumer**, before touching any files:
   > "How do you want token updates to reach this app once the source repo changes?
   > 1. **Manual** (recommended to start) — run the sync script whenever you want the latest export. No secrets, no setup.
   > 2. **CI, Bitbucket Pipelines** — auto-triggered on every source-repo push. Needs a Bitbucket access token.
   > 3. **CI, GitHub Actions** — same idea, for a GitHub-hosted consumer. Needs a cross-repo PAT."

   Manual is not a lesser option — it's the only one requiring zero infrastructure decisions on day one, and every CI choice is just a wrapper around the same manual script.

2. **Set up the source repo** (if it doesn't exist yet): copy `reference/core.js`, `reference/renderers/`, `reference/build.js` in verbatim — they're consumer-agnostic by design, nothing to edit.

3. **Set up the consumer repo:**
   - Ask where generated files should live. Convention (from the reference implementation): `src/styles/design_token.json` (the raw snapshot), `src/styles/tokens.css` (generated), `src/styles/tokens.meta.json` (just the export timestamp, so a live-preview UI can show "last synced" without bundling the full JSON).
   - Copy `templates/syncDesignTokens.template.js`, filling in the marked placeholders (paths, source repo URL).
   - Copy `templates/tokenMap.template.js` — this is the one file that's genuinely per-project: it maps Figma token paths to this app's own color names. Nothing to auto-generate here; it encodes a design judgment.
   - Wire `tailwind.config.js` per `templates/tailwind.config.snippet.js` — see below.
   - Add an npm script (e.g. `"tokens:sync": "node scripts/syncDesignTokens.js --fetch"`).

4. **If CI was chosen**, copy the matching file(s) from `templates/ci/` and fill in the placeholders (repo names, branch, secret names) — never invent a secret value, only reference the secret's name.

5. **Run the sync once** to verify: fetch succeeds, format validation passes, `tokens.css` is written, and the app renders with the new colors.

## Tailwind wiring pattern

Tokens must be stored as **channel triplets** (`"122 21 21"`), not hex, so Tailwind's `<alpha-value>` modifier (`bg-primary/20`) works:

```css
:root {
  --theme-color-text-default: 3 7 18;
}
```

```js
// tailwind.config.js
theme: {
  extend: {
    textColor: {
      default: "rgb(var(--theme-color-text-default, 3 7 18) / <alpha-value>)",
    },
  },
},
```

The fallback value (`3 7 18`) keeps the class usable even before the CSS custom property loads — always include one, don't rely on the var always being defined.

## Common Mistakes

- **Writing hex into a triplet var.** Given `--x: 122 21 21` (a triplet), writing `--x: #ff0000` breaks every consumer of `rgb(var(--x) / <alpha-value>)` — it becomes `rgb(#ff0000 / 1)`, invalid CSS, and silently falls back. Always check the existing declared shape before writing an override.
- **Consuming `.Brand` or `Color` tokens directly in app classes.** Only `+Theme` is meant to be consumer-facing; the other two are internal plumbing one or two alias-hops removed from anything the design system actually intends apps to use.
- **Rolling the snapshot back silently.** A designer sometimes shares a newer export outside the source repo (Slack/Lark) without pushing it — naively re-fetching then serves an older file than what's committed, and can produce a byte-identical `tokens.css` (no visible symptom at all). `reference` implementation compares `createdAt` and refuses to go backwards without an explicit `--force`.
- **Skipping the format validation "because it worked last time."** Export settings can change without anyone telling the consumer team. Validate every run.
