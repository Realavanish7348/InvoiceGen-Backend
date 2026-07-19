import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

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
    cookies: res.headers["set-cookie"] as string[] | undefined,
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

    const refresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookies ?? login.headers["set-cookie"]);
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

    const pdf = await request(app)
      .get(`/api/v1/invoices/${invoice.body.data._id}/pdf`)
      .set("Authorization", `Bearer ${token}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.body.length).toBeGreaterThan(100);
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
