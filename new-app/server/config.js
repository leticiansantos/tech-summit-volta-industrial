// Central configuration + Databricks auth token resolution.
//
// Three auth modes, resolved transparently:
//   1. OBO (on-behalf-of user): if a request carries `x-forwarded-access-token`
//      (Databricks Apps user auth), we use that so queries run as the end user.
//   2. App service principal: in Databricks Apps, DATABRICKS_CLIENT_ID/SECRET are
//      injected — we exchange them for an OAuth token (client_credentials).
//   3. Local dev: shell out to the Databricks CLI (`databricks auth token -p <profile>`).
//
// A short-lived cache avoids re-minting tokens on every request.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function normalizeHost(host) {
  if (!host) return "";
  let h = host.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(h)) h = `https://${h}`;
  return h;
}

export const config = {
  host: normalizeHost(process.env.DATABRICKS_HOST || "https://fe-sandbox-serverless-sandbox-admin.cloud.databricks.com"),
  profile: process.env.DATABRICKS_PROFILE || "sandbox-admin",
  catalog: process.env.DATABRICKS_CATALOG || "serverless_sandbox_admin_catalog",
  schema: process.env.DATABRICKS_SCHEMA || "default",
  warehouseId: process.env.DATABRICKS_WAREHOUSE_ID || "0b14e41d73a2ccf0",
  genieSpaceId: process.env.GENIE_SPACE_ID || "01f1a24279411b67a8b2f4bfbde46a4f",
  servingEndpoint: process.env.SERVING_ENDPOINT || "databricks-claude-sonnet-4-5",
  // Custom maintenance-risk model (XGBoost failure_recommender) — now live.
  maintenanceModelEndpoint: process.env.MAINTENANCE_MODEL_ENDPOINT || "volta-prediction-model",
  port: parseInt(process.env.PORT || "8000", 10),
  // In Databricks Apps this env var is present.
  isDatabricksApp: Boolean(process.env.DATABRICKS_APP_NAME || process.env.DATABRICKS_APP_URL),

  // Lakebase (autoscale) — persistence for generated alerts.
  lakebase: {
    endpoint: process.env.LAKEBASE_ENDPOINT || "projects/volta-industrial/branches/production/endpoints/primary",
    host: process.env.LAKEBASE_HOST || "ep-shy-term-d1865g4y.database.us-west-2.cloud.databricks.com",
    port: parseInt(process.env.LAKEBASE_PORT || "5432", 10),
    // `volta` DB holds the synced gold tables (public.line_status, open_atrisk,
    // parts, lines) + our public.generated_alerts — one connection serves both.
    database: process.env.LAKEBASE_DB || "volta",
    schema: process.env.LAKEBASE_SCHEMA || "public",
    // Postgres role name = the connecting identity. In the app that's the SP's
    // client id (DATABRICKS_CLIENT_ID); locally, set LAKEBASE_USER to your email.
    user: process.env.LAKEBASE_USER || process.env.DATABRICKS_CLIENT_ID || "",
  },
};

export const fq = (table) => `${config.catalog}.\`${config.schema}\`.${table}`;

let cachedToken = null;
let cachedExpiry = 0;

async function mintServicePrincipalToken() {
  const clientId = process.env.DATABRICKS_CLIENT_ID;
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "all-apis",
  });
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${config.host}/oidc/v1/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`OAuth token exchange failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { token: json.access_token, ttl: (json.expires_in || 3600) * 1000 };
}

async function mintLocalCliToken() {
  const { stdout } = await execFileAsync("databricks", ["auth", "token", "-p", config.profile], {
    maxBuffer: 1024 * 1024,
  });
  const json = JSON.parse(stdout);
  const expiresAt = json.expiry ? new Date(json.expiry).getTime() : Date.now() + 55 * 60 * 1000;
  return { token: json.access_token, ttl: Math.max(60_000, expiresAt - Date.now()) };
}

// Resolve the app/service-principal token (mode 2 or 3), cached.
export async function getServiceToken() {
  if (cachedToken && Date.now() < cachedExpiry) return cachedToken;

  let minted = await mintServicePrincipalToken();
  if (!minted) minted = await mintLocalCliToken();

  cachedToken = minted.token;
  // Refresh a minute before expiry.
  cachedExpiry = Date.now() + Math.max(60_000, minted.ttl - 60_000);
  return cachedToken;
}

// Token used for governed calls (SQL / Genie / model / FM).
// We always use the app's service-principal token (M2M, all-apis scope): the SP
// has been granted the needed permissions, and the forwarded end-user OBO token
// from Databricks Apps often lacks the `sql` / genie scopes (403 "required
// scopes: sql"). Kept as a function so a future OBO path can be reintroduced.
export async function getRequestToken(_req) {
  return getServiceToken();
}
