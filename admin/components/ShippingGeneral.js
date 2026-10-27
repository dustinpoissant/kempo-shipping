import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html, nothing } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Tags.js';
import '/kempo-ui/components/Spinner.js';
import '/kempo-ui/components/Toggle.js';
import '/kempo-ui/components/Time.js';
import Toast from '/kempo-ui/components/Toast.js';
import { countryOptions } from '/commerce/utils/regions.js';

/*
  The General tab of the shipping settings, served at /admin/extension/kempo-shipping/components/ShippingGeneral.js: the flat rate, the
  countries physical items ship to, how processing time is counted, and the address orders are sent from. It saves its own fields with
  its own button.

  The saved Ship From address is announced as an `origin-change` event (detail: the address), which bubbles from this element to the
  shipping page's `#shipping` wrapper. Carrier tabs listen there to keep their Test buttons off until the address they need is filled in.

  Other extensions can add a button under the countries: fill the `shipping-admin-country-actions` location, inside this element,
  with an element that names its own slot, and call `addCountries(['MX', 'CA'])` on this element (found with closest()):

    <k-ups-country-button slot="country-actions"></k-ups-country-button>
*/
const ORIGIN_FIELDS = [['name', 'Name or business', 'text'], ['phone', 'Phone', 'tel'], ['line1', 'Address', 'text'], ['line2', 'Apartment, suite, etc.', 'text'], ['city', 'City', 'text'], ['state', 'State or province', 'text'], ['postalCode', 'Postal code', 'text']];

export default class ShippingGeneral extends ShadowComponent {
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
  }

  connectedCallback(){
    super.connectedCallback();
    const pane = this.closest('k-tab-content');
    // Loads when its tab is first shown, so a tab nobody opens makes no requests.
    if(!pane || pane.active) this.load();
    else this.closest('k-tabs')?.addEventListener('tabfirstshown', ({ detail }) => {
      if(detail.tab === pane.name) this.load();
    });
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
    this.dispatchEvent(new CustomEvent('origin-change', { bubbles: true, detail: this.origin }));
  };

  /*
    Event handlers
  */

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

      ${this.renderFlatRate()}

      <h2 class="h4">Where you ship physical items</h2>
      <p class="tc-muted">Only these countries can be chosen as a shipping address for an order that needs sending. Anything else is refused at checkout. ${this.countries.length ? '' : 'None chosen yet, so physical items cannot be ordered.'}</p>
      <k-tags class="d-b mb" .allowedTags=${[...this.names.values()].join(',')} .getSuggestions=${this.suggestCountries} .value=${this.countries.map(code => this.names.get(code)).filter(Boolean).join(',')} @change=${this.chooseCountries}></k-tags>
      <p class="tc-muted">Type a country and press Enter or Tab to add it. Click a country to remove it.</p>
      <div class="d-f mb"><slot name="country-actions"></slot></div>

      ${this.renderProcessing()}

      ${this.renderOrigin()}
      <button type="button" class="primary" ?disabled=${this.saving} @click=${this.save}>${this.saving ? 'Saving…' : 'Save shipping settings'}</button>
    `;
  }
}

customElements.define('k-shipping-general', ShippingGeneral);
