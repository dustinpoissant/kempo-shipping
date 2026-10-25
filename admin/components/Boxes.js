import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, nothing } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Icon.js';
import '/kempo-ui/components/Spinner.js';
import '/kempo-ui/components/Toggle.js';
import Toast from '/kempo-ui/components/Toast.js';

/*
  The Boxes tab on the Shipping page, served at /admin/extension/kempo-shipping/components/Boxes.js.

    <k-shipping-boxes></k-shipping-boxes>

  The seller lists the boxes they have, with each one's inside size, the weight of the empty box, and optionally what it
  costs to send by weight: "up to this weight costs this", with a price for any weight above (or, for a flat rate box, for
  every weight). A box with no price is priced by a carrier extension (USPS, UPS, FedEx) instead. An order is packed into the
  smallest box it fits. Boxes a carrier extension registered are listed below, and can be turned on or off. A toggle puts
  several items in one box where they fit. Sizes are in the units on the Units tab and prices in the store's currency; the
  form shows whole currency units and stores the smallest.
*/
const TAG = 'k-shipping-boxes';

const blankBox = () => ({ name: '', length: '', width: '', height: '', emptyWeight: '', maxWeight: '', flatRate: false, defaultPrice: '', weights: [] });

export class Boxes extends ShadowComponent {
  static properties = {
    boxes: { state: true },
    carrierBoxes: { state: true },
    combine: { state: true },
    weightUnit: { state: true },
    dimensionUnit: { state: true },
    decimals: { state: true },
    currency: { state: true },
    error: { state: true },
    loading: { state: true },
    saving: { state: true },
  };

  constructor(){
    super();
    this.boxes = [];
    this.carrierBoxes = [];
    this.combine = false;
    this.weightUnit = 'lb';
    this.dimensionUnit = 'in';
    this.decimals = 2;
    this.currency = 'USD';
    this.error = '';
    this.loading = true;
    this.saving = false;
  }

  connectedCallback(){
    super.connectedCallback();
const pane = this.closest('k-tab-content');
    // Loads when its tab is first opened, so a tab nobody opens makes no requests.
    if(!pane || pane.active) this.load();
    else this.closest('k-tabs')?.addEventListener('tabfirstshown', ({ detail }) => {
      if(detail.tab === pane.name) this.load();
    });
  }

  /*
    Loading and saving
  */

  money = minor => (minor === null || minor === undefined ? '' : (minor / 10 ** this.decimals).toFixed(this.decimals));

  fromServer = box => ({
    name: box.name,
    length: String(box.length),
    width: String(box.width),
    height: String(box.height),
    emptyWeight: box.emptyWeight ? String(box.emptyWeight) : '',
    maxWeight: box.maxWeight ? String(box.maxWeight) : '',
    flatRate: box.defaultPrice !== null || box.weights.length > 0,
    defaultPrice: this.money(box.defaultPrice),
    weights: box.weights.map(tier => ({ maxWeight: String(tier.maxWeight), price: this.money(tier.price) })),
  });

  apply = (boxes, combine) => {
    this.boxes = boxes.filter(box => !box.owner).map(this.fromServer);
    this.carrierBoxes = boxes.filter(box => box.owner);
    this.combine = combine;
  };

  load = async () => {
    try {
      const [boxes, settings, products] = await Promise.all([
        fetch('/shipping/api/boxes', { credentials: 'same-origin' }).then(response => response.json()),
        fetch('/shipping/api/settings', { credentials: 'same-origin' }).then(response => response.json()),
        fetch('/products/api/config', { credentials: 'same-origin' }).then(response => response.json()),
      ]);
      this.decimals = products.decimals ?? 2;
      this.currency = String(products.currency ?? 'usd').toUpperCase();
      this.weightUnit = settings.weightUnit;
      this.dimensionUnit = settings.dimensionUnit;
      this.apply(boxes.boxes, settings.combine);
    } catch {
      this.error = 'The boxes could not be loaded.';
    }
    this.loading = false;
  };

