import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const serviceSchema = new Schema(
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
    unit: { type: String, default: "hour" },
    taxRuleId: { type: Schema.Types.ObjectId, ref: "TaxRule" },
    category: { type: String },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

serviceSchema.index({ companyId: 1, name: "text" });

export type ServiceDocument = InferSchemaType<typeof serviceSchema> & {
  _id: Types.ObjectId;
};

export const Service = model("Service", serviceSchema);
