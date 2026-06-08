# Design: Quarto visual-editor selection-change event

Status: proposed
Audience: Quarto maintainers (`quarto-dev/quarto`) + this extension
Related: `quarto.editor.getSelectedText` command (already added in the fork)

## Problem

VS Code does not raise `onDidChangeTextEditorSelection` for webview-based
editors. The Quarto visual editor is a ProseMirror webview, so an external
extension has no event to learn that the user changed their selection there.

This extension currently works around that by **polling** the
`quarto.editor.getSelectedText` command every 500 ms while a visual editor is
the active tab (see `startVisualModePolling()` in `extension.js`). Polling
works but is wasteful (runs while idle), adds up to 500 ms of latency, and
needs start/stop lifecycle plumbing.

Quarto already knows the exact moment the selection changes — it just doesn't
tell anyone. This design adds a push notification so consumers can subscribe
instead of poll.

## What already exists

The plumbing is mostly in place; only the last hop to an external consumer is
missing.

| Layer | Symbol | Behaviour |
|-------|--------|-----------|
| ProseMirror editor | `Editor` emits `StateChangeEvent` | Fires on **every** transaction, including selection-only changes (`editor.ts`, `dispatchTransaction`). |
| Webview bridge | `syncEditorToHost()` (`apps/vscode-editor/src/sync.ts`) | Already subscribes to `StateChangeEvent` and calls `host.onEditorStateChanged(editor.getEditorSourcePos())`. |
| Extension host | `onEditorStateChanged` (`apps/vscode/src/providers/editor/editor.ts`) | Receives the notification; today only stores a source position. |
| Public API | `QuartoExtensionApi` (`apps/vscode/src/api.ts`) | Returned from `activate()`; the idiomatic place to expose an event. |
| Selection text | `Editor.getSelectedText()` | Already added in the fork; returns markdown for the current selection, `''` when empty. |

So the event can ride the **existing** state-change notification — we extend
its payload with the selected text and re-emit it as a public VS Code event.

## Proposed API

Add an event to the already-exported `QuartoExtensionApi`:

```typescript
import * as vscode from 'vscode';

export interface VisualEditorSelectionChange {
  /** Document whose visual editor changed selection. */
  uri: vscode.Uri;
  /** Selected text as markdown; '' when the selection is empty/collapsed. */
  selectedText: string;
}

export interface QuartoExtensionApi {
  // ...existing members (getQuartoPath, getQuartoVersion, isQuartoAvailable)...

  /**
   * Fires when the selection changes in a Quarto visual (webview) editor.
   * Also fires with selectedText === '' when the editor is blurred, the
   * selection is cleared, or the visual editor is closed, so consumers can
   * reset any selection-derived UI.
   *
   * Fires only when the selected text actually changes (de-duplicated against
   * the previous value). Consumers that do expensive work per change should
   * still debounce.
   */
  onDidChangeVisualEditorSelection: vscode.Event<VisualEditorSelectionChange>;
}
```

External consumers subscribe through the exported API (no type import needed —
they copy the interface, as the existing API doc instructs):

```typescript
const quartoExt = vscode.extensions.getExtension('quarto.quarto');
if (quartoExt) {
  if (!quartoExt.isActive) { await quartoExt.activate(); }
  const api = quartoExt.exports as QuartoExtensionApi;
  context.subscriptions.push(
    api.onDidChangeVisualEditorSelection(e => {
      // e.uri, e.selectedText
    })
  );
}
```

## Data flow

```
ProseMirror selection change
  → Editor emits StateChangeEvent                     (already happens)
  → sync.ts handler reads editor.getSelectedText()    (new: include in payload)
  → host.onEditorStateChanged({ sourcePos, selectedText })  (extend payload)
  → VisualEditorProvider re-emits on a shared EventEmitter
  → QuartoExtensionApi.onDidChangeVisualEditorSelection fires  (new)
  → external extension's listener runs
```

Two concrete edits beyond what the fork already has:

1. **Carry the text.** In `sync.ts`, where the webview already calls
   `host.onEditorStateChanged(...)` on `StateChangeEvent`, include
   `editor.getSelectedText()` in the payload. The RPC for
   `VSC_VEH_OnEditorStateChanged` and the `onEditorStateChanged` host signature
   grow one field. (`getSelectedText` is synchronous and cheap.)

2. **Re-emit publicly.** `VisualEditorProvider` owns a module-level
   `vscode.EventEmitter<VisualEditorSelectionChange>`. Its `onEditorStateChanged`
   implementation fires the emitter with `{ uri: document.uri, selectedText }`,
   de-duplicated against the last value for that uri. `createQuartoExtensionApi`
   exposes `emitter.event` as `onDidChangeVisualEditorSelection`.

## Design decisions

- **Push the text, not just a signal.** The webview already has the markdown in
  hand, so including it avoids a follow-up `getSelectedText` round-trip for the
  common case. The `getSelectedText` command stays as an on-demand getter and
  as the backward-compatible fallback.
- **De-duplicate, don't debounce, in Quarto.** `StateChangeEvent` is noisy
  (every cursor move). Quarto suppresses no-op repeats by comparing against the
  previous `selectedText`, but leaves time-based debouncing to consumers, who
  know their own cost. This extension already debounces selection counts by
  400 ms and would keep doing so.
- **Empty selection is a real event.** Firing with `selectedText === ''` on
  blur / clear / close lets consumers reset UI without a separate "editor
  deactivated" signal.
- **`uri` included.** Disambiguates when multiple visual editors are open;
  consumers filter to the document they care about.

## Consumer changes in this extension

Once the event ships, `extension.js`:

- Drops `startVisualModePolling()` / `stopVisualModePolling()` and the
  `setInterval` loop.
- On activation, looks up the Quarto extension and subscribes to
  `onDidChangeVisualEditorSelection`, routing each change through the existing
  `scheduleSelectionCount()` path.
- Keeps the `quarto.editor.getSelectedText` command call as a fallback when the
  event is absent (older Quarto), so the extension degrades gracefully.

## Backward compatibility

Additive only. The `getSelectedText` command is unchanged. Extensions built
against today's API keep working; the event is opt-in. If Quarto without the
event is installed, this extension falls back to polling.

## Open questions

- Should the event also carry a structural selection (block range / source
  position) for consumers that need more than text? Out of scope here; the
  source position already flows through `onEditorStateChanged` and could be
  added to the payload later without breaking the event shape.
- Very large selections send a large string per change. De-duplication bounds
  the frequency; if this proves heavy, a signal-only variant plus on-demand
  `getSelectedText` is a fallback design.
