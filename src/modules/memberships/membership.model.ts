import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const membershipSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "member"],
      default: "owner",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

membershipSchema.index({ userId: 1, companyId: 1 }, { unique: true });

export type MembershipDocument = InferSchemaType<typeof membershipSchema> & {
  _id: Types.ObjectId;
};

export const Membership = model("Membership", membershipSchema);
