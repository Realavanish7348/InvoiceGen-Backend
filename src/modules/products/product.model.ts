import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const productSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    unitPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "USD", uppercase: true },
    sku: { type: String },
    taxRuleId: { type: Schema.Types.ObjectId, ref: "TaxRule" },
    category: { type: String },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

productSchema.index({ companyId: 1, name: "text" });

export type ProductDocument = InferSchemaType<typeof productSchema> & {
  _id: Types.ObjectId;
};

export const Product = model("Product", productSchema);
