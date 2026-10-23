/* ============================================================
   IPL в Одинцове — отправка заявок с формы.

   Два режима работы (включаются одной строкой ниже):

   ПРОКСИ (рекомендуется, токен не виден в коде страницы)
   ------------------------------------------------------
   PROXY_URL = 'https://<воркер>.workers.dev'
   Браузер шлёт заявку на Cloudflare Worker, а тот — в Telegram.
   Токен бота лежит в секретах воркера (proxy/worker.js).

   НАПРЯМУЮ (запасной вариант, без прокси)
   ---------------------------------------
   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID заполнены,
   PROXY_URL пустой — браузер обращается к Bot API сам.
   При этом токен виден в исходниках страницы!

   Если не настроено ни то, ни другое — форма работает как
   обычная: открывает письмо через mailto:. Сайт не ломается.

   Инструкция: docs/TELEGRAM-SETUP.md
   ============================================================ */
(function () {
  'use strict';

  var PROXY_URL = 'https://ipl-form.ipl-odintsovo.workers.dev';
  var TELEGRAM_BOT_TOKEN = '';   // ← заполняется только для режима «напрямую»
  var TELEGRAM_CHAT_ID = '';     // ← то же

  var form = document.querySelector('.form');
  if (!form) return;

  var status = form.querySelector('.form__status');
  var button = form.querySelector('button[type="submit"]');
  var buttonText = button ? button.textContent : '';

  function showStatus(text, kind) {
    if (!status) return;
    status.textContent = text;
    status.className = 'form__status form__status--' + kind;
  }

  function configured() {
    if (PROXY_URL && PROXY_URL.indexOf('ВСТАВЬТЕ') === -1) return true;
    return !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID &&
      TELEGRAM_BOT_TOKEN.indexOf('ВСТАВЬТЕ') === -1);
  }

  function fieldValue(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function payload() {
    return {
      name: fieldValue('f-name'),
      phone: fieldValue('f-phone'),
      plan: fieldValue('f-plan'),
      comment: fieldValue('f-comment'),
      page: location.href
    };
  }

  function messageText(data) {
    var lines = [
      'Новая заявка с сайта IPL в Одинцово',
      '',
      'Имя: ' + (data.name || '—'),
      'Телефон: ' + (data.phone || '—'),
      'Услуга: ' + (data.plan || '—')
    ];
    if (data.comment) lines.push('Комментарий: ' + data.comment);
    lines.push('');
    lines.push('Страница: ' + data.page);
    return lines.join('\n');
  }

  function send(data) {
    if (PROXY_URL) {
      return fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).then(function (result) {
        if (!result || result.ok !== true) throw new Error('not ok');
      });
    }

    return fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: messageText(data),
        disable_web_page_preview: true
      })
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (result) {
      if (!result || result.ok !== true) throw new Error('not ok');
    });
  }

  function restoreButton() {
    if (!button) return;
    button.disabled = false;
    button.textContent = buttonText;
  }

  form.addEventListener('submit', function (event) {
    if (!configured()) return;   // отправка не настроена — работает обычный mailto:

    event.preventDefault();

    var data = payload();
    if (!data.name || !data.phone) {
      showStatus('Заполните имя и телефон — без них мы не сможем перезвонить.', 'error');
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = 'Отправляем…';
    }
    showStatus('Отправляем заявку…', 'wait');

    send(data).then(function () {
      form.reset();
      restoreButton();
      var next = form.querySelector('.form__next');
      if (next) next.hidden = false;
      showStatus('Готово! Заявка отправлена — перезвоним в течение 15 минут.', 'ok');
    }).catch(function () {
      restoreButton();
      showStatus('Не удалось отправить в Telegram. Напишите нам в WhatsApp или Telegram — кнопки ниже.', 'error');
    });
  });
})();
