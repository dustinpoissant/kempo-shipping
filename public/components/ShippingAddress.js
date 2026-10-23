import LightComponent from '/kempo-ui/components/LightComponent.js';
import { html, nothing } from '/kempo-ui/lit-all.min.js';
import { getRegions } from '/commerce/sdk.js';
import { countryOptions, subdivisionOptions } from '/commerce/utils/regions.js';
import { registerCheckoutSection } from '/commerce/components/checkoutSections.js';
import '/kempo-ui/components/Icon.js';
import { loadFormat } from '/commerce/utils/format.js';
import addressKey from '/shipping/utils/addressKey.js';

/*
  The shipping address panel on the checkout page, served at /shipping/components/ShippingAddress.js.

  "Same as billing" is the default, and then the panel is only that tick box: the server copies the billing address
  when the order is placed, so it always follows billing. Unticked, the fields show. The panel is done when the
  address is complete, or when nothing in the order needs sending. Every change is handed to the checkout with
  setData, which is how the checkout sees the panel is done and opens the next one.

  **Nothing is asked of a carrier while the customer is typing.** Carrier rate requests can cost money, so the shipping price is
  worked out only when every required field is filled in and the customer has left a field (the checkout's `change` and
  `focusout`). Then the panel sends `shippingKey`, a text standing for exactly that address (see utils/addressKey.js), and asks
  the checkout to price again. The server asks a carrier only for an address whose key matches, and otherwise answers from what
  it already knows. Until then the panel says the options appear when the address is finished, and the order cannot be placed.

  The ways of sending the order (the store's own rate, USPS Ground Advantage, UPS Ground...) appear under the address as
  cards, cheapest first, with the price and, when it is known, the date it should arrive. The cheapest is chosen until the
  customer picks another. The server lists them with the shipping fee (`data.options` on the fee in the quote's cart, with
  the `arrival` date worked out from the products' processing days) and the pick is sent back as `shippingOption`.
*/
const TAG = 'k-shipping-address';

const WAITING = 'Finish your shipping address and the shipping options will appear.';

const UNAVAILABLE = "We can't ship this order to this address right now. Check the address, or contact the store.";

const REQUIRED = ['name', 'line1', 'city', 'postalCode', 'country'];
const BILLING_REQUIRED = ['name', 'line1', 'city', 'postalCode', 'country'];

export class ShippingAddress extends LightComponent {
  static properties = {
    address: { state: true },
    regions: { state: true },
    sameAsBilling: { state: true },
    destinations: { state: true },
    choice: { state: true },
    confirmedKey: { state: true },
    money: { state: true },
  };

  constructor(){
    super();
    this.checkoutPage = null;
    this.address = { name: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: '' };
    this.regions = null;
    this.sameAsBilling = true;
    this.destinations = null;
    this.choice = null;
    this.confirmedKey = null;
    this.listening = false;
    this.money = minor => String(minor);
    this.announced = false;
  }

  /* The checkout hands itself over. Until the customer changes anything, the order ships to billing. */
  set checkout(page){
    this.checkoutPage = page;
    if(page && !this.listening){
      this.listening = true;
      page.addEventListener('change', this.finishedField);
      page.addEventListener('focusout', this.finishedField);
    }
    if(this.announced) return;
    this.announced = true;
    queueMicrotask(() => this.announce());
  }

  get checkout(){
    return this.checkoutPage;
  }

  disconnectedCallback(){
    super.disconnectedCallback();
    this.checkoutPage?.removeEventListener('change', this.finishedField);
    this.checkoutPage?.removeEventListener('focusout', this.finishedField);
    this.listening = false;
  }

  connectedCallback(){
    super.connectedCallback();
    loadFormat().then(format => { this.money = format.money; });
    getRegions().then(([, regions]) => { this.regions = regions; });
    fetch('/shipping/api/destinations', { credentials: 'same-origin' }).then(response => response.json()).then(({ countries }) => { this.destinations = countries; });
  }

  /*
    Done when there is nothing to send, when it is the same as a complete billing address, or when every required
    field is filled in.
  */

  get complete(){
    if(!this.shippable) return true;
    return this.addressDone && this.confirmed && !this.unavailable;
  }

  /* The address the order goes to: the billing one while "same as billing" is ticked, otherwise the one typed here. */
  get currentAddress(){
    return this.sameAsBilling ? this.checkout?.form ?? {} : this.address;
  }

