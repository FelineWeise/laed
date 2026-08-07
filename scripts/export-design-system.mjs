#!/usr/bin/env node
// Derives a portable design-system export from LAED's in-repo sources of truth
// (tokens.css, globals.css, components/) into .claude/design-system/ so that
// Claude Code's /design-sync and Claude Design read real values, not guesses.
//
// Usage: node scripts/export-design-system.mjs [--out <dir>] [--check]
//   --check  write nothing; exit non-zero if any component has token drift or if
//            the committed export is stale relative to its sources.

import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATOR_VERSION = "1.0.0";

const SOURCES = {
  tokens: "frontend/src/styles/tokens.css",
  globals: "frontend/src/app/globals.css",
  layout: "frontend/src/app/layout.tsx",
  manifest: "frontend/public/manifest.json",
  packageJson: "frontend/package.json",
};

const SCAN_ROOTS = ["frontend/src/components", "frontend/src/lib"];
const SCAN_EXTENSIONS = [".tsx", ".ts"];

// Ordered: first match wins. Capture group 1 becomes the token key, so this
// single table drives both grouping and naming of the emitted tokens.
const TOKEN_RULES = [
  { path: ["color", "bubble"], match: /^--laed-bubble-(.+)$/ },
  { path: ["color", "chrome"], match: /^--laed-chrome-(.+)$/ },
  { path: ["color", "private"], match: /^--laed-private(?:-(.+))?$/, fallbackKey: "base" },
  {
    path: ["color", "semantic"],
    match: /^--laed-(bg|bg-elevated|surface|text|text-muted|text-faint|scrim|divider|action|action-fg|status-on|alert|fg|fg-muted|accent|accent-fg)$/,
  },
  { path: ["color", "neutral"], match: /^--laed-(ink.*|paper.*|white|border.*|grid|muted|fill-.+)$/ },
  { path: ["color", "accent"], match: /^--laed-(navy.*|green.*|warn)$/ },
  { path: ["shadow"], match: /^--laed-shadow-(.+)$/ },
  { path: ["shadow"], match: /^--laed-(halo-.+)$/ },
  { path: ["typography", "family"], match: /^--laed-font-(.+)$/ },
  { path: ["typography", "size"], match: /^--laed-size-(.+)$/ },
  { path: ["typography", "tracking"], match: /^--laed-track-(.+)$/ },
  { path: ["typography", "weight"], match: /^--laed-weight-(.+)$/ },
  { path: ["radius"], match: /^--laed-radius(?:-(.+))?$/, fallbackKey: "base" },
  { path: ["space"], match: /^--laed-space-(.+)$/ },
  { path: ["motion"], match: /^--laed-(ease)$/ },
  { path: ["motion", "duration"], match: /^--laed-dur-(.+)$/ },
  { path: ["layout"], match: /^--laed-(input-.+|viewport-pad-.+|bottom-bar-.+)$/ },
  { path: ["other"], match: /^--laed-(.+)$/ },
];

