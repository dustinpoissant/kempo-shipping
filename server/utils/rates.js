import { triggerHook } from 'kempo/server/sdk.js';
import { getProducts, effectiveAttributes } from 'kempo-products/sdk';
import { readShipping } from './config.js';
import { needsShipping } from './lines.js';
import { productRate, productParcel, chargeParts } from './charge.js';
import { readUsableBoxes } from './boxRows.js';
import { itemsFor, packItems } from './packing.js';
import { estimate } from './arrival.js';
import { parcelsFor, withStoreQuotes, buildOptions, pickOption, publicOption, STORE_SERVICE } from './quotes.js';

/*
  What shipping costs an order. The store's flat rate, unless a product sets its own charge (see charge.js) or the order can
  be packed into boxes, in which case each parcel is priced and the prices are added up.

  The lines with no charge of their own are packed into the seller's boxes (and the boxes carrier extensions registered).
  Each parcel is offered to the `kempo-shipping:rates` hook, which a carrier extension (USPS, UPS, FedEx) answers by adding
  a quote to the parcel. The payload is:

    lines     the lines that need sending, each with `rate` (the product's own charge, or null), and `weight`, `length`,
              `width`, `height` in the store's units (null when the product has none)
    parcels   the order packed into boxes, or an empty list when it could not be (a product has no size, or something fits no
              box). Each is `{ id, box: { id, ref, owner, name, length, width, height, emptyWeight }, items, contentsWeight,
              weight, quotes }`: `weight` is what it weighs with the box (null when an item's weight is unknown). A carrier
              pushes `{ carrier, service, price, days? }` onto `quotes`, with `price` in the smallest currency unit. The
              store's own price table has put its quote there first, for the boxes it has a price for.
    units     { weight: 'lb', dimension: 'in' }, the units those are in
    origin    the address orders are sent from: { name, phone, line1, line2, city, state, postalCode, country }
    address   the destination, when it is known
    currency  the currency of the order
    charge    { amount, method, products, store }: `products` is the charges products set for themselves and `store` the
              flat rate that would be paid for the lines without one. When there are no parcels, a handler that prices the
              order some other way can still set `charge.store` and `charge.method`.

  Each option also says when it `ships` and, when the carrier gives days in transit, the earliest (`arrival`) and latest
  (`arrivalLatest`, one weekday later) it should arrive, as YYYY-MM-DD, from the products' processing days and the cutoff and
  weekend settings (see arrival.js).

  `ready` is whether the customer has finished entering the address. A carrier extension must not make a paid request (it
  may answer from a cache) while `ready` is false, and says it held back by setting `charge.pending = true`; with nothing else
  to offer, the order then has no shipping price yet (a 202) instead of a flat rate that would flash up and change.

  The customer is offered every carrier and service that has a quote for each parcel (`charge.options`), cheapest first, and
  `choice` is the key of the one they picked (the cheapest when it is missing or no longer offered). If no option can be
  made, the order pays the store's flat rate when it has one, and otherwise cannot be priced. What was chosen is kept with
  the order (`charge.shipments`: box, items, weight, price, carrier and service) and shown to staff.
*/
export const RATE_EVENT = 'kempo-shipping:rates';

export const quoteShipping = async ({ lines, address, currency, choice = null, ready = true }) => {
  if(!needsShipping(lines)) return [null, null];
  const { flatRate, flatRateEnabled, weightUnit, dimensionUnit, combine, origin, processing } = await readShipping();
  const flat = flatRateEnabled ? flatRate : null;
  const ids = [...new Set(lines.map(line => line.productId))];
  const [error, found] = await getProducts({ ids, limit: ids.length });
  if(error) return [error, null];
  const products = new Map(found.items.map(product => [product.id, product]));
  const priced = lines
    .filter(line => line.needsShipping !== false)
    .map(line => {
      // a product's own values, then what its template gives a blank one (every model car weighs the same)
      const product = { attributes: effectiveAttributes(products.get(line.productId)) };
      return { ...line, rate: productRate(product), ...productParcel(product) };
    });
  const charge = { ...chargeParts({ lines: priced, flatRate: flat ?? 0 }), method: 'flat' };

  const unrated = priced.filter(line => line.rate === null);
  const [, boxes] = unrated.length ? await readUsableBoxes() : [null, []];
  const packed = unrated.length ? packItems(itemsFor(unrated), boxes ?? [], { combine }) : null;
  const parcels = packed ? withStoreQuotes(parcelsFor(packed), packed) : [];

  try {
    await triggerHook(RATE_EVENT, { lines: priced, parcels, units: { weight: weightUnit, dimension: dimensionUnit }, origin, address, currency, charge, ready });
  } catch(hookError) {
    console.error('[kempo-shipping] a rate extension failed:', hookError);
    return [{ code: 502, msg: 'The shipping rate could not be worked out' }, null];
  }

  const options = buildOptions(parcels);
  const picked = pickOption(options, choice);
  let offered = options.map(publicOption);
  const shipments = [];
  if(picked){
    charge.store = picked.price;
    charge.method = picked.carrier || 'boxes';
    shipments.push(...picked.shipments);
  } else if(charge.pending && ready === false){
    // a carrier is waiting for the customer to finish the address, so nothing is offered or charged yet
    return [{ code: 202, msg: 'Shipping options appear once the shipping address is complete' }, null];
  } else if(charge.method === 'flat' && unrated.length){
    // nothing priced the parcels: the store's flat rate, when it has one
    if(flat === null) return [{ code: 422, msg: "We can't ship this order to this address right now. Check the address, or contact the store." }, null];
    charge.store = flat;
    offered = [{ key: 'flat', carrier: '', service: STORE_SERVICE, label: STORE_SERVICE, price: flat, days: null }];
  }
  /* When each option ships and, when the carrier says how long it takes, arrives: the longest processing time of the items, then the days in transit. */
  const processingDays = Math.max(0, ...priced.map(line => line.processingDays ?? 0));
  const now = new Date();
  offered = offered.map(option => {
    const { shipDate, arrivalDate, latestArrivalDate } = estimate({ now, processingDays, ...processing, transitDays: option.days });
    return { ...option, ships: shipDate, arrival: arrivalDate, arrivalLatest: latestArrivalDate };
  });
  charge.selected = picked?.key ?? offered[0]?.key ?? null;
  charge.options = offered;
  charge.processingDays = processingDays;
  charge.amount = charge.products + charge.store;
  charge.units = { weight: weightUnit, dimension: dimensionUnit };
  charge.lines = priced.map(({ productId, name, quantity, rate, weight, length, width, height }) => ({ productId, name, quantity, rate, weight, length, width, height }));
  charge.shipments = shipments;
  if(!Number.isSafeInteger(charge.amount) || charge.amount < 0) return [{ code: 502, msg: 'The shipping rate could not be worked out' }, null];
  return [null, charge];
};
