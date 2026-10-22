# Заявки с сайта → Telegram

Схема, которая работает на сайте сейчас:

```
Клиент заполняет форму
        │
        ▼
telegram.js  ──POST──▶  Cloudflare Worker (прокси)
                              │  токен бота хранится здесь, в секретах
                              ▼
                        Telegram Bot API  ──▶  ваш чат
```

В коде страницы **нет ни токена бота, ни id чата** — только адрес прокси.
Посмотреть их в исходниках сайта невозможно.

---

## Что уже настроено

| Что | Значение |
|---|---|
| Бот | `@ipl_odintsovo_bot` |
| Прокси | `https://ipl-form.ipl-odintsovo.workers.dev` |
| Код воркера | `proxy/worker.js` |
| Деплой воркера | `tools/deploy_proxy.sh` |
| Секреты (токен, chat id) | хранятся в Cloudflare, не в репозитории |
| Локальные секреты | `.secrets/` — папка в `.gitignore`, в git не попадает |

Заявка приходит в таком виде:

```
Новая заявка с сайта IPL в Одинцово

Имя: Анна
Телефон: +7 (916) 123-45-67
Услуга: Тотал Плюс — 8 800 ₽
Комментарий: первый раз, чувствительная кожа

Страница: https://mufassa955.github.io/ipl-odintsovo/
```

---

## Если нужно поменять чат получателя

Например, заявки должны идти не в личку, а в группу студии.

1. Создайте группу, добавьте бота, сделайте его **администратором**.
2. Напишите в группе любое сообщение.
3. Узнайте id группы:

   ```bash
   curl -s "https://api.telegram.org/bot<ТОКЕН>/getUpdates" | grep -o '"chat":{"id":-\?[0-9]*'
   ```

   У группы id отрицательный, например `-1001234567890`.
4. Обновите секрет в Cloudflare:

   ```bash
   . .secrets/cloudflare.env && . .secrets/telegram.env
   curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts/ipl-form/secrets" \
     -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' \
     -d '{"name":"TELEGRAM_CHAT_ID","text":"-1001234567890","type":"secret_text"}'
   ```

---

## Если нужно сменить токен бота

Токен «утекал» или вы пересоздали бота у @BotFather:

1. Получите новый токен у @BotFather (`/mybots` → бот → API Token).
2. Обновите `.secrets/telegram.env`.
3. Перезалейте секрет в Cloudflare (тот же запрос, что выше, но `TELEGRAM_CHAT_ID` → `TELEGRAM_BOT_TOKEN`)
   или просто заново выполните `bash tools/deploy_proxy.sh` — он перезапишет оба секрета.

Сайт при этом пересобирать не нужно: адрес прокси не меняется.

---

## Передеплой прокси с нуля

```bash
. .secrets/cloudflare.env && . .secrets/telegram.env
bash tools/deploy_proxy.sh
```

Скрипту нужны:

| Переменная | Откуда взять |
|---|---|
| `CF_API_TOKEN` | Cloudflare → My Profile → API Tokens → шаблон «Edit Cloudflare Workers» |
| `CF_ACCOUNT_ID` | Cloudflare → Workers & Pages → правая колонка «Account ID» |
| `TELEGRAM_BOT_TOKEN` | @BotFather |
| `TELEGRAM_CHAT_ID` | `getUpdates` (см. выше) |
| `ALLOWED_ORIGIN` | домен сайта, по умолчанию `https://mufassa955.github.io` |

---

## Запасной режим — без прокси

Если прокси недоступен, форму можно переключить на прямую отправку.
В `telegram.js`:

```js
var PROXY_URL = '';                                  // выключили прокси
var TELEGRAM_BOT_TOKEN = '8123456789:AAH...';        // ← токен окажется в коде страницы!
var TELEGRAM_CHAT_ID = '123456789';
```

⚠️ В этом режиме токен виден любому посетителю сайта. Использовать только как временную меру.

Если не настроено ни то, ни другое, форма работает как обычная: открывает письмо через `mailto:`.
Сайт не ломается никогда.

---

## Проверка

```bash
# 1. Прокси отвечает
curl -X POST https://ipl-form.ipl-odintsovo.workers.dev \
  -H 'Content-Type: application/json' \
  -d '{"name":"Проверка","phone":"+7 999 123-45-67","plan":"тест"}'
# ожидаем: {"ok":true}

# 2. В исходниках сайта нет токена
curl -s https://mufassa955.github.io/ipl-odintsovo/telegram.js | grep -c "AAH"   # ожидаем: 0
```

И главное — заполните форму на сайте: заявка должна прийти в Telegram за 1–2 секунды,
а на странице появиться «Готово! Заявка отправлена — перезвоним в течение 15 минут».
