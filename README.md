# Pandoc Word Count

Shows a real word count for Markdown (`.md`) and Quarto (`.qmd`) files in the
VS Code status bar, using Pandoc to strip markup before counting.

## How it works

```
pandoc --from=markdown --to=plain <file> | wc -w
```

Pandoc converts the file to plain text first, so headings, links, code blocks,
YAML front matter, and other markup are excluded from the count. The result
appears in the bottom-right status bar. Click it to force a refresh.

## Requirements

- `pandoc` must be on your `PATH`
- `wc` (standard on macOS/Linux)

## Features

- Updates on file switch, save, and edit (1 s debounce)
- Works for both `.md` and `.qmd` files (compatible with the Quarto extension)
- Click the status bar item to manually refresh

## Install from source

```bash
npm install          # install vsce
npm run package      # produces pandoc-wordcount-0.1.0.vsix
code --install-extension pandoc-wordcount-0.1.0.vsix
```
