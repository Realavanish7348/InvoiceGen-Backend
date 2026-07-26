import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const paymentSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["stripe"],
      default: "stripe",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed", "canceled"],
      default: "pending",
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true },
    stripeCheckoutSessionId: { type: String, index: true, sparse: true },
    stripePaymentIntentId: { type: String, index: true, sparse: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

paymentSchema.index({ companyId: 1, invoiceId: 1, createdAt: -1 });

export type PaymentDocument = InferSchemaType<typeof paymentSchema> & {
  _id: Types.ObjectId;
};

export const Payment = model("Payment", paymentSchema);
