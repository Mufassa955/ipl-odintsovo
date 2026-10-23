/* ============================================================
   Бэкенд сайта IPL в Одинцово (Cloudflare Worker).

   Два маршрута:
     POST /          — приём заявки с сайта и отправка в Telegram
     POST /telegram  — вебхук бота @ipl_odintsovo_bot

   Секреты (Cloudflare → Worker → Settings → Variables):
     TELEGRAM_BOT_TOKEN        — токен от @BotFather
     TELEGRAM_CHAT_ID          — чат студии, куда приходят заявки
     TELEGRAM_WEBHOOK_SECRET   — проверка, что вебхук пришёл от Telegram
     ALLOWED_ORIGIN            — домен сайта (CORS)

   Токен в код страницы не попадает — только адрес этого воркера.
   ============================================================ */

const SITE = 'https://mufassa955.github.io/ipl-odintsovo/';
const PHONES = '+7 993 266-63-66, +7 925 326-61-96';

const TEXT = {
  greeting:
    'Здравствуйте! Это студия IPL в Одинцове 🌿\n' +
    'БЦ «Телеграф», Можайское шоссе, 20, каб. 206\n\n' +
    'Чем помочь?',

  booking:
    'Записаться можно так:\n\n' +
    '1. Позвонить: ' + PHONES + '\n' +
    '2. Оставить заявку на сайте: ' + SITE + '#booking\n\n' +
    'Администратор свяжется с вами и подтвердит время. ' +
    'Если удобнее, чтобы мы написали первыми — нажмите «Позвать администратора».',

  prices:
    'Комплексы на всё тело (−20 % до 30.11.2026):\n' +
    '• Тотал Лайт — 6 240 ₽ (было 7 800)\n' +
    '• Тотал Боди — 7 600 ₽ (было 9 500)\n' +
    '• Тотал Плюс — 8 800 ₽ (было 11 000)\n\n' +
    'Популярные зоны (со скидкой первого визита):\n' +
    '• Подмышки — 1 105 ₽\n' +
    '• Бикини классика — 1 700 ₽\n' +
    '• Ноги полностью — 2 975 ₽\n\n' +
    'Электроэпиляция — 35 ₽/мин\n' +
    'Мужская эпиляция — +20 % к прайсу\n\n' +
    'Полный прайс по 24 зонам: ' + SITE + '#zones',

  address:
    'Московская обл., г. Одинцово,\n' +
    'Можайское шоссе, 20 (БЦ «Телеграф»),\n' +
    '2 этаж, каб. 206\n\n' +
    '5 минут пешком от МЦК «Одинцово».\n' +
    'Ежедневно с 10:00 до 22:00.\n\n' +
    'Маршрут: https://yandex.ru/maps/?rtext=~55.674347%2C37.277413&z=17',

  prep:
    'Подготовка к процедуре:\n\n' +
    '• За 24 часа не загорайте и не используйте автозагар.\n' +
    '• За 2–3 дня побрейте зону.\n' +
    '• В день процедуры не наносите крем и дезодорант на зону обработки.\n' +
    '• Приходите за 5 минут до начала.',

  admin:
    'Передал администратору — ответим в течение 15 минут в рабочее время ' +
    '(ежедневно с 10:00 до 22:00).'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/telegram') return handleTelegram(request, env);
    return handleForm(request, env);
  }
};

/* ---------------- Заявка с сайта ---------------- */

async function handleForm(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405, cors);

  let data;
  try { data = await request.json(); } catch { return json({ ok: false, error: 'bad json' }, 400, cors); }

  if (data.hp) return json({ ok: true }, 200, cors);   // ловушка для ботов

  const name = clean(data.name, 80);
  const phone = clean(data.phone, 40);
  if (!name || !phone) return json({ ok: false, error: 'name and phone required' }, 422, cors);

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

  const digits = phone.replace(/\D/g, '').replace(/^8/, '7');
  const buttons = [];
  if (digits.length >= 10) {
    buttons.push({
      text: 'WhatsApp клиенту',
      url: 'https://wa.me/' + digits + '?text=' +
        encodeURIComponent('Здравствуйте, ' + name + '! Это студия IPL в Одинцове. Вы оставляли заявку на сайте — уточните, пожалуйста, удобное время.')
    });
  }
  buttons.push({ text: '✅ Взял', callback_data: 'taken' });

  const sent = await tg(env, 'sendMessage', {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: lines.join('\n'),
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [buttons] }
  });

  if (!sent.ok) return json({ ok: false, error: 'telegram failed' }, 502, cors);
  return json({ ok: true }, 200, cors);
}

