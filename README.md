# Pandoc Word Count

Shows a live word count for Markdown (`.md`) and Quarto (`.qmd`) files in the
VS Code status bar, using Pandoc to strip markup before counting.

When you select text in source mode, the display becomes `selection / total`.
Full-file counting also works in the **Quarto visual editor**. Selection
counting in the visual editor requires a Quarto extension change that is not
yet released — see [Visual editor support](#visual-editor-support).

## Why this exists

Word limits are usually about *prose* — the words a reader or grader actually
reads. But a Markdown or Quarto source file is full of things that aren't
prose: YAML front matter, heading syntax, link URLs, code blocks, figure and
table markup, citation keys. VS Code's built-in word count (and most naive
counters) count all of that, so the number it shows is inflated and doesn't
match what a marker counts. Running the document through Pandoc to plain text
first strips the markup, so the count reflects the words that count.

**Counting a selection** is the part that makes this useful day to day. If
you're writing to a word limit — an essay, an assignment, a journal abstract —
you rarely want the whole-file total. You want to know how long *this section*
is, or the body without the references, or whether the introduction is pulling
more than its share. Select the relevant text and the status bar shows
`selection / total`, so you can keep a section under its cap without deleting
and re-counting. This works the same whether you write in Markdown source or in
the Quarto visual editor.

## How it works

Pandoc converts the document to plain text first, so headings, links, YAML
front matter, and other markup are excluded from the count:

```
pandoc --from=markdown --to=plain <file>
```

The plain-text output is then word-counted in Node. Both the full file (passed
to pandoc as an argument) and the current selection (piped via stdin) use the
same pipeline, so the two numbers are comparable.

By default **code is also excluded** — code blocks, executable chunks
(```` ```{r} ````), and inline code — so the count reflects prose, which is
usually what a word limit refers to. See [Configuration](#configuration) to
include code.

The result appears in the bottom-right status bar. Click it to force a refresh.

## Features

- Live count, updating on file switch, save, and edit (1 s debounce)
- Selection count shown as `selection / total` (400 ms debounce)
- Code excluded from the count by default (configurable)
- Works for both `.md` and `.qmd` files (compatible with the Quarto extension)
- Full-file counting in the Quarto visual editor (works today)
- Selection counting in the Quarto visual editor (requires an unreleased Quarto
  extension change — see below)
- Click the status bar item to manually refresh

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `pandocWordcount.countCode` | `false` | Count code as words. When off, code blocks, executable chunks, and inline code are excluded so the count reflects prose. When on, all code is counted. |

## Requirements

- `pandoc` on your `PATH`

## Visual editor support

In source mode VS Code reports selection changes through its public API, so
selection counting works out of the box. The Quarto **visual editor** is a
webview, and VS Code does not expose selection-change events for webview
editors — so this extension cannot see the selection there using stock Quarto.

To make selection counting work in the visual editor, Quarto must expose the
selected text through a command this extension can call:

```js
const text = await vscode.commands.executeCommand('quarto.editor.getSelectedText');
```

This command is **not yet part of released Quarto**. It is implemented in a
fork and proposed upstream:

- Fork: <https://github.com/stevehaigh/quarto> (branch with the
  `quarto.editor.getSelectedText` command)

Until that change is released by the Quarto team, visual-editor selection
counting requires running a locally built Quarto extension from the fork. The
full-file count works in visual mode regardless, via the Tab API.

When the command is unavailable, the extension silently falls back to showing
the total word count only.

## Install from source

```bash
npm install          # install vsce
npm run package      # produces pandoc-wordcount-<version>.vsix
code --install-extension pandoc-wordcount-<version>.vsix
```

Reload VS Code after installing (`Cmd+Shift+P` → `Reload Window`).
