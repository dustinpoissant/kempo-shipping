import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, nothing } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';
import '/kempo-ui/components/Icon.js';
import Toast from '/kempo-ui/components/Toast.js';
import { getOrder, getRegions } from '/commerce/sdk.js';
import { loadFormat } from '/commerce/utils/format.js';
import { countryOptions } from '/commerce/utils/regions.js';

/*
  The Shipping tab of the admin order page, served at /admin/extension/kempo-shipping/components/OrderShipping.js.

    <k-shipping-order></k-shipping-order>

  It is the content of a `k-commerce-order-tab` that admin/order-tab.global.html puts on the page, and shows where the order is
  going (staff can edit the address), the method the customer chose and when it was estimated to arrive, the size and weight of
  each item that was sent, the boxes the order was packed into and how each was priced, and what was charged. All of that except
  the address was kept with the order's shipping fee when it was placed, in the units the store had then, so a later change of
  rates, boxes or units never rewrites an old order. Changing the address changes where it is sent from now on; it does not
  change what was charged, or the address on a label that was already bought.
*/
const TAG = 'k-shipping-order';

export class OrderShipping extends ShadowComponent {
  static properties = {
    order: { state: true },
    money: { state: true },
    loading: { state: true },
    editing: { state: true },
    draft: { state: true },
    countries: { state: true },
    saving: { state: true },
  };

  constructor(){
    super();
    this.order = null;
    this.money = minor => String(minor);
    this.loading = true;
    this.editing = false;
    this.draft = {};
    this.countries = [];
    this.saving = false;
  }

  connectedCallback(){
    super.connectedCallback();
    this.load();
  }

  load = async () => {
    const id = new URLSearchParams(location.search).get('id') ?? '';
    const [[error, data], format] = await Promise.all([getOrder(id), loadFormat()]);
    this.money = format.money;
    this.order = error ? null : data.order;
    this.loading = false;
  };

  /* The address as a form: the countries are only asked for when somebody starts editing. */
  edit = async () => {
    this.draft = { name: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: '', ...(this.order?.data?.shipping ?? {}) };
    this.editing = true;
    if(!this.countries.length){
      const [, regions] = await getRegions();
      if(regions) this.countries = countryOptions(regions, navigator.language || 'en');
    }
  };

  setDraft = (name, value) => {
    this.draft = { ...this.draft, [name]: value };
  };

