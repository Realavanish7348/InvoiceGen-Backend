import { Settings, type SettingsDocument } from "./settings.model.js";
import { TaxRule } from "../taxRules/taxRule.model.js";
import { badRequest } from "../../utils/AppError.js";

export async function getOrCreateSettings(companyId: string) {
  let settings = await Settings.findOne({ companyId });
  if (!settings) {
    settings = await Settings.create({ companyId });
  }
  return settings;
}

export type SettingsInput = Partial<{
  defaultCurrency: string;
  defaultTaxRuleId: string | null;
  defaultDueDays: number;
  paymentTerms: string;
  paymentInstructions: string;
  invoiceNotes: string;
  invoiceFooter: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  emailPreferences: SettingsDocument["emailPreferences"];
}>;

export async function updateSettings(companyId: string, input: SettingsInput) {
  if (
    Object.prototype.hasOwnProperty.call(input, "defaultTaxRuleId") &&
    input.defaultTaxRuleId
  ) {
    const rule = await TaxRule.findOne({
      _id: input.defaultTaxRuleId,
      companyId,
      isDeleted: false,
    });
    if (!rule) throw badRequest("Invalid tax rule");
  }

  const settings = await getOrCreateSettings(companyId);
  const { emailPreferences, ...rest } = input;
  Object.assign(settings, rest);
  if (emailPreferences) {
    settings.emailPreferences = {
      invoiceReminders:
        emailPreferences.invoiceReminders ??
        settings.emailPreferences?.invoiceReminders ??
        true,
      productUpdates:
        emailPreferences.productUpdates ??
        settings.emailPreferences?.productUpdates ??
        false,
    };
  }
  await settings.save();
  return settings;
}
