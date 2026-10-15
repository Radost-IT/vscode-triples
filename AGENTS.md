# AGENTS.md

Instructions for AI coding agents (and humans) working on **Triples**, a VS Code extension by Radost IT.

## What we are building

Triples is a VS Code extension that visualizes ontology files (Turtle `.ttl`, RDF/XML `.owl`/`.rdf`, JSON-LD, N-Triples, TriG, and more) as an interactive graph. Primary goals, in priority order:

1. **Easy to read and understand.** A person who has never seen the file should grasp its structure within seconds. Readability beats completeness.
2. **Navigate large graphs comfortably.** Zoom, pan, search, focus on a neighborhood.
3. **Two views of the same data.** Toggle between a **graph view** (nodes and edges) and a **hierarchy view** (class/property tree).
4. **Semantic diff.** Show what changed between two versions of an ontology (for example the PR base vs the PR head) as a colored overlay on the graph, not as a text diff.

Non-goals (for now): editing ontologies, reasoning/inference, SPARQL querying, a hosted web service.

## Identity

| Item             | Value                      |
| ---------------- | -------------------------- |
| Display name     | `Triples`                  |
| Extension `name` | `triples`                  |
| Publisher ID     | `RadostIT`                 |
| Extension ID     | `RadostIT.triples`         |
| Repo             | `Radost-IT/vscode-triples` |
| License          | MIT                        |

Do not put "by Radost IT" in `displayName`; the Marketplace shows the publisher automatically.

## Tech stack

- TypeScript everywhere, `strict` mode on.
- VS Code extension host code in `src/extension/`.
- Webview UI in `src/webview/` (bundled separately). Plain TypeScript plus a small framework is fine (Preact or Svelte preferred; avoid heavy frameworks).
- Bundler: esbuild (one bundle for the extension host, one for the webview).
- Parsing (in a Web Worker or worker thread, never on the UI thread):
  - Turtle, TriG, N-Triples, N-Quads: `n3`
  - RDF/XML (most `.owl` files): `rdfxml-streaming-parser`
  - JSON-LD: `jsonld-streaming-parser` with an offline document loader (see `docs/decisions.md`)
  - OWL Functional Syntax and Manchester Syntax: later milestone
- Graph rendering: Cytoscape.js (canvas) with `fcose` for force layout and `dagre` for hierarchy layout. If considering `elkjs`, note it is EPL-2.0; confirm license compatibility first.
- Tests: Vitest for unit tests, `@vscode/test-electron` for integration tests.
- Lint/format: ESLint + Prettier.

Before adding any dependency, check its license and bundle size and record it in `docs/dependencies.md`.

## Suggested layout

```
src/
  extension/        activation, commands, custom editor provider, git integration
  core/             pure TS, no VS Code imports (parsing, model, diff, layout inputs)
    parse/          one module per format, all producing the same triple stream
    model/          OntologyModel: classes, properties, individuals, edges, prefixes
    diff/           semantic diff engine
    view/           what to draw: declutter, filters, hierarchy, search, neighborhood
  webview/          UI: graph view, hierarchy view, toolbar, legend, search, diff overlay, parser worker
test/
  fixtures/         small ttl/owl/jsonld files, plus before/after pairs for diff tests
  integration/      tests that run inside VS Code
docs/
```

Keep `src/core` free of VS Code and DOM APIs so it can be unit tested and reused (for example in a CLI or CI check later).

## Commands

Keep these working and documented in `package.json`:

```
npm install
npm run build        # bundle extension + webview
npm run watch        # rebuild on change
npm run lint
npm test             # unit tests
npm run test:vscode  # integration tests in the extension host
npm run package      # produce .vsix
```

Press F5 in VS Code to launch the Extension Development Host.

## Product requirements

### 1. Opening files

- Activate for `.ttl`, `.owl`, `.rdf`, `.nt`, `.trig`, `.jsonld` (and `.owx`, `.omn` when supported).
- Provide a command "Triples: Open Visualizer" and an editor title button when a supported file is open.
- Open the visualizer **beside** the text editor by default. Support a custom editor option too.
- Auto-refresh (debounced) when the file changes or is saved. Preserve zoom, pan, and selection across refreshes.
- Show clear, friendly parse errors with line numbers and a "go to line" link. Never show a blank panel.

### 2. Graph view

