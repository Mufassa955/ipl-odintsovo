#!/usr/bin/env bash
# ============================================================
#  Деплой прокси (Cloudflare Worker) через REST API — без Node.js.
#
#  Что нужно один раз:
#    1. Аккаунт Cloudflare (бесплатный).
#    2. API-токен с правом «Workers Scripts: Edit».
#    3. Account ID.
#
#  Как запускать:
#    CF_API_TOKEN=... CF_ACCOUNT_ID=... \
#    TELEGRAM_CHAT_ID=... ALLOWED_ORIGIN=https://mufassa955.github.io \
#    bash tools/deploy_proxy.sh
#
#  Токен бота скрипт берёт из .secrets/telegram.env (файл в .gitignore)
#  или из переменной TELEGRAM_BOT_TOKEN.
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

SCRIPT_NAME="${SCRIPT_NAME:-ipl-form}"
WORKER_FILE="proxy/worker.js"

if [ -f .secrets/telegram.env ]; then
  # shellcheck disable=SC1091
  . .secrets/telegram.env
fi

: "${CF_API_TOKEN:?нужен CF_API_TOKEN (Cloudflare → My Profile → API Tokens)}"
: "${CF_ACCOUNT_ID:?нужен CF_ACCOUNT_ID (правый столбец на странице аккаунта)}"
: "${TELEGRAM_BOT_TOKEN:?нужен TELEGRAM_BOT_TOKEN в .secrets/telegram.env}"
: "${TELEGRAM_CHAT_ID:?нужен TELEGRAM_CHAT_ID — id чата для заявок}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-https://mufassa955.github.io}"

API="https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers"
AUTH="Authorization: Bearer ${CF_API_TOKEN}"

say() { printf '\n=== %s ===\n' "$1"; }

say "Проверка токена и аккаунта"
ACC=$(curl -s -H "$AUTH" "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("result",{}).get("name","") if d.get("success") else "")')
[ -n "$ACC" ] && echo "аккаунт: $ACC" || { echo "❌ токен/account id не подошли"; exit 1; }

say "1/4 Загрузка кода воркера"
META=$(python3 - "$ALLOWED_ORIGIN" <<'PY'
import json, sys
print(json.dumps({
    "main_module": "worker.js",
    "compatibility_date": "2025-01-01",
    "bindings": [{"type": "plain_text", "name": "ALLOWED_ORIGIN", "text": sys.argv[1]}],
}))
PY
)
curl -s -X PUT "${API}/scripts/${SCRIPT_NAME}" \
  -H "$AUTH" \
  -F "metadata=${META};type=application/json" \
  -F "worker.js=@${WORKER_FILE};type=application/javascript+module" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("✅ код загружен" if d.get("success") else "❌ "+json.dumps(d.get("errors"), ensure_ascii=False)); sys.exit(0 if d.get("success") else 1)'

say "2/4 Секрет с токеном бота"
curl -s -X PUT "${API}/scripts/${SCRIPT_NAME}/secrets" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,os; print(json.dumps({"name":"TELEGRAM_BOT_TOKEN","text":os.environ["TELEGRAM_BOT_TOKEN"],"type":"secret_text"}))')" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("✅ токен сохранён как секрет" if d.get("success") else "❌ "+json.dumps(d.get("errors"), ensure_ascii=False))'

say "3/4 Секрет с id чата"
curl -s -X PUT "${API}/scripts/${SCRIPT_NAME}/secrets" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,os; print(json.dumps({"name":"TELEGRAM_CHAT_ID","text":os.environ["TELEGRAM_CHAT_ID"],"type":"secret_text"}))')" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("✅ chat id сохранён" if d.get("success") else "❌ "+json.dumps(d.get("errors"), ensure_ascii=False))'

say "4/6 Включение адреса *.workers.dev"
curl -s -X POST "${API}/scripts/${SCRIPT_NAME}/subdomain" \
  -H "$AUTH" -H 'Content-Type: application/json' -d '{"enabled":true,"previews_enabled":false}' \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("✅ адрес включён" if d.get("success") else "❌ "+json.dumps(d.get("errors"), ensure_ascii=False))'

SUB=$(curl -s -H "$AUTH" "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/subdomain" \
  | python3 -c 'import sys,json; print((json.load(sys.stdin).get("result") or {}).get("subdomain",""))')

if [ -z "$SUB" ]; then
  echo "❌ не удалось получить workers.dev-поддомен"; exit 1
fi
WORKER_URL="https://${SCRIPT_NAME}.${SUB}.workers.dev"
export TELEGRAM_WEBHOOK_SECRET WORKER_URL

say "5/6 Секрет для проверки вебхука"
if [ -z "${TELEGRAM_WEBHOOK_SECRET:-}" ]; then
  TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 24)
  echo "TELEGRAM_WEBHOOK_SECRET=${TELEGRAM_WEBHOOK_SECRET}" >> .secrets/telegram.env
  echo "сгенерирован новый секрет (сохранён в .secrets/telegram.env)"
fi
curl -s -X PUT "${API}/scripts/${SCRIPT_NAME}/secrets" \
  -H "$AUTH" -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,os; print(json.dumps({"name":"TELEGRAM_WEBHOOK_SECRET","text":os.environ["TELEGRAM_WEBHOOK_SECRET"],"type":"secret_text"}))')" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("✅ секрет вебхука сохранён" if d.get("success") else "❌ "+json.dumps(d.get("errors"), ensure_ascii=False))'

say "6/6 Регистрация вебхука бота"
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,os; print(json.dumps({"url":os.environ["WORKER_URL"]+"/telegram","secret_token":os.environ["TELEGRAM_WEBHOOK_SECRET"],"allowed_updates":["message","callback_query","my_chat_member"]}))')" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("✅ вебхук подключён" if d.get("ok") else "❌ "+str(d.get("description")))'

say "Готово"
echo "Адрес прокси: ${WORKER_URL}"
echo "Вебхук бота:  ${WORKER_URL}/telegram"
echo
echo "В telegram.js должно быть: PROXY_URL = '${WORKER_URL}'"

