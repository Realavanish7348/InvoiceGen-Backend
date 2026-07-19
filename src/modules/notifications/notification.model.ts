import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const notificationSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "invoice_created",
        "invoice_published",
        "invoice_paid",
        "invoice_overdue",
        "invoice_sent",
        "system",
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    resourceType: { type: String },
    resourceId: { type: Schema.Types.ObjectId },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ companyId: 1, userId: 1, createdAt: -1 });

export type NotificationDocument = InferSchemaType<typeof notificationSchema> & {
  _id: Types.ObjectId;
};

export const Notification = model("Notification", notificationSchema);
