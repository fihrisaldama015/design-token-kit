---
description: Re-apply just the visual delta from the prototype repo to a production page that already has real data/state wired up — never touches hooks, mutations, or business logic
argument-hint: [menu name, route, comma-separated list, or literal path — one or more production pages to check]
---

Follow the **`sync-existing`** procedure in this skill's `SKILL.md`, using `$ARGUMENTS` to resolve one or more target pages. Confirm the resolved list with the user before editing anything if resolution was fuzzy (a menu/module name matching multiple pages). Run each resolved page through the full procedure independently — one page's failure shouldn't block the others; report per-page results at the end.
