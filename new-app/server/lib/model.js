// Maintenance-risk recommendation abstraction.
//
// TODAY: reads the batch-scored `gold_maintenance_recommendations` table.
// FUTURE: when MAINTENANCE_MODEL_ENDPOINT is set, the app will call that
// serving endpoint per line instead. The route/UI contract stays identical;
// only this function changes — keeping the swap a one-file change.

import { config } from "../config.js";
import { execSql, chatCompletion, modelPredict } from "./databricks.js";
import { fq } from "../config.js";
import * as lakebase from "./lakebase.js";

// Unplanned downtime rate used to frame the candidate scenarios ($/hour).
const DOWNTIME_RATE = 22000;
const ACTIONS = ["pull_now", "run_to_shift_end", "expedite_parts_and_run"];

// Build the three candidate action scenarios for a line. The model scores the
// downtime cost each avoids; net_value = avoided − action_cost. Scenario costs
// and expected downtime hours are documented demo assumptions derived from the
// line's real risk + parts logistics (mirrors the spec-03 heuristic).
function buildCandidates(ctx) {
  const partCost = ctx.part_unit_cost_usd || 3000;
  const lead = ctx.part_lead_time_days || 10;
  const local = ctx.part_local ? 1 : 0;
  return {
    pull_now: { action_cost_usd: 40000, downtime_hours: 2.0 },
    run_to_shift_end: { action_cost_usd: 0, downtime_hours: 4.0 },
    expedite_parts_and_run: {
      action_cost_usd: partCost + (local ? 0 : lead * 800),
      downtime_hours: local ? 1.0 : 2.5,
    },
  };
}

/**
 * Normalized recommendation for a line:
 *   { line_id, recommended_action, predicted_net_value_usd,
 *     predicted_downtime_cost_avoided_usd, ranking: [{action, net_value, cost, avoided}], source }
 */
export async function getLineRecommendation(lineId, token) {
  if (config.maintenanceModelEndpoint) {
    return getRecommendationFromEndpoint(lineId, token);
  }
  return getRecommendationFromTable(lineId, token);
}

async function getRecommendationFromTable(lineId, token) {
  const sql = `SELECT line_id, recommended_action, predicted_net_value_usd,
      predicted_downtime_cost_avoided_usd, action_ranking
    FROM ${fq("gold_maintenance_recommendations")} WHERE line_id = :line_id`;
  const { rows } = await execSql(sql, [{ name: "line_id", value: lineId }], token);
  const row = rows[0];
  if (!row) return null;
  return {
    line_id: row.line_id,
    recommended_action: row.recommended_action,
    predicted_net_value_usd: row.predicted_net_value_usd,
    predicted_downtime_cost_avoided_usd: row.predicted_downtime_cost_avoided_usd,
    ranking: parseRanking(row.action_ranking),
    source: "gold_maintenance_recommendations",
  };
}

// Fetch the model input context (risk + parts logistics) from Lakebase.
async function fetchLineContexts(lineIds, _token) {
  return lakebase.lineContexts(lineIds);
}

/**
 * Score the three candidate actions for many lines in a SINGLE batched call to
 * the model endpoint. Returns Map(line_id -> { recommended_action,
 * predicted_net_value_usd, predicted_downtime_cost_avoided_usd, ranking }).
 * `contexts` need: line_id, failure_risk_score, part_local, part_unit_cost_usd, part_lead_time_days.
 */
