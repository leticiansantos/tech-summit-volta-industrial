// Lakebase (autoscale Postgres) access.
//
// The `volta` database holds the synced gold tables (public.line_status,
// open_atrisk, parts, lines) plus our writable public.generated_alerts — so a
// single pooled connection serves both the read path (replacing warehouse SQL
// where a synced table exists) and the alert-persistence write path.
//
// Auth: connection password is a short-lived OAuth credential minted for the
// endpoint (scoped to the app SP in prod, or the CLI user locally). Established
// sessions stay valid; only NEW connections need a fresh token.

import pg from "pg";
import { config, getServiceToken } from "../config.js";
import { getDbCredential } from "./databricks.js";

const { Pool, types } = pg;
// Return bigint (int8) and numeric as JS numbers so the UI gets numbers, not strings.
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

const lb = config.lakebase;
const S = lb.schema; // schema for our own tables (public)

let pool = null;
let cachedCred = null;
let cachedCredExpiry = 0;

async function freshCredential() {
  if (cachedCred && Date.now() < cachedCredExpiry) return cachedCred;
  const svc = await getServiceToken();
  cachedCred = await getDbCredential(lb.endpoint, svc);
  cachedCredExpiry = Date.now() + 40 * 60 * 1000;
  return cachedCred;
}

export function isConfigured() {
  return Boolean(lb.user && lb.host);
}

