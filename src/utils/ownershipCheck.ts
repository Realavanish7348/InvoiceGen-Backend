import type { Model, Types, HydratedDocument } from "mongoose";
import { notFound } from "./AppError.js";

type CompanyOwned = {
  companyId: Types.ObjectId;
  isDeleted?: boolean;
};

export async function assertCompanyOwnership<T extends CompanyOwned>(
  ModelClass: Model<T>,
  resourceId: string,
  companyId: string,
  options?: { includeDeleted?: boolean },
): Promise<HydratedDocument<T>> {
  const filter: Record<string, unknown> = {
    _id: resourceId,
    companyId,
  };
  if (!options?.includeDeleted) {
    filter.isDeleted = false;
  }

  const doc = await ModelClass.findOne(filter);
  if (!doc) {
    throw notFound();
  }
  return doc;
}
