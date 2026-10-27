import ShadowComponent from '/kempo-ui/components/ShadowComponent.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';
import Toast from '/kempo-ui/components/Toast.js';

/*
  The Units tab of the shipping settings, served at /admin/extension/kempo-shipping/components/ShippingUnits.js: the units product
  weights and sizes are measured in, which carrier extensions price by. A unit is a single choice, so it saves as soon as it is picked.
  Changing it converts the weights and sizes saved on products and on carrier tables, so the select waits until that is done, and goes
  back to the old unit if it fails.
*/
const WEIGHT_UNITS = [['lb', 'Pounds (lb)'], ['oz', 'Ounces (oz)'], ['kg', 'Kilograms (kg)'], ['g', 'Grams (g)']];
const DIMENSION_UNITS = [['in', 'Inches (in)'], ['cm', 'Centimetres (cm)']];

export default class ShippingUnits extends ShadowComponent {
  static properties = {
    weightUnit: { state: true },
    dimensionUnit: { state: true },
    changing: { state: true },
    loading: { state: true },
  };

  constructor(){
    super();
    this.weightUnit = 'lb';
    this.dimensionUnit = 'in';
    this.changing = false;
    this.loading = true;
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

  load = async () => {
    const settings = await fetch('/shipping/api/settings', { credentials: 'same-origin' }).then(response => response.json());
    this.weightUnit = settings.weightUnit;
    this.dimensionUnit = settings.dimensionUnit;
    this.loading = false;
  };

  changeUnit = async (key, event) => {
    const select = event.target;
    const previous = this[key];
    const next = select.value;
    if(next === previous) return;
    this.changing = true;
    const response = await fetch('/shipping/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ [key]: next }),
    });
    const body = await response.json().catch(() => ({}));
    this.changing = false;
    if(!response.ok){
      select.value = previous;
      Toast.error(body.error || 'The unit could not be changed.');
      return;
    }
    this[key] = body[key];
    Toast.success('Unit changed. The weights and sizes already saved were converted.');
  };

  render(){
    if(this.loading) return html`<k-spinner></k-spinner>`;
    return html`
      <h2 class="h4">Units</h2>
      <p class="tc-muted">The units product weights and sizes are measured in, and that carrier extensions price by. They save as soon as you pick one, and the weights and sizes already saved on products are converted.</p>
      <label class="mb">
        Weight
        <select ?disabled=${this.changing} @change=${event => this.changeUnit('weightUnit', event)}>${WEIGHT_UNITS.map(([code, label]) => html`<option value=${code} ?selected=${this.weightUnit === code}>${label}</option>`)}</select>
      </label>
      <label class="mb">
        Length, width and height
        <select ?disabled=${this.changing} @change=${event => this.changeUnit('dimensionUnit', event)}>${DIMENSION_UNITS.map(([code, label]) => html`<option value=${code} ?selected=${this.dimensionUnit === code}>${label}</option>`)}</select>
      </label>
    `;
  }
}

customElements.define('k-shipping-units', ShippingUnits);
