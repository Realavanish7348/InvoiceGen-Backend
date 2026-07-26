import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const portalSessionSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    refreshTokenHash: { type: String, required: true },
    userAgent: { type: String },
    ip: { type: String },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBySessionId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

portalSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PortalSessionDocument = InferSchemaType<typeof portalSessionSchema> & {
  _id: Types.ObjectId;
};

export const PortalSession = model("PortalSession", portalSessionSchema);
