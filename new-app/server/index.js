import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

import { config } from "./config.js";
import dataRoutes from "./routes/data.js";
import alertRoutes from "./routes/alerts.js";
import recRoutes from "./routes/recommendations.js";
import genieRoutes from "./routes/genie.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: "1mb" }));

// Health + app metadata (safe subset — no secrets).
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/config", (_req, res) =>
  res.json({
    catalog: config.catalog,
    schema: config.schema,
    genieSpaceId: config.genieSpaceId,
    hasCustomModel: Boolean(config.maintenanceModelEndpoint),
  }),
);

app.use("/api", dataRoutes);
app.use("/api", recRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/genie", genieRoutes);

// Serve the built React frontend (production).
const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
} else {
  app.get("/", (_req, res) =>
    res
      .status(200)
      .send("<h1>Volta Industrial API</h1><p>Frontend não compilado. Rode <code>npm run build</code> ou o Vite dev server.</p>"),
  );
}

app.listen(config.port, () => {
  console.log(`Volta Industrial app on :${config.port}  (catalog=${config.catalog}, app=${config.isDatabricksApp})`);
});