  /* Every required field is filled in and the customer has left the last one, so this exact address may be priced. */
  get confirmed(){
    return this.addressDone && this.confirmedKey === addressKey(this.currentAddress);
  }

  /* The address is complete but the customer has not yet left a field, so nothing has been asked of a carrier. */
  get awaiting(){
    return this.addressDone && !this.confirmed;
  }

  get addressDone(){
    if(this.sameAsBilling){
      const form = this.checkout?.form ?? {};
      return this.billingReady && this.shipsTo(form.country) && (subdivisionOptions(this.regions, form.country, navigator.language || 'en').length === 0 || String(form.state ?? '') !== '');
    }
    const { address } = this;
    return REQUIRED.every(field => address[field].trim() !== '') && (this.stateOptions.length === 0 || address.state !== '') && this.shipsTo(address.country);
  }

  /* The shipping fee the server worked out for this address, with the ways of sending it that it offered. */
  get fee(){
    return (this.checkout?.quote?.cart?.adjustments ?? []).find(adjustment => adjustment.source === 'kempo-shipping' && adjustment.code === 'shipping') ?? null;
  }

  get options(){
    return this.fee?.data?.options ?? [];
  }

  /* The option chosen: the customer's pick when it is still offered, otherwise the cheapest, which is what the server uses. */
  get selected(){
    return this.options.find(option => option.key === this.choice) ?? this.options[0] ?? null;
  }

  /* The checkout keeps the order from being placed while this says why it cannot. */
  get blocker(){
    if(!this.shippable) return '';
    if(this.awaiting) return WAITING;
    return this.unavailable ? UNAVAILABLE : '';
  }

  /* The address is complete, the server has answered, and it could not price the order: nothing can be placed yet. */
  get unavailable(){
    return this.confirmed && !this.checkout?.pricing && !this.fee;
  }

  get billingReady(){
    const form = this.checkout?.form ?? {};
    return BILLING_REQUIRED.every(field => String(form[field] ?? '').trim() !== '');
  }

  /* Whether the store ships physical items to a country. Until the list has loaded, nothing is refused yet. */
  shipsTo(country){
    return !this.destinations || this.destinations.includes(country);
  }

  get countryChoices(){
    const all = this.regions ? countryOptions(this.regions, navigator.language || 'en') : [];
    return this.destinations ? all.filter(option => this.destinations.includes(option.code)) : all;
  }

  get shippable(){
    return (this.checkout?.quote?.cart?.lines ?? []).some(line => !line.creditsOnly);
  }

  get stateOptions(){
    return subdivisionOptions(this.regions, this.address.country, navigator.language || 'en');
  }

  /*
    Event handlers
  */

  announce(){
    this.checkout?.setData('shipping', this.sameAsBilling ? { sameAsBilling: true } : this.address);
  }

  toggleSame = event => {
    this.sameAsBilling = event.target.checked;
    this.confirmedKey = null;
    this.announce();
    this.confirm();
  };

  type = (name, event) => {
    const next = { ...this.address, [name]: event.target.value };
    if(name === 'country') next.state = '';
    this.address = next;
    this.checkout?.setData('shipping', this.address);
  };

  chooseMethod = key => {
    this.choice = key;
    this.checkout?.setData('shippingOption', this.choice);
    this.checkout?.reprice();
  };

  /*
    A field was left. When the whole address is filled in, and it is not the one already priced, tell the server this is the
    finished address and price again. Once per address: leaving other fields, or typing in a field without leaving it, asks
    nothing of a carrier. Runs after the field's own handlers, so what was typed is in the form.
  */
  finishedField = () => {
    setTimeout(this.confirm);
  };

  confirm = () => {
    if(!this.shippable || !this.addressDone) return;
    const key = addressKey(this.currentAddress);
    if(key === this.confirmedKey) return;
    this.confirmedKey = key;
    this.checkout?.setData('shippingKey', key);
    this.checkout?.reprice();
  };

  /* Kept for the fields below: leaving one is handled by the checkout-wide listener above. */
  changed = () => {
    this.finishedField();
  };

  /*
    Rendering
  */

  field(name, label, { required = false, hint = '', autocomplete = '' } = {}){
    return html`
      <label class="mb">
        ${label}${required ? html` <span class="tc-danger" aria-hidden="true">*</span>` : nothing}
        ${hint ? html`<small class="tc-muted d-b">${hint}</small>` : nothing}
        <input type="text" .value=${this.address[name]} ?required=${required} autocomplete=${autocomplete || 'off'} @input=${event => this.type(name, event)} @change=${this.changed}>
      </label>
    `;
  }

