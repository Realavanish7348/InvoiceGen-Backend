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
