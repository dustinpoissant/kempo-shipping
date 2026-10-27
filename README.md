# kempo-shipping

Shipping for [kempo-commerce](https://github.com/dustinpoissant/kempo-commerce): what an order that needs sending costs,
where physical items may be sent, the address the order goes to, and the tax on the shipping. It also owns the attributes
every shipping extension reads from a product (flat charge, weight and size), so a carrier extension only has to require
kempo-shipping and use them.

## The admin page

**Shipping** (Commerce group) is a page of tabs:

- **General:** the flat rate, the countries physical items ship to, and where orders are sent from.
  - **Offer a flat rate** turns the flat rate on or off (`flat_rate_enabled`). The amount is stored as `shipping_flat_rate`,
    in the smallest currency unit (500 is 5.00). With it off, an order that the boxes and carriers cannot price cannot be
    placed, so turn it off once a carrier extension prices everything you sell.
  - The countries are stored as `shipping_countries`. Blank ships nowhere, so physical items cannot be ordered until a
    country is chosen.
  - **Ship from** is the address orders are sent from (`origin_*` settings), which carriers need to quote a rate.
- **Boxes:** the boxes you ship in (inside size, empty weight, optional maximum weight) and, with **Enable Flat Rate Per Box** turned on for a box, what it costs by
  weight ("up to 1 lb costs 5.00, up to 3 lb costs 6.50, anything heavier 8.00"; a flat rate box has one price for any
  weight). An order is packed into the smallest box it fits. A toggle puts several items in one box where they fit. A box
  with no price of your own is priced by a carrier extension. Boxes a carrier extension registered are listed below yours,
  and each can be turned on or off.
- **Processing time:** how the days a product takes to make are counted. **Count weekends as processing days** (off by default), a **cutoff time** after which an order starts counting tomorrow (5:00 pm by default), and the **time zone** the cutoff is read on. See [Processing days and arrival dates](#processing-days-and-arrival-dates).
- **Units:** weight in pounds, ounces, grams or kilograms; length, width and height in inches or centimetres. Each saves
  as soon as it is picked, and converts the weights and sizes already saved on products, and renames the product attributes to match.
- **A tab for each carrier extension** that is installed (a rate table, UPS, USPS).

## Product shipping attributes

On each product's form, a **Shipping** tab holds:

| Attribute | Meaning |
|---|---|
| Flat shipping charge | The product's own charge per unit bought. Blank uses the store rate, and 0 is free |
| Weight | The item's weight, in the store's units |
| Length, Width, Height needed | The room the product needs inside a box, including any packing material (not the size of the box it ends up in), in the store's units |

The flat rate does not use weight or size, but every carrier extension reads them.

If many products share a size and weight (a shop of model cars), do not fill the tab in on each one. Open **Products > Templates**, edit the template, and set the Shipping attributes on its **Shipping** tab; every product made from that template uses them until it sets its own. A change of units converts the templates' defaults too.

They are registered with kempo-products on install (`shippingrate`, `weight`, `length`, `width`, `height`), so carrier
extensions never define their own. The store's flat rate is paid once per order if any line that needs sending has no
charge of its own, so a mixed order pays each product's charge plus the store rate once.

## Processing days and arrival dates

A product (or a product template, as a default) can have **Processing days** on its **Shipping** tab: how many days it takes you to make it and get it ready to ship. Blank means it ships the day it is ordered. The longest processing time of the items in an order is used.

The customer sees when each shipping method should arrive:

- Today counts as the first processing day when the order comes in **before the cutoff time**, and tomorrow is the first when it comes in after it.
- **Weekends** do not count as processing days unless **Count weekends as processing days** is on. Carriers do not pick up on weekends, so a ship date is always a weekday.
- The carrier's days in transit are then counted as weekdays after the ship date. A method with no transit time (your own box prices, the flat rate) shows its price and no delivery estimate.
- The customer sees it as an **estimate**: the shipping time as a range ("3–4 business days") and "Estimated delivery Oct 28 – 29". The range's second date is one more weekday than the carrier's days, to allow for things like post office holidays.
- Each shipping option has `ships`, `arrival` (earliest) and `arrivalLatest` dates (`YYYY-MM-DD`, the seller's own calendar), kept with the order's shipping fee.

Example: 2 processing days, weekends not counted, cutoff 5 pm. An order on Monday at 3 pm ships Tuesday, and with 3 days in transit it arrives Friday. The same order at 6 pm ships Wednesday.

## Carrier requests only happen when the address is finished

Carrier rate requests can cost money, so nothing is asked of a carrier while the customer is typing. The checkout works out the shipping price only when **every required address field is filled in and the customer has left a field**. At that moment the shipping panel sends `shippingKey` (a text standing for exactly that address, from `public/utils/addressKey.js`) and prices again; the server asks a carrier only for an address whose key matches. Leaving other fields, or typing, asks nothing, and an address that is edited has to be finished again. Until then the panel says the options appear when the address is finished, and **Place order** stays off.

A price a carrier extension already has in its cache is still used at any time, because it is free; a parcel that needed a request is `pending`. The `kempo-shipping:rates` payload carries `ready`, and a carrier extension that held back because `ready` is false sets `charge.pending = true`. See the carrier extensions' READMEs.

## What needs sending

A line needs sending when its product's **product type** says so (kempo-products decides that). kempo-products alone
has only "Generic Product", which is not shipped. This extension adds **Physical Item** (`physical`), which is, so a
product has to be a Physical Item to be sent; `credits-only` and digital types are not. A line from an older cart that
does not say defaults to needing it.

## Checkout

- **The shipping address panel** ("Shipping address", priority 300, between billing and credits). Same as billing is the
  default. The country list is limited to the countries the store ships to.
- **The fee** is added at checkout once an address is known, and is taxable where kempo-tax says shipping is taxed
  (without kempo-tax, shipping is not taxed).
- **Placing the order** refuses an address to a country the store does not ship to, and refuses when the charge or the
  shipping tax cannot be worked out. Nobody is charged a guess.

## How an order is priced

1. A line with its own flat charge pays it (per unit bought).
2. The other lines are packed into your boxes, plus any carrier boxes that are turned on: each item goes in the smallest box
   it fits, or with **Put several items in one box** they are merged into as few boxes as the room allows. A product with no
   size, or an item that fits no box, means no packing, and the store flat rate is paid (once per order).
3. Each **parcel** (a packed box) gets quotes. Your own price table for the box is the first, when it has a price. Every
   handler of `kempo-shipping:rates` can add more.
4. The customer is offered each **carrier and service that has a quote for every parcel** ("USPS Ground Advantage",
   "UPS Ground", "Standard shipping" for your own table), priced as the parcels' quotes added up. They are listed cheapest
   first in a **Shipping method** choice under the shipping address (shown only when there is more than one), and the
   cheapest is chosen until the customer picks another.
5. If there is no option at all, the order pays the flat rate when it is on. With the flat rate off, the order cannot be
   priced, and the checkout says so instead of letting it be placed.

A service is offered only when every parcel has it, so a carrier should quote the same service names for all its boxes
(a USPS flat rate box that can only go Priority Mail makes "Ground Advantage" unavailable for an order that includes it).

What was chosen (box, items, weight, carrier, service, price) is kept with the order, with the list the customer chose from.

## Building a carrier extension (USPS, UPS, FedEx)

A carrier extension requires kempo-shipping and does the following.

**1. Price the parcels.** Listen to `kempo-shipping:rates` in its `kempo-config.json`:

```json
{ "dependencies": ["kempo-shipping"], "hooks": { "kempo-shipping:rates": "./hooks/rates.js" } }
```

```javascript
export default async ({ parcels, address, origin, units, currency }) => {
  for(const parcel of parcels){
    const price = await usps.rate({ from: origin, to: address, weight: parcel.weight, size: parcel.box });
    if(price) parcel.quotes.push({ carrier: 'USPS', service: 'Ground Advantage', price, days: 3 });
  }
};
```

The handler receives `{ lines, parcels, units, origin, address, currency, charge }`:

| Property | Meaning |
|---|---|
| `parcels` | The order packed into boxes (empty when it could not be). Each is `{ id, box: { id, ref, owner, name, length, width, height, emptyWeight }, items, contentsWeight, weight, quotes }`. `weight` is the contents plus the empty box, in the store's units (`null` when an item's weight is unknown). Push `{ carrier, service, price, days? }` onto `quotes`: `carrier` and `service` are shown to the customer as they are ("USPS" and "Ground Advantage"), `price` is in the smallest currency unit, and `days` is the delivery time when known |
| `origin` | Where orders are sent from: `{ name, phone, line1, line2, city, state, postalCode, country }` (from the **Ship From** tab) |
| `address` | The destination, when it is known |
| `units` | `{ weight: 'lb', dimension: 'in' }`, the units weights and sizes are in |
| `currency` | The currency of the order |
| `lines` | The lines that need sending, each with `quantity`, `rate` (the product's own charge, or `null`), and `weight`, `length`, `width`, `height` per unit (`null` when the product has none) |
| `charge` | `{ amount, method, products, store }`. Leave it unless there are no parcels and you price the order some other way: then set `charge.store` and `charge.method` |

A carrier that cannot price a parcel (the destination is not one it serves) adds nothing for it; another carrier or the
store's own table may. A carrier that throws makes the order unable to be priced, so catch what you can.

**2. Register its boxes** (USPS flat rate boxes), from `install.js` and `update.js`, in the units it works in, and remove
them in `uninstall.js`. They are converted to the store's units, and the seller turns each on or off on the Boxes tab:

```javascript
import { registerBoxes, unregisterBoxes } from 'kempo-shipping/sdk';

await registerBoxes('kempo-usps', [
  { ref: 'priority-medium-flat', name: 'Priority Mail Medium Flat Rate Box', length: 13.625, width: 11.875, height: 3.375, emptyWeight: 0.4 },
], { weightUnit: 'lb', dimensionUnit: 'in' });

await unregisterBoxes('kempo-usps');
```

`ref` is the carrier's own id for the box; registering again updates the box and keeps whether the seller turned it on.
Also exported: `getShippingSettings()` (flat rate, countries, units, `combine`, `origin`), `getBoxes()`, `convertWeight` and
`convertLength`. When the store's units change, kempo-shipping converts the boxes and fires `kempo-shipping:units_changed`
with `{ from, to }` for an extension that keeps weights or sizes of its own.

**3. Add a tab.** The shipping page's tabs are its own. Fill the `shipping-admin-tabs` location with a plain `k-tab` and
`k-tab-content`, and load the carrier's script into `shipping-admin-scripts`, for the carrier's account settings:

```html
<k-tab for="usps">USPS</k-tab><k-tab-content name="usps" class="pt"><k-usps-settings></k-usps-settings></k-tab-content>
```

The carrier's component finds the page with `closest('#shipping')`, listens there for `origin-change` (the Ship From address,
as saved), and reads the address itself when its tab is first shown.

**4. Add a button under the countries**, such as "Add all countries where UPS ships". Fill `shipping-admin-country-actions`
with an element that names its own slot and finds the General tab with `closest()`:

```html
<k-ups-country-button slot="country-actions"></k-ups-country-button>
```

```javascript
this.closest('k-shipping-general').addCountries(['CA', 'MX', 'GB']);
```

`addCountries(codes)` adds two-letter codes to the chosen countries, ignores anything that is not a country, and returns
how many it added. Nothing is saved until the person presses **Save shipping settings**.

## The order's Shipping tab

The admin order page has a **Shipping** tab: where the order is going (staff can **Edit address**; the change is noted in the order history and applies from then on, not to what was charged), the method the customer chose and its estimated delivery, each item's size and weight, the boxes the order was
packed into (inside size, how many items, weight, who priced it, price), and what was charged. Everything is kept with the order's shipping fee
when it is placed, in the units the store had then, so changing boxes, rates or units later never rewrites an old order.
An item with no size or weight set shows "Not set". Orders placed before this was recorded show the address and the
charge only.

## Hooks

| Hook | What it does |
|---|---|
| `kempo-commerce:totals:fees` | Adds the shipping fee at checkout, taxable where kempo-tax says so |
| `kempo-commerce:checkout:validate` | Refuses a missing address, a country not shipped to, or a charge or tax that cannot be worked out |
| `kempo-commerce:checkout:before_place` | Stores the checked address (copied from billing when chosen) in `order.data.shipping` |
| `kempo-shipping:rates` | For carrier extensions, described above |
| `kempo-shipping:units_changed` | Fired after the weight or length unit changes and everything was converted |

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `shipping_flat_rate` | `0` | The flat charge for an order that needs sending, in the smallest currency unit |
| `flat_rate_enabled` | `true` | Whether the flat rate is offered when boxes and carriers cannot price an order |
| `shipping_countries` | blank | The countries physical items ship to, as two-letter codes separated by commas |
| `weight_unit` | `lb` | `oz`, `lb`, `g` or `kg` |
| `dimension_unit` | `in` | `in` or `cm` |
| `combine_items` | `false` | Put several items in one box where they fit |
| `origin_name`, `origin_phone`, `origin_line1`, `origin_line2`, `origin_city`, `origin_state`, `origin_postal_code`, `origin_country` | blank | The address orders are sent from (`origin_country` is a two-letter code) |

## Permissions

`shipping:view` sees the settings; `shipping:manage` changes them. The groups `kempo-shipping:viewer` and
`kempo-shipping:manager` hold them.

## Not built yet

The carrier extensions themselves (USPS, UPS, FedEx), zones and rates by destination, labels, tracking, and the customer and staff
shipment panels.

## Tests

`npm test` covers the packing and the shipping options (every carrier and service every parcel has, cheapest first), the box rules, the address rules (including same as billing), the line rule, the per-product charge arithmetic, the
parcel attributes, the units, and the country list. The checkout behaviour is covered through kempo-commerce's suite.
