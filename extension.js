'use strict';

const vscode = require('vscode');
const {
	isSupportedExtension,
	fmt,
	pandocCountText,
	pandocCountFile,
} = require('./lib/wordcount');

const SUPPORTED_LANGUAGES = new Set(['markdown', 'quarto']);

let statusBarItem;
let debounceTimer;
let selectionDebounceTimer;
let visualModePollingTimer;
let lastVisualSelectionText = '';

// Cache the last full-file word count so we can display "sel / total" quickly.
let lastTotalWords = null;
// Track the URI we last counted so stale results don't overwrite a new file.
let lastCountedUri = null;

/** True for .md/.qmd regardless of whether the Quarto extension is installed. */
function isSupportedUri(uri) {
	if (!uri || uri.scheme !== 'file') return false;
	return isSupportedExtension(uri.fsPath);
}

function isSupportedDocument(document) {
	if (!document) return false;
	if (SUPPORTED_LANGUAGES.has(document.languageId)) return true;
	return isSupportedUri(document.uri);
}

/** Whether to strip code from the count (the inverse of the countCode setting). */
function excludeCode() {
	return !vscode.workspace.getConfiguration('pandocWordcount').get('countCode', false);
}

/**
 * Returns the URI of the currently active file, even when the Quarto visual
 * editor is open (which makes window.activeTextEditor === undefined).
 * Falls back to the Tab API (VS Code 1.80+).
 */
function getActiveUri() {
	const editor = vscode.window.activeTextEditor;
	if (editor) return editor.document.uri;

	// Visual / custom editor — inspect the active tab's input.
	const activeTab = vscode.window.tabGroups?.activeTabGroup?.activeTab;
	if (!activeTab) return undefined;
	const input = activeTab.input;
	if (input && 'uri' in input) return input.uri;
	return undefined;
}

/**
 * Count words in the full file at `uri` and update the status bar.
 * Optionally also count words in `selectionText` (pandoc via stdin) and
 * display as "sel / total".
 */
async function updateCount(uri, selectionText) {
	if (!uri || !isSupportedUri(uri)) {
		statusBarItem.hide();
		lastTotalWords = null;
		lastCountedUri = null;
		return;
	}

	statusBarItem.text = '$(sync~spin) counting…';
	statusBarItem.show();
	lastCountedUri = uri.toString();

	try {
		const totalStr = await pandocCountFile(uri.fsPath, excludeCode());
		// Guard against a stale result arriving after the user switched files.
		if (lastCountedUri !== uri.toString()) return;

		lastTotalWords = totalStr;

		if (selectionText && selectionText.trim().length > 0) {
			const selStr = await pandocCountText(selectionText, excludeCode());
			statusBarItem.text = `$(pencil) ${fmt(selStr)} / ${fmt(totalStr)} words`;
			statusBarItem.tooltip =
				`Selection: ${fmt(selStr)} words\nTotal: ${fmt(totalStr)} words\n` +
				'(pandoc --to=plain | wc -w) — click to refresh';
		} else {
			statusBarItem.text = `$(pencil) ${fmt(totalStr)} words`;
			statusBarItem.tooltip =
				`${fmt(totalStr)} words (pandoc --to=plain | wc -w)\nClick to refresh`;
		}
		statusBarItem.command = 'pandoc-wordcount.refresh';
	} catch (err) {
		statusBarItem.text = err.message.startsWith('pandoc not found')
			? '$(warning) pandoc not found'
			: '$(warning) wc error';
		statusBarItem.tooltip = err.message;
	}
}

/**
 * Update only the selection portion of the display without re-running the
 * full-file count.  Used for rapid selection changes.
 */
async function updateSelectionOnly(selectionText) {
	if (lastTotalWords === null) return;

	if (!selectionText || selectionText.trim().length === 0) {
		statusBarItem.text = `$(pencil) ${fmt(lastTotalWords)} words`;
		statusBarItem.tooltip =
			`${fmt(lastTotalWords)} words (pandoc --to=plain | wc -w)\nClick to refresh`;
		return;
	}

	try {
		const selStr = await pandocCountText(selectionText, excludeCode());
		statusBarItem.text = `$(pencil) ${fmt(selStr)} / ${fmt(lastTotalWords)} words`;
		statusBarItem.tooltip =
			`Selection: ${fmt(selStr)} words\nTotal: ${fmt(lastTotalWords)} words\n` +
			'(pandoc --to=plain | wc -w) — click to refresh';
	} catch (_) {
		// Silently ignore transient errors on selection counts.
	}
}

