# Syncing the LAED design system into Claude Design

How to get LAED's real design language out of this repo and into Claude Design
(`/design-sync` in Claude Code), so prototypes start from actual tokens instead of
a generic template — and how to push refinements back.

## What `/design-sync` actually does

`/design-sync` is a Claude Code slash command (shipped June 2026) that moves a design
system between a local codebase and Claude Design in both directions:

- **pull** — brings a linked design system into the repo under `.claude/design-system/`
  (`tokens.json`, `components.json`, `meta.json`) so Claude Code builds against it.
- **push** — sends the repo's design system / implemented components back to the
  Claude Design canvas for visual work.

Claude Design then validates its own output against those tokens before showing it to you.

This runbook sits in `.claude/design-system/` rather than `docs/` because `docs/` is
gitignored in this repo — the export and its instructions need to travel together.

**Requirements**

| Requirement | Notes |
| --- | --- |
| Claude Code ≥ `2.1.181` | `/design-sync` does not exist in older builds |
| Paid Claude plan (Pro / Max / Team / Enterprise) | Claude Design is beta, off by default on Enterprise |
| Signed-in Claude Code | uses your claude.ai session, no extra API key |
| Optional: Claude Design MCP server | needed only for `/design` (create/edit design projects from the terminal) |

## Why LAED needs an export step first

The reference workflow in the docs assumes a standalone design-system repo:

```bash
cd path/to/your-design-system
claude
› /design-sync
```

LAED has no such repo. Its design language lives inside the monorepo as:

- `frontend/src/styles/tokens.css` — 109 CSS custom properties, the declared source of truth
- `frontend/src/app/globals.css` — 44 `.laed-*` semantic classes (buttons, inputs, shells, tooltips)
- `frontend/src/components/**` — 42 modules consuming those tokens inline
- No `tailwind.config.*` (Tailwind v4 CSS-first), no `cva`/shadcn, no component registry

An importer pointed at that would have to infer the system from arbitrary Tailwind
values like `bg-[var(--laed-paper)]`. So we generate a machine-readable export first.

## The generator

`scripts/export-design-system.mjs` derives the export from the sources above and
writes `.claude/design-system/`:

| File | Contents |
| --- | --- |
| `tokens.json` | All tokens in W3C Design Tokens (DTCG) format — `$type`/`$value`, grouped `color.*`, `typography.*`, `space`, `radius`, `shadow`, `motion`, `layout`. `var()` aliases resolved to literals, with the original alias kept under `$extensions."eu.laed"` |
| `components.json` | Per-file manifest: exports, tokens used, `.laed-*` classes used, plus the `globals.css` CSS primitives and their token usage |
| `meta.json` | Repo remote, branch, commit, dirty flag, stack versions, theme model, scope accents, pointers to the principle rules, counts |
| `DESIGN_SYSTEM.md` | Human-readable brief — also the file to upload if you import into Claude Design by hand |

`tokens.css` stays the single source of truth. Nothing in the export is hand-maintained;
regenerate rather than edit.

```bash
node scripts/export-design-system.mjs          # from repo root
npm --prefix frontend run design:export        # same thing
node scripts/export-design-system.mjs --out /tmp/laed-ds   # standalone copy
node scripts/export-design-system.mjs --check  # verify only, exit 1 on problems
```

`--check` writes nothing and fails on two conditions: any component using a literal
that matches no token, or a committed artifact that no longer matches its sources.
Timestamps and git metadata are masked out of the comparison, so a commit alone never
makes the export stale. Use it as the gate after implementing a design change, and it
is safe to wire into a pre-commit hook or CI.

## Procedure

### 1. Update Claude Code

```bash
claude --version           # must be >= 2.1.181
claude update              # or: npm install -g @anthropic-ai/claude-code@latest
```

### 2. Regenerate the export

```bash
cd /Users/feline/Desktop/Repositories/laed
node scripts/export-design-system.mjs
```

Expected tail:

```
117 tokens · 44 css primitives · 42 components · 0 drift findings
```

Counts move when `tokens.css` changes — that is the point.

### 3. Sync from the repo root

```bash
cd /Users/feline/Desktop/Repositories/laed
claude
```

Then, in the session:

```
/design-sync
```

Run it from the **repo root**, not `frontend/` — `.claude/` lives at the root and the
manifest paths are repo-root-relative.

