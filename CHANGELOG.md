# Changelog

All notable changes to `kempo-shipping` are documented in this file.

## [Unreleased]

### Changed

- **The order's Shipping section is now a tab** on the admin order page (`admin/order-tab.global.html`), and the order's shipping address can be edited there (`PUT /shipping/api/orders/:id/address`, `shipping:manage`). The tab also shows the method the customer chose and its estimated delivery.

### Added

- **Carrier requests wait for a finished address.** The shipping price is worked out only when every required address field is filled in and the customer has left a field, not while they type, so carrier rate requests (which can cost money) are not spent on half an address. The page sends `shippingKey` for the finished address and the server asks a carrier only for a matching one; cached prices are still used. The `kempo-shipping:rates` payload gains `ready`, and a carrier that held back sets `charge.pending = true` (the order then has no price yet, a 202, instead of a flat rate that flashes up and changes).
- **Delivery is an estimate, as a range.** Each option shows its time in transit as a range ("3–4 business days") and "Estimated delivery Oct 28 – 29": the earliest date, and one more weekday to allow for holidays (`arrival` and `arrivalLatest`).
- **Processing days and arrival dates.** A product or template can have **Processing days** (how long it takes to make and ship). New **Processing time** settings on the General tab say whether weekends count, the cutoff time after which an order starts counting tomorrow, and the time zone the cutoff is read on. Each shipping option now carries `ships` and `arrival` dates (the longest processing time, then the carrier's weekdays in transit), shown at checkout as "Arrives by Wed, Oct 28".
- **The shipping method at checkout is a set of cards** with the price and arrival date, instead of a drop-down. The chosen card is highlighted; it is a button group (`role="radio"`), so it works with a keyboard and has no radio dot.
- **A box's own prices are behind a switch** (**Enable Flat Rate Per Box**, off by default). Off, a carrier prices the box; on, the weight and price table appears. Turning it off and saving clears the box's prices.
- **Boxes are built in** (they were the `kempo-shipping-boxes` extension, which this replaces). A **Boxes** tab lists the boxes you ship in; an order is packed into the smallest box it fits, optionally several items to a box. A box now has an empty weight (added to the parcel's), an optional maximum weight, and an optional price table: a box with no price is priced by a carrier. Existing boxes and the combine setting are kept on update.
- **Ready for carrier extensions (USPS, UPS, FedEx):** `kempo-shipping:rates` now receives the packed `parcels`, the `origin` and the `address`; a carrier pushes `{ carrier, service, price, days? }` onto each parcel's `quotes`. `charge.shipments` now records the carrier and service.
- **The customer chooses how it is sent:** every carrier and service that has a quote for each parcel is offered under the shipping address as a **Shipping method** choice, cheapest first and chosen by default (it is hidden when there is only one). The choice is sent as `shippingOption`, priced again by the server, and kept on the order's shipping fee with the options it was chosen from.
- **The flat rate can be turned off** (`flat_rate_enabled`, an **Offer a flat rate** switch). With it off, an order that boxes and carriers cannot price cannot be placed (the checkout says shipping cannot be worked out), so a store with a carrier extension does not fall back to a rate it never wanted.
- **Ship from** on the General tab: the address orders are sent from, which carriers need to quote a rate (`origin_*` settings).
- **Carrier boxes:** `registerBoxes` and `unregisterBoxes` in `kempo-shipping/sdk` let a carrier register its own boxes (in its own units, converted to the store's); the seller turns each on or off on the Boxes tab. Boxes are converted when the units change.
- The order's Shipping panel shows who priced each box.

- **Shipping details can come from the product template:** the weight, size and flat charge attributes are ordinary product attributes, so a template (every model car) can set them once as defaults and its products use them until they set their own. Rates use the product's own values over the template's, and a change of units converts the templates' defaults along with the products.
- **A Shipping section on the admin order page:** the address, each item's size and weight, the boxes a carrier chose and what was charged. It is recorded on the order's shipping fee when the order is placed (units included), so later changes never rewrite an old order. A carrier supplies its boxes in `charge.shipments`.
- **A units change reaches the carrier extensions:** after converting the products, kempo-shipping fires `kempo-shipping:units_changed` with `{ from, to }`, and exports `convertWeight` and `convertLength` from `kempo-shipping/sdk`, so an extension that keeps weights or sizes of its own converts them too.
- Saving the settings shows a toast, and a unit saves as soon as it is picked (and goes back to the old one if converting fails).
- **The Shipping page is a set of tabs:** General (the flat rate, the countries and where you ship from), Boxes, Units, and a tab for each carrier extension, added through the `shipping-admin-tabs` location with a `k-shipping-tab`.
- **Units:** weight in pounds, ounces, grams or kilograms, and length, width and height in inches or centimetres. Changing them converts the weights and sizes already saved on products and renames the product attributes.
- **Product weight, length, width and height**, registered here so every carrier extension uses the same attributes. Length, width and height are the room the product needs inside a box, packing material included. With the product's flat charge they are in a **Shipping** tab on the product form.
- **The `kempo-shipping:rates` hook** now gives a carrier the lines with their weight and size, the units, and `charge.products` and `charge.store`, so it can replace the store's part while a product's own flat charge is kept.
- A **Shipping** admin page with the store's **flat rate** and the **countries physical items ship to**. Physical items cannot be ordered to a country that is not chosen, and the checkout offers only those countries.
- A **product's own flat charge**, a money attribute registered with kempo-products. A blank attribute uses the store's rate; 0 is free. The charge is paid per unit bought, and the store's rate once per order for lines without one.
- **A button slot under the countries** (`shipping-admin-country-actions`) and `addCountries(codes)` on `k-shipping-settings`, so a carrier can add "Add all countries where UPS ships".
- A **shipping address** on the checkout, as its own panel between billing and store credit. **Same as billing** is the default: the server copies the billing address when the order is placed.
- **Shipping tax** from kempo-tax: the fee is marked taxable only where kempo-tax says shipping is taxed.
- The address is checked at checkout and kept with the order as `order.data.shipping`.