- Nodes and directed, labeled edges.
- **Readable labels first.** Use `rdfs:label` (prefer the VS Code UI language, then English, then any), falling back to the local name, never a full IRI unless asked. Show the full IRI and all annotations in a details panel on hover or click.
- **Visual encoding** (consistent and shown in a legend):
  - Classes, object properties, datatype properties, individuals, datatypes/literals each get a distinct shape and color.
  - `rdfs:subClassOf` edges look different from other relations (for example thin, with a hollow arrowhead).
  - Respect the VS Code light, dark, and high-contrast themes; do not rely on color alone.
- **Declutter by default:** hide `owl:Thing`, `rdf:type owl:Class` noise, and annotation-only triples; collapse literals into the node detail instead of drawing a node for each. All of this is toggleable.
- Zoom (wheel, pinch, buttons, fit-to-screen), pan (drag), minimap optional.
- Click to select; highlight the neighborhood and dim the rest. Double-click to focus on N hops (default 1, adjustable).
- Search box with autocomplete by label or IRI; selecting a result centers and highlights it.
- Filters: by node kind, by namespace/prefix, by relation type. Namespace prefixes are collapsed (`foaf:Person`).
- Layouts: force-directed and layered. Layout should be stable (same file gives same picture) and fast.
- Export current view as SVG and PNG.

### 3. Hierarchy view

- Toggle in the toolbar between **Graph** and **Hierarchy**; remember the choice per file.
- Tree of classes by `rdfs:subClassOf` (and a separate tab or section for object/data properties by `rdfs:subPropertyOf`). Handle multiple inheritance (a node can appear under several parents, marked).
- Collapsible, with expand all / collapse all, search, and instance counts.
- Selecting a node in one view selects and reveals it in the other.
- Also offer a left-to-right or top-down tree _diagram_ layout, not just an outline list.

### 4. Semantic diff (two ontologies)

Show how an ontology changed, for example between the PR base and the PR head.

- Compare **triples (parsed graphs)**, not text, so reordering, whitespace, prefix changes, and syntax conversions (ttl to owl) do not create noise.
- Blank nodes must be handled properly. OWL restrictions, unions, and lists are blank-node structures; use RDF canonicalization (RDFC-1.0) or structural matching so unchanged restrictions are not reported as changed.
- Overlay on the graph and hierarchy views:
  - **Added**: green; **Removed**: red (ghosted or dashed); **Modified** (same node, changed label/annotation/domain/range/etc.): amber; **Unchanged**: normal or dimmed.
  - Toggle "show only changes" (with a small context ring of unchanged neighbors).
- Summary panel: counts of added/removed/modified classes, properties, individuals, and a clickable list of changes grouped by entity. Clicking jumps to the node.
- Inputs, all supported:
  - Current file vs `HEAD` or vs the working tree (via the built-in `vscode.git` extension API).
  - Current file vs any branch, tag, or commit (quick pick).
  - Two arbitrary files ("Compare Two Ontologies").
  - From a Git/SCM diff or the GitHub Pull Requests extension: a "View ontology changes" action on a changed ontology file, comparing the PR base with the head.
- Renamed IRIs are shown as removed + added (do not guess renames in v1).
- Handle the case where one side does not exist (new or deleted file).

### 5. Quality bars

- **Performance:** parse and first render of a 5,000-node ontology under 2 seconds; stays interactive up to ~20,000 nodes by using canvas rendering, progressive disclosure (collapse large subtrees, "show more"), and worker-based parsing.
- **Offline and private:** no network calls, no telemetry in v1, no remote scripts or fonts. Webview uses a strict Content-Security-Policy and local resources only.
- **Accessibility:** keyboard navigation, focus rings, screen-reader labels for toolbar controls, sufficient contrast.
- **Robustness:** never crash on malformed input, huge files, or unknown formats; degrade with a clear message.

## Milestones

1. **M1 Skeleton:** extension scaffold, command opens a webview, parse Turtle with `n3`, draw a basic graph with zoom/pan. Fixtures and unit tests.
2. **M2 Readability:** labels, legend, node kinds, declutter toggles, details panel, search, filters, export.
3. **M3 Hierarchy:** hierarchy view, toggle, cross-selection.
4. **M4 More formats:** RDF/XML (`.owl`), JSON-LD, N-Triples, TriG; auto-refresh; good error reporting.
5. **M5 Diff:** semantic diff core with blank-node handling, overlay, summary panel, git integration, two-file compare.
6. **M6 PR workflow and polish:** GitHub PR entry point, performance tuning, accessibility pass, docs, Marketplace + Open VSX publishing.

