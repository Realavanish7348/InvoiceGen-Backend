import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const invitationSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: ["admin", "member"],
      required: true,
      default: "member",
    },
    invitedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "revoked", "expired"],
      default: "pending",
      index: true,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

invitationSchema.index(
  { companyId: 1, email: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

export type InvitationDocument = InferSchemaType<typeof invitationSchema> & {
  _id: Types.ObjectId;
};

export const Invitation = model("Invitation", invitationSchema);
