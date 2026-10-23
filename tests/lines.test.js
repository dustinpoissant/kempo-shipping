import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsShipping } from '../server/utils/lines.js';

test('a line whose product type does not need shipping sends nothing', () => {
  assert.equal(needsShipping([{ needsShipping: false }]), false);
  assert.equal(needsShipping([]), false);
});

test('one line that needs shipping makes the order need it, and a line that does not say so defaults to it', () => {
  assert.equal(needsShipping([{ needsShipping: false }, { needsShipping: true }]), true);
  assert.equal(needsShipping([{}]), true);
});
