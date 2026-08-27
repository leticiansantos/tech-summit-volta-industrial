# Volta Industrial — Downtime & Maintenance Rescue App

App de chão de fábrica para a Volta Industrial (Tech Summit). Node/Express + React (Vite + TS),
deploy como Databricks App. Consome os assets em `cosin_aws_classic_catalog.default` e a Genie
room "Volta Plant Floor".

## Config
- HOST: https://fevm-cosin-aws-classic.cloud.databricks.com
- Catálogo/Schema: cosin_aws_classic_catalog.default
- Warehouse: c29eba833f442426
- Genie space: 01f1a226bf8e11ccbd6467ab622e81e1
- Profile local: cosin
- Identidade: laranja industrial #F26522 sobre branco

## Plano
- [x] Pesquisa de contexto (Google Doc, GitHub, assets/dashboard)
- [x] Decisões (stack Node/Express+React, 4 módulos, alertas read-only, laranja #F26522)
- [x] Backend Express: config + auth (local profile / app SP / OBO), REST helpers (SQL, Genie, LLM)
- [x] Rotas: /api/kpis, /api/lines, /api/atrisk, /api/line/:id, /api/recommendations,
      /api/alerts/generate, /api/plan/:id, /api/genie/* — TODAS validadas contra infra real
- [x] Frontend: tema Volta, layout (sidebar/header/logo), api client, tipos
- [x] Página Overview (KPIs + narrativa + rollup por planta)
- [x] Página Central de Alertas (fila + filtros + mapa + scatter + drawer)
- [x] Página Geração de Alertas (regras + preview + notificação)
- [x] Página Recomendação + Plano (3 ações ranqueadas + explicabilidade + plano gerado)
- [x] Página Chat Genie
- [x] app.yaml + deploy.sh + .gitignore + READMEs
- [x] Build TypeScript OK + todas as rotas validadas contra infra real
- [~] Validação visual (screenshots via agente) — em andamento
- [ ] Seção de revisão

## Notas técnicas
- mv_line_risk é metric view → usar MEASURE().
- Modelo de risco: camada server/lib/model.js lê gold_maintenance_recommendations hoje,
  preparada para trocar por serving endpoint depois (env MAINTENANCE_MODEL_ENDPOINT).
- Alertas: read-only, calculados via query filtrada nas tabelas gold.