export async function scoreLines(contexts, token) {
  const rows = [];
  const index = [];
  for (const c of contexts) {
    const cand = buildCandidates(c);
    const localInt = c.part_local ? 1 : 0;
    for (const a of ACTIONS) {
      rows.push([a, c.failure_risk_score, localInt, cand[a].action_cost_usd, cand[a].downtime_hours]);
      index.push({ line_id: c.line_id, action: a, cost: cand[a].action_cost_usd });
    }
  }
  const result = new Map();
  if (!rows.length) return result;

  const columns = ["action_type", "risk_at_action", "part_local", "action_cost_usd", "downtime_hours"];
  const predictions = await modelPredict(config.maintenanceModelEndpoint, columns, rows, token);

  const byLine = new Map();
  index.forEach((it, i) => {
    const avoided = Math.round(Number(predictions[i]) || 0);
    const list = byLine.get(it.line_id) || [];
    list.push({ action: it.action, avoided, cost: Math.round(it.cost), net_value: Math.round(avoided - it.cost) });
    byLine.set(it.line_id, list);
  });

  for (const [line_id, ranking] of byLine) {
    ranking.sort((a, b) => b.net_value - a.net_value);
    const best = ranking[0];
    result.set(line_id, {
      recommended_action: best.action,
      predicted_net_value_usd: best.net_value,
      predicted_downtime_cost_avoided_usd: best.avoided,
      ranking,
    });
  }
  return result;
}

// Live single-line recommendation via the custom model serving endpoint.
async function getRecommendationFromEndpoint(lineId, token) {
  const ctxs = await fetchLineContexts([lineId], token);
  if (!ctxs.length) return null;
  const scores = await scoreLines(ctxs, token);
  const s = scores.get(lineId);
  if (!s) return null;
  return { line_id: lineId, ...s, source: `${config.maintenanceModelEndpoint} (live)` };
}

function parseRanking(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    return JSON.parse(v);
  } catch {
    return [];
  }
}

const ACTION_LABEL = {
  pull_now: "Parar agora (manutenção planejada)",
  run_to_shift_end: "Rodar até o fim do turno",
  expedite_parts_and_run: "Agilizar peça e seguir rodando",
};

export function actionLabel(a) {
  return ACTION_LABEL[a] || a;
}

/**
 * Draft a maintenance plan + explainability narrative for a line using the
 * Foundation Model. Deterministic context is assembled here; the model only
 * writes the prose so the numbers stay grounded.
 */
export async function draftMaintenancePlan({ line, recommendation, note }) {
  const rec = recommendation || {};
  const ctx = {
    line_id: line.line_id,
    plant_id: line.plant_id,
    machine_type: line.machine_type,
    criticality: line.criticality,
    failure_risk_score: line.failure_risk_score,
    risk_band: line.risk_band,
    vibration_rms: line.vibration_rms,
    temperature_c: line.temperature_c,
    open_wo_count: line.open_wo_count,
    has_open_corrective: line.has_open_corrective,
    part_local: line.part_local,
    part_lead_time_days: line.part_lead_time_days,
    part_unit_cost_usd: line.part_unit_cost_usd,
    candidate_part_id: line.candidate_part_id,
    downtime_exposure_usd: line.downtime_exposure_usd,
    recommended_action: rec.recommended_action,
    predicted_net_value_usd: rec.predicted_net_value_usd,
    predicted_downtime_cost_avoided_usd: rec.predicted_downtime_cost_avoided_usd,
    action_ranking: rec.ranking,
    technician_note: note?.technician_note_text || null,
  };

  const system =
    "Você é um assistente de confiabilidade industrial da Volta Industrial. " +
    "Escreva em português do Brasil, tom objetivo e executivo para um gestor não-técnico (Sam Ortiz, VP de Operações). " +
    "Use APENAS os números fornecidos no contexto; nunca invente valores. " +
    "Custo de parada não planejada é ~US$ 22.000/hora.";

  const user = `Contexto da linha (JSON):\n${JSON.stringify(ctx, null, 2)}\n\n` +
    `Gere um plano de manutenção acionável em Markdown com estas seções:\n` +
    `1. **Recomendação** — a ação recomendada e por que ela vence as alternativas (cite net value e custo evitado).\n` +
    `2. **Explicabilidade** — os sinais que sustentam a decisão (risco, vibração, temperatura, corretivo aberto, disponibilidade local da peça e lead time).\n` +
    `3. **Plano de ação** — 3 a 6 passos concretos para o técnico de campo.\n` +
    `4. **Rascunho de Work Order** — um bloco curto com linha, ação, peça e janela estimada.\n` +
    `Seja conciso.`;

  const content = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { maxTokens: 1400, temperature: 0.25 },
  );
  return content;
}