If it reports no linked design system, create one at
[claude.ai/design](https://claude.ai/design) → design system → import from local
codebase, then re-run. To drive it from the terminal instead:

```bash
claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp
claude
› /design-login
› /design
```

### 4. Verify

- Claude Design's design system lists LAED's colours with `#1a1917` ink, `#f2f0ec` paper,
  `#1d3a57` navy and `#1b4332` green — not an invented palette.
- Type defaults to the Helvetica stack at 11px body, no webfont.
- `git status .claude/design-system` shows only the regenerated files.

### 5. Manual fallback

If `/design-sync` is unavailable, Claude Design imports raw uploads. Upload the four
files from `.claude/design-system/` — `DESIGN_SYSTEM.md` carries the intent, `tokens.json`
the exact values.

## Drift, and how it was closed

The generator reports drift: literals in components that match no token. The first run
found 14. All are now fixed, so the system imports clean. What changed:

**Eight tokens added** — a two-step tint scale per accent hue (`--laed-navy-tint-strong`,
`--laed-private-tint`, `--laed-private-tint-strong`), an extra ink alpha step
(`--laed-fill-12`), two semantic ink colours (`--laed-text-faint`, `--laed-scrim`), a
floating-panel elevation (`--laed-shadow-sheet`), and a type step at 13px
(`--laed-size-title`). `--laed-chrome-private` / `--laed-chrome-project` are now aliases
of the strong tints, since they always held those exact values.

**Values that already had a token** now reference it: `ChatBubble` and `CollaboratorsPanel`
card shadows became `--laed-shadow-card`, `BottomBar`'s project FAB shadow became
`--laed-shadow-fab`, and `TopologyCanvas` strokes became `--laed-green-line` / `--laed-fill-04`.

**Snapped to the nearest step** where a literal was a rounding duplicate in the same role —
navy fills at `0.08`/`0.09`/`0.10` all became `--laed-navy-tint`, halos at `0.14` became the
strong tints, type at `13.5px` became `13px` and `10.5px` became `--laed-size-meta`, and the
attach sheet's `0.16` shadow joined the assistant panel on `--laed-shadow-sheet`. Each shift
is ≤ 0.03 alpha or 0.5px; nothing was re-designed.

**One genuine bug fixed:** `MentionHighlightedText` highlighted mentions in
`rgba(26, 54, 93, 0.12)`, which is not LAED's navy (`rgba(29, 58, 87, …)`).

A second bug surfaced while verifying the build: `text-[var(--laed-size-*)]` is ambiguous
in Tailwind, so it compiled to `color:` and the font size was silently dropped —
`MessageSources` captions had been rendering at inherited size. The fix is the `length:`
hint, `text-[length:var(--laed-size-caption)]`, and there is now an
`ambiguous-font-size-var` detector so it cannot come back.

## Design → code round trip

The automated push-back (`/design-sync push`, "hand off to Claude Code") requires the
CLI to reach Anthropic's design endpoints. On an MDM-managed machine that forces
`ANTHROPIC_BASE_URL` at a company gateway, those calls 401 and the loop has to be
closed by hand. The order below is what keeps both sides honest either way.

**In Claude Design.** Scope a session to one surface, not the whole product. Require
every change to be expressed as an existing `--laed-*` token or a new named one, and
ask for the token delta as a list at the end — that list is the implementable artifact,
the picture is only for checking intent. State the sovereignty constraint each time:
`--laed-private*` and `--laed-green` mark real privacy properties, so using them
decoratively is a correctness bug.

**Back in the repo.**

1. Land the token delta in `frontend/src/styles/tokens.css` first — it is the source of
   truth, and everything else derives from it.
2. Implement component changes referencing tokens, never literals.
3. `node scripts/export-design-system.mjs --check` — must pass. A failure here means the
   design change was implemented with hardcoded values.
4. `npm --prefix frontend run build`.
5. Re-import the regenerated export into Claude Design, so the next session starts from
   what shipped rather than what was proposed.

Step 5 is the one that gets skipped, and skipping it is how one design system quietly
becomes two.

### Still worth doing

Three gaps the detectors do not cover: the **z-index ladder** (80 → 500, ad hoc across
components and `globals.css`, absent from `tokens.css`), **breakpoints** (only `768px`,
hardcoded in `globals.css`), and **scrims** — `--laed-scrim` now exists but `bg-black/20`,
`bg-black/55` and `globals.css`'s `rgba(0, 0, 0, 0.48)` assistant backdrop still bypass it.
Each is a new entry in `DRIFT_DETECTORS` plus a sweep of the call sites.

The loop for each: add the token to `tokens.css`, replace the literal at its call sites,
re-run the generator, confirm the finding disappears, then `/design-sync` again.
Fixing drift before importing gives Claude Design a cleaner system to design against.

Design-reference mockups in `frontend/design-reference/` are **not** exported. They
contain unadopted decisions (DM Sans / Instrument Serif, `#d8d4ce` backgrounds, an 88px
bottom bar vs the shipped 92px) and would pollute the imported system. Promote anything
worth keeping into `tokens.css` first.

## Session log — 2026-08-07

Recorded so this is reproducible, including what did not run.

```
$ claude --version
2.1.76 (Claude Code)                    # BLOCKER: /design-sync needs >= 2.1.181

$ claude mcp list
No MCP servers configured.              # /design would need the claude-design server

$ git rev-parse --abbrev-ref HEAD
LAED-v1.1-refactoring @ 04f38da (dirty)

$ node --version
v20.18.0

$ node scripts/export-design-system.mjs
109 tokens · 44 css primitives · 42 components · 14 drift findings

# … 8 tokens added to tokens.css, 13 components + globals.css rewired …

$ node scripts/export-design-system.mjs
117 tokens · 44 css primitives · 42 components · 0 drift findings

$ npm --prefix frontend run build
✓ Compiled successfully · ✓ Generating static pages (15/15)

$ rg -o "font-size:var\(--laed-size-[a-z]+\)|color:var\(--laed-size-[a-z]+\)" frontend/.next/static/css/*.css | sort | uniq -c
   2 font-size:var(--laed-size-body)      # no color:var(--laed-size-*) remains —
   1 font-size:var(--laed-size-caption)   # every size token compiles as a size
   1 font-size:var(--laed-size-title)
   …
```

**Not executed:** `/design-sync` itself — the installed Claude Code predates the command,
and the handshake needs an interactive claude.ai login. Steps 1 and 3 above are yours to run.
