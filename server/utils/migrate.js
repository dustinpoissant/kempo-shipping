import { sql } from 'drizzle-orm';
import db from 'kempo/server/db/index.js';
import { getSetting, setSetting } from 'kempo/server/sdk.js';

/*
  Boxes used to be their own extension, kempo-shipping-boxes. A site that had it keeps its boxes (the same table, with the
  columns carrier extensions need added) and its choice to combine items; the old extension's hooks are removed, because
  they would price the same order a second time. The old extension itself is then uninstalled from the Extensions screen.
  Every step is safe to run again.
*/
const COLUMNS = [
  { name: 'owner', statement: sql`ALTER TABLE "kempoShippingBox" ADD COLUMN IF NOT EXISTS "owner" text NOT NULL DEFAULT ''` },
  { name: 'ref', statement: sql`ALTER TABLE "kempoShippingBox" ADD COLUMN IF NOT EXISTS "ref" text NOT NULL DEFAULT ''` },
  { name: 'enabled', statement: sql`ALTER TABLE "kempoShippingBox" ADD COLUMN IF NOT EXISTS "enabled" boolean NOT NULL DEFAULT true` },
  { name: 'emptyWeight', statement: sql`ALTER TABLE "kempoShippingBox" ADD COLUMN IF NOT EXISTS "emptyWeight" double precision NOT NULL DEFAULT 0` },
  { name: 'maxWeight', statement: sql`ALTER TABLE "kempoShippingBox" ADD COLUMN IF NOT EXISTS "maxWeight" double precision` },
];

/* Only the columns that are missing are added: Postgres logs a notice for each `IF NOT EXISTS` that finds its column already there. */
export const ensureBoxColumns = async () => {
  const existing = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'kempoShippingBox'`);
  const present = new Set(existing.map(row => row.column_name));
  for(const { name, statement } of COLUMNS){
    if(!present.has(name)) await db.execute(statement);
  }
};

export const absorbBoxesExtension = async () => {
  const [, combine] = await getSetting('kempo-shipping-boxes', 'combine_items', null);
  if(combine === true || combine === 'true'){
    await setSetting('kempo-shipping', 'combine_items', true, 'boolean', false, 'Whether items in an order are put into one box where they fit, instead of one box each');
  }
  const removed = await db.execute(sql`DELETE FROM "hook" WHERE "owner" = 'kempo-shipping-boxes' RETURNING "id"`);
  if(removed.length) console.warn('[kempo-shipping] Boxes are now part of kempo-shipping. Uninstall kempo-shipping-boxes from the Extensions screen.');
};

/* Everything the install and the update do for the boxes. */
export default async () => {
  await ensureBoxColumns();
  try {
    await absorbBoxesExtension();
  } catch(error) {
    console.warn(`[kempo-shipping] The old boxes extension could not be absorbed: ${error.message}`);
  }
};
