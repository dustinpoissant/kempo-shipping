import ProductTab from '/products/components/ProductTab.js';
import { html } from '/kempo-ui/lit-all.min.js';
import '/kempo-ui/components/Spinner.js';

/*
  The Shipping tab of the product form, served at /admin/extension/kempo-shipping/components/ShippingProductTab.js: the store's own
  flat charge for the product, its processing days, and its weight and size. kempo-shipping owns these attributes and shows them here;
  the product form does not decide where they go. Its own Save button saves them.

    <k-shipping-product-tab></k-shipping-product-tab>
*/
const KEYS = ['shippingrate', 'processingdays', 'weight', 'length', 'width', 'height'];

export default class ShippingProductTab extends ProductTab {
  render(){
    if(!this.ready) return html`<k-spinner></k-spinner>`;
    const attributes = this.form.allAttributes.filter(attribute => KEYS.includes(attribute.key));
    return html`
      <p class="tc-muted mb">How this product is shipped. Blank values use the store's own settings.</p>
      ${attributes.map(this.renderAttributeInput)}
    `;
  }
}

customElements.define('k-shipping-product-tab', ShippingProductTab);
