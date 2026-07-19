import { Company, type CompanyDocument } from "../companies/company.model.js";
import { notFound } from "../../utils/AppError.js";

export async function getBusinessProfile(companyId: string) {
  const company = await Company.findOne({ _id: companyId, isDeleted: false });
  if (!company) throw notFound("Company not found");
  return company;
}

export type BusinessProfileInput = Partial<{
  name: string;
  email: string;
  phone: string;
  taxNumber: string;
  address: CompanyDocument["address"];
  branding: Partial<NonNullable<CompanyDocument["branding"]>>;
}>;

export async function updateBusinessProfile(
  companyId: string,
  input: BusinessProfileInput,
) {
  const company = await getBusinessProfile(companyId);
  const { address, branding, ...rest } = input;

  Object.assign(company, rest);
  if (address) {
    company.address = { ...(company.address ?? {}), ...address };
  }
  if (branding) {
    company.branding = { ...(company.branding ?? {}), ...branding };
  }

  await company.save();
  return company;
}

export async function updateLogo(companyId: string, logoUrl: string) {
  const company = await getBusinessProfile(companyId);
  company.logoUrl = logoUrl;
  await company.save();
  return company;
}
