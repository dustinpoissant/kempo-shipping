import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productRate, chargeFor } from '../server/utils/charge.js';

test('a blank shipping attribute means the store rate, and 0 is a real free charge', () => {
  assert.equal(productRate({ attributes: {} }), null);
  assert.equal(productRate({ attributes: { shippingrate: '' } }), null);
  assert.equal(productRate({ attributes: { shippingrate: 0 } }), 0);
  assert.equal(productRate({ attributes: { shippingrate: 350 } }), 350);
  assert.equal(productRate({ attributes: { shippingrate: -5 } }), null);
});

test('the store rate is paid once when a line has no charge of its own', () => {
  assert.equal(chargeFor({ lines: [{ rate: null, quantity: 2 }], flatRate: 500 }), 500);
  assert.equal(chargeFor({ lines: [{ rate: null, quantity: 1 }, { rate: null, quantity: 3 }], flatRate: 500 }), 500);
});

test('a product charge is paid per unit and replaces the store rate for that line', () => {
  assert.equal(chargeFor({ lines: [{ rate: 300, quantity: 2 }], flatRate: 500 }), 600);
  assert.equal(chargeFor({ lines: [{ rate: 0, quantity: 4 }], flatRate: 500 }), 0);
});

test('mixed lines: product charges add up, and the store rate is added once for the unrated ones', () => {
  assert.equal(chargeFor({ lines: [{ rate: 300, quantity: 2 }, { rate: null, quantity: 1 }], flatRate: 500 }), 1100);
});

test('lines that need no sending are left out', () => {
  assert.equal(chargeFor({ lines: [{ rate: 300, quantity: 2, needsShipping: false }], flatRate: 500 }), 0);
  assert.equal(chargeFor({ lines: [{ rate: null, quantity: 1, needsShipping: false }], flatRate: 500 }), 0);
});

test('the charge is split into what products set for themselves and the store rate, so a carrier can replace the store part', async () => {
  const { chargeParts, productParcel } = await import('../server/utils/charge.js');
  assert.deepEqual(chargeParts({ lines: [{ rate: 300, quantity: 2 }, { rate: null, quantity: 1 }], flatRate: 500 }), { products: 600, store: 500, amount: 1100 });
  assert.deepEqual(chargeParts({ lines: [{ rate: 300, quantity: 1 }], flatRate: 500 }), { products: 300, store: 0, amount: 300 });
  assert.deepEqual(productParcel({ attributes: { weight: 2.5, length: '10', width: '', height: null } }), { weight: 2.5, length: 10, width: null, height: null, processingDays: null });
  assert.equal(productParcel({ attributes: { processingdays: '3' } }).processingDays, 3);
  assert.equal(productParcel({ attributes: { processingdays: 0 } }).processingDays, 0);
  assert.equal(productParcel({ attributes: { processingdays: -1 } }).processingDays, null);
  assert.equal(productParcel({ attributes: { processingdays: '' } }).processingDays, null);
});
