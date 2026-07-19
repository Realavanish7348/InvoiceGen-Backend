import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const clientSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String },
    company: { type: String },
    address: {
      street: String,
      city: String,
      state: String,
      zip: String,
      country: String,
    },
    notes: { type: String },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

clientSchema.index({ companyId: 1, email: 1 }, { sparse: true });
clientSchema.index({ companyId: 1, name: "text" });

export type ClientDocument = InferSchemaType<typeof clientSchema> & {
  _id: Types.ObjectId;
};

export const Client = model("Client", clientSchema);
