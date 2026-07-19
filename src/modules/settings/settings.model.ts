import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const settingsSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true,
      index: true,
    },
    defaultCurrency: { type: String, default: "USD", uppercase: true },
    defaultTaxRuleId: { type: Schema.Types.ObjectId, ref: "TaxRule" },
    defaultDueDays: { type: Number, default: 14, min: 0 },
    paymentTerms: { type: String, default: "" },
    paymentInstructions: { type: String, default: "" },
    invoiceNotes: { type: String, default: "" },
    invoiceFooter: { type: String, default: "" },
    invoicePrefix: { type: String, default: "INV-" },
    nextInvoiceNumber: { type: Number, default: 1, min: 1 },
    emailPreferences: {
      invoiceReminders: { type: Boolean, default: true },
      productUpdates: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

export type SettingsDocument = InferSchemaType<typeof settingsSchema> & {
  _id: Types.ObjectId;
};

export const Settings = model("Settings", settingsSchema);
