import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const portalAuthTokenSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

portalAuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PortalAuthTokenDocument = InferSchemaType<
  typeof portalAuthTokenSchema
> & {
  _id: Types.ObjectId;
};

export const PortalAuthToken = model("PortalAuthToken", portalAuthTokenSchema);
