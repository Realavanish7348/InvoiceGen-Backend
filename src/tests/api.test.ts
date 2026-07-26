import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

function cookieHeader(
  value: string | string[] | undefined,
): string[] | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value : [value];
}

async function register(email: string, name = "Test User") {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: "Password1!", name });
  expect(res.status).toBe(201);
  expect(res.body.success).toBe(true);
  expect(res.body.data.accessToken).toBeTruthy();
  expect(res.body.data.user.activeCompanyId).toBeTruthy();
  return {
    token: res.body.data.accessToken as string,
    user: res.body.data.user,
    cookies: cookieHeader(res.headers["set-cookie"]),
  };
}

describe("auth + single-workspace provisioning", () => {
  it("atomically creates user, company, membership, settings, and subscription", async () => {
    const { token, user } = await register("owner@example.com", "Owner");

    const me = await request(app)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe("owner@example.com");

    const profile = await request(app)
      .get("/api/v1/business-profile")
      .set("Authorization", `Bearer ${token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data._id).toBe(user.activeCompanyId);
    expect(profile.body.data.name).toContain("Owner");

    const settings = await request(app)
      .get("/api/v1/settings")
      .set("Authorization", `Bearer ${token}`);
    expect(settings.status).toBe(200);
    expect(settings.body.data.defaultCurrency).toBe("USD");

    const sub = await request(app)
      .get("/api/v1/subscriptions/current")
      .set("Authorization", `Bearer ${token}`);
    expect(sub.status).toBe(200);
    expect(sub.body.data.planId).toBe("free");
  });

  it("logs in and refreshes tokens", async () => {
    const { cookies } = await register("login@example.com");
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "login@example.com", password: "Password1!" });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();

    const refreshCookies =
      cookies ?? cookieHeader(login.headers["set-cookie"]) ?? [];
    const refresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookies);
    expect(refresh.status).toBe(200);
    expect(refresh.body.data.accessToken).toBeTruthy();
  });
});

describe("company isolation (IDOR)", () => {
  it("prevents cross-company client access", async () => {
    const a = await register("a@example.com", "Alice");
    const b = await register("b@example.com", "Bob");

    const created = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ name: "Alice Client", email: "client@a.com" });
    expect(created.status).toBe(201);
    const clientId = created.body.data._id as string;

    const forbidden = await request(app)
      .get(`/api/v1/clients/${clientId}`)
      .set("Authorization", `Bearer ${b.token}`);
    expect(forbidden.status).toBe(404);
    expect(forbidden.body.error.code).toBe("NOT_FOUND");

    // Body companyId must be ignored — still creates under caller's company
    const spoof = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${b.token}`)
      .send({
        name: "Spoof",
        companyId: a.user.activeCompanyId,
      });
    expect(spoof.status).toBe(201);

    const listA = await request(app)
      .get("/api/v1/clients")
      .set("Authorization", `Bearer ${a.token}`);
    const listB = await request(app)
      .get("/api/v1/clients")
      .set("Authorization", `Bearer ${b.token}`);
    expect(listA.body.data).toHaveLength(1);
    expect(listB.body.data).toHaveLength(1);
    expect(listB.body.data[0].name).toBe("Spoof");
  });
});

