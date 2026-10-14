# Triples

**See your ontology.** Triples turns Turtle, OWL and other RDF files into a clear, interactive graph inside VS Code, and shows what changed between two versions.

## Features

- **Graph view**: classes, properties and individuals as nodes with labeled arrows. Zoom, pan, fit to screen, force or layered layout.
- **Hierarchy view**: class and property trees by `rdfs:subClassOf` and `rdfs:subPropertyOf`, as an outline or a tree diagram. Multiple parents are marked. Selection stays in sync with the graph view.
- **Readable by default**: labels from `rdfs:label` in your VS Code language, collapsed prefixes (`foaf:Person`), distinct shapes and colors per kind, and a legend. `owl:Thing`, annotation links and data values are hidden until you turn them on.
- **Details panel**: full IRI, annotations, data values and relations of the selected node.
- **Search and focus**: find any node by label or IRI. Double-click a node to focus on its neighborhood.
- **Filters**: by node kind, namespace and relation type.
- **Semantic diff**: compare two versions of an ontology. Added nodes are green, removed are red and dashed, modified are amber. Reordering, whitespace, prefix changes and syntax changes (Turtle to RDF/XML) are ignored, because Triples compares the data, not the text. Unchanged OWL restrictions stay unchanged, even when their blank nodes get new labels.
- **Export**: the current view as SVG or PNG.
- **Live**: the view refreshes while you edit, and keeps zoom, pan and selection.
- **Clear errors**: parse errors show the line and a "Go to line" link.
- **Private and offline**: no network access, no telemetry. JSON-LD remote contexts are refused, not fetched.

## Supported formats

| Format                   | Extensions            |
| ------------------------ | --------------------- |
| Turtle, N3               | `.ttl`, `.n3`         |
| RDF/XML (OWL)            | `.owl`, `.rdf`        |
| JSON-LD                  | `.jsonld`             |
| N-Triples, N-Quads, TriG | `.nt`, `.nq`, `.trig` |

`.owl` files in Turtle syntax are detected and work too. OWL/XML (`.owx`), Functional Syntax and Manchester Syntax (`.omn`) are not supported yet; Triples says so instead of showing a parse error.

## Usage

1. Open an ontology file.
2. Click the Triples button in the editor title bar, or run **Triples: Open Visualizer** from the Command Palette. The visualizer opens beside the text.
3. Use the toolbar to switch between **Graph** and **Hierarchy**, search, filter, change the layout and export. Triples remembers the view per file.

You can also right-click a file and choose **Open With... > Triples Visualizer**.

### Comparing versions

- **Triples: Compare Ontology with HEAD** shows the uncommitted changes of the current file.
- **Triples: Compare Ontology with Branch, Tag or Commit...** lets you pick any Git revision.
- **Triples: Compare Two Ontologies** compares two files. Select two files in the Explorer, or pick them in a dialog.
- **Triples: View Ontology Changes** is in the Source Control view on a changed file, and in the title bar of any diff editor. This includes pull request diffs from the GitHub Pull Requests extension, so you can review the PR base against the head.

The changes panel lists added, removed and modified classes, properties and individuals. Click an entry to jump to the node. In the filters, **Show only changes** hides everything else except a ring of unchanged neighbors.

A new or deleted file shows everything as added or removed. A renamed IRI shows as removed plus added.

## Development

Requires Node.js 22 or newer.

```
npm install
npm run build        # bundle extension and webview into dist/
npm run watch        # rebuild on change
npm run lint         # ESLint and type check
npm test             # unit tests (Vitest)
npm run test:vscode  # integration tests in a downloaded VS Code
```

Press **F5** in VS Code to start the Extension Development Host.

Source layout:

- `src/core`: parsing, model, diff and view logic. No VS Code or DOM APIs.
- `src/extension`: commands, panels, custom editor and Git integration.
- `src/webview`: the UI, plus the Web Worker that parses files.
- `test/fixtures`: sample ontologies and before/after pairs for diff tests.

Design notes are in [docs/decisions.md](docs/decisions.md) and dependency licenses in [docs/dependencies.md](docs/dependencies.md).

## Packaging

```
npm install
npm run package
```

This runs a production build and writes `triples-<version>.vsix`. Install it with:

```
code --install-extension triples-0.1.0.vsix
```

Run `npx vsce ls` to see which files go into the package.

## Deploy

Publishing needs accounts that only a maintainer can create:

1. **VS Code Marketplace**: create the publisher `radost-it` at https://marketplace.visualstudio.com/manage and a Personal Access Token in Azure DevOps with the scope "Marketplace (Manage)". Then run `npx vsce login radost-it` and `npx vsce publish`.
2. **Open VSX**: create an account at https://open-vsx.org, claim the `radost-it` namespace with `npx ovsx create-namespace radost-it -p <token>`, then run `npx ovsx publish triples-0.1.0.vsix -p <token>`.

Bump `version` in `package.json` and add a `CHANGELOG.md` entry before each release.

## License

[MIT](LICENSE)

## About

Built by [Radost IT](https://radostit.com).
