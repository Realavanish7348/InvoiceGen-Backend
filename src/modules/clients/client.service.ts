import { Client, type ClientDocument } from "./client.model.js";
import { parsePagination, buildSearchRegex } from "../../utils/pagination.js";
import { notFound } from "../../utils/AppError.js";
import { assertCompanyOwnership } from "../../utils/ownershipCheck.js";

export type ListClientsParams = {
  companyId: string;
  page?: unknown;
  limit?: unknown;
  search?: string;
};

export async function listClients(params: ListClientsParams) {
  const { page, limit, skip } = parsePagination(params);
  const filter: Record<string, unknown> = {
    companyId: params.companyId,
    isDeleted: false,
  };

  if (params.search) {
    const regex = buildSearchRegex(params.search);
    filter.$or = [{ name: regex }, { email: regex }, { company: regex }];
  }

  const [items, total] = await Promise.all([
    Client.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Client.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

export async function getClientById(companyId: string, clientId: string) {
  return assertCompanyOwnership(Client, clientId, companyId);
}

export type CreateClientInput = {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: ClientDocument["address"];
  notes?: string;
};

export async function createClient(
  companyId: string,
  createdByUserId: string,
  input: CreateClientInput,
) {
  return Client.create({
    ...input,
    companyId,
    createdByUserId,
  });
}

export type UpdateClientInput = Partial<CreateClientInput>;

export async function updateClient(
  companyId: string,
  clientId: string,
  input: UpdateClientInput,
) {
  const client = await assertCompanyOwnership(Client, clientId, companyId);
  Object.assign(client, input);
  await client.save();
  return client;
}

export async function deleteClient(companyId: string, clientId: string) {
  const client = await assertCompanyOwnership(Client, clientId, companyId);
  client.isDeleted = true;
  client.deletedAt = new Date();
  await client.save();
  return { id: String(client._id) };
}

export async function ensureClientExists(companyId: string, clientId: string) {
  const client = await Client.findOne({
    _id: clientId,
    companyId,
    isDeleted: false,
  });
  if (!client) throw notFound("Client not found");
  return client;
}
