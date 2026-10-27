import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';
import '/products/components/AttributeInput.js';

/*
  The Shipping tab of a product template, served at /admin/extension/kempo-shipping/components/ShippingTemplateTab.js: the defaults a
  template gives the shipping attributes (the flat charge, processing days, weight and size). Its own Save button saves them.
*/
const KEYS = ['shippingrate', 'processingdays', 'weight', 'length', 'width', 'height'];

export default class ShippingTemplateTab extends ProductTab {
  changeDefault = event => {
    event.stopPropagation();
    this.form.set({ defaults: { ...this.draft.defaults, [event.detail.key]: event.detail.value } });
  };

  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const { draft, form, config } = this;
    const attributes = form.shared.filter(attribute => KEYS.includes(attribute.key));
    return html`
      <p class="tc-muted mb">The shipping values every product made from this template starts with. Blank means no default.</p>
      ${attributes.map(attribute => html`<k-products-attribute-input .attribute=${attribute} .value=${draft.defaults[attribute.key] ?? ''} .decimals=${config.decimals} .currency=${config.currency} @change=${this.changeDefault}></k-products-attribute-input>`)}
    `;
  }
}

customElements.define('k-shipping-template-tab', ShippingTemplateTab);
