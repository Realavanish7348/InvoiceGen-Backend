import { InvoiceTemplate } from "./template.model.js";
import { parsePagination, buildSearchRegex } from "../../utils/pagination.js";
import { badRequest } from "../../utils/AppError.js";
import { assertCompanyOwnership } from "../../utils/ownershipCheck.js";

export type ListTemplatesParams = {
  companyId: string;
  page?: unknown;
  limit?: unknown;
  search?: string;
};

export async function listTemplates(params: ListTemplatesParams) {
  const { page, limit, skip } = parsePagination(params);
  const filter: Record<string, unknown> = {
    companyId: params.companyId,
    isDeleted: false,
  };

  if (params.search) {
    filter.name = buildSearchRegex(params.search);
  }

  const [items, total] = await Promise.all([
    InvoiceTemplate.find(filter)
      .sort({ isDefault: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    InvoiceTemplate.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

export async function getTemplateById(companyId: string, templateId: string) {
  return assertCompanyOwnership(InvoiceTemplate, templateId, companyId);
}

export type TemplateInput = {
  name: string;
  isDefault?: boolean;
  layout?: string;
  colors?: { primary?: string; accent?: string; text?: string };
  fonts?: { heading?: string; body?: string };
  showLogo?: boolean;
  showWatermark?: boolean;
  watermarkText?: string;
  footer?: string;
  signatureUrl?: string;
};

async function clearOtherDefaults(companyId: string, exceptId?: string) {
  const filter: Record<string, unknown> = { companyId, isDefault: true };
  if (exceptId) filter._id = { $ne: exceptId };
  await InvoiceTemplate.updateMany(filter, { $set: { isDefault: false } });
}

export async function createTemplate(
  companyId: string,
  createdByUserId: string,
  input: TemplateInput,
) {
  const template = await InvoiceTemplate.create({
    ...input,
    companyId,
    createdByUserId,
  });

  if (template.isDefault) {
    await clearOtherDefaults(companyId, String(template._id));
  }

  return template;
}

export async function updateTemplate(
  companyId: string,
  templateId: string,
  input: Partial<TemplateInput>,
) {
  const template = await assertCompanyOwnership(
    InvoiceTemplate,
    templateId,
    companyId,
  );

  const { colors, fonts, ...rest } = input;
  Object.assign(template, rest);
  if (colors) Object.assign(template.colors ?? {}, colors);
  if (fonts) Object.assign(template.fonts ?? {}, fonts);
  await template.save();

  if (input.isDefault) {
    await clearOtherDefaults(companyId, String(template._id));
  }

  return template;
}

export async function deleteTemplate(companyId: string, templateId: string) {
  const template = await assertCompanyOwnership(
    InvoiceTemplate,
    templateId,
    companyId,
  );
  if (template.isDeleted) {
    throw badRequest("Template already deleted", "ALREADY_DELETED");
  }
  template.isDeleted = true;
  template.deletedAt = new Date();
  template.isDefault = false;
  await template.save();
  return { id: String(template._id) };
}