const TYPE_RULES = [
  { type: "color", test: (v) => /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|color-mix\()/i.test(v) },
  { type: "cubicBezier", test: (v) => /^cubic-bezier\(/i.test(v) },
  { type: "duration", test: (v) => /^-?[\d.]+m?s$/i.test(v) },
  { type: "fontWeight", test: (v, name) => /weight/.test(name) && /^\d+$/.test(v) },
  { type: "fontFamily", test: (v, name) => /font/.test(name) },
  { type: "shadow", test: (v, name) => /shadow|halo/.test(name) },
  { type: "dimension", test: (v) => /^-?[\d.]+(px|rem|em|%|vh|vw)$/i.test(v) },
  { type: "number", test: (v) => /^-?[\d.]+$/.test(v) },
];

const DRIFT_DETECTORS = [
  {
    id: "hardcoded-color",
    label: "Colour literal not present in tokens.css",
    pattern: /#[0-9a-fA-F]{6}\b|rgba?\([^)]*\)/g,
  },
  {
    id: "hardcoded-font-size",
    label: "Tailwind arbitrary font size not present in tokens.css",
    pattern: /text-\[(\d+(?:\.\d+)?px)\]/g,
  },
  {
    // Tailwind resolves a bare var() in text-* as a colour, silently dropping
    // the font size. The length: hint is required.
    id: "ambiguous-font-size-var",
    label: "text-[var(--laed-size-*)] compiles to color — needs text-[length:var(...)]",
    pattern: /text-\[var\((--laed-size-[a-z0-9-]+)\)\]/g,
  },
];

const readRepoFile = (relPath) => readFile(join(REPO_ROOT, relPath), "utf8");

// Timestamps and git metadata change on every run and every commit; they are not
// design-system content, so --check compares artifacts with them masked out.
const VOLATILE_PATTERNS = [
  /\d{4}-\d{2}-\d{2}T[\d:.]+Z/g,
  /"(commit|branch)": "[^"]*"/g,
  /"dirty": (?:true|false)/g,
  /`[^`]*@[0-9a-f]{7,40}`(?: \(working tree dirty\))?/g,
];

const stripVolatile = (text) =>
  VOLATILE_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, "<volatile>"), text);

// Comparison form for CSS literals: authored spacing and trailing zeros differ
// freely between tokens.css and component call sites, so compare canonically.
const normalizeLiteral = (value) =>
  value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\(([^)]*)\)/g, (_, inner) =>
      `(${inner
        .split(",")
        .map((part) => (/^-?[\d.]+$/.test(part) ? String(Number(part)) : part))
        .join(",")})`,
    );

function parseCustomProperties(css) {
  const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!rootBlock) throw new Error("No :root block found in tokens.css");
  const entries = new Map();
  for (const decl of rootBlock[1].split(";")) {
    const match = decl.match(/(--[a-z0-9-]+)\s*:\s*([\s\S]+)/i);
    if (!match) continue;
    entries.set(match[1], match[2].replace(/\s*\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim());
  }
  return entries;
}

function resolveValue(name, entries, seen = new Set()) {
  const raw = entries.get(name);
  if (raw === undefined || seen.has(name)) return raw ?? "";
  seen.add(name);
  return raw.replace(/var\((--[a-z0-9-]+)\)/gi, (_, ref) => resolveValue(ref, entries, seen) || `var(${ref})`);
}

const aliasTarget = (raw) => raw.match(/^var\((--[a-z0-9-]+)\)$/i)?.[1] ?? null;

const inferType = (value, name) => TYPE_RULES.find((rule) => rule.test(value, name))?.type ?? "other";

function classify(name) {
  for (const rule of TOKEN_RULES) {
    const match = name.match(rule.match);
    if (match) return { path: rule.path, key: match[1] ?? rule.fallbackKey ?? "base" };
  }
  return { path: ["other"], key: name.replace(/^--/, "") };
}

function buildTokenTree(entries) {
  const tree = {};
  const flat = [];
  for (const [name, raw] of entries) {
    const { path, key } = classify(name);
    const value = resolveValue(name, entries);
    const alias = aliasTarget(raw);
    const token = {
      $type: inferType(value, name),
      $value: value,
      $extensions: {
        "eu.laed": { cssVar: name, raw, ...(alias ? { aliasOf: alias } : {}) },
      },
    };
    let node = tree;
    for (const segment of path) node = node[segment] ??= {};
    node[key] = token;
    flat.push({ name, path: [...path, key].join("."), type: token.$type, value, raw, alias });
  }
  return { tree, flat };
}

function parseCssClasses(css, sourcePath) {
  const classes = new Map();
  const lines = css.split("\n");
  lines.forEach((line, index) => {
    if (!line.includes("{") || !line.includes(".laed-")) return;
    for (const match of line.slice(0, line.indexOf("{")).matchAll(/\.(laed-[a-z0-9-]+)/g)) {
      if (!classes.has(match[1])) {
        classes.set(match[1], { class: match[1], source: sourcePath, line: index + 1, tokens: [] });
      }
    }
  });
  const blocks = css.split("}");
  for (const block of blocks) {
    const [selector, body = ""] = block.split("{");
    if (!selector?.includes(".laed-")) continue;
    const tokens = [...new Set([...body.matchAll(/var\((--laed-[a-z0-9-]+)\)/g)].map((m) => m[1]))];
    for (const match of selector.matchAll(/\.(laed-[a-z0-9-]+)/g)) {
      const entry = classes.get(match[1]);
      if (entry) entry.tokens = [...new Set([...entry.tokens, ...tokens])];
    }
  }
  return [...classes.values()].sort((a, b) => a.class.localeCompare(b.class));
}

async function walk(dir) {
  const found = [];
  let listing;
  try {
    listing = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of listing) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else if (SCAN_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) found.push(full);
  }
  return found;
}

function detectDrift(source, literals) {
  const findings = [];
  for (const detector of DRIFT_DETECTORS) {
    const values = new Set();
    for (const match of source.matchAll(detector.pattern)) {
      const value = (match[1] ?? match[0]).replace(/\s+/g, " ").trim();
      if (!literals.has(normalizeLiteral(value))) values.add(value);
    }
    if (values.size > 0) findings.push({ detector: detector.id, label: detector.label, values: [...values] });
  }
  return findings;
}

const EXPORT_PATTERNS = [
  /export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/g,
  /export\s+function\s+([A-Z][A-Za-z0-9_]*)/g,
  /export\s+const\s+([A-Za-z][A-Za-z0-9_]*)/g,
  /export\s+type\s+([A-Z][A-Za-z0-9_]*)/g,
];

async function scanComponents(literals) {
  const files = (await Promise.all(SCAN_ROOTS.map((root) => walk(join(REPO_ROOT, root))))).flat();
  const components = [];
  for (const file of files.sort()) {
    const source = await readFile(file, "utf8");
    const tokens = [...new Set([...source.matchAll(/--laed-[a-z0-9-]+/g)].map((m) => m[0]))].sort();
    const cssClasses = [...new Set([...source.matchAll(/(?<![-\w])laed-[a-z0-9-]+/g)].map((m) => m[0]))].sort();
    if (tokens.length === 0 && cssClasses.length === 0) continue;
    const exports = [...new Set(EXPORT_PATTERNS.flatMap((p) => [...source.matchAll(p)].map((m) => m[1])))];
    components.push({
      name: file.split("/").pop().replace(/\.tsx?$/, ""),
      path: relative(REPO_ROOT, file),
      exports,
      tokens,
      cssClasses,
      drift: detectDrift(source, literals),
    });
  }
  return components;
}

function gitInfo() {
  const run = (args) => {
    try {
      return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  };
  return {
    remote: run(["remote", "get-url", "origin"]),
    branch: run(["rev-parse", "--abbrev-ref", "HEAD"]),
    commit: run(["rev-parse", "--short", "HEAD"]),
    dirty: run(["status", "--porcelain"]) !== "",
  };
}

function markdownBrief({ flat, tree, classes, components, meta }) {
  const group = (path) => flat.filter((t) => t.path.startsWith(`${path}.`));
  const table = (rows) =>
    ["| Token | CSS variable | Value |", "| --- | --- | --- |", ...rows.map((t) => `| \`${t.path}\` | \`${t.name}\` | \`${t.value}\` |`)].join("\n");
  const driftRows = components
    .flatMap((c) => c.drift.map((d) => ({ component: c.path, ...d })))
    .map((d) => `| \`${d.component}\` | ${d.detector} | ${d.values.slice(0, 6).map((v) => `\`${v}\``).join(", ")}${d.values.length > 6 ? ` (+${d.values.length - 6})` : ""} |`);

  return `# LAED design system

