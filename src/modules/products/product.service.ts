import { Product } from "./product.model.js";
import { TaxRule } from "../taxRules/taxRule.model.js";
import { parsePagination, buildSearchRegex } from "../../utils/pagination.js";
import { badRequest } from "../../utils/AppError.js";
import { assertCompanyOwnership } from "../../utils/ownershipCheck.js";

export type ListProductsParams = {
  companyId: string;
  page?: unknown;
  limit?: unknown;
  search?: string;
  category?: string;
};

export async function listProducts(params: ListProductsParams) {
  const { page, limit, skip } = parsePagination(params);
  const filter: Record<string, unknown> = {
    companyId: params.companyId,
    isDeleted: false,
  };

  if (params.search) {
    const regex = buildSearchRegex(params.search);
    filter.$or = [{ name: regex }, { sku: regex }, { category: regex }];
  }
  if (params.category) {
    filter.category = params.category;
  }

  const [items, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

export async function getProductById(companyId: string, productId: string) {
  return assertCompanyOwnership(Product, productId, companyId);
}

export type ProductInput = {
  name: string;
  description?: string;
  unitPrice: number;
  currency?: string;
  sku?: string;
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

export async function createProduct(
  companyId: string,
  createdByUserId: string,
  input: ProductInput,
) {
  await assertTaxRuleValid(companyId, input.taxRuleId);
  return Product.create({
    ...input,
    companyId,
    createdByUserId,
  });
}

export async function updateProduct(
  companyId: string,
  productId: string,
  input: Partial<ProductInput>,
) {
  if (Object.prototype.hasOwnProperty.call(input, "taxRuleId")) {
    await assertTaxRuleValid(companyId, input.taxRuleId);
  }
  const product = await assertCompanyOwnership(Product, productId, companyId);
  Object.assign(product, input);
  await product.save();
  return product;
}

export async function deleteProduct(companyId: string, productId: string) {
  const product = await assertCompanyOwnership(Product, productId, companyId);
  if (product.isDeleted) {
    throw badRequest("Product already deleted", "ALREADY_DELETED");
  }
  product.isDeleted = true;
  product.deletedAt = new Date();
  await product.save();
  return { id: String(product._id) };
}
