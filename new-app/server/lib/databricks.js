// Thin REST clients for the Databricks APIs the app uses:
//   - SQL Statement Execution API (query the gold_* tables + metric view)
//   - Genie Conversation API (the "Volta Plant Floor" space)
//   - Serving endpoints (Foundation Model for plan drafting / explainability)

import { config, getServiceToken } from "../config.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = "GET", body, token } = {}) {
  const bearer = token || (await getServiceToken());
  const res = await fetch(`${config.host}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || text || res.statusText;
    const err = new Error(`Databricks API ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// ---------------------------------------------------------------------------
// SQL Statement Execution
// ---------------------------------------------------------------------------

/**
 * Run a SQL statement and return { columns, rows } where rows are objects.
 * `parameters` is an array of { name, value, type } for :named placeholders.
 */
export async function execSql(statement, parameters = [], token) {
  let resp = await api("/api/2.0/sql/statements", {
    method: "POST",
    token,
    body: {
      statement,
      warehouse_id: config.warehouseId,
      wait_timeout: "30s",
      on_wait_timeout: "CONTINUE",
      disposition: "INLINE",
      format: "JSON_ARRAY",
      parameters: parameters.length ? parameters : undefined,
    },
  });

  const statementId = resp.statement_id;
  let state = resp.status?.state;
  // Poll until terminal.
  let tries = 0;
  while (state === "PENDING" || state === "RUNNING") {
    if (tries++ > 60) throw new Error("SQL statement timed out");
    await sleep(1000);
    resp = await api(`/api/2.0/sql/statements/${statementId}`, { token });
    state = resp.status?.state;
  }
  if (state !== "SUCCEEDED") {
    const err = resp.status?.error?.message || `SQL statement ${state}`;
    throw new Error(err);
  }

  const cols = (resp.manifest?.schema?.columns || []).map((c) => ({ name: c.name, type: c.type_name }));
  const dataArray = resp.result?.data_array || [];
  const rows = dataArray.map((arr) => {
    const obj = {};
    cols.forEach((c, i) => {
      obj[c.name] = coerce(arr[i], c.type);
    });
    return obj;
  });
  return { columns: cols, rows };
}

function coerce(v, type) {
  if (v === null || v === undefined) return null;
  switch (type) {
    case "INT":
    case "LONG":
    case "SHORT":
    case "BYTE":
      return parseInt(v, 10);
    case "FLOAT":
    case "DOUBLE":
    case "DECIMAL":
      return parseFloat(v);
    case "BOOLEAN":
      return v === true || v === "true";
    default:
      return v;
  }
}

// ---------------------------------------------------------------------------
// Genie Conversation API
// ---------------------------------------------------------------------------

async function pollGenieMessage(spaceId, conversationId, messageId, token) {
  let tries = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (tries++ > 90) throw new Error("Genie message timed out");
    const msg = await api(
      `/api/2.0/genie/spaces/${spaceId}/conversations/${conversationId}/messages/${messageId}`,
      { token },
    );
    const status = msg.status;
    if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") return msg;
    await sleep(1200);
  }
}

async function fetchGenieResult(spaceId, conversationId, messageId, attachmentId, token) {
  try {
    const r = await api(
      `/api/2.0/genie/spaces/${spaceId}/conversations/${conversationId}/messages/${messageId}/query-result/${attachmentId}`,
      { token },
    );
    const sr = r.statement_response;
    if (!sr) return null;
    const cols = (sr.manifest?.schema?.columns || []).map((c) => ({ name: c.name, type: c.type_name }));
    const dataArray = sr.result?.data_array || [];
    const rows = dataArray.map((arr) => {
      const obj = {};
      cols.forEach((c, i) => (obj[c.name] = coerce(arr[i], c.type)));
      return obj;
    });
    return { columns: cols, rows };
  } catch {
    return null;
  }
}

function shapeGenieMessage(msg, spaceId, conversationId, token) {
  return Promise.all(
    (msg.attachments || []).map(async (att) => {
      if (att.text) return { type: "text", content: att.text.content };
      if (att.query) {
        const result = await fetchGenieResult(spaceId, conversationId, msg.id, att.attachment_id, token);
        return {
          type: "query",
          sql: att.query.query,
          description: att.query.description || att.query.title || null,
          result,
        };
      }
      return null;
    }),
  ).then((parts) => parts.filter(Boolean));
}

export async function genieStart(content, token) {
  const spaceId = config.genieSpaceId;
  const start = await api(`/api/2.0/genie/spaces/${spaceId}/start-conversation`, {
    method: "POST",
    token,
    body: { content },
  });
  const conversationId = start.conversation_id || start.conversation?.id;
  const messageId = start.message_id || start.message?.id;
  const msg = await pollGenieMessage(spaceId, conversationId, messageId, token);
  const parts = await shapeGenieMessage(msg, spaceId, conversationId, token);
  return { conversationId, messageId, status: msg.status, parts };
}

export async function genieFollowup(conversationId, content, token) {
  const spaceId = config.genieSpaceId;
  const created = await api(`/api/2.0/genie/spaces/${spaceId}/conversations/${conversationId}/messages`, {
    method: "POST",
    token,
    body: { content },
  });
  const messageId = created.message_id || created.id;
  const msg = await pollGenieMessage(spaceId, conversationId, messageId, token);
  const parts = await shapeGenieMessage(msg, spaceId, conversationId, token);
  return { conversationId, messageId, status: msg.status, parts };
}

// ---------------------------------------------------------------------------
// Foundation Model (serving endpoint, OpenAI-compatible invocations)
// ---------------------------------------------------------------------------

export async function chatCompletion(messages, { maxTokens = 1200, temperature = 0.3 } = {}) {
  const resp = await api(`/serving-endpoints/${config.servingEndpoint}/invocations`, {
    method: "POST",
    body: { messages, max_tokens: maxTokens, temperature },
  });
  return resp.choices?.[0]?.message?.content || "";
}

// ---------------------------------------------------------------------------
// Custom model serving endpoint (dataframe_split → predictions[])
// ---------------------------------------------------------------------------

/**
 * Invoke a tabular model. `columns` is the ordered feature list, `rows` a list
 * of value arrays in the same order. Returns the raw `predictions` array.
 */
export async function modelPredict(endpoint, columns, rows, token) {
  const resp = await api(`/serving-endpoints/${endpoint}/invocations`, {
    method: "POST",
    token,
    body: { dataframe_split: { columns, data: rows } },
  });
  return resp.predictions || resp.outputs || [];
}

// ---------------------------------------------------------------------------
// Lakebase — short-lived Postgres credential (used as the connection password)
// ---------------------------------------------------------------------------

// Mints an OAuth credential for the Lakebase endpoint, scoped to the caller
// identity (app SP in prod, CLI user locally). Token lives ~1h.
export async function getDbCredential(endpoint, token) {
  const resp = await api("/api/2.0/postgres/credentials", {
    method: "POST",
    token,
    body: { endpoint },
  });
  return resp.token;
}
