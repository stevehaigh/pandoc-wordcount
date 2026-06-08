# CLAUDE.md — pandoc-wordcount VS Code extension

## What this extension does

Shows a live word count for `.md` and `.qmd` files in the VS Code status bar,
using Pandoc to strip markup before counting:

```
pandoc --from=markdown --to=plain <file> | wc -w
```

When text is selected in source mode the display becomes `sel / total words`.

## Files

| File | Purpose |
|------|---------|
| `extension.js` | Entire extension — activation, counting, status bar |
| `package.json` | Extension manifest, activation events, commands |
| `.vscodeignore` | Files excluded from the packaged .vsix |
| `README.md` | User-facing docs |

## Build & install

```bash
npm install                   # installs @vscode/vsce
npm run package               # → pandoc-wordcount-0.1.0.vsix
code --install-extension pandoc-wordcount-0.1.0.vsix
```

Reload VS Code after install (`Cmd+Shift+P → Reload Window`).

## Current known limitation — visual editor selection

VS Code's extension API does not expose selection-change events for
webview-based editors. The Quarto visual editor is a webview (ProseMirror),
so `onDidChangeTextEditorSelection` never fires when it is active.

**The fix** is a PR to the Quarto monorepo (`quarto-dev/quarto`) to expose
selected text via a public command or event. See the session plan for details:

```
~/.copilot/session-state/b91c8006-dcff-43b0-b9fd-f289b435cf0b/plan.md
```

### What the Quarto PR needs to provide

A VS Code command (preferred) that our extension can call:

```typescript
const text: string | undefined =
  await vscode.commands.executeCommand('quarto.editor.getSelectedText');
```

Or an exported activation event / observable we can subscribe to.

### How this extension will consume it

In `extension.js`, in the `activate()` function, add:

```javascript
// Listen for selection changes from Quarto visual editor
// (fires only when activeTextEditor is undefined, i.e. visual mode is active)
const quartoExt = vscode.extensions.getExtension('quarto.quarto');
if (quartoExt) {
  // Subscribe to quarto.onDidChangeSelection if/when that API ships, OR
  // poll via executeCommand on a debounce triggered by tabGroups change.
}
```

The full-file count already works in visual mode via the Tab API
(`tabGroups.onDidChangeTabs` + reading the URI from the active tab input).

## Architecture notes

### getActiveUri()
Uses `vscode.window.activeTextEditor?.document.uri` first, then falls back to
`vscode.window.tabGroups.activeTabGroup.activeTab.input.uri` for webview tabs.
This is what makes the full-file count work in Quarto visual mode.

### Word counting
- **Full file**: `pandoc --from=markdown --to=plain "<path>" | wc -w` (disk read)
- **Selection**: `pandoc --from=markdown --to=plain` via stdin (no temp file)
- **Debounce**: edits → 1 s; selection changes → 400 ms

### Status bar display
- No selection: `✏ 1,234 words`
- Selection active: `✏ 42 / 1,234 words`
- Visual mode (no selection API): `✏ 1,234 words` (total only)
- Error: `⚠ wc error` (tooltip shows stderr)
- Click the item → manual refresh (`pandoc-wordcount.refresh` command)

## Requirements (runtime)

- `pandoc` on `$PATH`
- `wc` (macOS/Linux standard)
