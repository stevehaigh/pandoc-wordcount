'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
	isSupportedExtension,
	fmt,
	pandocCountText,
	pandocCountFile,
} = require('../out/lib/wordcount');

// pandoc-dependent tests are skipped when pandoc isn't on PATH (e.g. some CI).
let hasPandoc = false;
try {
	execFileSync('pandoc', ['--version'], { stdio: 'ignore' });
	hasPandoc = true;
} catch {
	hasPandoc = false;
}

test('isSupportedExtension accepts .md and .qmd, case-insensitively', () => {
	assert.equal(isSupportedExtension('/a/b/notes.md'), true);
	assert.equal(isSupportedExtension('/a/b/paper.qmd'), true);
	assert.equal(isSupportedExtension('/a/b/PAPER.QMD'), true);
});

test('isSupportedExtension rejects other extensions and empty input', () => {
	assert.equal(isSupportedExtension('/a/b/readme.txt'), false);
	assert.equal(isSupportedExtension('/a/b/script.markdown'), false);
	assert.equal(isSupportedExtension('/a/b/noext'), false);
	assert.equal(isSupportedExtension(''), false);
	assert.equal(isSupportedExtension(undefined), false);
});

test('fmt preserves digits and groups thousands locale-independently', () => {
	assert.equal(fmt(42), '42');
	assert.equal(fmt('270'), '270');
	// Grouping separator is locale-dependent; assert the digits survive in order.
	assert.equal(fmt(1234).replace(/\D/g, ''), '1234');
});

test('pandocCountText counts prose, stripping markup', { skip: !hasPandoc }, async () => {
	assert.equal(await pandocCountText('one two three four five'), '5');
	// '#' heading marker and '**' bold markers must not add to the count.
	assert.equal(
		await pandocCountText('# Heading\n\nHello world this is **bold** text.'),
		'7'
	);
});

test('pandocCountText returns 0 for empty/markup-only input', { skip: !hasPandoc }, async () => {
	assert.equal(await pandocCountText(''), '0');
});

test('pandocCountText excludes code when excludeCode is set', { skip: !hasPandoc }, async () => {
	// 'Hello world.' is 2 words; the code chunk adds 4 more when counted.
	const md = 'Hello world.\n\n```{r}\nx <- 1\n```\n';
	assert.equal(await pandocCountText(md, false), '6');
	assert.equal(await pandocCountText(md, true), '2');
});

test('pandocCountFile counts a file by path', { skip: !hasPandoc }, async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwc-'));
	const file = path.join(dir, 'fixture.md');
	try {
		fs.writeFileSync(file, 'one two three four five\n');
		assert.equal(await pandocCountFile(file), '5');
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test('pandocCountFile treats a path with shell metacharacters literally', { skip: !hasPandoc }, async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwc-'));
	// A filename (single path segment, no slashes) containing a command
	// substitution. If the path were passed through a shell, '$(echo pwned)'
	// would expand to 'pwned.md', which does not exist, and pandoc would
	// reject. A correct count proves the literal path reached pandoc.
	const evil = path.join(dir, '$(echo pwned).md');
	try {
		fs.writeFileSync(evil, 'safe words here\n');
		assert.equal(await pandocCountFile(evil), '3');
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});
