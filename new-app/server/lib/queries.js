// Data access for the app.
//
// Reads come from Lakebase Postgres (synced gold tables: line_status,
// open_atrisk, parts, lines) — low latency, no warehouse spin-up. Only data
// that is NOT synced to Lakebase (per-line telemetry history and technician
// notes, from the bronze_* tables) still goes through the SQL warehouse.
import { fq } from "../config.js";
import { execSql } from "./databricks.js";
import { scoreLines } from "./model.js";
import * as lakebase from "./lakebase.js";

// Merge a scoreLines() Map into line objects, adding recommendation fields.
function attachScores(lines, scores) {
  return lines.map((l) => {
    const s = scores.get(l.line_id);
    if (!s) return l;
    return {
      ...l,
      recommended_action: s.recommended_action,
      predicted_net_value_usd: s.predicted_net_value_usd,
      predicted_downtime_cost_avoided_usd: s.predicted_downtime_cost_avoided_usd,
      action_ranking: JSON.stringify(s.ranking),
    };
  });
}

// Headline KPIs: counts/exposure from Lakebase; predicted figures from the model.
export async function getKpis(token) {
  const [counts, scored] = await Promise.all([lakebase.kpiCounts(), getAtRiskLines(token)]);
  return {
    ...counts,
    predicted_net_value_usd: Math.round(scored.reduce((s, l) => s + (l.predicted_net_value_usd || 0), 0)),
    predicted_cost_avoided_usd: Math.round(scored.reduce((s, l) => s + (l.predicted_downtime_cost_avoided_usd || 0), 0)),
  };
}

// Per-plant rollup (computed in Postgres, replacing the mv_line_risk metric view).
export function getPlantRollup() {
  return lakebase.plantRollup();
}

// The alert queue: at-risk lines + the live model's recommended action.
export async function getAtRiskLines(token) {
  const lines = await lakebase.atRiskLines();
  const scores = await scoreLines(lines, token);
  return attachScores(lines, scores);
}

export function getScatterLines() {
  return lakebase.scatterLines();
}

// Full detail for one line: status (Lakebase) + telemetry & note (warehouse) +
// the live model recommendation.
export async function getLineDetail(lineId, token) {
  const telemetrySql = `SELECT telemetry_date, vibration_rms, temperature_c, utilization_pct, error_count
    FROM ${fq("bronze_telemetry")} WHERE line_id = :line_id
    ORDER BY telemetry_date DESC LIMIT 90`;
  const noteSql = `SELECT snapshot_date, failure_risk_score, open_wo_count, technician_note_text
    FROM ${fq("bronze_risk_snapshots")} WHERE line_id = :line_id
    ORDER BY snapshot_date DESC LIMIT 1`;
  const p = [{ name: "line_id", value: lineId }];

  const [line0, telemetry, note] = await Promise.all([
    lakebase.lineRow(lineId),
    execSql(telemetrySql, p, token),
    execSql(noteSql, p, token),
  ]);

  let line = line0;
  if (line) {
    const scores = await scoreLines([line], token);
    [line] = attachScores([line], scores);
  }
  return {
    line,
    telemetry: telemetry.rows.slice().reverse(), // oldest -> newest for charts
    note: note.rows[0] || null,
  };
}

// Recommendations list: at-risk lines scored live by the model, ranked by net value.
export async function getRecommendations(token) {
  const scored = await getAtRiskLines(token);
  return scored
    .filter((l) => l.predicted_net_value_usd != null)
    .sort((a, b) => (b.predicted_net_value_usd || 0) - (a.predicted_net_value_usd || 0));
}

// Rule-based alert generation (read-only) — Lakebase.
export function generateAlerts(rules, _token) {
  return lakebase.generateAlerts(rules);
}

// Filter dropdown values — Lakebase.
export function getFilterOptions(_token) {
  return lakebase.filterOptions();
}