describe("invoices", () => {
  it("creates invoice with integer money totals and generates PDF", async () => {
    const { token } = await register("inv@example.com");

    const client = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Acme" });
    expect(client.status).toBe(201);

    const invoice = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientId: client.body.data._id,
        currency: "USD",
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        items: [{ name: "Design", quantity: 2, unitPrice: 15000 }],
        discountAmount: 1000,
        shippingAmount: 500,
      });

    expect(invoice.status).toBe(201);
    expect(invoice.body.data.subtotal).toBe(30000);
    expect(invoice.body.data.discountAmount).toBe(1000);
    expect(invoice.body.data.grandTotal).toBe(29500);
    expect(invoice.body.data.status).toBe("draft");

    const published = await request(app)
      .post(`/api/v1/invoices/${invoice.body.data._id}/publish`)
      .set("Authorization", `Bearer ${token}`);
    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe("published");

    const notesOnly = await request(app)
      .patch(`/api/v1/invoices/${invoice.body.data._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "Thanks for your business" });
    expect(notesOnly.status).toBe(200);
    expect(notesOnly.body.data.notes).toBe("Thanks for your business");

    const pdf = await request(app)
      .get(`/api/v1/invoices/${invoice.body.data._id}/pdf`)
      .set("Authorization", `Bearer ${token}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.body.length).toBeGreaterThan(100);
  });

  it("emails a published invoice PDF and records sentAt", async () => {
    const { token } = await register("send@example.com");

    const client = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Acme", email: "billing@acme.test" });
    expect(client.status).toBe(201);

    const invoice = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientId: client.body.data._id,
        currency: "USD",
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        items: [{ name: "Design", quantity: 1, unitPrice: 10000 }],
      });
    expect(invoice.status).toBe(201);

    const draftSend = await request(app)
      .post(`/api/v1/invoices/${invoice.body.data._id}/send`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(draftSend.status).toBe(400);
    expect(draftSend.body.error.code).toBe("INVOICE_NOT_SENDABLE");

    await request(app)
      .post(`/api/v1/invoices/${invoice.body.data._id}/publish`)
      .set("Authorization", `Bearer ${token}`);

    const sent = await request(app)
      .post(`/api/v1/invoices/${invoice.body.data._id}/send`)
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "Please pay at your earliest convenience." });
    expect(sent.status).toBe(200);
    expect(sent.body.data.sentAt).toBeTruthy();
    expect(sent.body.data.lastEmailDelivery.to).toBe("billing@acme.test");
    expect(sent.body.data.lastEmailDelivery.status).toBe("sent");

    const override = await request(app)
      .post(`/api/v1/invoices/${invoice.body.data._id}/send`)
      .set("Authorization", `Bearer ${token}`)
      .send({ to: "alt@acme.test" });
    expect(override.status).toBe(200);
    expect(override.body.data.lastEmailDelivery.to).toBe("alt@acme.test");
  });

  it("rejects send when client has no email and to is omitted", async () => {
    const { token } = await register("noemail@example.com");

    const client = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "No Email Co" });
    expect(client.status).toBe(201);

    const invoice = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientId: client.body.data._id,
        currency: "USD",
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        items: [{ name: "Work", quantity: 1, unitPrice: 5000 }],
      });
    expect(invoice.status).toBe(201);

    await request(app)
      .post(`/api/v1/invoices/${invoice.body.data._id}/publish`)
      .set("Authorization", `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/v1/invoices/${invoice.body.data._id}/send`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MISSING_RECIPIENT_EMAIL");
  });

  it("escapes invoice search metacharacters", async () => {
    const { token } = await register("search@example.com");
    const res = await request(app)
      .get("/api/v1/invoices")
      .query({ search: "(" })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("error contracts", () => {
  it("rejects invalid taxRuleId with 400", async () => {
    const { token } = await register("tax@example.com");
    const res = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Widget",
        unitPrice: 100,
        taxRuleId: "000000000000000000000000",
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns CONFIRM_TEXT_MISMATCH for wrong delete confirmation", async () => {
    const { token } = await register("del@example.com");
    const res = await request(app)
      .delete("/api/v1/users/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirmation: "DELETE" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CONFIRM_TEXT_MISMATCH");
  });

  it("returns INVALID_PLAN for unknown planId", async () => {
    const { token } = await register("plan@example.com");
    const res = await request(app)
      .post("/api/v1/subscriptions/change-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: "enterprise" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_PLAN");
  });

  it("rejects checkout when Stripe is not configured", async () => {
    const { token } = await register("pay@example.com");

    await request(app)
      .post("/api/v1/subscriptions/change-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: "professional" });

    const client = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Payer", email: "payer@test.com" });

    const invoice = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientId: client.body.data._id,
        currency: "USD",
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        items: [{ name: "Work", quantity: 1, unitPrice: 5000 }],
      });

    await request(app)
      .post(`/api/v1/invoices/${invoice.body.data._id}/publish`)
      .set("Authorization", `Bearer ${token}`);

    const checkout = await request(app)
      .post(
        `/api/v1/payments/invoices/${invoice.body.data._id}/checkout-session`,
      )
      .set("Authorization", `Bearer ${token}`);
    expect(checkout.status).toBe(400);
    expect(checkout.body.error.code).toBe("PAYMENTS_NOT_CONFIGURED");

    const config = await request(app)
      .get("/api/v1/payments/config")
      .set("Authorization", `Bearer ${token}`);
    expect(config.status).toBe(200);
    expect(config.body.data.configured).toBe(false);
  });

  it("lists team members for the active workspace", async () => {
    const { token, user } = await register("teamowner@example.com", "Team Owner");

    const members = await request(app)
      .get("/api/v1/companies/current/members")
      .set("Authorization", `Bearer ${token}`);
    expect(members.status).toBe(200);
    expect(members.body.data).toHaveLength(1);
    expect(members.body.data[0].role).toBe("owner");
    expect(members.body.data[0].email).toBe("teamowner@example.com");
    expect(members.body.data[0].userId).toBe(user.id);

    const invite = await request(app)
      .post("/api/v1/companies/current/invitations")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "newhire@example.com", role: "member" });
    expect(invite.status).toBe(201);
    expect(invite.body.data.email).toBe("newhire@example.com");

    const listInvites = await request(app)
      .get("/api/v1/companies/current/invitations")
      .set("Authorization", `Bearer ${token}`);
    expect(listInvites.status).toBe(200);
    expect(listInvites.body.data).toHaveLength(1);
  });

  it("creates an additional workspace and switches active company", async () => {
    const { token, user } = await register("multiws@example.com", "Multi");

    const created = await request(app)
      .post("/api/v1/companies")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Second Co" });
    expect(created.status).toBe(201);
    expect(created.body.data.name).toBe("Second Co");
    expect(created.body.data.isActive).toBe(true);

    const list = await request(app)
      .get("/api/v1/companies")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);

    const other = list.body.data.find(
      (w: { isActive: boolean }) => !w.isActive,
    );
    expect(other).toBeTruthy();

    const switched = await request(app)
      .patch("/api/v1/users/me/active-company")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId: other.companyId });
    expect(switched.status).toBe(200);
    expect(switched.body.data.activeCompanyId).toBe(other.companyId);
    expect(switched.body.data.id).toBe(user.id);
  });

  it("rejects online payment checkout on free plan", async () => {
    const { token } = await register("freeplan@example.com");

    const client = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Payer" });

    const invoice = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientId: client.body.data._id,
        currency: "USD",
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        items: [{ name: "Work", quantity: 1, unitPrice: 5000 }],
      });

    await request(app)
      .post(`/api/v1/invoices/${invoice.body.data._id}/publish`)
      .set("Authorization", `Bearer ${token}`);

    const checkout = await request(app)
      .post(
        `/api/v1/payments/invoices/${invoice.body.data._id}/checkout-session`,
      )
      .set("Authorization", `Bearer ${token}`);
    expect(checkout.status).toBe(400);
    expect(checkout.body.error.code).toBe("PLAN_FEATURE_REQUIRED");
  });

  it("returns 400 for malformed JSON", async () => {
    const { token } = await register("json@example.com");
    const res = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "application/json")
      .send("{not-json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
  });
});

