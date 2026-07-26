import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const expenseSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, default: "USD" },
    category: { type: String, required: true, trim: true, maxlength: 120 },
    date: { type: Date, required: true, index: true },
    vendor: { type: String, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 2000 },
    receiptUrl: { type: String },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

expenseSchema.index({ companyId: 1, date: -1 });
expenseSchema.index({ companyId: 1, category: 1 });

export type ExpenseDocument = InferSchemaType<typeof expenseSchema> & {
  _id: Types.ObjectId;
};

export const Expense = model("Expense", expenseSchema);
