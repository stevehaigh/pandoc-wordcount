import { spawn } from 'child_process';
import * as path from 'path';

// Logic with no dependency on the `vscode` API, so it can be unit-tested
// without launching a VS Code host. extension.ts requires these helpers.

export const SUPPORTED_EXTENSIONS = new Set(['.md', '.qmd']);

// Lua filter that strips code (blocks, chunks, inline) before counting.
const CODE_FILTER = path.join(__dirname, 'nocode.lua');

/** True if `fsPath` has a supported (.md/.qmd) extension. */
export function isSupportedExtension(fsPath: string | null | undefined): boolean {
	if (!fsPath) return false;
	return SUPPORTED_EXTENSIONS.has(path.extname(fsPath).toLowerCase());
}

/** Format a raw word-count number (or numeric string) for display. */
export function fmt(n: number | string): string {
	const num = Number(n);
	return Number.isFinite(num) ? num.toLocaleString() : '?';
}

/** Base pandoc args; adds the code-stripping filter when excludeCode is set. */
function pandocArgs(excludeCode: boolean): string[] {
	const args = ['--from=markdown', '--to=plain'];
	if (excludeCode) args.push('--lua-filter=' + CODE_FILTER);
	return args;
}

/**
 * Spawn pandoc with `args` (no shell), optionally writing `inputText` to stdin,
 * and resolve with the word count of its plain-text output as a string.
 */
function runPandoc(args: string[], inputText?: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = spawn('pandoc', args, { timeout: 10000 });
		let stdout = '';
		let stderr = '';
		proc.stdout.on('data', (d: Buffer) => { stdout += d; });
		proc.stderr.on('data', (d: Buffer) => { stderr += d; });
		proc.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'ENOENT') {
				reject(new Error('pandoc not found — install pandoc and ensure it is on your PATH'));
			} else {
				reject(err);
			}
		});
		proc.on('close', (code: number | null) => {
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
export function pandocCountText(text: string, excludeCode = false): Promise<string> {
	return runPandoc(pandocArgs(excludeCode), text);
}

/** Count words in the FILE at `filePath`; resolve with a word count string. */
export function pandocCountFile(filePath: string, excludeCode = false): Promise<string> {
	// Pass the path as an argv argument (never through a shell) so filenames
	// containing shell metacharacters can't be interpreted as commands.
	return runPandoc([...pandocArgs(excludeCode), '--', filePath]);
}
