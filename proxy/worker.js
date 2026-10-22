/* ============================================================
   Прокси для заявок с сайта IPL в Одинцово (Cloudflare Worker).

   Зачем: чтобы токен Telegram-бота НЕ попадал в код страницы.
   Браузер отправляет заявку на этот воркер, а воркер уже сам
   дёргает Telegram Bot API. Токен хранится в секретах Cloudflare.

   Переменные окружения воркера:
     TELEGRAM_BOT_TOKEN — секрет, токен от @BotFather
     TELEGRAM_CHAT_ID   — id чата (секрет или переменная)
     ALLOWED_ORIGIN     — домен сайта, напр. https://mufassa955.github.io

   Деплой: tools/deploy_proxy.sh (через Cloudflare API, без Node.js)
   ============================================================ */

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method' }, 405, cors);
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false, error: 'bad json' }, 400, cors);
    }

    // Ловушка для ботов: скрытое поле, которое человек не заполняет.
    if (data.hp) return json({ ok: true }, 200, cors);

    const name = clean(data.name, 80);
    const phone = clean(data.phone, 40);
    if (!name || !phone) {
      return json({ ok: false, error: 'name and phone required' }, 422, cors);
    }

    const lines = [
      'Новая заявка с сайта IPL в Одинцово',
      '',
      'Имя: ' + name,
      'Телефон: ' + phone,
      'Услуга: ' + (clean(data.plan, 120) || '—')
    ];
    const comment = clean(data.comment, 600);
    if (comment) lines.push('Комментарий: ' + comment);
    lines.push('');
    lines.push('Страница: ' + (clean(data.page, 300) || '—'));

    const tg = await fetch(
      'https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: lines.join('\n'),
          disable_web_page_preview: true
        })
      }
    );

    const result = await tg.json().catch(() => ({}));
    if (!tg.ok || !result.ok) {
      // Клиенту не раскрываем внутренние детали.
      return json({ ok: false, error: 'telegram failed' }, 502, cors);
    }
    return json({ ok: true }, 200, cors);
  }
};

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}
