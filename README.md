# design-token-kit

A Claude Code plugin bundling three independent skills for keeping an app's
UI in sync with a Figma-exported design-token pipeline:

| Skill | Does | Cadence |
|---|---|---|
| `sync-tokens` | Pulls a Figma variables export (Tokens Brücke, DTCG) into a codebase as CSS custom properties Tailwind consumes | Once to set up, then either automatic (CI) or manual (`npm run tokens:sync`) |
| `slice-component` | Ports a page from a design-synced prototype repo into production, or re-applies just the visual delta to an already-integrated page | Daily — the main workhorse |
| `color-checker` | A live, in-app dev tool auditing whether markup actually uses the resulting tokens, plus a live token-override panel | Once to install, then re-invoked whenever the tool itself gains a capability |

Install once (this plugin), get all three as `design-token-kit:sync-tokens`,
`design-token-kit:slice-component`, `design-token-kit:color-checker` —
independently invokable, not a chain.

Each skill's `SKILL.md` explains its own scope, workflow, and common
mistakes in full — this file is just the map. Start there, not here.

## Layout

```
skills/
├── sync-tokens/
│   ├── SKILL.md
│   ├── reference/    ← copy verbatim, consumer-agnostic
│   └── templates/    ← fill in the {{PLACEHOLDER}}s, one per project
├── slice-component/
│   ├── SKILL.md
│   └── commands/      ← thin slash-command wrappers around SKILL.md's procedure
└── color-checker/
    ├── SKILL.md
    └── reference/     ← copy verbatim on fresh install, diff-and-ask on upgrade
```
