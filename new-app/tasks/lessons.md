# Lessons

## Deploy de app Node no Databricks Apps — proxy npm
- **Problema:** o Databricks roda `npm install` contra `npm-proxy.cloud.databricks.com`
  no deploy. Deu **404 em deps transitivas** (ex.: `vary@1.1.2` do express) → "Error
  installing packages", deploy FAILED.
- **Solução:** empacotar o servidor com esbuild num único `.mjs` (bundle de tudo,
  inclusive express) e deployar um `package.json` **sem `dependencies`** → o npm install
  do Databricks vira no-op. Bundle ESM precisa do banner `createRequire` para interop CJS,
  e formato ESM (não cjs) para `import.meta.url` funcionar (__dirname serve o client/dist).
- **Permissões:** o app roda como service principal próprio. Conceder (aditivo):
  `grants update` USE_CATALOG/USE_SCHEMA/SELECT no UC; `permissions update warehouses`
  CAN_USE; `permissions update serving-endpoints <id>` CAN_QUERY; `permissions update
  genie <space>` CAN_RUN.

## Databricks Statement Execution API — parâmetros numéricos
- **Problema:** parâmetro com `type: "DECIMAL"` comparado a coluna `DOUBLE`
  (`failure_risk_score >= :r` com r="0.75") retornou 0 linhas — o DECIMAL sem
  precisão/escala trunca o valor (0.75 vira 0/1).
- **Regra:** para thresholds numéricos comparados a colunas DOUBLE/FLOAT, usar
  `type: "DOUBLE"` (ou omitir o type e deixar o cast implícito). Nunca "DECIMAL"
  sem precisão explícita.

## Metric view mv_line_risk
- Exige `MEASURE(<measure>)`; `SELECT <coluna>` cru dá METRIC_VIEW_MISSING_MEASURE_FUNCTION.

## JOIN em Spark
- Preferir `ON a.col = b.col` a `USING(col)` quando preciso qualificar a coluna do
  join no SELECT — USING impede `a.col`/`b.col` qualificado e dá AMBIGUOUS_REFERENCE
  se todas as colunas do SELECT não estiverem prefixadas.
