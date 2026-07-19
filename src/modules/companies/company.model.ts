import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const addressSchema = new Schema(
  {
    street: String,
    city: String,
    state: String,
    zip: String,
    country: String,
  },
  { _id: false },
);

const brandingSchema = new Schema(
  {
    theme: { type: String, default: "default" },
    primaryColor: { type: String, default: "#011627" },
    accentColor: { type: String, default: "#ff9f1c" },
    fontFamily: { type: String, default: "Inter" },
    footer: { type: String, default: "" },
  },
  { _id: false },
);

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    logoUrl: { type: String },
    address: addressSchema,
    taxNumber: { type: String },
    email: { type: String },
    phone: { type: String },
    branding: { type: brandingSchema, default: () => ({}) },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type CompanyDocument = InferSchemaType<typeof companySchema> & {
  _id: Types.ObjectId;
};

export const Company = model("Company", companySchema);
