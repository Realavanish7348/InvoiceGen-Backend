export function roundMoney(value: number): number {
  return Math.round(value);
}

export type LineInput = {
  quantity: number;
  unitPrice: number;
};

export type InvoiceTotalsInput = {
  lines: LineInput[];
  discountAmount?: number;
  taxRateBps?: number; // basis points, e.g. 1800 = 18%
  shippingAmount?: number;
};

export type InvoiceTotals = {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingAmount: number;
  grandTotal: number;
};

/**
 * Calculation order: subtotal → discount → tax → shipping → grand total.
 * All amounts are integer minor units.
 */
export function calculateInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const subtotal = roundMoney(
    input.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
  );
  const discountAmount = roundMoney(Math.min(input.discountAmount ?? 0, subtotal));
  const taxable = Math.max(subtotal - discountAmount, 0);
  const taxRateBps = input.taxRateBps ?? 0;
  const taxAmount = roundMoney((taxable * taxRateBps) / 10_000);
  const shippingAmount = roundMoney(Math.max(input.shippingAmount ?? 0, 0));
  const grandTotal = taxable + taxAmount + shippingAmount;

  return {
    subtotal,
    discountAmount,
    taxAmount,
    shippingAmount,
    grandTotal,
  };
}