  save = async event => {
    event.preventDefault();
    this.saving = true;
    const response = await fetch(`/shipping/api/orders/${encodeURIComponent(this.order.id)}/address`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ address: this.draft }),
    });
    this.saving = false;
    const body = await response.json().catch(() => ({}));
    if(!response.ok){
      Toast.error(body.error || 'The address could not be saved.');
      return;
    }
    Toast.success('Shipping address changed');
    this.editing = false;
    await this.load();
  };

  /*
    Rendering
  */

  get fee(){
    return this.order?.adjustments?.find(adjustment => adjustment.type === 'fee' && adjustment.code === 'shipping' && adjustment.source === 'kempo-shipping') ?? null;
  }

  size = (item, unit) => (item.length && item.width && item.height ? `${item.length} × ${item.width} × ${item.height} ${unit}` : html`<span class="tc-warning">Not set</span>`);

  weight = (item, unit) => (item.weight ? `${item.weight} ${unit}` : html`<span class="tc-warning">Not set</span>`);

  field(name, label, { required = false } = {}){
    return html`<label class="mb">${label}${required ? html` <span class="tc-danger" aria-hidden="true">*</span>` : nothing}
      <input type="text" ?required=${required} .value=${this.draft[name] ?? ''} @input=${event => this.setDraft(name, event.target.value)}></label>`;
  }

  renderEditor(){
    return html`
      <form @submit=${this.save} class="mb">
        ${this.field('name', 'Full name', { required: true })}
        ${this.field('line1', 'Address', { required: true })}
        ${this.field('line2', 'Apartment, suite, etc.')}
        ${this.field('city', 'City', { required: true })}
        ${this.field('state', 'State or region')}
        ${this.field('postalCode', 'Postal code', { required: true })}
        <label class="mb">Country <span class="tc-danger" aria-hidden="true">*</span>
          ${this.countries.length
    ? html`<select required @change=${event => this.setDraft('country', event.target.value)}>
                <option value="" ?selected=${!this.draft.country}>Select a country</option>
                ${this.countries.map(country => html`<option value=${country.code} ?selected=${country.code === this.draft.country}>${country.name}</option>`)}
              </select>`
    : html`<input type="text" required maxlength="2" .value=${this.draft.country ?? ''} @input=${event => this.setDraft('country', event.target.value.toUpperCase())}>`}
        </label>
        <div class="d-f">
          <button class="primary mr" ?disabled=${this.saving}>${this.saving ? 'Saving…' : 'Save address'}</button>
          <button type="button" class="btn" ?disabled=${this.saving} @click=${() => { this.editing = false; }}>Cancel</button>
        </div>
      </form>
    `;
  }

  renderAddress(address){
    if(this.editing) return this.renderEditor();
    if(!address) return html`<p class="tc-muted mb">No shipping address was kept with this order.</p><button class="btn mb" @click=${this.edit}>Add an address</button>`;
    const place = [address.city, address.state, address.postalCode].filter(Boolean).join(', ');
    return html`
      <p class="mb">${[address.name, address.line1, address.line2, place, address.country].filter(Boolean).map(line => html`${line}<br>`)}</p>
      <button class="btn mb" @click=${this.edit}><k-icon name="edit"></k-icon> Edit address</button>
    `;
  }

  /* The day range the customer was shown (2026-10-28 and 2026-10-29 are "Oct 28 – 29"), in the seller's calendar. */
  rangeText = (from, to) => new Intl.DateTimeFormat(navigator.language || 'en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).formatRange(new Date(`${from}T12:00:00Z`), new Date(`${to}T12:00:00Z`));

  renderChoice(data){
    const chosen = (data.options ?? []).find(option => option.key === data.selected);
    if(!chosen) return nothing;
    return html`
      <h3 class="h6">Shipping method the customer chose</h3>
      <p class="mb"><strong>${chosen.label}</strong> ${this.money(chosen.price)}
        ${chosen.days ? html`<br><span class="tc-muted">${chosen.days}–${chosen.days + 1} business days</span>` : nothing}
        ${chosen.arrival && chosen.arrivalLatest ? html`<br><span class="tc-muted">Estimated delivery ${this.rangeText(chosen.arrival, chosen.arrivalLatest)}, as shown when it was ordered</span>` : nothing}
      </p>
    `;
  }

  renderItems(data){
    const units = data.units ?? { weight: '', dimension: '' };
    return html`
      <table class="mb">
        <thead><tr><th>Item</th><th>Quantity</th><th>Size needed (each)</th><th>Weight (each)</th><th>Own charge</th></tr></thead>
        <tbody>${(data.lines ?? []).map(item => html`<tr>
          <td>${item.name}</td>
          <td>${item.quantity}</td>
          <td>${this.size(item, units.dimension)}</td>
          <td>${this.weight(item, units.weight)}</td>
          <td>${item.rate === null || item.rate === undefined ? html`<span class="tc-muted">Store rate</span>` : this.money(item.rate)}</td>
        </tr>`)}</tbody>
      </table>
    `;
  }

  renderBoxes(data){
    const units = data.units ?? { weight: '', dimension: '' };
    if(!data.shipments?.length) return nothing;
    return html`
      <h3 class="h6">Boxes</h3>
      <table class="mb">
        <thead><tr><th>Box</th><th>Inside size</th><th>Items</th><th>Weight</th><th>Sent by</th><th>Price</th></tr></thead>
        <tbody>${data.shipments.map(box => html`<tr>
          <td>${box.name || 'Unnamed box'}</td>
          <td>${box.length} × ${box.width} × ${box.height} ${units.dimension}</td>
          <td>${box.items}</td>
          <td>${box.weight ? `${box.weight} ${units.weight}` : html`<span class="tc-muted">Not set</span>`}</td>
          <td>${[box.carrier, box.service].filter(Boolean).join(' ') || 'Store rate'}</td>
          <td>${this.money(box.price)}</td>
        </tr>`)}</tbody>
      </table>
    `;
  }

  /* How the charge was reached, in plain words. */
  how(data){
    if(!data.method) return 'How this was priced was not kept for this order, which was placed before shipping details were recorded.';
    if(data.method === 'boxes') return 'Priced by the box each parcel went in.';
    if(data.method && data.method !== 'flat') return `Priced by ${data.method}, as the customer chose.`;
    return 'The store flat rate, because no carrier priced these items (a product has no size set, or something does not fit any box).';
  }

  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    const { fee } = this;
    const address = this.order?.data?.shipping;
    if(!this.order || (!fee && !address)) return nothing;
    const data = fee?.data ?? {};
    return html`
      <h3 class="h6">Ship to</h3>
      ${this.renderAddress(address)}
      ${this.renderChoice(data)}
      ${data.lines?.length ? html`<h3 class="h6">Items</h3>${this.renderItems(data)}` : nothing}
      ${this.renderBoxes(data)}
      ${fee ? html`<p class="mb"><strong>Charged ${this.money(fee.amount)}.</strong> <span class="tc-muted">${this.how(data)}</span></p>` : nothing}
    `;
  }
}

customElements.define(TAG, OrderShipping);
