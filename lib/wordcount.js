'use strict';

// Logic with no dependency on the `vscode` API, so it can be unit-tested
// without launching a VS Code host. extension.js requires these helpers.

const { spawn } = require('child_process');
const path = require('path');

const SUPPORTED_EXTENSIONS = new Set(['.md', '.qmd']);

// Lua filter that strips code (blocks, chunks, inline) before counting.
const CODE_FILTER = path.join(__dirname, 'nocode.lua');

/** True if `fsPath` has a supported (.md/.qmd) extension. */
function isSupportedExtension(fsPath) {
	if (!fsPath) return false;
	return SUPPORTED_EXTENSIONS.has(path.extname(fsPath).toLowerCase());
}

/** Format a raw word-count number (or numeric string) for display. */
function fmt(n) {
	const num = Number(n);
	return Number.isFinite(num) ? num.toLocaleString() : '?';
}

/** Base pandoc args; adds the code-stripping filter when excludeCode is set. */
function pandocArgs(excludeCode) {
	const args = ['--from=markdown', '--to=plain'];
	if (excludeCode) args.push('--lua-filter=' + CODE_FILTER);
	return args;
}

/**
 * Spawn pandoc with `args` (no shell), optionally writing `inputText` to stdin,
 * and resolve with the word count of its plain-text output as a string.
 */
function runPandoc(args, inputText) {
	return new Promise((resolve, reject) => {
		const proc = spawn('pandoc', args, { timeout: 10000 });
		let stdout = '';
		let stderr = '';
		proc.stdout.on('data', d => { stdout += d; });
		proc.stderr.on('data', d => { stderr += d; });
		proc.on('error', err => {
			if (err.code === 'ENOENT') {
				reject(new Error('pandoc not found — install pandoc and ensure it is on your PATH'));
			} else {
				reject(err);
			}
		});
		proc.on('close', code => {
			if (code !== 0) reject(new Error(stderr || `exit ${code}`));
			else resolve(String(stdout.split(/\s+/).filter(Boolean).length));
		});
		if (inputText != null) {
			// Avoid an unhandled EPIPE if pandoc exits before we finish writing.
			proc.stdin.on('error', () => {});
			proc.stdin.write(inputText);
			proc.stdin.end();
		}
	});
}

/** Count words in TEXT (passed via stdin); resolve with a word count string. */
function pandocCountText(text, excludeCode = false) {
	return runPandoc(pandocArgs(excludeCode), text);
}

/** Count words in the FILE at `filePath`; resolve with a word count string. */
function pandocCountFile(filePath, excludeCode = false) {
	// Pass the path as an argv argument (never through a shell) so filenames
	// containing shell metacharacters can't be interpreted as commands.
	return runPandoc([...pandocArgs(excludeCode), '--', filePath]);
}

module.exports = {
	SUPPORTED_EXTENSIONS,
	isSupportedExtension,
	fmt,
	pandocCountText,
	pandocCountFile,
};