  save = async () => {
    const toMinor = value => (String(value).trim() === '' ? null : Math.round(Number(value) * 10 ** this.decimals));
    const toNumber = value => (String(value).trim() === '' ? null : Number(value));
    const boxes = this.boxes.map(box => ({
      name: box.name,
      length: Number(box.length),
      width: Number(box.width),
      height: Number(box.height),
      emptyWeight: toNumber(box.emptyWeight) ?? 0,
      maxWeight: toNumber(box.maxWeight),
      defaultPrice: box.flatRate ? toMinor(box.defaultPrice) : null,
      weights: box.flatRate ? box.weights.map(tier => ({ maxWeight: Number(tier.maxWeight), price: toMinor(tier.price) ?? NaN })) : [],
    }));
    this.saving = true;
    const response = await fetch('/shipping/api/boxes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ combine: this.combine, boxes, carrierBoxes: this.carrierBoxes.map(({ id, enabled }) => ({ id, enabled })) }),
    });
    this.saving = false;
    const body = await response.json().catch(() => ({}));
    if(!response.ok){
      Toast.error(body.error || 'The boxes could not be saved.');
      return;
    }
    this.apply(body.boxes, body.combine);
    Toast.success('Boxes saved');
  };

  /*
    Event handlers
  */

  setBox = (index, patch) => {
    this.boxes = this.boxes.map((box, at) => (at === index ? { ...box, ...patch } : box));
  };

  setTier = (boxIndex, tierIndex, patch) => {
    this.setBox(boxIndex, { weights: this.boxes[boxIndex].weights.map((tier, at) => (at === tierIndex ? { ...tier, ...patch } : tier)) });
  };

  addBox = () => {
    this.boxes = [...this.boxes, blankBox()];
  };

  removeBox = index => {
    this.boxes = this.boxes.filter((box, at) => at !== index);
  };

  addWeight = index => {
    this.setBox(index, { weights: [...this.boxes[index].weights, { maxWeight: '', price: '' }] });
  };

  removeWeight = (boxIndex, tierIndex) => {
    this.setBox(boxIndex, { weights: this.boxes[boxIndex].weights.filter((tier, at) => at !== tierIndex) });
  };

  setCarrierBox = (id, enabled) => {
    this.carrierBoxes = this.carrierBoxes.map(box => (box.id === id ? { ...box, enabled } : box));
  };

  /*
    Rendering
  */

  size(index, key, label, unit){
    return html`<label class="mr">${label} (${unit})
      <input type="number" min="0" step="any" .value=${this.boxes[index][key]} style="max-width: 8rem;" @input=${event => this.setBox(index, { [key]: event.target.value })}>
    </label>`;
  }

  renderWeights(index, box){
    const limit = box.weights.map(tier => Number(tier.maxWeight)).filter(Number.isFinite).sort((a, b) => b - a)[0];
    const blocked = box.weights.length && String(box.defaultPrice).trim() === '';
    return html`
      <label class="checkbox d-f mt mb"><k-toggle .value=${box.flatRate} @change=${event => this.setBox(index, { flatRate: event.currentTarget.value === true })}></k-toggle> Enable Flat Rate Per Box</label>
      ${box.flatRate ? html`
        <table class="mb">
          <thead><tr><th>Max weight (${this.weightUnit})</th><th>Price (${this.currency})</th><th></th></tr></thead>
          <tbody>
            ${box.weights.map((tier, at) => html`<tr>
              <td><input type="number" min="0" step="any" class="full" aria-label="Max weight" .value=${tier.maxWeight} @input=${event => this.setTier(index, at, { maxWeight: event.target.value })}></td>
              <td><input type="number" min="0" step=${(10 ** -this.decimals).toFixed(this.decimals)} class="full" placeholder="0.00" .value=${tier.price} @input=${event => this.setTier(index, at, { price: event.target.value })}></td>
              <td><button type="button" class="no-btn tc-danger" style="cursor: pointer;" title="Remove this weight limit" aria-label="Remove this row" @click=${() => this.removeWeight(index, at)}><k-icon name="delete"></k-icon></button></td>
            </tr>`)}
            <tr>
              <td>${box.weights.length ? 'Anything heavier' : 'Any weight'}</td>
              <td><input type="number" min="0" step=${(10 ** -this.decimals).toFixed(this.decimals)} class="full" placeholder=${box.weights.length ? 'Not available' : '0.00'} .value=${box.defaultPrice} @input=${event => this.setBox(index, { defaultPrice: event.target.value })}></td>
              <td></td>
            </tr>
          </tbody>
        </table>
        ${blocked ? html`<p class="tc-muted mb">A parcel over ${limit} ${this.weightUnit} cannot go in this box. Enter a price to allow it.</p>` : nothing}
        <button type="button" class="btn mb" @click=${() => this.addWeight(index)}><k-icon name="add"></k-icon> Add a weight limit</button>
      ` : html`<p class="tc-muted mb">Off: a carrier extension (USPS, UPS, FedEx, EasyPost) prices this box. With no carrier set up, orders pay the store's flat rate.</p>`}
    `;
  }

  renderCarrierBoxes(){
    if(!this.carrierBoxes.length) return nothing;
    return html`
      <h3 class="h4">Carrier boxes</h3>
      <p class="tc-muted">Boxes your carrier extensions provide. A carrier prices a parcel in one of these when it is the smallest box the order fits. Turn off any you do not have.</p>
      ${this.carrierBoxes.map(box => html`<div class="b r p mb d-f">
        <label class="checkbox d-f flex"><k-toggle .value=${box.enabled} @change=${event => this.setCarrierBox(box.id, event.currentTarget.value === true)}></k-toggle> ${box.name}</label>
        <span class="tc-muted">${box.length} × ${box.width} × ${box.height} ${this.dimensionUnit} · ${box.owner.replace(/^kempo-/, '')}</span>
      </div>`)}
    `;
  }

  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    return html`
      ${this.error ? html`<p class="tc-danger" role="alert">${this.error}</p>` : nothing}
      <p class="tc-muted">List the boxes you ship in. An order is packed into the smallest box it fits, and the box is priced by your table below or by a carrier extension (USPS, UPS, FedEx) from where it ships to where it goes. A product's length, width and height are the room it needs inside a box, packing material included. If an order does not fit any box, a product has no size set, or a parcel cannot be priced, it pays the flat rate.</p>
      <label class="checkbox d-f mb"><k-toggle .value=${this.combine} @change=${event => { this.combine = event.currentTarget.value === true; }}></k-toggle> Put several items in one box where they fit</label>
      <p class="tc-muted">${this.combine ? 'Items are put together into one box where the room they need fits a box you have, and into more boxes when they do not all fit.' : 'Every item ships in a box of its own.'}</p>
      <h3 class="h4">Your boxes</h3>
      ${this.boxes.map((box, index) => html`<div class="b r p mb">
        <div class="d-f mb">
          <label class="flex mr">Name
            <input type="text" class="full" maxlength="100" placeholder="Small box" .value=${box.name} @input=${event => this.setBox(index, { name: event.target.value })}>
          </label>
          <button type="button" class="no-btn tc-danger" style="cursor: pointer;" title="Remove this box" aria-label=${`Remove box ${index + 1}`} @click=${() => this.removeBox(index)}><k-icon name="delete"></k-icon></button>
        </div>
        <p class="mb">Inside size</p>
        <div class="d-f mb">${this.size(index, 'length', 'Length', this.dimensionUnit)}${this.size(index, 'width', 'Width', this.dimensionUnit)}${this.size(index, 'height', 'Height', this.dimensionUnit)}</div>
        <div class="d-f mb">
          ${this.size(index, 'emptyWeight', 'Empty box weight', this.weightUnit)}
          ${this.size(index, 'maxWeight', 'Most it can hold', this.weightUnit)}
        </div>
        ${this.renderWeights(index, box)}
      </div>`)}
      ${this.boxes.length ? nothing : html`<p class="mb">No boxes of your own yet. Carriers (USPS, UPS, FedEx, EasyPost) price the boxes your orders are packed into, so with no box every order pays the flat rate. Add one that fits your products: it does not need a price.</p>`}
      ${this.renderCarrierBoxes()}
      <div class="d-f mb">
        <button type="button" class="btn mr" @click=${this.addBox}><k-icon name="add"></k-icon> Add a box</button>
        <button type="button" class="primary" ?disabled=${this.saving} @click=${this.save}>${this.saving ? 'Saving…' : 'Save boxes'}</button>
      </div>
    `;
  }
}

customElements.define(TAG, Boxes);
