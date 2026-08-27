import { Router } from "express";
import { getRequestToken } from "../config.js";
import { genieStart, genieFollowup } from "../lib/databricks.js";

const router = Router();

// POST /api/genie/message
// Body: { content, conversationId? }  -> starts or continues a Genie conversation.
router.post("/message", async (req, res) => {
  try {
    const token = await getRequestToken(req);
    const { content, conversationId } = req.body || {};
    if (!content || !content.trim()) return res.status(400).json({ error: "Pergunta vazia" });

    const result = conversationId
      ? await genieFollowup(conversationId, content, token)
      : await genieStart(content, token);

    res.json(result);
  } catch (err) {
    console.error("[genie] message:", err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
