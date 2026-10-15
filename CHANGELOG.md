# Changelog

## Unreleased

- Blank nodes without a label are named after the values they hold, such as `dateTime gteq launchDate` for an ODRL constraint, instead of "anonymous".
- "Instance of" links to a class with more than 15 instances are hidden by default, because dozens of dotted lines meeting in one class hide everything else. The details panel still names each node's class, and a filter brings the links back.
- In a graph with more than 300 edges, edge labels show only around the selected node, so the labels no longer cover the graph.

## 1.1.0

- Edge labels sit beside their line instead of on it, so the line and arrow no longer run through the text. SVG export matches.
- Several self loops on one node fan out around it instead of stacking, so each label is readable.
- SHACL shapes read clearly. Node shapes get their own kind and legend entry, and simple property shapes become arrows labeled with their path and counts (`name [1..1]`) instead of "anonymous" nodes.
- The graph fits the panel when it opens, even while the panel is still growing, so labels are readable from the start. Labels are white in dark themes.
- The "Open Visualizer" command is now "Open with Triples by Radost IT" in the Explorer menu, the editor title bar and the Command Palette.

## 1.0.3

- CI tags each new `package.json` version on `main` and starts the release.

## 1.0.2

- Installs on VS Code 1.101 and newer. 1.0.0 required 1.140, which blocked older editors.

## 1.0.1

- "Go to line" only opens the documents shown in the view. A crafted ontology can no longer make the visualizer open other files.

## 1.0.0

- First stable release. All planned milestones are complete: graph and hierarchy views, every supported format, semantic diff with Git and pull request entry points, minimap and export.

## 0.17.0

- A `Release` workflow publishes to the Marketplace and Open VSX when a `v<version>` tag is pushed, and attaches the `.vsix` to a GitHub release.

## 0.16.0

- Compare with HEAD on a new file that Git does not track yet now shows every entity as added, instead of failing with "Git relative path not found".

## 0.15.0

- Tree diagram: a class with several parents sits under its first parent, and links to its other parents are drawn dashed, so edges no longer cross other branches.
- Light theme: nodes outside the selected neighborhood stay faintly visible instead of almost disappearing.

## 0.14.0

- Minimap: an optional overview of the whole graph in the corner of the graph view. Click or drag on it to move the view. Toggle it with the Minimap button.

## 0.13.0

- Manchester Syntax: `.omn` files, and `.owl` files written in Manchester Syntax, now open in the graph and hierarchy views and work in the semantic diff.

## 0.12.0

- OWL/XML: `.owx` files, and `.owl` files written in OWL/XML, now open in the graph and hierarchy views and work in the semantic diff.

## 0.11.0

- OWL Functional Syntax: `.ofn` files, and `.owl` files written in Functional Syntax, now open in the graph and hierarchy views and work in the semantic diff.

## 0.10.0

- Translations: the webview now reads the same `l10n` bundle as the extension, so adding `l10n/bundle.l10n.<locale>.json` translates the whole UI. See "Development" in the README.

## 0.9.0

- When several nodes share a label, the graph and the hierarchy add the compact name, such as `Person (foaf:Person)`, so they can be told apart.

## 0.8.0

- The graph keeps its zoom and pan after a window reload.

## 0.7.0

- Keyboard: with a node selected, arrow keys move to the connected node in that direction and Enter focuses on it. With nothing selected, Enter selects the node in the middle of the view. Screen readers announce the selected node's label, kind and change status.

## 0.6.0

- GitHub Pull Requests: "View Ontology Changes" in the pull request file tree opens the semantic diff of the PR base against the head.

## 0.5.0

- Source Control: "View Ontology Changes" on a file under Changes compares the staged file with the working copy, and the new "View Staged Ontology Changes" under Staged Changes compares HEAD with the staged file, the same as Git's own diffs.
- Comparing with a branch or commit after comparing with HEAD now opens a new panel instead of showing the old comparison.

## 0.4.0

- "Show only changes" now also filters the hierarchy view: it keeps changed classes and properties and the path from each one up to its root.

## 0.3.0

- The changes panel groups changes by entity: each changed class, property or individual lists its added and removed statements underneath. Short lists start expanded.

## 0.2.1

- CI: the performance budget allows for slower shared runners, and the VS Code download for integration tests is cached.

## 0.2.0

- Large files: above 20,000 nodes the graph view no longer draws everything at once. It offers the hierarchy view or "Draw anyway", and search shows the neighborhood of the chosen node.

## 0.1.2

- Tests: a 5,000-node ontology must parse, project and lay out in under 2 seconds, and the same file must always give the same layout.

## 0.1.1

- Continuous integration: lint, format check, unit tests, integration tests and packaging run on Linux, Windows and macOS for every push and pull request.

## 0.1.0

First release.

- Graph view of Turtle, TriG, N-Triples, N-Quads, N3, RDF/XML (`.owl`, `.rdf`) and JSON-LD files.
- Readable labels from `rdfs:label` in the VS Code language, distinct shapes and colors per kind, and a legend.
- Declutter options, filters by kind, namespace and relation, search, neighborhood focus, force and layered layouts.
- Hierarchy view of classes and properties as an outline or a tree diagram, with cross-selection.
- Details panel with IRI, annotations, data values and relations.
- Semantic diff against HEAD, any branch, tag or commit, another file, or the open diff editor.
- Summary panel with added, removed and modified counts and a list of changes.
- Export as SVG or PNG.
- Live refresh while editing, and parse errors with a "Go to line" link.
- Visual refresh: soft halos around nodes, bolder labels, a dot grid behind the graph, rounded panels, and line samples for each edge style in the legend.
- The packaged extension now includes the webview stylesheet.
- README screenshots and example ontologies in `examples/`.
