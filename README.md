# InvoiceGen Backend

Phase 1 API for InvoiceGen: single-workspace, company-scoped Express + MongoDB service.

## Requirements

- Node.js 20+
- MongoDB 6+ (**replica set required** — registration uses multi-document transactions; MongoDB Atlas provides this by default)

## Setup

```bash
cd backend
cp .env.example .env
# Edit secrets: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (each ≥ 64 chars; must differ)
# ENCRYPTION_KEY: exactly 64 hex chars
npm install
npm run dev
```

- API base: `http://localhost:5000/api/v1`
- Health: `GET /health` · Ready: `GET /ready`
- OpenAPI: [`../docs/openapi.yaml`](../docs/openapi.yaml)
- Human API guide: [`../docs/API.md`](../docs/API.md)
- Handoff handbook: [`../docs/BACKEND_HANDBOOK.md`](../docs/BACKEND_HANDBOOK.md)

Always run commands from the `backend/` directory so uploads resolve correctly (`UPLOAD_DIR` relative to `cwd`).

## Scripts

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Watch mode |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (memory replica set) |
| `npm run test:watch` | Vitest watch |
| `npm run audit:prod` | Production dependency audit |

## Architecture (short)

- Register creates **User + Company + Owner Membership + Settings + Subscription** in one transaction
- Authenticated business routes: `requireAuth` → `resolveCompanyContext` → `req.companyId`
- Business resources are scoped by server-derived `companyId` (never trust client ownership)
- Money amounts are integer minor units (cents); tax uses basis points
- Invoice lifecycle: draft → publish → pending/paid/overdue → archived; soft trash + 30-day purge

See the handbook for jobs, env semantics, indexes, deployment constraints, and known limitations.

## Postman

Import `postman/collection.json` and `postman/environment.json` (environment name: **Local Dev**).

1. Select the **Local Dev** environment (required — `{{accessToken}}` will not resolve otherwise).
2. Send **Auth → Login** (or Register). A post-response script saves `data.accessToken` into `{{accessToken}}`.
3. Send any protected request — collection Bearer auth uses `{{accessToken}}`.

To sync the same Login/Register/Refresh scripts and Products Bearer auth onto the remote InvoiceGen workspace collections:

```powershell
$env:POSTMAN_API_KEY = "PMAK-..."   # https://go.postman.co/settings/me/api-keys
node postman/apply-dynamic-auth.mjs
```

The committed collection is a starter subset. Prefer OpenAPI + `docs/API.md` for the full route surface and error scenarios.

## Keeping docs in sync

When you add or change a route:

1. Update Zod schemas / services / routes
2. Update `docs/openapi.yaml`
3. Update the relevant section in `docs/API.md`
4. Add or adjust tests
