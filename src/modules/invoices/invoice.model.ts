import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const lineItemSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    serviceId: { type: Schema.Types.ObjectId, ref: "Service" },
  },
  { _id: true },
);

const invoiceSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },
    templateId: { type: Schema.Types.ObjectId, ref: "InvoiceTemplate" },
    invoiceNumber: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "published", "pending", "paid", "overdue", "archived"],
      default: "draft",
      index: true,
    },
    currency: { type: String, required: true, default: "USD", uppercase: true },
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    items: { type: [lineItemSchema], default: [] },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxRuleId: { type: Schema.Types.ObjectId, ref: "TaxRule" },
    taxRateBps: { type: Number, default: 0 },
    shippingAmount: { type: Number, default: 0, min: 0 },
    subtotal: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    notes: { type: String },
    terms: { type: String },
    paymentInstructions: { type: String },
    footer: { type: String },
    clientSnapshot: {
      name: String,
      email: String,
      phone: String,
      company: String,
      address: {
        street: String,
        city: String,
        state: String,
        zip: String,
        country: String,
      },
    },
    companySnapshot: {
      name: String,
      email: String,
      phone: String,
      taxNumber: String,
      logoUrl: String,
      address: {
        street: String,
        city: String,
        state: String,
        zip: String,
        country: String,
      },
    },
    publishedAt: { type: Date },
    paidAt: { type: Date },
    paymentProvider: {
      type: String,
      enum: ["stripe"],
    },
    stripeCheckoutSessionId: { type: String },
    stripePaymentIntentId: { type: String },
    /** Last successful email delivery timestamp (convenience mirror of lastEmailDelivery.sentAt). */
    sentAt: { type: Date },
    lastEmailDelivery: {
      to: { type: String },
      status: {
        type: String,
        enum: ["sent", "failed"],
      },
      sentAt: { type: Date },
      error: { type: String },
      messageId: { type: String },
    },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

invoiceSchema.index({ companyId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ companyId: 1, status: 1, createdAt: -1 });
invoiceSchema.index({ companyId: 1, isDeleted: 1, deletedAt: 1 });

export type InvoiceDocument = InferSchemaType<typeof invoiceSchema> & {
  _id: Types.ObjectId;
};

export const Invoice = model("Invoice", invoiceSchema);
