import { Router } from "express";
import { getRequestToken } from "../config.js";
import { getLineDetail } from "../lib/queries.js";
import { getLineRecommendation, draftMaintenancePlan } from "../lib/model.js";

const router = Router();

// GET /api/recommendation/:id — normalized recommendation (table today, endpoint later).
router.get("/recommendation/:id", async (req, res) => {
  try {
    const token = await getRequestToken(req);
    const rec = await getLineRecommendation(req.params.id, token);
    if (!rec) return res.status(404).json({ error: "Sem recomendação para esta linha" });
    res.json({ recommendation: rec });
  } catch (err) {
    console.error("[rec] recommendation:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/plan/:id — LLM-drafted maintenance plan + explainability.
router.post("/plan/:id", async (req, res) => {
  try {
    const token = await getRequestToken(req);
    const [{ line, note }, rec] = await Promise.all([
      getLineDetail(req.params.id, token),
      getLineRecommendation(req.params.id, token),
    ]);
    if (!line) return res.status(404).json({ error: "Linha não encontrada" });
    const plan = await draftMaintenancePlan({ line, recommendation: rec, note });
    res.json({ plan, recommendation: rec });
  } catch (err) {
    console.error("[rec] plan:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
