import crypto from 'crypto';
import db from 'kempo/server/db/index.js';
import { and, asc, eq } from 'drizzle-orm';
import { kempoShippingBox } from '../db/schema.js';
import { cleanBoxes, cleanCarrierBox, convertBoxes } from './boxes.js';
import { convertWeight, convertLength } from './units.js';

/*
  The boxes in the database. The seller's own are replaced as a list from the Boxes tab; a carrier extension's are
  registered and removed by the extension, and the seller only turns them on or off.
*/
const newId = () => crypto.randomBytes(8).toString('hex');

/* Every box, the seller's first, in the order they were listed. */
export const readBoxes = async () => {
  try {
    const boxes = await db.select().from(kempoShippingBox).orderBy(asc(kempoShippingBox.owner), asc(kempoShippingBox.position), asc(kempoShippingBox.name));
    return [null, boxes];
  } catch {
    return [{ code: 500, msg: 'The boxes could not be read' }, null];
  }
};

/* The boxes an order can be packed into: the seller's, and the carriers' that are turned on. */
export const readUsableBoxes = async () => {
  const [error, boxes] = await readBoxes();
  return error ? [error, null] : [null, boxes.filter(box => box.enabled)];
};

/* Replaces the seller's own list in one step, so a failed save never leaves half of it, and turns carrier boxes on or off. */
export const replaceBoxes = async ({ boxes, carrierBoxes = [] }) => {
  const [invalid, rows] = cleanBoxes(boxes);
  if(invalid) return [invalid, null];
  try {
    const now = new Date();
    await db.transaction(async tx => {
      await tx.delete(kempoShippingBox).where(eq(kempoShippingBox.owner, ''));
      if(rows.length) await tx.insert(kempoShippingBox).values(rows.map(row => ({ id: newId(), ...row, created: now })));
      for(const { id, enabled } of Array.isArray(carrierBoxes) ? carrierBoxes : []){
        if(typeof enabled === 'boolean') await tx.update(kempoShippingBox).set({ enabled }).where(eq(kempoShippingBox.id, String(id)));
      }
    });
    return readBoxes();
  } catch {
    return [{ code: 500, msg: 'The boxes could not be saved' }, null];
  }
};

/*
  A carrier extension's boxes, given in the units it works in (`units` is { weightUnit, dimensionUnit }, the store's when
  left out) and converted to the store's. Idempotent: a box with a ref that is there already is updated, keeping whether the
  seller turned it on; one the carrier no longer lists is removed.
*/
export const registerBoxes = async (owner, boxes, { units, store }) => {
  if(!owner) return [{ code: 400, msg: 'An owner (your extension name) is required' }, null];
  if(!Array.isArray(boxes)) return [{ code: 400, msg: 'The boxes must be a list' }, null];
  const from = units ?? store;
  const rows = [];
  for(const box of boxes){
    const [error, row] = cleanCarrierBox(box, from, store, { weight: convertWeight, length: convertLength });
    if(error) return [error, null];
    rows.push(row);
  }
  try {
    const now = new Date();
    await db.transaction(async tx => {
      const existing = await tx.select().from(kempoShippingBox).where(eq(kempoShippingBox.owner, owner));
      const keep = new Set(rows.map(row => row.ref));
      for(const box of existing) if(!keep.has(box.ref)) await tx.delete(kempoShippingBox).where(eq(kempoShippingBox.id, box.id));
      for(const [position, row] of rows.entries()){
        const found = existing.find(box => box.ref === row.ref);
        if(found) await tx.update(kempoShippingBox).set({ ...row, position }).where(eq(kempoShippingBox.id, found.id));
        else await tx.insert(kempoShippingBox).values({ id: newId(), owner, ...row, position, created: now });
      }
    });
    return [null, { registered: rows.length }];
  } catch {
    return [{ code: 500, msg: 'The boxes could not be registered' }, null];
  }
};

/* For an extension's uninstall.js: removes every box it registered. */
export const unregisterBoxes = async owner => {
  if(!owner) return [{ code: 400, msg: 'An owner (your extension name) is required' }, null];
  try {
    const removed = await db.delete(kempoShippingBox).where(and(eq(kempoShippingBox.owner, owner))).returning();
    return [null, { removed: removed.length }];
  } catch {
    return [{ code: 500, msg: 'The boxes could not be removed' }, null];
  }
};

/* Converts every box's sizes and weights to the store's new units, in one step so a failure leaves the boxes as they were. */
export const convertAllBoxes = async (from, to) => {
  const [error, boxes] = await readBoxes();
  if(error) return [error, null];
  const converted = convertBoxes(boxes, from, to, { weight: convertWeight, length: convertLength });
  try {
    await db.transaction(async tx => {
      for(const box of converted){
        await tx.update(kempoShippingBox).set({ length: box.length, width: box.width, height: box.height, emptyWeight: box.emptyWeight, maxWeight: box.maxWeight, weights: box.weights }).where(eq(kempoShippingBox.id, box.id));
      }
    });
    return [null, { converted: converted.length }];
  } catch {
    return [{ code: 500, msg: 'The boxes could not be converted to the new units' }, null];
  }
};
