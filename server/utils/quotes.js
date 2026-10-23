import { priceFor } from './packing.js';

/*
  Pricing the parcels of an order, as pure rules with no imports so they can be tested alone.

  Every parcel gets a list of `quotes`, each `{ carrier, service, price, days? }` with `price` in the smallest currency unit.
  The store's own table is one quote (`carrier: ''`, `service: 'Standard shipping'`) when it has a price for the parcel; a
  carrier extension adds its own through the `kempo-shipping:rates` hook (`carrier: 'USPS'`, `service: 'Ground Advantage'`).
  The customer is offered a shipping option for every carrier and service that has a quote for each parcel of the order,
  priced as the quotes added up, cheapest first. If there is none, the order cannot be priced by its boxes.
*/
const MAX_NAME = 100;

export const STORE_SERVICE = 'Standard shipping';

/* The parcels as a carrier extension sees them: no functions, nothing to change but `quotes`. */
export const parcelsFor = packed => packed.parcels.map((parcel, index) => ({
  id: `parcel-${index + 1}`,
  box: {
    id: parcel.box.id ?? '',
    ref: parcel.box.ref ?? '',
    owner: parcel.box.owner ?? '',
    name: parcel.box.name ?? '',
    length: parcel.box.length,
    width: parcel.box.width,
    height: parcel.box.height,
    emptyWeight: parcel.box.emptyWeight ?? 0,
  },
  items: parcel.items,
  contentsWeight: parcel.contentsWeight,
  weight: parcel.weight,
  quotes: [],
}));

/* The store's own table as the first quote of each parcel, for the ones it can price. */
export const withStoreQuotes = (parcels, packed) => parcels.map((parcel, index) => {
  const price = priceFor(packed.parcels[index].box, parcel.weight);
  return price === null ? parcel : { ...parcel, quotes: [{ carrier: '', service: STORE_SERVICE, price }, ...parcel.quotes] };
});

const text = value => (typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : '');

const usable = quote => quote && typeof quote === 'object' && Number.isSafeInteger(quote.price) && quote.price >= 0;

/* The cheapest usable quote of a parcel for each carrier and service, by key. */
const quotesByKey = parcel => {
  const found = new Map();
  for(const quote of Array.isArray(parcel.quotes) ? parcel.quotes : []){
    if(!usable(quote)) continue;
    const carrier = text(quote.carrier);
    const service = text(quote.service);
    const key = `${carrier}|${service}`;
    if(!found.has(key) || quote.price < found.get(key).price) found.set(key, { carrier, service, price: quote.price, days: Number.isFinite(quote.days) && quote.days >= 0 ? quote.days : null });
  }
  return found;
};

/*
  What the customer can choose between: each carrier and service every parcel has a quote for, with its price for the whole
  order, cheapest first (the store's own table wins a tie). `shipments` is what is kept with the order if it is chosen.
*/
export const buildOptions = parcels => {
  if(!Array.isArray(parcels) || !parcels.length) return [];
  const perParcel = parcels.map(quotesByKey);
  const options = [];
  for(const [key, first] of perParcel[0]){
    const quotes = perParcel.map(found => found.get(key));
    if(quotes.some(quote => !quote)) continue;
    options.push({
      key,
      carrier: first.carrier,
      service: first.service,
      label: [first.carrier, first.service].filter(Boolean).join(' ') || 'Shipping',
      price: quotes.reduce((sum, quote) => sum + quote.price, 0),
      days: quotes.every(quote => quote.days !== null) ? Math.max(...quotes.map(quote => quote.days)) : null,
      shipments: parcels.map((parcel, index) => ({
        name: parcel.box.name,
        length: parcel.box.length,
        width: parcel.box.width,
        height: parcel.box.height,
        items: parcel.items,
        weight: parcel.weight,
        price: quotes[index].price,
        carrier: quotes[index].carrier,
        service: quotes[index].service,
      })),
    });
  }
  return options.sort((a, b) => a.price - b.price || (a.carrier === '' ? -1 : 0) - (b.carrier === '' ? -1 : 0));
};

/* The option with this key, or the cheapest when there is no such option (the first is the cheapest). */
export const pickOption = (options, key) => options.find(option => option.key === key) ?? options[0] ?? null;

/* An option as the checkout page and the kept order see it: no shipments. */
export const publicOption = ({ key, carrier, service, label, price, days }) => ({ key, carrier, service, label, price, days });
