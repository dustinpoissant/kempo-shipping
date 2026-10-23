import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, nothing } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Tabs.js';
import '/kempo-ui/components/Tags.js';
import '/kempo-ui/components/Spinner.js';
import '/kempo-ui/components/Toggle.js';
import '/kempo-ui/components/Time.js';
import Toast from '/kempo-ui/components/Toast.js';
import '/admin/extension/kempo-shipping/components/Boxes.js';
import { countryOptions } from '/commerce/utils/regions.js';

/*
  The shipping settings screen, served at /admin/extension/kempo-shipping/components/ShippingSettings.js, in tabs:
  General (the flat rate, the countries physical items ship to, how processing time is counted, and the address orders are
  sent from, which carriers need to quote a rate), Boxes (see Boxes.js) and Units. A product sets its own flat charge, weight and size in the Shipping tab
  of its product form.

  The saved Ship From address is a public property, `origin`, and an `origin-change` event fires on this element when it
  loads and when it is saved. A carrier tab reads and listens to it (it finds this screen with closest()) to keep its Test
  button off until the address it needs is filled in.

  A carrier extension adds a tab by filling the `shipping-admin-tabs` location with an element that names the tab:

    <k-shipping-tab name="table" label="Table Rates"> ...anything... </k-shipping-tab>

  It can also add a button under the countries by filling `shipping-admin-country-actions` with an element that names
  its own slot. It finds this screen with closest() and calls `addCountries(['MX', 'CA'])`:

    <k-ups-country-button slot="country-actions"></k-ups-country-button>
*/
const WEIGHT_UNITS = [['lb', 'Pounds (lb)'], ['oz', 'Ounces (oz)'], ['kg', 'Kilograms (kg)'], ['g', 'Grams (g)']];
const DIMENSION_UNITS = [['in', 'Inches (in)'], ['cm', 'Centimetres (cm)']];
const ORIGIN_FIELDS = [['name', 'Name or business', 'text'], ['phone', 'Phone', 'tel'], ['line1', 'Address', 'text'], ['line2', 'Apartment, suite, etc.', 'text'], ['city', 'City', 'text'], ['state', 'State or province', 'text'], ['postalCode', 'Postal code', 'text']];
const TAG = 'k-shipping-settings';

export class ShippingSettings extends ShadowComponent {
  static properties = {
    rate: { state: true },
    flatRateEnabled: { state: true },
    countries: { state: true },
    origin: { state: true },
    processing: { state: true },
    names: { state: true },
    decimals: { state: true },
    currency: { state: true },
    error: { state: true },
    loading: { state: true },
    saving: { state: true },
    weightUnit: { state: true },
    dimensionUnit: { state: true },
    carrierTabs: { state: true },
    changingUnit: { state: true },
  };

  constructor(){
    super();
    this.rate = '';
    this.flatRateEnabled = true;
    this.countries = [];
    this.origin = {};
    this.processing = { countWeekends: false, cutoff: '17:00', timeZone: 'America/New_York' };
    this.names = new Map();
    this.decimals = 2;
    this.currency = 'USD';
    this.error = '';
    this.loading = true;
    this.saving = false;
    this.weightUnit = 'lb';
    this.dimensionUnit = 'in';
    this.carrierTabs = [];
    this.changingUnit = false;
  }

  connectedCallback(){
    super.connectedCallback();
    this.carrierTabs = [...this.querySelectorAll(':scope > k-shipping-tab')].map($tab => {
      const name = $tab.getAttribute('name') || $tab.getAttribute('label') || 'tab';
      $tab.slot = `tab-${name}`;
      $tab.style.display = 'block';
      return { name, label: $tab.getAttribute('label') || name };
    });
    this.load();
  }

  /*
    Loading and saving
  */

  load = async () => {
    try {
      const [settings, regions, config] = await Promise.all([
        fetch('/shipping/api/settings', { credentials: 'same-origin' }).then(response => response.json()),
        fetch('/commerce/api/regions', { credentials: 'same-origin' }).then(response => response.json()),
        fetch('/products/api/config', { credentials: 'same-origin' }).then(response => response.json()),
      ]);
      this.decimals = config.decimals ?? 2;
      this.currency = String(config.currency ?? 'usd').toUpperCase();
      this.flatRateEnabled = settings.flatRateEnabled !== false;
      this.rate = (settings.flatRate / 10 ** this.decimals).toFixed(this.decimals);
      this.names = new Map(countryOptions(regions, 'en').map(option => [option.code, option.name]));
      this.countries = settings.countries;
      this.origin = settings.origin ?? {};
      this.processing = settings.processing ?? this.processing;
      this.announceOrigin();
      this.weightUnit = settings.weightUnit;
      this.dimensionUnit = settings.dimensionUnit;
    } catch {
      this.error = 'The shipping settings could not be loaded.';
    }
    this.loading = false;
  };