function getPool() {
  if (!isConfigured()) throw new Error("Lakebase não configurado (defina LAKEBASE_USER).");
  if (pool) return pool;
  pool = new Pool({
    host: lb.host,
    port: lb.port,
    database: lb.database,
    user: lb.user,
    password: freshCredential,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  pool.on("error", (e) => console.error("[lakebase] pool error:", e.message));
  return pool;
}

async function q(text, params = []) {
  const p = getPool();
  const { rows } = await p.query(text, params);
  return rows;
}

// Columns from the synced line_status table.
const LINE_FIELDS = [
  "line_id", "plant_id", "line_name", "machine_type", "criticality",
  "plant_lat", "plant_lng", "vibration_rms", "temperature_c", "utilization_pct",
  "failure_risk_score", "open_wo_count", "has_open_corrective", "part_local",
  "downtime_exposure_usd", "risk_band",
];
const LINE_COLS = LINE_FIELDS.join(", ");
const lineCols = (alias) => LINE_FIELDS.map((f) => `${alias}.${f}`).join(", ");

// ---------------- Read path (synced gold tables) ----------------

export async function atRiskLines() {
  return q(`SELECT ${lineCols("s")},
      a.candidate_part_id, a.part_lead_time_days, a.part_unit_cost_usd
    FROM public.line_status s
    JOIN public.open_atrisk a ON a.line_id = s.line_id
    ORDER BY s.downtime_exposure_usd DESC`);
}

export async function scatterLines() {
  return q(`SELECT ${LINE_COLS} FROM public.line_status WHERE risk_band <> 'healthy'
    UNION ALL
    SELECT ${LINE_COLS} FROM (
      SELECT ${LINE_COLS} FROM public.line_status
      WHERE risk_band = 'healthy' ORDER BY failure_risk_score DESC LIMIT 200
    ) h`);
}

export async function lineRow(lineId) {
  const rows = await q(
    `SELECT ${lineCols("s")},
        a.candidate_part_id, a.part_lead_time_days, a.part_unit_cost_usd
     FROM public.line_status s
     LEFT JOIN public.open_atrisk a ON a.line_id = s.line_id
     WHERE s.line_id = $1`,
    [lineId],
  );
  return rows[0] || null;
}

// Model input context for one or more lines.
export async function lineContexts(lineIds) {
  const rows = await q(
    `SELECT s.line_id, s.failure_risk_score, s.part_local,
        a.part_unit_cost_usd, a.part_lead_time_days
     FROM public.line_status s
     LEFT JOIN public.open_atrisk a ON a.line_id = s.line_id
     WHERE s.line_id = ANY($1)`,
    [lineIds],
  );
  return rows;
}

export async function kpiCounts() {
  const rows = await q(`SELECT
      (SELECT count(*) FROM public.open_atrisk) AS atrisk_lines,
      (SELECT count(*) FROM public.line_status WHERE risk_band='critical') AS critical_lines,
      (SELECT count(*) FROM public.line_status WHERE risk_band='elevated') AS elevated_lines,
      (SELECT count(*) FROM public.line_status WHERE risk_band='watch') AS watch_lines,
      (SELECT count(*) FROM public.line_status) AS total_lines,
      (SELECT round(sum(downtime_exposure_usd)) FROM public.open_atrisk) AS total_exposure_usd,
      (SELECT sum(open_wo_count) FROM public.open_atrisk) AS open_work_orders,
      (SELECT count(*) FROM public.open_atrisk WHERE part_local = false) AS nonlocal_part_lines`);
  return rows[0] || {};
}

export async function plantRollup() {
  return q(`SELECT plant_id,
      round(sum(downtime_exposure_usd)) AS exposure,
      count(*) FILTER (WHERE risk_band <> 'healthy') AS atrisk,
      count(*) FILTER (WHERE risk_band = 'critical') AS critical,
      count(*) AS lines,
      avg(failure_risk_score) AS avg_risk,
      avg(vibration_rms) AS avg_vib
    FROM public.line_status
    GROUP BY plant_id
    ORDER BY exposure DESC`);
}

export async function filterOptions() {
  const rows = await q(`SELECT
      array_agg(DISTINCT plant_id ORDER BY plant_id) AS plants,
      array_agg(DISTINCT machine_type ORDER BY machine_type) AS machine_types
    FROM public.line_status`);
  const r = rows[0] || {};
  return { plants: r.plants || [], machineTypes: r.machine_types || [] };
}

// Rule-based alert generation (read-only) over the synced line_status table.
export async function generateAlerts(rules) {
  const clamp = (v, min, max, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
  };
  const where = ["failure_risk_score >= $1", "vibration_rms >= $2", "temperature_c >= $3"];
  const params = [clamp(rules.minRisk, 0, 1, 0.5), clamp(rules.minVibration, 0, 100, 0), clamp(rules.minTemp, 0, 500, 0)];
  if (rules.requireOpenCorrective) where.push("has_open_corrective = true");
  if (Array.isArray(rules.plants) && rules.plants.length) {
    params.push(rules.plants);
    where.push(`plant_id = ANY($${params.length})`);
  }
  if (Array.isArray(rules.machineTypes) && rules.machineTypes.length) {
    params.push(rules.machineTypes);
    where.push(`machine_type = ANY($${params.length})`);
  }
  return q(`SELECT ${LINE_COLS} FROM public.line_status
    WHERE ${where.join(" AND ")} ORDER BY downtime_exposure_usd DESC`, params);
}

// ---------------- Write path (generated alerts) ----------------

const ALERTS = () => `${S}.generated_alerts`;

export async function persistAlerts(runId, generatedBy, rules, alerts) {
  if (!alerts.length) return runId;
  const cols = [
    "run_id", "generated_by", "line_id", "plant_id", "machine_type", "severity",
    "failure_risk_score", "vibration_rms", "temperature_c", "downtime_exposure_usd",
    "part_local", "recommended_action", "reason", "rules",
  ];
  const rulesJson = JSON.stringify(rules || {});
  const values = [];
  const tuples = alerts.map((a, i) => {
    const base = i * cols.length;
    values.push(
      runId, generatedBy, a.line_id, a.plant_id, a.machine_type, a.severity,
      a.failure_risk_score, a.vibration_rms, a.temperature_c, a.downtime_exposure_usd,
      a.part_local, a.recommended_action || null, a.reason, rulesJson,
    );
    return `(${cols.map((_, j) => `$${base + j + 1}`).join(", ")})`;
  });
  await q(`INSERT INTO ${ALERTS()} (${cols.join(", ")}) VALUES ${tuples.join(", ")}`, values);
  return runId;
}

export async function listRecentAlerts(limit = 120) {
  return q(
    `SELECT id, run_id, generated_at, generated_by, line_id, plant_id, machine_type,
        severity, failure_risk_score, downtime_exposure_usd, part_local,
        recommended_action, reason, acknowledged
     FROM ${ALERTS()} ORDER BY generated_at DESC, id DESC LIMIT $1`,
    [limit],
  );
}

export async function listRuns(limit = 20) {
  return q(
    `SELECT run_id, min(generated_at) AS generated_at, max(generated_by) AS generated_by,
        count(*) AS total,
        count(*) FILTER (WHERE severity = 'critical') AS critical,
        round(sum(downtime_exposure_usd)) AS total_exposure_usd,
        count(*) FILTER (WHERE acknowledged) AS acknowledged
     FROM ${ALERTS()} GROUP BY run_id ORDER BY generated_at DESC LIMIT $1`,
    [limit],
  );
}

export async function acknowledgeAlert(id) {
  await q(`UPDATE ${ALERTS()} SET acknowledged = true WHERE id = $1`, [id]);
}
