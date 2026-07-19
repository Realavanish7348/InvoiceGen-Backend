import { TaxRule } from "./taxRule.model.js";
import { parsePagination, buildSearchRegex } from "../../utils/pagination.js";
import { badRequest } from "../../utils/AppError.js";
import { assertCompanyOwnership } from "../../utils/ownershipCheck.js";

export type ListTaxRulesParams = {
  companyId: string;
  page?: unknown;
  limit?: unknown;
  search?: string;
};

export async function listTaxRules(params: ListTaxRulesParams) {
  const { page, limit, skip } = parsePagination(params);
  const filter: Record<string, unknown> = {
    companyId: params.companyId,
    isDeleted: false,
  };

  if (params.search) {
    filter.name = buildSearchRegex(params.search);
  }

  const [items, total] = await Promise.all([
    TaxRule.find(filter).sort({ isDefault: -1, createdAt: -1 }).skip(skip).limit(limit),
    TaxRule.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

export async function getTaxRuleById(companyId: string, taxRuleId: string) {
  return assertCompanyOwnership(TaxRule, taxRuleId, companyId);
}

export type TaxRuleInput = {
  name: string;
  rateBps: number;
  description?: string;
  isDefault?: boolean;
};

async function clearOtherDefaults(companyId: string, exceptId?: string) {
  const filter: Record<string, unknown> = { companyId, isDefault: true };
  if (exceptId) filter._id = { $ne: exceptId };
  await TaxRule.updateMany(filter, { $set: { isDefault: false } });
}

export async function createTaxRule(
  companyId: string,
  createdByUserId: string,
  input: TaxRuleInput,
) {
  const taxRule = await TaxRule.create({
    ...input,
    companyId,
    createdByUserId,
  });

  if (taxRule.isDefault) {
    await clearOtherDefaults(companyId, String(taxRule._id));
  }

  return taxRule;
}

export async function updateTaxRule(
  companyId: string,
  taxRuleId: string,
  input: Partial<TaxRuleInput>,
) {
  const taxRule = await assertCompanyOwnership(TaxRule, taxRuleId, companyId);
  Object.assign(taxRule, input);
  await taxRule.save();

  if (input.isDefault) {
    await clearOtherDefaults(companyId, String(taxRule._id));
  }

  return taxRule;
}

export async function deleteTaxRule(companyId: string, taxRuleId: string) {
  const taxRule = await assertCompanyOwnership(TaxRule, taxRuleId, companyId);
  if (taxRule.isDeleted) {
    throw badRequest("Tax rule already deleted", "ALREADY_DELETED");
  }
  taxRule.isDeleted = true;
  taxRule.deletedAt = new Date();
  taxRule.isDefault = false;
  await taxRule.save();
  return { id: String(taxRule._id) };
}
