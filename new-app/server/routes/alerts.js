import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getRequestToken } from "../config.js";
import { generateAlerts, getFilterOptions } from "../lib/queries.js";
import * as lakebase from "../lib/lakebase.js";

const router = Router();

// Risk-band severity for a given failure_risk_score (mirrors the gold logic).
function severityFor(score) {
  if (score >= 0.75) return "critical";
  if (score >= 0.5) return "elevated";
  if (score >= 0.25) return "watch";
  return "healthy";
}

// POST /api/alerts/generate — read-only rule engine + persist to Lakebase.
// Body: { minRisk, minVibration, minTemp, requireOpenCorrective, plants[], machineTypes[] }
router.post("/generate", async (req, res) => {
  try {
    const token = await getRequestToken(req);
    const rules = req.body || {};

    // Validate plant/machine filters against the real domain (defense in depth).
    const { plants: validPlants, machineTypes: validMts } = await getFilterOptions(token);
    const plants = (rules.plants || []).filter((p) => validPlants.includes(p));
    const machineTypes = (rules.machineTypes || []).filter((m) => validMts.includes(m));

    const lines = await generateAlerts({ ...rules, plants, machineTypes }, token);
    const alerts = lines.map((l) => ({
      ...l,
      severity: severityFor(l.failure_risk_score),
      title: `${l.line_id} · ${l.machine_type.replace(/_/g, " ")} em ${l.plant_id}`,
      reason: buildReason(l, rules),
      generated_at: new Date().toISOString(),
    }));

    const summary = {
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === "critical").length,
      elevated: alerts.filter((a) => a.severity === "elevated").length,
      watch: alerts.filter((a) => a.severity === "watch").length,
      total_exposure_usd: Math.round(alerts.reduce((s, a) => s + (a.downtime_exposure_usd || 0), 0)),
    };

    // Persist to Lakebase (graceful: report the failure but still return the alerts).
    const runId = randomUUID();
    let persisted = false;
    let persistError = null;
    if (lakebase.isConfigured() && alerts.length) {
      try {
        const who = req.headers["x-forwarded-email"] || req.headers["x-forwarded-user"] || "app";
        await lakebase.persistAlerts(runId, who, { ...rules, plants, machineTypes }, alerts);
        persisted = true;
      } catch (e) {
        persistError = e.message;
        console.error("[alerts] persist falhou:", e.message);
      }
    }

    res.json({ summary, alerts, runId, persisted, persistError });
  } catch (err) {
    console.error("[alerts] generate:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/alerts/history — recent runs + recent persisted alerts from Lakebase.
router.get("/history", async (_req, res) => {
  try {
    if (!lakebase.isConfigured()) return res.json({ configured: false, runs: [], alerts: [] });
    const [runs, alerts] = await Promise.all([lakebase.listRuns(20), lakebase.listRecentAlerts(120)]);
    res.json({ configured: true, runs, alerts });
  } catch (err) {
    console.error("[alerts] history:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alerts/:id/ack — mark a persisted alert acknowledged.
router.post("/:id/ack", async (req, res) => {
  try {
    await lakebase.acknowledgeAlert(parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (err) {
    console.error("[alerts] ack:", err.message);
    res.status(500).json({ error: err.message });
  }
});

function buildReason(l, rules) {
  const parts = [];
  parts.push(`risco de falha ${(l.failure_risk_score * 100).toFixed(0)}%`);
  if (rules.minVibration && l.vibration_rms >= rules.minVibration)
    parts.push(`vibração ${l.vibration_rms.toFixed(2)} RMS`);
  if (rules.minTemp && l.temperature_c >= rules.minTemp) parts.push(`temperatura ${l.temperature_c.toFixed(1)}°C`);
  if (l.has_open_corrective) parts.push(`${l.open_wo_count} corretivo(s) aberto(s)`);
  if (l.part_local === false) parts.push(`peça não estocada localmente`);
  return parts.join(" · ");
}

export default router;
