# InvoiceGen Backend

Phase 1 API for InvoiceGen: single-workspace, company-scoped Express + MongoDB service.

## Requirements

- Node.js 20+
- MongoDB 6+ (replica set recommended — registration uses multi-document transactions; MongoDB Atlas provides this by default)

## Setup

```bash
cd backend
cp .env.example .env
# Edit secrets: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY (each ≥ 64 hex chars; JWTs must differ)
npm install
npm run dev
```

API base: `http://localhost:5000/api/v1`  
Health: `GET /health` · Ready: `GET /ready`

## Scripts

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Watch mode |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (memory replica set) |
| `npm run audit:prod` | Production dependency audit |

## Architecture

- Register creates **User + Company + Owner Membership + Settings + Subscription** in one transaction
- Authenticated business routes use `requireAuth` → `resolveCompanyContext` → `req.companyId`
- All business resources are scoped by `companyId` (never by client-supplied ownership)
- Money amounts are integer minor units (cents)

See `../docs/BACKEND_PLANNING.md` and `../docs/API.md`.

## Postman

Import `postman/collection.json` and `postman/environment.json`.