/* ---------------- Бот ---------------- */

async function handleTelegram(request, env) {
  if (request.method !== 'POST') return new Response('ok');

  // Проверяем, что запрос действительно от Telegram
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (got !== env.TELEGRAM_WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
  }

  let update;
  try { update = await request.json(); } catch { return new Response('ok'); }

  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
  } else if (update.message) {
    await handleMessage(update.message, env);
  }
  return new Response('ok');
}

async function handleMessage(message, env) {
  const text = (message.text || '').trim();
  const chatId = message.chat.id;
  const isCommand = text.startsWith('/');

  // Личные сообщения бота — меню. В группе не отвечаем на болтовню.
  if (message.chat.type !== 'private') return;
  if (isCommand && !/^\/(start|help|menu)\b/i.test(text)) return;

  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: TEXT.greeting,
    reply_markup: menuKeyboard()
  });
}

async function handleCallback(cb, env) {
  const data = cb.data || '';
  const msg = cb.message;
  const chatId = msg && msg.chat ? msg.chat.id : null;
  if (!chatId) return tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });

  // Отметка «Взял» на заявке
  if (data === 'taken') {
    const current = msg.text || '';
    if (current.startsWith('✅')) {
      return tg(env, 'answerCallbackQuery', {
        callback_query_id: cb.id,
        text: 'Эту заявку уже взяли',
        show_alert: true
      });
    }
    const who = [cb.from.first_name, cb.from.last_name].filter(Boolean).join(' ') ||
      (cb.from.username ? '@' + cb.from.username : 'мастер');
    await tg(env, 'editMessageText', {
      chat_id: chatId,
      message_id: msg.message_id,
      text: '✅ Взял(а): ' + who + '\n\n' + current,
      disable_web_page_preview: true
    });
    return tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Отмечено' });
  }

  // Позвать администратора
  if (data === 'admin') {
    const who = [cb.from.first_name, cb.from.last_name].filter(Boolean).join(' ') || 'без имени';
    const username = cb.from.username ? '@' + cb.from.username : 'нет username';
    const lines = [
      'Клиент просит администратора',
      '',
      'Имя: ' + who,
      'Username: ' + username,
      'Telegram ID: ' + cb.from.id
    ];
    const buttons = [];
    if (cb.from.username) buttons.push([{ text: 'Написать клиенту', url: 'https://t.me/' + cb.from.username }]);
    await tg(env, 'sendMessage', {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: lines.join('\n'),
      reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined
    });
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Передал администратору' });
    return editOrSend(env, chatId, msg.message_id, TEXT.admin, backKeyboard());
  }

  const answer = {
    menu: TEXT.greeting,
    booking: TEXT.booking,
    prices: TEXT.prices,
    address: TEXT.address,
    prep: TEXT.prep
  }[data];

  if (!answer) return tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });

  await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
  return editOrSend(env, chatId, msg.message_id, answer, data === 'menu' ? menuKeyboard() : backKeyboard());
}

/* ---------------- Клавиатуры и утилиты ---------------- */

function menuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'Записаться', callback_data: 'booking' }, { text: 'Цены', callback_data: 'prices' }],
      [{ text: 'Как добраться', callback_data: 'address' }, { text: 'Подготовка к процедуре', callback_data: 'prep' }],
      [{ text: 'Позвать администратора', callback_data: 'admin' }]
    ]
  };
}

function backKeyboard() {
  return { inline_keyboard: [[{ text: '← В меню', callback_data: 'menu' }]] };
}

async function editOrSend(env, chatId, messageId, text, replyMarkup) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    disable_web_page_preview: true,
    reply_markup: replyMarkup
  };
  const res = await tg(env, 'editMessageText', payload);
  if (res.ok) return res;
  return tg(env, 'sendMessage', {
    chat_id: chatId,
    text: text,
    disable_web_page_preview: true,
    reply_markup: replyMarkup
  });
}

async function tg(env, method, payload) {
  try {
    const res = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

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
