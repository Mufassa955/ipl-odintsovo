/* ============================================================
   IPL в Одинцове — настройка отправки заявок в Telegram.

   Как это работает
   ----------------
   1) Форма (index.html) — обычная HTML-форма с полями.
   2) app.js перехватывает отправку, собирает из полей одно
      сообщение и отправляет его в Telegram Bot API:
         POST https://api.telegram.org/bot<TOKEN>/sendMessage
   3) Если токен не заполнен (или запрос не прошёл) — форма
      работает как раньше: открывает письмо через mailto:.
      Клиент всегда получает заявку, сайт никогда не ломается.

   Что нужно заполнить (один раз)
   -------------------------------
   - TELEGRAM_BOT_TOKEN — токен от @BotFather
   - TELEGRAM_CHAT_ID   — id чата, куда приходят заявки
   Подробная инструкция: docs/TELEGRAM-SETUP.md
   ============================================================ */
(function () {
  'use strict';

  var TELEGRAM_BOT_TOKEN = '';   // ← вставьте токен от @BotFather
  var TELEGRAM_CHAT_ID = '';     // ← вставьте id чата

  var form = document.querySelector('.form');
  if (!form) return;

  var status = form.querySelector('.form__status');
  var route = form.querySelector('.form__route');
  var button = form.querySelector('button[type="submit"]');
  var buttonText = button ? button.textContent : '';

  function showStatus(text, kind) {
    if (!status) return;
    status.textContent = text;
    status.className = 'form__status form__status--' + kind;
  }

  function telegramReady() {
    return !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID &&
      TELEGRAM_BOT_TOKEN.indexOf('ВСТАВЬТЕ') === -1);
  }

  function fieldValue(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function buildMessage() {
    var lines = [
      'Новая заявка с сайта IPL в Одинцово',
      '',
      'Имя: ' + (fieldValue('f-name') || '—'),
      'Телефон: ' + (fieldValue('f-phone') || '—'),
      'Услуга: ' + (fieldValue('f-plan') || '—')
    ];
    var comment = fieldValue('f-comment');
    if (comment) lines.push('Комментарий: ' + comment);
    lines.push('');
    lines.push('Страница: ' + location.href);
    return lines.join('\n');
  }

  // Когда токен вписан — честно говорим посетителю, куда ушла заявка
  if (telegramReady() && route) {
    route.textContent = 'Заявка уходит прямо в Telegram студии — отвечаем в течение 15 минут, ежедневно с 10:00 до 22:00.';
  }

  form.addEventListener('submit', function (event) {
    if (!telegramReady()) return;   // токена нет — отдаём форму как обычный mailto:

    event.preventDefault();
    var name = fieldValue('f-name');
    var phone = fieldValue('f-phone');
    if (!name || !phone) {
      showStatus('Заполните имя и телефон — без них мы не сможем перезвонить.', 'error');
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = 'Отправляем…';
    }
    showStatus('Отправляем заявку…', 'wait');

    fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: buildMessage(),
        disable_web_page_preview: true
      })
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function () {
      form.reset();
      if (button) {
        button.disabled = false;
        button.textContent = buttonText;
      }
      showStatus('Готово! Заявка отправлена — перезвоним в течение 15 минут.', 'ok');
    }).catch(function () {
      if (button) {
        button.disabled = false;
        button.textContent = buttonText;
      }
      showStatus('Не удалось отправить в Telegram. Напишите нам в WhatsApp или Telegram — кнопки ниже.', 'error');
    });
  });
})();
