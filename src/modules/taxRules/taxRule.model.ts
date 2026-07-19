import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const taxRuleSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    rateBps: { type: Number, required: true, min: 0, max: 100_000 },
    description: { type: String },
    isDefault: { type: Boolean, default: false },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

taxRuleSchema.index({ companyId: 1, name: 1 });

export type TaxRuleDocument = InferSchemaType<typeof taxRuleSchema> & {
  _id: Types.ObjectId;
};

export const TaxRule = model("TaxRule", taxRuleSchema);