  /* Two dates as the customer's own calendar writes a range (Oct 28 – 29). Noon UTC, so no time zone can move a day. */
  rangeText = (from, to) => new Intl.DateTimeFormat(navigator.language || 'en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).formatRange(new Date(`${from}T12:00:00Z`), new Date(`${to}T12:00:00Z`));

  /* The time it takes, as a range ("3–4 business days") because it is an estimate, then the estimated delivery dates. */
  whenText = option => {
    const lines = [];
    if(option.days) lines.push(`${option.days}–${option.days + 1} business days`);
    if(option.arrival && option.arrivalLatest) lines.push(`Estimated delivery ${this.rangeText(option.arrival, option.arrivalLatest)}`);
    return lines.join(' · ');
  };

  renderMethod(){
    const { options, selected } = this;
    if(this.awaiting && !options.length) return html`<p class="tc-muted mb">${WAITING}</p>`;
    if(this.blocker && !this.awaiting) return html`<p class="tc-danger" role="alert">${this.blocker}</p>`;
    if(!options.length) return nothing;
    return html`
      <div class="mb" role="radiogroup" aria-label="Shipping method">
        <p class="mb">Shipping method</p>
        ${options.map(option => {
          const chosen = option.key === selected?.key;
          const when = this.whenText(option);
          return html`<button type="button" role="radio" aria-checked=${chosen ? 'true' : 'false'} class=${`full ta-left mb${chosen ? ' primary' : ''}`} @click=${() => this.chooseMethod(option.key)}>
            ${chosen ? html`<k-icon name="check"></k-icon> ` : nothing}<strong>${option.label}</strong> ${this.money(option.price)}
            ${when ? html`<small class="d-b">${when}</small>` : nothing}
          </button>`;
        })}
      </div>
    `;
  }

  renderLightDom(){
    if(!this.shippable) return html`<p class="tc-muted">Nothing in this order needs sending.</p>`;
    const { address, regions, stateOptions } = this;
    return html`
      ${this.destinations && !this.destinations.length ? html`<p class="tc-danger">Physical items cannot be shipped yet: the store has not chosen the countries it ships to.</p>` : nothing}
      ${this.destinations && this.destinations.length && !this.shipsTo(this.checkout?.form?.country) && this.sameAsBilling ? html`<p class="tc-warning">The store does not ship to your billing country. Choose another shipping address.</p>` : nothing}
      <label class="checkbox mb"><input type="checkbox" .checked=${this.sameAsBilling} @change=${this.toggleSame}> Same as billing address</label>
      ${this.sameAsBilling ? nothing : html`<div class="mb">
        ${this.field('name', 'Full name', { required: true, autocomplete: 'shipping name' })}
        ${this.field('line1', 'Address', { required: true, autocomplete: 'shipping address-line1' })}
        ${this.field('line2', 'Apartment, suite, etc.', { autocomplete: 'shipping address-line2' })}
        ${this.field('city', 'City', { required: true, autocomplete: 'shipping address-level2' })}
        ${stateOptions.length
          ? html`<label class="mb">State or region <span class="tc-danger" aria-hidden="true">*</span>
              <select autocomplete="shipping address-level1" @change=${event => { this.type('state', event); this.changed(); }}>
                <option value="" ?selected=${!address.state}>Select a state or region</option>
                ${stateOptions.map(state => html`<option value=${state.code} ?selected=${state.code === address.state}>${state.name}</option>`)}
              </select>
            </label>`
          : this.field('state', 'State or region', { autocomplete: 'shipping address-level1' })}
        ${this.field('postalCode', 'Postal code', { required: true, autocomplete: 'shipping postal-code' })}
        ${regions
          ? html`<label class="mb">Country <span class="tc-danger" aria-hidden="true">*</span>
              <select autocomplete="shipping country" @change=${event => { this.type('country', event); this.changed(); }}>
                <option value="" ?selected=${!address.country}>Select a country</option>
                ${this.countryChoices.map(country => html`<option value=${country.code} ?selected=${country.code === address.country}>${country.name}</option>`)}
              </select>
            </label>`
          : this.field('country', 'Country', { required: true, hint: 'A two-letter code, such as US or GB', autocomplete: 'shipping country' })}
      </div>`}
      ${this.renderMethod()}
    `;
  }
}

customElements.define(TAG, ShippingAddress);
registerCheckoutSection(TAG, { title: 'Shipping address', priority: 300 });
