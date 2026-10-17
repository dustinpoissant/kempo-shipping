import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
  This package is only a place in the admin menu with a "coming soon" page, so these check that the
  pieces agree with each other: the menu entry belongs to this package, opens a page that exists and
  draws an icon this package ships.
*/
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');

test('the menu entry belongs to this package, opens its page and draws its own icon', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const nav = await read('admin/nav.global.html');
  assert.equal(pkg.name, 'kempo-shipping');
  assert.match(nav, /owner="kempo-shipping"/);
  assert.match(nav, /href="\/admin\/extension\/kempo-shipping\/"/);
  const icon = /icon-src="\/admin\/extension\/kempo-shipping\/(icons\/[\w-]+\.svg)"/.exec(nav);
  assert.ok(icon, 'the entry names an icon this package ships');
  assert.ok(existsSync(path.join(root, 'admin', icon[1])), `admin/${icon[1]} is in the package`);
  assert.ok(existsSync(path.join(root, 'admin', 'index.page.html')), 'the page the entry opens exists');
});

test('the icon is a single filled path that k-icon can recolour', async () => {
  const svg = await read('admin/icons/local_shipping.svg');
  assert.match(svg, /viewBox="0 (-960|0) 960 960"/);
  assert.equal((svg.match(/<path/g) ?? []).length, 1);
  assert.doesNotMatch(svg, /stroke=/);
});

test('it stays private and unreleased until the extension is built', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.private, true);
  assert.deepEqual(pkg.files, ['admin', 'kempo-config.json']);
});
