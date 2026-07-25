import { Service } from "./service.model.js";
import { TaxRule } from "../taxRules/taxRule.model.js";
import { parsePagination, buildSearchRegex } from "../../utils/pagination.js";
import { badRequest } from "../../utils/AppError.js";
import { assertCompanyOwnership } from "../../utils/ownershipCheck.js";

export type ListServicesParams = {
  companyId: string;
  page?: unknown;
  limit?: unknown;
  search?: string;
  category?: string;
};

export async function listServices(params: ListServicesParams) {
  const { page, limit, skip } = parsePagination(params);
  const filter: Record<string, unknown> = {
    companyId: params.companyId,
    isDeleted: false,
  };

  if (params.search) {
    const regex = buildSearchRegex(params.search);
    filter.$or = [{ name: regex }, { category: regex }];
  }
  if (params.category) {
    filter.category = params.category;
  }

  const [items, total] = await Promise.all([
    Service.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Service.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

export async function getServiceById(companyId: string, serviceId: string) {
  return assertCompanyOwnership(Service, serviceId, companyId);
}

export type ServiceInput = {
  name: string;
  description?: string;
  unitPrice: number;
  currency?: string;
  unit?: string;
  taxRuleId?: string | null;
  category?: string;
};

async function assertTaxRuleValid(companyId: string, taxRuleId?: string | null) {
  if (!taxRuleId) return;
  const rule = await TaxRule.findOne({
    _id: taxRuleId,
    companyId,
    isDeleted: false,
  });
  if (!rule) throw badRequest("Invalid tax rule");
}

export async function createService(
  companyId: string,
  createdByUserId: string,
  input: ServiceInput,
) {
  await assertTaxRuleValid(companyId, input.taxRuleId);
  return Service.create({
    ...input,
    companyId,
    createdByUserId,
  });
}

export async function updateService(
  companyId: string,
  serviceId: string,
  input: Partial<ServiceInput>,
) {
  if (Object.prototype.hasOwnProperty.call(input, "taxRuleId")) {
    await assertTaxRuleValid(companyId, input.taxRuleId);
  }
  const service = await assertCompanyOwnership(Service, serviceId, companyId);
  Object.assign(service, input);
  await service.save();
  return service;
}

export async function deleteService(companyId: string, serviceId: string) {
  const service = await assertCompanyOwnership(Service, serviceId, companyId);
  if (service.isDeleted) {
    throw badRequest("Service already deleted", "ALREADY_DELETED");
  }
  service.isDeleted = true;
  service.deletedAt = new Date();
  await service.save();
  return { id: String(service._id) };
}
