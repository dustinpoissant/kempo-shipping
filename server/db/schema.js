import { pgTable, text, timestamp, integer, doublePrecision, jsonb, boolean } from 'drizzle-orm/pg-core';

/*
  A box an order can be packed into: its inside size (in the store's length unit), what it weighs empty and the most it can
  hold (in the weight unit). Either the seller's own (`owner` is '') or one a carrier extension registered (`owner` is the
  extension and `ref` its own name for the box), which the seller can turn on or off with `enabled`.

  `weights` is a list of `{ maxWeight, price }` tiers (in the weight unit): the store's own price for a parcel is the lightest
  tier that holds its weight. `defaultPrice` is what any heavier parcel pays, and what a box with no tiers charges for every
  weight (a flat rate box); null means the store has no price for a parcel heavier than its heaviest tier. Prices are in the
  smallest currency unit, and a box needs none when a carrier extension prices the parcels.
*/
export const kempoShippingBox = pgTable('kempoShippingBox', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull().default(''),
  ref: text('ref').notNull().default(''),
  enabled: boolean('enabled').notNull().default(true),
  name: text('name').notNull().default(''),
  length: doublePrecision('length').notNull(),
  width: doublePrecision('width').notNull(),
  height: doublePrecision('height').notNull(),
  emptyWeight: doublePrecision('emptyWeight').notNull().default(0),
  maxWeight: doublePrecision('maxWeight'),
  defaultPrice: integer('defaultPrice'),
  weights: jsonb('weights').notNull().default([]),
  position: integer('position').notNull().default(0),
  created: timestamp('created').notNull(),
});
