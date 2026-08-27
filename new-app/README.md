# Volta Industrial — Downtime & Maintenance Rescue

App de chão de fábrica para a **Volta Industrial**: visualiza linhas de produção em risco,
gera alertas por regras, ranqueia ações de manutenção pelo valor líquido evitado e conversa
com o lakehouse via **Genie**. Construído como **Databricks App** (Express + React).

## Stack
- **Backend:** Node.js / Express (ESM) — chama a Statement Execution API (SQL), a Genie
  Conversation API e o serving endpoint de Foundation Model.
- **Frontend:** React + Vite + TypeScript + Recharts.
- **Dados:** `serverless_sandbox_admin_catalog.default` (tabelas `gold_*` + metric view `mv_line_risk`).
- **Genie:** space "Volta Plant Floor" (`01f1a24279411b67a8b2f4bfbde46a4f`).
- **Modelo de risco:** endpoint de serving `volta-prediction-model` (XGBoost `failure_recommender`).
- **Workspace:** `fe-sandbox-serverless-sandbox-admin`.

## Módulos
1. **Visão Geral** — KPIs (exposição a downtime, linhas críticas, corretivos, valor líquido),
   mapa de risco (vibração × risco) e exposição por planta.
2. **Central de Alertas** — fila de linhas em risco, filtros, mapa geográfico das plantas,
   scatter e drawer de detalhe (telemetria, nota do técnico, peça, ações ranqueadas).
3. **Geração de Alertas** — motor de regras (risco/vibração/temperatura/corretivo/planta/
   equipamento) calculado **em tempo real, read-only**; notificação de browser + rascunho de email.
4. **Recomendação & Plano** — 3 ações ranqueadas (`pull_now` / `run_to_shift_end` /
   `expedite_parts_and_run`) por valor líquido, com **plano + explicabilidade** redigidos pelo LLM.
5. **Chat Genie** — perguntas em linguagem natural; mostra o SQL gerado e os resultados.

## Modelo de risco (futuro)
`server/lib/model.js` lê hoje `gold_maintenance_recommendations`. Quando o modelo de
recomendação de risco estiver publicado, basta setar `MAINTENANCE_MODEL_ENDPOINT` — a rota e a
UI não mudam (o contrato é o mesmo). Ver o TODO em `getRecommendationFromEndpoint`.

## Rodar localmente
Pré-requisito: `databricks auth login --host https://fe-sandbox-serverless-sandbox-admin.cloud.databricks.com --profile sandbox-admin`

```bash
cp .env.example .env         # ajuste se necessário
npm run install:all          # instala backend + client

# Terminal 1 — backend
npm run dev                  # Express em :8000

# Terminal 2 — frontend (dev, com proxy /api -> :8000)
npm run client:dev           # Vite em :5173
```

Abra http://localhost:5173.

## Build de produção
```bash
npm run build                # gera client/dist
npm start                    # Express serve API + client/dist em :8000
```

## Deploy (Databricks App)
```bash
./deploy.sh volta-industrial
```
Depois conceda ao service principal do app: **Can use** no SQL warehouse, **SELECT** nas
tabelas / **Can run** no Genie space, e **Can query** no serving endpoint. Redeploy para aplicar.

## Autenticação
`server/config.js` resolve o token em 3 modos, transparente:
1. **OBO** — header `x-forwarded-access-token` (user auth do Databricks App).
2. **Service principal** — `DATABRICKS_CLIENT_ID/SECRET` (injetados no app) via OAuth.
3. **Local** — `databricks auth token -p <profile>`.