  save = async () => {
    const amount = Number(this.rate);
    const validRate = this.rate.trim() !== '' && Number.isFinite(amount) && amount >= 0;
    if(this.flatRateEnabled && !validRate){
      Toast.error('The flat rate must be an amount of zero or more.');
      return;
    }
    this.saving = true;
    const response = await fetch('/shipping/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        flatRateEnabled: this.flatRateEnabled,
        ...(validRate ? { flatRate: Math.round(amount * 10 ** this.decimals) } : {}),
        countries: this.countries,
        origin: this.origin,
        processing: this.processing,
      }),
    });
    this.saving = false;
    const body = await response.json().catch(() => ({}));
    if(!response.ok){
      Toast.error(body.error || 'The settings could not be saved.');
      return;
    }
    this.countries = body.countries;
    this.origin = body.origin;
    this.processing = body.processing;
    this.announceOrigin();
    Toast.success('Shipping settings saved');
  };

  /* Tells the carrier tabs where orders are sent from, as saved, so they can say when it is missing. */
  announceOrigin = () => {
    this.dispatchEvent(new CustomEvent('origin-change', { detail: this.origin }));
  };

  /*
    Event handlers
  */

  /*
    A unit is a single choice, so it saves as soon as it is picked, on its own. Changing it converts the weights and
    sizes saved on products and on carrier extensions' tables, so the select waits until that is done, and goes back to
    the old unit if it fails.
  */
  changeUnit = async (key, event) => {
    const select = event.target;
    const previous = this[key];
    const next = select.value;
    if(next === previous) return;
    this.changingUnit = true;
    const response = await fetch('/shipping/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ [key]: next }),
    });
    const body = await response.json().catch(() => ({}));
    this.changingUnit = false;
    if(!response.ok){
      select.value = previous;
      Toast.error(body.error || 'The unit could not be changed.');
      return;
    }
    this[key] = body[key];
    Toast.success('Unit changed. The weights and sizes already saved were converted.');
  };

  /* The tags hold country names; the setting holds codes. */
  chooseCountries = event => {
    const codeOf = new Map([...this.names].map(([code, name]) => [name, code]));
    this.countries = event.target.value.split(',').map(name => codeOf.get(name.trim())).filter(Boolean).sort();
  };

  setProcessing = (key, value) => {
    this.processing = { ...this.processing, [key]: value };
  };

  setOrigin = (key, value) => {
    this.origin = { ...this.origin, [key]: value };
  };

  /*
    Public methods, for the buttons a carrier extension puts in the `country-actions` slot
  */

  /* Adds countries by two-letter code. Codes that are not countries are ignored. */
  addCountries = codes => {
    const known = codes.map(code => String(code).toUpperCase()).filter(code => this.names.has(code));
    this.countries = [...new Set([...this.countries, ...known])].sort();
    return known.length;
  };

  suggestCountries = query => [...this.names.values()].filter(name => name.toLowerCase().startsWith(query.trim().toLowerCase()));

  /*
    Rendering
  */

  renderFlatRate(){
    return html`
      <h2 class="h4">Flat rate</h2>
      <label class="checkbox d-f mb"><k-toggle .value=${this.flatRateEnabled} @change=${event => { this.flatRateEnabled = event.currentTarget.value === true; }}></k-toggle> Offer a flat rate</label>
      ${this.flatRateEnabled
        ? html`<label class="mb">
          Shipping charge for an order that needs sending (${this.currency})
          <span class="d-b tc-muted">Charged once per order when your boxes and carriers cannot price it, for the items with no charge of their own. A product's own flat charge replaces this for that item, per unit bought, and 0 makes it free. Set on the product form.</span>
          <input type="number" min="0" step="0.01" .value=${this.rate} style="max-width: 12rem;" @input=${event => { this.rate = event.target.value; }}>
        </label>`
        : html`<p class="tc-muted">Off. An order that your boxes and carriers cannot price cannot be placed, so set up boxes (and a carrier) for everything you sell.</p>`}
    `;
  }

  renderProcessing(){
    const { countWeekends, cutoff, timeZone } = this.processing;
    const zones = Intl.supportedValuesOf('timeZone');
    return html`
      <h2 class="h4">Processing time</h2>
      <p class="tc-muted">A product can say how many days it takes you to make it and get it ready (its <strong>Processing days</strong>, on the product's Shipping tab). It is added to the shipping time to show the customer when it should arrive. These say how the days are counted.</p>
      <label class="checkbox d-f mb"><k-toggle .value=${countWeekends} @change=${event => this.setProcessing('countWeekends', event.currentTarget.value === true)}></k-toggle> Count weekends as processing days</label>
      <label class="checkbox d-f mb"><k-toggle .value=${cutoff !== ''} @change=${event => this.setProcessing('cutoff', event.currentTarget.value === true ? '17:00' : '')}></k-toggle> An order placed after a cutoff time starts counting tomorrow</label>
      ${cutoff !== '' ? html`<label class="mb">
        Cutoff time
        <k-time .value=${cutoff} @change=${event => this.setProcessing('cutoff', event.currentTarget.value || '17:00')}></k-time>
      </label>` : nothing}
      <label class="mb">
        Time zone
        <span class="d-b tc-muted">Which clock the cutoff time is read on. Your browser is on ${Intl.DateTimeFormat().resolvedOptions().timeZone}.</span>
        <select @change=${event => this.setProcessing('timeZone', event.target.value)}>${zones.map(zone => html`<option value=${zone} ?selected=${zone === timeZone}>${zone.replaceAll('_', ' ')}</option>`)}</select>
      </label>
    `;
  }

  renderOrigin(){
    return html`
      <h2 class="h4">Ship from</h2>
      <p class="tc-muted">The address your orders are sent from. A carrier extension (USPS, UPS, FedEx) needs it to work out what a parcel costs to send.</p>
      ${ORIGIN_FIELDS.map(([key, label, type]) => html`<label class="mb">
        ${label}
        <input type=${type} maxlength="200" .value=${this.origin[key] ?? ''} @input=${event => this.setOrigin(key, event.target.value)}>
      </label>`)}
      <label class="mb">
        Country
        <select @change=${event => this.setOrigin('country', event.target.value)}>
          <option value="" ?selected=${!this.origin.country}>Choose a country</option>
          ${[...this.names].map(([code, name]) => html`<option value=${code} ?selected=${this.origin.country === code}>${name}</option>`)}
        </select>
      </label>
    `;
  }

  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    return html`
      ${this.error ? html`<p class="tc-danger" role="alert">${this.error}</p>` : nothing}

      <k-tabs class="mb">
        <k-tab for="general">General</k-tab>
        <k-tab for="boxes">Boxes</k-tab>
        <k-tab for="units">Units</k-tab>
        ${this.carrierTabs.map(tab => html`<k-tab for=${tab.name}>${tab.label}</k-tab>`)}
        <k-tab-content name="general" class="pt">
          ${this.renderFlatRate()}

          <h2 class="h4">Where you ship physical items</h2>
          <p class="tc-muted">Only these countries can be chosen as a shipping address for an order that needs sending. Anything else is refused at checkout. ${this.countries.length ? '' : 'None chosen yet, so physical items cannot be ordered.'}</p>
          <k-tags class="d-b mb" .allowedTags=${[...this.names.values()].join(',')} .getSuggestions=${this.suggestCountries} .value=${this.countries.map(code => this.names.get(code)).filter(Boolean).join(',')} @change=${this.chooseCountries}></k-tags>
          <p class="tc-muted">Type a country and press Enter or Tab to add it. Click a country to remove it.</p>
          <div class="d-f mb"><slot name="country-actions"></slot></div>

          ${this.renderProcessing()}

          ${this.renderOrigin()}
          <button type="button" class="primary" ?disabled=${this.saving} @click=${this.save}>${this.saving ? 'Saving…' : 'Save shipping settings'}</button>
        </k-tab-content>
        <k-tab-content name="boxes" class="pt"><k-shipping-boxes></k-shipping-boxes></k-tab-content>
        <k-tab-content name="units" class="pt">
          <h2 class="h4">Units</h2>
          <p class="tc-muted">The units product weights and sizes are measured in, and that carrier extensions price by. They save as soon as you pick one, and the weights and sizes already saved on products are converted.</p>
          <label class="mb">
            Weight
            <select ?disabled=${this.changingUnit} @change=${event => this.changeUnit('weightUnit', event)}>${WEIGHT_UNITS.map(([code, label]) => html`<option value=${code} ?selected=${this.weightUnit === code}>${label}</option>`)}</select>
          </label>
          <label class="mb">
            Length, width and height
            <select ?disabled=${this.changingUnit} @change=${event => this.changeUnit('dimensionUnit', event)}>${DIMENSION_UNITS.map(([code, label]) => html`<option value=${code} ?selected=${this.dimensionUnit === code}>${label}</option>`)}</select>
          </label>
        </k-tab-content>
        ${this.carrierTabs.map(tab => html`<k-tab-content name=${tab.name} class="pt"><slot name=${`tab-${tab.name}`}></slot></k-tab-content>`)}
      </k-tabs>
    `;
  }
}

customElements.define(TAG, ShippingSettings);
