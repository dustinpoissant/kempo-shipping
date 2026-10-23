import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAddress, resolveAddress } from '../server/utils/address.js';

const full = { name: ' Ada Lovelace ', line1: '1 Main St', line2: '', city: 'Springfield', state: 'IL', postalCode: '62701', country: 'US' };

test('a full address is kept, trimmed', () => {
  const [error, address] = checkAddress(full);
  assert.equal(error, null);
  assert.equal(address.name, 'Ada Lovelace');
  assert.equal(address.line2, '');
});

test('a missing required field is refused', () => {
  const [error, address] = checkAddress({ ...full, city: '  ' });
  assert.equal(address, null);
  assert.equal(error.code, 400);
});

test('no address at all is refused', () => {
  assert.equal(checkAddress(undefined)[0].code, 400);
  assert.equal(checkAddress(['x'])[0].code, 400);
});

test('the country must be two capital letters', () => {
  assert.equal(checkAddress({ ...full, country: 'usa' })[0].code, 400);
});

test('a field over its length is refused', () => {
  assert.equal(checkAddress({ ...full, postalCode: '1'.repeat(21) })[0].code, 400);
});

test('same as billing copies the billing address, so it follows billing', () => {
  const billing = { name: 'Ada', line1: '2 Elm', line2: 'Flat 3', city: 'Lyon', state: '', postalCode: '69001', country: 'FR', email: 'a@example.test' };
  const [error, address] = resolveAddress({ shipping: { sameAsBilling: true }, billing });
  assert.equal(error, null);
  assert.equal(address.line1, '2 Elm');
  assert.equal(address.country, 'FR');
  assert.equal(address.email, undefined);
});

test('same as billing with an incomplete billing address is refused', () => {
  assert.equal(resolveAddress({ shipping: { sameAsBilling: true }, billing: { name: 'Ada' } })[0].code, 400);
});

test('a typed address is used as typed when same as billing is not chosen', () => {
  const [error, address] = resolveAddress({ shipping: full, billing: { name: 'Someone else' } });
  assert.equal(error, null);
  assert.equal(address.name, 'Ada Lovelace');
});
