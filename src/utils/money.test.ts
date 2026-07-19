import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals } from "../utils/money.js";

describe("calculateInvoiceTotals", () => {
  it("computes subtotal → discount → tax → shipping → grand total", () => {
    const result = calculateInvoiceTotals({
      lines: [
        { quantity: 2, unitPrice: 1000 },
        { quantity: 1, unitPrice: 500 },
      ],
      discountAmount: 250,
      taxRateBps: 1000, // 10%
      shippingAmount: 100,
    });

    expect(result.subtotal).toBe(2500);
    expect(result.discountAmount).toBe(250);
    expect(result.taxAmount).toBe(225); // 10% of 2250
    expect(result.shippingAmount).toBe(100);
    expect(result.grandTotal).toBe(2575);
  });

  it("caps discount at subtotal", () => {
    const result = calculateInvoiceTotals({
      lines: [{ quantity: 1, unitPrice: 100 }],
      discountAmount: 500,
    });
    expect(result.discountAmount).toBe(100);
    expect(result.grandTotal).toBe(0);
  });

  it("rounds money to nearest integer minor unit", () => {
    const result = calculateInvoiceTotals({
      lines: [{ quantity: 3, unitPrice: 333 }],
      taxRateBps: 1750,
    });
    expect(result.subtotal).toBe(999);
    expect(result.taxAmount).toBe(175); // round(999 * 0.175)
    expect(result.grandTotal).toBe(1174);
  });
});