Work milestone by milestone. Each milestone should leave the extension in a working, releasable state.

## Conventions for agents

- Make small, focused changes. Add or update tests with every behavior change, especially in `src/core`.
- Diff engine changes require before/after fixture pairs in `test/fixtures/diff/` covering: added/removed/modified entities, reordered file, prefix change, blank-node restrictions unchanged vs changed, ttl-to-owl conversion with identical content.
- Do not read or write outside the workspace; do not add network access.
- Do not add dependencies without checking license and size (see above).
- Use `vscode.Uri` and the `workspace.fs` API instead of Node `fs` in extension code where practical (web-extension friendliness).
- UI strings should be centralized for future localization.
- Update `README.md` and `CHANGELOG.md` when user-visible behavior changes.
- If a requirement here is ambiguous or conflicts with reality, leave a note in `docs/decisions.md` and pick the option that favors readability for the end user.

## Definition of done (per feature)

- Works on the fixtures in `test/fixtures/` in light and dark themes.
- Unit tests pass; lint passes; no new warnings.
- Handles error and empty states.
- Documented in README if user-facing.

## Non-negotiable rules

1. **Never read `.env` contents.** Local configuration lives in a `.env` file that holds real keys. Never open, print, grep, diff, or otherwise read `.env` or any `.env.*` file except `.env.example`, and never paste its values into prompts, logs, tests, or commits. `.env` stays in `.gitignore`.
   - Validate the whole config with zod at startup and fail fast with a clear message naming the missing key, never its value.

2. Think Before Coding
   Don't assume. Don't hide confusion. Surface tradeoffs.
   Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them.
- If a simpler approach exists, say so.
- If something is unclear, stop. Name what's confusing.
- Do not read .env files.
- Never use "—" in documents as it's a typical sign is LLM-generated content, replace it with "-" if needed.

3. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No “flexibility” that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 80, rewrite it.

4. Surgical Changes

Touch only what you must. Clean up only your own mess.

- Don't “improve” adjacent code or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice dead code, mention it — don't delete it.

5. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- “Add validation” → “Write tests, then make them pass”
- “Fix the bug” → “Reproduce it in a test, then fix”
- “Refactor X” → “Ensure tests pass before and after”

## Code quality: no AI slop

Write code a senior engineer would be happy to sign. Judges will read it.

**Readable without comments**

- Names explain intent: `captureAuthorizedPayment`, not `handlePayment2` or `processData`.
- Small functions with one job, early returns, no deep nesting, no boolean flag parameters that switch behavior.
- Prefer plain functions and data over classes and patterns. No factories, managers, or abstract base classes unless there are at least two real implementations today.

**Comments**

- Comment _why_, never _what_. If code needs a comment to explain what it does, rename or restructure it instead.
- No banner comments, no section dividers, no emojis, no comments restating the line below, no commented-out code.
- JSDoc only on exported functions whose contract is not obvious from the types.

**Honest code**

- No placeholders, stubs, `TODO` leftovers, or fake success paths. If something is not implemented, throw a typed `NotImplementedError` and say so in your reply.
- No mocks or hardcoded data in production code paths. Seed data lives only in `scripts/`.
- Do not swallow errors. Catch only where you can handle or translate the error; otherwise let it propagate.
- No speculative features, options, or config flags nobody asked for.

**Lean code**

- No dead code, unused exports, unused dependencies, or duplicate helpers. Search before adding a helper.
- Add a dependency only when it removes meaningful code; state why in the commit message.
- Keep diffs focused. Do not reformat or rename unrelated code.

**Human-readable output**

- Code, README, logs, and commit messages use short, plain sentences. Avoid filler and hype words such as "seamless", "robust", "leverage", "cutting-edge", "revolutionary", "delve", and "empower".
- Logs are structured JSON with a short message and context fields. Redact tokens, emails, and secrets.
- Commit messages follow Conventional Commits and say what changed and why in one or two lines.

## Technical conventions

- Always check for latest compatible and secure libraries.

## How to work

1. Restate the task in one or two sentences and list the files you expect to touch.
2. Make the smallest change that fully solves the task, with tests.
3. Commit and push each finished task. One task, one commit. The message is short, plain, and human readable: say what changed and why (Conventional Commits format).
4. If a rule here blocks progress or seems wrong, stop and ask. Do not work around it silently.
5. When you need the human to do something outside the code (accounts, keys, console clicks), tell them, and update the Deploy section of `README.md` if the setup changes.
