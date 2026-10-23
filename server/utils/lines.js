/*
  Whether an order has anything to send: any line whose product type says it needs shipping. A line from an older
  cart that does not say defaults to needing it, so nothing is posted for free by mistake. Pure.
*/
export const needsShipping = lines => lines.some(line => line.needsShipping !== false);