/** Get the current selection text from the active editor (empty string if none). */
function getSelectionText() {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.selection.isEmpty) return '';
	return editor.document.getText(editor.selection);
}

function scheduleFullCount(uri) {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => updateCount(uri, getSelectionText()), 1000);
}

function scheduleSelectionCount(selText) {
	clearTimeout(selectionDebounceTimer);
	selectionDebounceTimer = setTimeout(() => updateSelectionOnly(selText), 400);
}

function startVisualModePolling() {
	if (visualModePollingTimer) return;
	lastVisualSelectionText = '';
	visualModePollingTimer = setInterval(async () => {
		// Stop if a standard text editor has become active.
		if (vscode.window.activeTextEditor) {
			stopVisualModePolling();
			return;
		}
		try {
			const text = await vscode.commands.executeCommand('quarto.editor.getSelectedText');
			const selText = typeof text === 'string' ? text : '';
			if (selText !== lastVisualSelectionText) {
				lastVisualSelectionText = selText;
				scheduleSelectionCount(selText);
			}
		} catch (_) {
			// Quarto extension not installed or command unavailable — stop polling.
			stopVisualModePolling();
		}
	}, 500);
}

function stopVisualModePolling() {
	if (visualModePollingTimer) {
		clearInterval(visualModePollingTimer);
		visualModePollingTimer = null;
	}
	lastVisualSelectionText = '';
}

function activate(context) {
	statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		100
	);

	// --- File switching ---

	// Standard text editor activated (source mode).
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			lastTotalWords = null;
			stopVisualModePolling();
			const uri = editor?.document?.uri ?? getActiveUri();
			updateCount(uri, getSelectionText());
		})
	);

	// Visual / custom editor activated — detected via tab change.
	if (vscode.window.tabGroups) {
		context.subscriptions.push(
			vscode.window.tabGroups.onDidChangeTabs(() => {
				// Only act if there is no standard text editor active.
				if (vscode.window.activeTextEditor) return;
				const uri = getActiveUri();
				if (uri?.toString() !== lastCountedUri) {
					lastTotalWords = null;
					updateCount(uri, '');
				}
				// Start polling for selection changes in the visual editor.
				if (isSupportedUri(uri)) {
					startVisualModePolling();
				}
			})
		);
	}

	// --- Edit / save ---

	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(doc => {
			if (doc.uri.toString() === lastCountedUri) {
				updateCount(doc.uri, getSelectionText());
			}
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.uri.toString() === lastCountedUri) {
				scheduleFullCount(event.document.uri);
			}
		})
	);

	// --- Selection changes ---

	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorSelection(event => {
			const document = event.textEditor.document;
			if (!isSupportedDocument(document)) return;
			const selText = document.getText(event.selections[0]);
			// If this file hasn't been counted yet (or the total isn't ready),
			// run a full count so we have a total to show "sel / total" against.
			if (document.uri.toString() !== lastCountedUri || lastTotalWords === null) {
				updateCount(document.uri, selText);
			} else {
				scheduleSelectionCount(selText);
			}
		})
	);

	// --- Configuration changes ---

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('pandocWordcount.countCode')) {
				lastTotalWords = null;
				const uri = getActiveUri();
				updateCount(uri, getSelectionText());
			}
		})
	);

	// --- Manual refresh ---

	context.subscriptions.push(
		vscode.commands.registerCommand('pandoc-wordcount.refresh', () => {
			lastTotalWords = null;
			const uri = getActiveUri();
			updateCount(uri, getSelectionText());
		})
	);

	context.subscriptions.push(statusBarItem);

	// Seed an initial count for whatever is already open.
	const uri = getActiveUri();
	updateCount(uri, getSelectionText());

	// If we activated while a visual editor is already the active tab, start polling.
	if (!vscode.window.activeTextEditor && isSupportedUri(uri)) {
		startVisualModePolling();
	}
}

function deactivate() {
	clearTimeout(debounceTimer);
	clearTimeout(selectionDebounceTimer);
	stopVisualModePolling();
}

module.exports = { activate, deactivate };
