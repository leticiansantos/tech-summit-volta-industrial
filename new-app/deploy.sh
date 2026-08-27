#!/usr/bin/env bash
# Deploy do Volta Industrial app como Databricks App.
# Estratégia: empacotar o servidor (esbuild) num único .mjs sem dependências e
# enviar um pacote enxuto — assim o `npm install` do Databricks não busca nada
# no proxy interno (que falha em deps transitivas como vary@1.1.2).
# Uso: ./deploy.sh [app-name]
set -euo pipefail

PROFILE="${DATABRICKS_PROFILE:-sandbox-admin}"
APP_NAME="${1:-volta-app}"
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "▶ Perfil:   $PROFILE"
echo "▶ App:      $APP_NAME"

# 1. Build do frontend (client/dist) e do bundle do servidor (dist-server/index.mjs).
echo "▶ Compilando frontend…"
( cd "$ROOT/client" && npm install --no-fund --no-audit && npm run build )
echo "▶ Empacotando servidor (esbuild)…"
( cd "$ROOT" && npm install --no-fund --no-audit && npm run build:server )

# 2. Montar um diretório de deploy enxuto (sem node_modules, sem package-lock).
STAGE="$(mktemp -d)"
mkdir -p "$STAGE/dist-server" "$STAGE/client"
cp "$ROOT/dist-server/index.mjs" "$STAGE/dist-server/"
cp -R "$ROOT/client/dist" "$STAGE/client/dist"
cp "$ROOT/app.yaml" "$STAGE/"
# package.json sem dependencies -> npm install do Databricks é no-op.
cat > "$STAGE/package.json" <<'EOF'
{
  "name": "volta-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "start": "node dist-server/index.mjs" },
  "dependencies": {}
}
EOF

# 3. Descobrir o usuário e o caminho no workspace.
ME="$(databricks current-user me -p "$PROFILE" -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["userName"])')"
WS_PATH="/Workspace/Users/$ME/$APP_NAME"
echo "▶ Destino:  $WS_PATH"

# 4. Criar o app (idempotente).
databricks apps create "$APP_NAME" -p "$PROFILE" 2>/dev/null || echo "  (app já existe, seguindo)"

# 5. Sincronizar apenas o pacote enxuto.
echo "▶ Enviando arquivos…"
databricks sync "$STAGE" "$WS_PATH" -p "$PROFILE" --full

# 6. Deploy.
echo "▶ Deploy…"
databricks apps deploy "$APP_NAME" --source-code-path "$WS_PATH" -p "$PROFILE"

echo "✔ Concluído."
databricks apps get "$APP_NAME" -p "$PROFILE" -o json | python3 -c 'import sys,json;a=json.load(sys.stdin);print("URL:",a.get("url"));print("status:",a.get("app_status",a.get("status")))' || true

echo
echo "IMPORTANTE — conceda ao service principal do app permissões nos recursos:"
echo "  • SQL Warehouse 0b14e41d73a2ccf0 : Can use"
echo "  • Tabelas em serverless_sandbox_admin_catalog.default : SELECT"
echo "  • Genie space 01f1a24279411b67a8b2f4bfbde46a4f : Can run"
echo "  • Serving endpoints volta-prediction-model e databricks-claude-sonnet-4-5 : Can query"
echo "Depois rode novamente o deploy para aplicar."

rm -rf "$STAGE"