describe("portal magic link + invoices", () => {
  it("issues a portal session and scopes invoices by client email", async () => {
    const { token } = await register("seller-portal@example.com", "Seller");
    await request(app)
      .post("/api/v1/subscriptions/change-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: "professional" });

    const client = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Portal Client", email: "buyer@portal.test" });
    expect(client.status).toBe(201);

    const invoice = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clientId: client.body.data._id,
        currency: "USD",
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        items: [{ name: "Consulting", quantity: 1, unitPrice: 10000 }],
      });
    expect(invoice.status).toBe(201);

    await request(app)
      .post(`/api/v1/invoices/${invoice.body.data._id}/publish`)
      .set("Authorization", `Bearer ${token}`);

    const requestLink = await request(app)
      .post("/api/v1/portal/auth/request-link")
      .send({ email: "buyer@portal.test" });
    expect(requestLink.status).toBe(200);

    const { PortalAuthToken } = await import(
      "../modules/portal/portalAuthToken.model.js"
    );
    const { randomToken, sha256 } = await import("../utils/tokenCompare.js");
    const raw = randomToken(32);
    await PortalAuthToken.create({
      email: "buyer@portal.test",
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    const verify = await request(app)
      .post("/api/v1/portal/auth/verify")
      .send({ email: "buyer@portal.test", token: raw });
    expect(verify.status).toBe(200);
    expect(verify.body.data.accessToken).toBeTruthy();
    const portalToken = verify.body.data.accessToken as string;

    const list = await request(app)
      .get("/api/v1/portal/invoices")
      .set("Authorization", `Bearer ${portalToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);
    expect(list.body.data[0].invoiceNumber).toBeTruthy();

    const detail = await request(app)
      .get(`/api/v1/portal/invoices/${invoice.body.data._id}`)
      .set("Authorization", `Bearer ${portalToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.payable).toBe(true);

    const pdf = await request(app)
      .get(`/api/v1/portal/invoices/${invoice.body.data._id}/pdf`)
      .set("Authorization", `Bearer ${portalToken}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");

    const stranger = await request(app)
      .post("/api/v1/portal/auth/verify")
      .send({ email: "nobody@portal.test", token: raw });
    expect(stranger.status).toBe(401);
  });

  it("returns 404 for invoices belonging to another client email", async () => {
    const a = await register("seller-a@example.com", "Seller A");
    const b = await register("seller-b@example.com", "Seller B");

    const clientA = await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${a.token}`)
      .send({ name: "A Client", email: "a-only@portal.test" });
    const invoiceA = await request(app)
      .post("/api/v1/invoices")
      .set("Authorization", `Bearer ${a.token}`)
      .send({
        clientId: clientA.body.data._id,
        currency: "USD",
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        items: [{ name: "A", quantity: 1, unitPrice: 5000 }],
      });
    await request(app)
      .post(`/api/v1/invoices/${invoiceA.body.data._id}/publish`)
      .set("Authorization", `Bearer ${a.token}`);

    await request(app)
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${b.token}`)
      .send({ name: "B Client", email: "b-only@portal.test" });

    const { PortalAuthToken } = await import(
      "../modules/portal/portalAuthToken.model.js"
    );
    const { randomToken, sha256 } = await import("../utils/tokenCompare.js");
    const raw = randomToken(32);
    await PortalAuthToken.create({
      email: "b-only@portal.test",
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    const verify = await request(app)
      .post("/api/v1/portal/auth/verify")
      .send({ email: "b-only@portal.test", token: raw });
    const portalToken = verify.body.data.accessToken as string;

    const miss = await request(app)
      .get(`/api/v1/portal/invoices/${invoiceA.body.data._id}`)
      .set("Authorization", `Bearer ${portalToken}`);
    expect(miss.status).toBe(404);
  });
});

describe("expenses + reports", () => {
  it("gates expenses on plan and supports CRUD", async () => {
    const { token } = await register("expenses@example.com");

    const denied = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        amount: 2500,
        currency: "USD",
        category: "Software",
        date: new Date().toISOString(),
      });
    expect(denied.status).toBe(400);
    expect(denied.body.error.code).toBe("PLAN_FEATURE_REQUIRED");

    await request(app)
      .post("/api/v1/subscriptions/change-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: "professional" });

    const created = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        amount: 2500,
        currency: "USD",
        category: "Software",
        date: new Date().toISOString(),
        vendor: "Notion",
      });
    expect(created.status).toBe(201);
    expect(created.body.data.amount).toBe(2500);

    const list = await request(app)
      .get("/api/v1/expenses")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(1);

    const deleted = await request(app)
      .delete(`/api/v1/expenses/${created.body.data._id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleted.status).toBe(200);
  });

  it("gates reports on business plan", async () => {
    const { token } = await register("reports@example.com");
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    const to = new Date().toISOString();

    const denied = await request(app)
      .get("/api/v1/reports/summary")
      .query({ from, to })
      .set("Authorization", `Bearer ${token}`);
    expect(denied.status).toBe(400);
    expect(denied.body.error.code).toBe("PLAN_FEATURE_REQUIRED");

    await request(app)
      .post("/api/v1/subscriptions/change-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({ planId: "business" });

    const summary = await request(app)
      .get("/api/v1/reports/summary")
      .query({ from, to })
      .set("Authorization", `Bearer ${token}`);
    expect(summary.status).toBe(200);
    expect(summary.body.data).toHaveProperty("revenue");
    expect(summary.body.data).toHaveProperty("expenses");
    expect(summary.body.data).toHaveProperty("net");
  });
});

describe("health", () => {
  it("returns API info at root", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.apiBase).toBe("/api/v1");
  });

  it("returns liveness", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
  });
});
