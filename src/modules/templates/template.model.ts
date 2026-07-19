import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const templateSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false },
    layout: { type: String, default: "classic" },
    colors: {
      primary: { type: String, default: "#011627" },
      accent: { type: String, default: "#ff9f1c" },
      text: { type: String, default: "#011627" },
    },
    fonts: {
      heading: { type: String, default: "Inter" },
      body: { type: String, default: "Inter" },
    },
    showLogo: { type: Boolean, default: true },
    showWatermark: { type: Boolean, default: false },
    watermarkText: { type: String, default: "InvoiceGen" },
    footer: { type: String, default: "" },
    signatureUrl: { type: String },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type TemplateDocument = InferSchemaType<typeof templateSchema> & {
  _id: Types.ObjectId;
};

export const InvoiceTemplate = model("InvoiceTemplate", templateSchema);
