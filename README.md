# Pandoc Word Count

Shows a live word count for Markdown (`.md`) and Quarto (`.qmd`) files in the
VS Code status bar, using Pandoc to strip markup before counting.

When you select text in source mode, the display becomes `selection / total`.
Selection counting also works in the **Quarto visual editor** (see
[Visual editor support](#visual-editor-support) below).

## How it works

Pandoc converts the document to plain text first, so headings, links, code
blocks, YAML front matter, and other markup are excluded from the count:

```
pandoc --from=markdown --to=plain <file>
```

- **Full file**: the file is passed to pandoc as an argument and the resulting
  plain text is word-counted in Node.
- **Selection**: the selected text is piped through `pandoc --to=plain | wc -w`.

The result appears in the bottom-right status bar. Click it to force a refresh.

## Features

- Live count, updating on file switch, save, and edit (1 s debounce)
- Selection count shown as `selection / total` (400 ms debounce)
- Works for both `.md` and `.qmd` files (compatible with the Quarto extension)
- Selection counting in the Quarto visual editor (requires the Quarto changes
  described below)
- Click the status bar item to manually refresh

## Requirements

- `pandoc` on your `PATH`
- `wc` (standard on macOS/Linux) — used for selection counts

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
