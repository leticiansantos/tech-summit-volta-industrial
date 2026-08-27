import { Router } from "express";
import { getRequestToken } from "../config.js";
import {
  getKpis,
  getPlantRollup,
  getAtRiskLines,
  getScatterLines,
  getLineDetail,
  getRecommendations,
  getFilterOptions,
} from "../lib/queries.js";

const router = Router();

const handle = (fn) => async (req, res) => {
  try {
    const token = await getRequestToken(req);
    const data = await fn(req, token);
    res.json(data);
  } catch (err) {
    console.error(`[data] ${req.path}:`, err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
};

router.get("/kpis", handle(async (_req, token) => ({ kpis: await getKpis(token) })));
router.get("/plants", handle(async (_req, token) => ({ plants: await getPlantRollup(token) })));
router.get("/atrisk", handle(async (_req, token) => ({ lines: await getAtRiskLines(token) })));
router.get("/scatter", handle(async (_req, token) => ({ lines: await getScatterLines(token) })));
router.get("/recommendations", handle(async (_req, token) => ({ recommendations: await getRecommendations(token) })));
router.get("/filters", handle(async (_req, token) => await getFilterOptions(token)));
router.get("/line/:id", handle(async (req, token) => await getLineDetail(req.params.id, token)));

export default router;
