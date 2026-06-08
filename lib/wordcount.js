'use strict';

// Logic with no dependency on the `vscode` API, so it can be unit-tested
// without launching a VS Code host. extension.js requires these helpers.

const { execFile, spawn } = require('child_process');
const path = require('path');

const SUPPORTED_EXTENSIONS = new Set(['.md', '.qmd']);

/** True if `fsPath` has a supported (.md/.qmd) extension. */
function isSupportedExtension(fsPath) {
	if (!fsPath) return false;
	return SUPPORTED_EXTENSIONS.has(path.extname(fsPath).toLowerCase());
}

/** Format a raw word-count number (or numeric string) for display. */
function fmt(n) {
	return Number(n).toLocaleString();
}

/** Run pandoc on TEXT passed via stdin; resolve with word count string. */
function pandocCountText(text) {
	return new Promise((resolve, reject) => {
		const proc = spawn('sh', ['-c', 'pandoc --from=markdown --to=plain | wc -w'], {
			timeout: 10000,
		});
		let stdout = '';
		let stderr = '';
		proc.stdout.on('data', d => { stdout += d; });
		proc.stderr.on('data', d => { stderr += d; });
		proc.on('close', code => {
			if (code !== 0) reject(new Error(stderr || `exit ${code}`));
			else resolve(stdout.trim().replace(/\s+/g, ''));
		});
		proc.stdin.write(text);
		proc.stdin.end();
	});
}

/** Run pandoc on a FILE path; resolve with word count string. */
function pandocCountFile(filePath) {
	return new Promise((resolve, reject) => {
		// Pass the path as an argv argument (never through a shell) so filenames
		// containing shell metacharacters can't be interpreted as commands.
		execFile(
			'pandoc',
			['--from=markdown', '--to=plain', '--', filePath],
			{ timeout: 10000, maxBuffer: 64 * 1024 * 1024 },
			(err, stdout, stderr) => {
				if (err) reject(new Error(stderr || err.message));
				else resolve(String(stdout.split(/\s+/).filter(Boolean).length));
			}
		);
	});
}

module.exports = {
	SUPPORTED_EXTENSIONS,
	isSupportedExtension,
	fmt,
	pandocCountText,
	pandocCountFile,
};
