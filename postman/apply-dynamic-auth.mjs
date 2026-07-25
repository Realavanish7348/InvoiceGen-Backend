/**
 * Applies dynamic Bearer auth to the InvoiceGen Postman workspace.
 *
 * Requires: POSTMAN_API_KEY (PMAK-...) from https://go.postman.co/settings/me/api-keys
 *
 * Usage (PowerShell):
 *   $env:POSTMAN_API_KEY = "PMAK-..."
 *   node backend/postman/apply-dynamic-auth.mjs
 */

const API = "https://api.getpostman.com";
const KEY = process.env.POSTMAN_API_KEY;

const IDS = {
  environment: "44ecf2f2-fee3-4a8e-ad5f-2ea53a5cdc60",
  authCollection: "d1908ba8-1e7a-4863-a8d7-c0649dcd2e5b",
  productsCollection: "7a35880c-2937-4ae3-a291-f6213e78f2d9",
};

const ENV_VALUES = [
  { key: "baseUrl", value: "http://localhost:5000", type: "default", enabled: true },
  { key: "accessToken", value: "", type: "secret", enabled: true },
  { key: "clientId", value: "", type: "default", enabled: true },
  { key: "productId", value: "", type: "default", enabled: true },
  { key: "serviceId", value: "", type: "default", enabled: true },
  { key: "taxRuleId", value: "", type: "default", enabled: true },
  { key: "templateId", value: "", type: "default", enabled: true },
  { key: "invoiceId", value: "", type: "default", enabled: true },
  { key: "sessionId", value: "", type: "default", enabled: true },
  { key: "notificationId", value: "", type: "default", enabled: true },
];

function saveTokenScript(expectedStatus) {
  return [
    `pm.test('status ${expectedStatus}', function () { pm.response.to.have.status(${expectedStatus}); });`,
    "var json = pm.response.json();",
    "var token = json && json.data && json.data.accessToken;",
    "if (token) {",
    "  pm.environment.set('accessToken', token);",
    "  console.log('Saved accessToken to active environment');",
    "} else {",
    "  console.warn('No data.accessToken in response; environment not updated');",
    "}",
  ];
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "X-Api-Key": KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 800)}`);
  }
  return json;
}

function walkRequests(items, fn) {
  for (const item of items || []) {
    if (item.request) fn(item);
    if (item.item) walkRequests(item.item, fn);
  }
}

function setTestScript(item, execLines) {
  item.event = [
    {
      listen: "test",
      script: {
        type: "text/javascript",
        exec: execLines,
      },
    },
  ];
  // Auth endpoints should not send Bearer
  if (item.request) {
    item.request.auth = { type: "noauth" };
  }
}

async function main() {
  if (!KEY) {
    console.error("Missing POSTMAN_API_KEY. Create one at https://go.postman.co/settings/me/api-keys");
    process.exit(1);
  }

  console.log("1) Updating Local Dev environment…");
  const envRes = await api("GET", `/environments/${IDS.environment}`);
  const existing = envRes.environment?.values || [];
  const merged = ENV_VALUES.map((wanted) => {
    const prev = existing.find((v) => v.key === wanted.key);
    if (wanted.key === "accessToken") {
      return { ...wanted, value: prev?.value ?? "" };
    }
    return { ...wanted, value: prev?.value || wanted.value };
  });
  for (const v of existing) {
    if (!merged.some((m) => m.key === v.key)) merged.push(v);
  }
  await api("PUT", `/environments/${IDS.environment}`, {
    environment: {
      name: envRes.environment?.name || "Local Dev",
      values: merged,
    },
  });
  console.log("   baseUrl + secret accessToken ensured");

  console.log("2) Updating 01 - Auth (Login / Register / Refresh scripts)…");
  const authRes = await api("GET", `/collections/${IDS.authCollection}`);
  const authCollection = authRes.collection;
  if (!authCollection?.item) throw new Error("Auth collection empty");

  const scriptMap = {
    Login: saveTokenScript(200),
    Register: saveTokenScript(201),
    Refresh: saveTokenScript(200),
  };

  walkRequests(authCollection.item, (item) => {
    if (scriptMap[item.name]) {
      setTestScript(item, scriptMap[item.name]);
      console.log(`   ${item.name}: post-response → pm.environment.set('accessToken', …)`);
    }
  });

  // Preserve required info.schema; strip uid-only fields that can break PUT
  await api("PUT", `/collections/${IDS.authCollection}`, {
    collection: {
      info: {
        name: authCollection.info.name,
        description: authCollection.info.description || "",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: authCollection.item,
      variable: authCollection.variable || [{ key: "baseUrl", value: "http://localhost:5000" }],
      auth: { type: "noauth" },
      event: authCollection.event,
    },
  });

  console.log("3) Restoring 05 - Products Bearer {{accessToken}}…");
  const productsRes = await api("GET", `/collections/${IDS.productsCollection}`);
  const productsCollection = productsRes.collection;
  if (!productsCollection?.item) throw new Error("Products collection empty");

  walkRequests(productsCollection.item, (item) => {
    if (item.request?.auth) {
      delete item.request.auth;
    }
  });

  await api("PUT", `/collections/${IDS.productsCollection}`, {
    collection: {
      info: {
        name: productsCollection.info.name,
        description: productsCollection.info.description || "",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      auth: {
        type: "bearer",
        bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }],
      },
      item: productsCollection.item,
      variable: productsCollection.variable || [{ key: "baseUrl", value: "http://localhost:5000" }],
      event: productsCollection.event,
    },
  });
  console.log("   collection auth = Bearer {{accessToken}}; request overrides removed");

  console.log("\nDone. In Postman desktop:");
  console.log("  1. Select environment: Local Dev");
  console.log("  2. Send 01 - Auth → Login");
  console.log("  3. Confirm Local Dev.accessToken is filled");
  console.log("  4. Send 05 - Products → List Products (Inherit / {{accessToken}})");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
