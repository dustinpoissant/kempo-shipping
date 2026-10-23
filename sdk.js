import { readShipping } from './server/utils/config.js';
import { readBoxes, registerBoxes as storeBoxes, unregisterBoxes } from './server/utils/boxRows.js';

/*
  What a carrier extension (USPS, UPS, FedEx) imports from kempo-shipping.

    import { registerBoxes, unregisterBoxes, getShippingSettings, convertWeight, convertLength } from 'kempo-shipping/sdk';

  Pricing an order. kempo-shipping packs the order into boxes and hands the parcels to every handler of the
  `kempo-shipping:rates` hook, with the destination (`address`), where it is sent from (`origin`), the units and the
  currency. A carrier answers by pushing a quote onto each parcel it can price:

    // hooks/rates.js
    export default async ({ parcels, address, origin, units, currency }) => {
      for(const parcel of parcels){
        const price = await myCarrier.rate({ from: origin, to: address, weight: parcel.weight, size: parcel.box });
        if(price) parcel.quotes.push({ carrier: 'USPS', service: 'Ground Advantage', price, days: 3 });
      }
    };

  `price` is in the smallest currency unit, `weight` and the box's sizes in the store's units (`units`). A parcel is sent by its
  quotes: the customer is offered each carrier and service that has a quote for every parcel (the store's own price table is
  "Standard shipping"), cheapest first, and `carrier` and `service` are shown to them as they are ("USPS", "Ground
  Advantage"). If none can be offered, the order pays the flat rate, or cannot be placed when the store turned it off.
  See server/utils/rates.js for the whole payload.

  Boxes. A carrier with boxes of its own (USPS flat rate boxes) registers them from install.js and update.js, in the units it
  works in, and removes them from uninstall.js. The seller sees them on the Boxes tab and can turn each on or off; the packer
  uses the ones that are on:

    await registerBoxes('kempo-usps', [{ ref: 'priority-medium-flat', name: 'Priority Mail Medium Flat Rate Box', length: 13.625, width: 11.875, height: 3.375, emptyWeight: 0.4 }], { weightUnit: 'lb', dimensionUnit: 'in' });

  The store's units are on the Units tab of the Shipping page. When they change, kempo-shipping converts the weights and
  sizes saved on products and the boxes, then fires `kempo-shipping:units_changed` with `{ from, to }` (each `{ weightUnit,
  dimensionUnit }`) so an extension that keeps weights or sizes of its own can convert them the same way.
*/
export { WEIGHT_UNITS, DIMENSION_UNITS, convertWeight, convertLength } from './server/utils/units.js';

/* The store's shipping settings: flat rate (and whether it is offered), countries, units, whether items are combined, and the ship-from address (`origin`). */
export const getShippingSettings = readShipping;

/* Every box: the seller's own (`owner` is '') and the ones carriers registered. */
export const getBoxes = readBoxes;

/* Registers a carrier's boxes (see above), replacing the ones the carrier registered before. Resolves to [error, { registered }]. */
export const registerBoxes = async (owner, boxes, { weightUnit, dimensionUnit } = {}) => {
  const store = await readShipping();
  return storeBoxes(owner, boxes, { units: weightUnit && dimensionUnit ? { weightUnit, dimensionUnit } : undefined, store });
};

export { unregisterBoxes };
