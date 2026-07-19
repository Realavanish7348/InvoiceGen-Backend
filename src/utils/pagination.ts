export type PaginationResult = {
  page: number;
  limit: number;
  skip: number;
};

export type PaginationQuery = {
  page?: unknown;
  limit?: unknown;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toPositiveInt(value: unknown, fallback: number): number {
  const num =
    typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(num) || Number.isNaN(num)) return fallback;
  return Math.trunc(num);
}

/**
 * Parses page/limit query params with safe defaults and bounds.
 * page defaults to 1 (min 1). limit defaults to 20 (min 1, max 100).
 */
export function parsePagination(query: PaginationQuery): PaginationResult {
  const page = Math.max(1, toPositiveInt(query.page, DEFAULT_PAGE));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, toPositiveInt(query.limit, DEFAULT_LIMIT)),
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds a case-insensitive "contains" regex for simple text search. */
export function buildSearchRegex(search: string): RegExp {
  return new RegExp(escapeRegExp(search.trim()), "i");
}
