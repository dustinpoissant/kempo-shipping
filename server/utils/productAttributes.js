import { registerAttribute, getProducts, updateProduct, getTemplates, updateTemplate } from 'kempo-products/sdk';
import { WEIGHT_UNITS, DIMENSION_UNITS, convertWeight, convertLength } from './units.js';

/*
  The attributes every shipping extension reads from a product, owned here so a carrier extension never defines its own:
  the store's own flat charge for the product, and its weight and size. They live in the product form's Shipping
  tab. Weight and size are in the store's units, and their labels say which; changing the units converts what is
  saved (see convertProducts).
*/
const OWNER = 'kempo-shipping';
const TAB = 'shipping';
const SPACE = 'The room the product needs inside a box, including any packing material. It is not the size of the box it ends up in.';

export const shippingAttributes = ({ weightUnit, dimensionUnit }) => [
  { key: 'shippingrate', label: 'Flat shipping charge (blank uses the store rate)', type: 'currency', tab: TAB },
  { key: 'processingdays', label: 'Processing days', type: 'number', tab: TAB, description: 'How many days it takes you to make this and get it ready to ship. Blank ships the day it is ordered. Added to the shipping time to show the customer when it should arrive.' },
  { key: 'weight', label: `Weight (${weightUnit})`, type: 'number', tab: TAB },
  { key: 'length', label: `Length needed (${dimensionUnit})`, type: 'number', tab: TAB, description: SPACE },
  { key: 'width', label: `Width needed (${dimensionUnit})`, type: 'number', tab: TAB, description: SPACE },
  { key: 'height', label: `Height needed (${dimensionUnit})`, type: 'number', tab: TAB, description: SPACE },
];

export const registerShippingAttributes = async units => {
  for(const definition of shippingAttributes(units)){
    const [error] = await registerAttribute(OWNER, definition);
    if(error) throw new Error(error.msg);
  }
};

/*
  The weights and sizes saved on products and on product templates (their defaults), converted when the store changes
  its units, so a number that meant pounds does not quietly start meaning kilograms. Goes through every product a
  page at a time.
*/
export const convertProducts = async ({ from, to }) => {
  const changes = [];
  if(from.weightUnit !== to.weightUnit && from.weightUnit in WEIGHT_UNITS && to.weightUnit in WEIGHT_UNITS){
    changes.push(['weight', value => convertWeight(value, from.weightUnit, to.weightUnit)]);
  }
  if(from.dimensionUnit !== to.dimensionUnit && from.dimensionUnit in DIMENSION_UNITS && to.dimensionUnit in DIMENSION_UNITS){
    for(const key of ['length', 'width', 'height']) changes.push([key, value => convertLength(value, from.dimensionUnit, to.dimensionUnit)]);
  }
  if(!changes.length) return [null, { converted: 0 }];
  let converted = 0;
  const [templatesError, templates = []] = await getTemplates();
  if(templatesError) return [templatesError, null];
  for(const template of templates){
    const defaults = {};
    for(const [key, convert] of changes){
      const value = template.defaults?.[key];
      if(value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) defaults[key] = convert(Number(value));
    }
    if(!Object.keys(defaults).length) continue;
    const [updateError] = await updateTemplate(template.key, { defaults: { ...template.defaults, ...defaults } });
    if(updateError) return [updateError, null];
  }
  for(let offset = 0; ; offset += 100){
    const [error, page] = await getProducts({ limit: 100, offset });
    if(error) return [error, null];
    for(const product of page.items){
      const attributes = {};
      for(const [key, convert] of changes){
        const value = product.attributes?.[key];
        if(value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) attributes[key] = convert(Number(value));
      }
      if(!Object.keys(attributes).length) continue;
      const [updateError] = await updateProduct(product.id, { attributes });
      if(updateError) return [updateError, null];
      converted++;
    }
    if(page.items.length < 100) break;
  }
  return [null, { converted }];
};