Generated by \`scripts/export-design-system.mjs\` v${GENERATOR_VERSION} on ${meta.generatedAt}
from \`${meta.sources.tokens}\` at \`${meta.git.branch}@${meta.git.commit}\`${meta.git.dirty ? " (working tree dirty)" : ""}.

**Do not edit this file.** Change \`${meta.sources.tokens}\` and re-run the generator.

## Design intent

LAED is a secure EU-hosted collaboration platform, shipped as a mobile-first PWA.
The visual language is **warm paper and ink** with two meaning-bearing accents:

- **Navy \`${tree.color.accent.navy.$value}\`** — shared/project surfaces and primary actions.
- **Sovereign green \`${tree.color.private.base.$value}\`** — private surfaces and trust cues. Green is only
  used where a real architectural privacy property holds; it is never decorative.

Single light theme. There is no dark mode. Chrome colour, not layout, signals scope
(private vs project). Type is deliberately small and tight (${tree.typography.size.body.$value} body, ${tree.typography.size.label.$value} uppercase labels
at ${tree.typography.tracking.label.$value} tracking) over a warm ${tree.color.neutral.paper.$value} paper ground.

## Colour — neutral

${table(group("color.neutral"))}

## Colour — accent

${table(group("color.accent"))}

## Colour — private / sovereignty

${table(group("color.private"))}

## Colour — semantic aliases

${table(group("color.semantic"))}

## Colour — chat bubbles

${table(group("color.bubble"))}

## Typography

Families: sans \`${tree.typography.family.sans.$value}\`, mono \`${tree.typography.family.mono.$value}\`.
No webfont is loaded — the stack is intentionally system-local so no CDN sees user traffic.

${table(group("typography"))}

## Spacing, radii, shadow, motion, layout

${table([...group("space"), ...group("radius"), ...group("shadow"), ...group("motion"), ...group("layout")])}

## CSS primitives (\`${meta.sources.globals}\`)

${classes.map((c) => `- \`.${c.class}\` (line ${c.line})${c.tokens.length ? ` — uses ${c.tokens.map((t) => `\`${t}\``).join(", ")}` : ""}`).join("\n")}

## Components

${components.length} modules participate in the design system. Full manifest with per-file token
usage in \`components.json\`.

${components.map((c) => `- \`${c.path}\` — ${c.tokens.length} tokens, ${c.cssClasses.length} classes`).join("\n")}

## Known drift (candidates to tokenise)

${driftRows.length ? ["| Source | Detector | Literals |", "| --- | --- | --- |", ...driftRows].join("\n") : "None detected."}
`;
}

async function main() {
  const outFlag = process.argv.indexOf("--out");
  const outDir = resolve(REPO_ROOT, outFlag > -1 ? process.argv[outFlag + 1] : ".claude/design-system");
  const check = process.argv.includes("--check");

  const [tokensCss, globalsCss, pkgRaw] = await Promise.all([
    readRepoFile(SOURCES.tokens),
    readRepoFile(SOURCES.globals),
    readRepoFile(SOURCES.packageJson),
  ]);

  const entries = parseCustomProperties(tokensCss);
  const { tree, flat } = buildTokenTree(entries);
  const literals = new Set(flat.map((t) => normalizeLiteral(t.value)));
  const classes = parseCssClasses(globalsCss, SOURCES.globals);
  const components = await scanComponents(literals);
  const pkg = JSON.parse(pkgRaw);

  const meta = {
    name: "LAED",
    slug: "laed",
    description:
      "Design system for LAED — an EU-hosted, sovereignty-first secure collaboration PWA. Warm paper/ink base, navy for shared project surfaces, green for private and trust-bearing surfaces.",
    generator: { script: "scripts/export-design-system.mjs", version: GENERATOR_VERSION },
    generatedAt: new Date().toISOString(),
    git: gitInfo(),
    sources: SOURCES,
    stack: {
      framework: `next@${pkg.dependencies?.next ?? "unknown"}`,
      css: `tailwindcss@${pkg.devDependencies?.tailwindcss ?? "unknown"} (v4 CSS-first, no tailwind.config)`,
      tokenTransport: "CSS custom properties consumed as Tailwind arbitrary values, e.g. bg-[var(--laed-paper)]",
    },
    themes: ["light"],
    scopeAccents: { private: "--laed-private", project: "--laed-navy" },
    principles: [
      ".cursor/rules/security-sovereignty.mdc",
      ".cursor/rules/mobile-pwa-ux.mdc",
      ".cursor/rules/frontend-nextjs.mdc",
    ],
    counts: {
      tokens: flat.length,
      cssPrimitives: classes.length,
      components: components.length,
      driftFindings: components.reduce((sum, c) => sum + c.drift.length, 0),
    },
  };

  const files = {
    "tokens.json": { $description: meta.description, ...tree },
    "components.json": {
      $description: "Modules that consume LAED design tokens, with per-file token and class usage.",
      generatedAt: meta.generatedAt,
      cssPrimitives: classes,
      components,
    },
    "meta.json": meta,
    "DESIGN_SYSTEM.md": markdownBrief({ flat, tree, classes, components, meta }),
  };

  const rendered = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [
      name,
      typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`,
    ]),
  );

  const summary =
    `${meta.counts.tokens} tokens · ${meta.counts.cssPrimitives} css primitives · ` +
    `${meta.counts.components} components · ${meta.counts.driftFindings} drift findings`;

  if (check) {
    const stale = [];
    for (const [name, body] of Object.entries(rendered)) {
      const existing = await readFile(join(outDir, name), "utf8").catch(() => null);
      if (existing === null) stale.push(`${name} (missing)`);
      else if (stripVolatile(existing) !== stripVolatile(body)) stale.push(name);
    }

    console.log(summary);
    for (const component of components) {
      for (const finding of component.drift) {
        console.error(`drift  ${component.path}  ${finding.detector}: ${finding.values.join(", ")}`);
      }
    }
    for (const name of stale) console.error(`stale  ${name}`);

    if (meta.counts.driftFindings > 0 || stale.length > 0) {
      const hints = [];
      if (meta.counts.driftFindings > 0) {
        hints.push(`Replace the literals above with tokens, adding any missing ones to ${SOURCES.tokens}.`);
      }
      if (stale.length > 0) hints.push("Regenerate: node scripts/export-design-system.mjs");
      console.error(
        `\nFAIL — ${meta.counts.driftFindings} drift finding(s), ${stale.length} stale artifact(s).\n` +
          hints.join("\n"),
      );
      process.exit(1);
    }
    console.log("\nOK — no drift, export up to date.");
    return;
  }

  await mkdir(outDir, { recursive: true });
  for (const [name, body] of Object.entries(rendered)) {
    await writeFile(join(outDir, name), body, "utf8");
    console.log(`wrote ${relative(REPO_ROOT, join(outDir, name))} (${body.length} bytes)`);
  }
  console.log(`\n${summary}`);
}

main().catch((error) => {
  console.error(`export-design-system failed: ${error.message}`);
  process.exit(1);
});
