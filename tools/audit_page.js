/* ============================================================
   audit_page.js — автоматический аудит страницы.
   Проверяет вёрстку на разных ширинах, доступность и битые ссылки.
   Вставляется в страницу и возвращает отчёт.
   Запуск: tools/audit_page.js (через browser-инструмент) или
   в консоли браузера: fetch('tools/audit_page.js').then(r=>r.text()).then(eval)
   ============================================================ */
(function () {
  'use strict';

  function audit() {
    var report = { width: document.documentElement.clientWidth, errors: [], warnings: [], info: {} };

    /* 1. Горизонтальная прокрутка */
    var de = document.documentElement;
    report.info.scrollWidth = de.scrollWidth;
    report.info.clientWidth = de.clientWidth;
    if (de.scrollWidth > de.clientWidth + 1) {
      report.errors.push('Горизонтальная прокрутка: ' + de.scrollWidth + ' > ' + de.clientWidth);
    }

    /* 2. Элементы, выходящие за границы */
    var overflowing = [];
    Array.prototype.forEach.call(document.querySelectorAll('body *'), function (el) {
      var r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1)) {
        var cls = String(el.className || '');
        // намеренный выезд за край: бегущая строка, скрытая ссылка, декоративные слои
        if (cls.indexOf('marquee') !== -1 || cls === 'skip' || cls.indexOf('footer__label') !== -1 ||
            cls.indexOf('hero__label') !== -1 || cls.indexOf('plan--top') !== -1) return;
        if (el.closest && el.closest('.marquee__track')) return;   // текст бегущей строки
        overflowing.push(el.tagName + '.' + cls.slice(0, 30) + ' → ' + Math.round(r.right));
      }
    });
    if (overflowing.length) report.errors.push('За границами: ' + overflowing.slice(0, 5).join(' | '));

    /* 3. Изображения: alt и загрузка */
    var noAlt = [], broken = [], noDims = [];
    Array.prototype.forEach.call(document.images, function (img) {
      if (!img.hasAttribute('alt')) noAlt.push(img.getAttribute('src') || '?');
      if (img.complete && img.naturalWidth === 0) broken.push(img.getAttribute('src') || '?');
      if (!img.hasAttribute('width') || !img.hasAttribute('height')) noDims.push(img.getAttribute('src') || '?');
    });
    if (noAlt.length) report.warnings.push('Без alt: ' + noAlt.length + ' (' + noAlt.slice(0, 3).join(', ') + ')');
    if (broken.length) report.errors.push('Не загрузились: ' + broken.join(', '));
    if (noDims.length) report.warnings.push('Без width/height (CLS): ' + noDims.length);

    /* 4. Внутренние якоря */
    var deadAnchors = [];
    Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (a) {
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      if (!document.querySelector(id)) deadAnchors.push(id);
    });
    if (deadAnchors.length) report.errors.push('Битые якоря: ' + deadAnchors.join(', '));

    /* 5. Заголовки */
    var h1 = document.querySelectorAll('h1');
    if (h1.length !== 1) report.warnings.push('h1: ' + h1.length + ' (должен быть 1)');
    report.info.h2 = document.querySelectorAll('h2').length;

    /* 6. Мета */
    if (!document.querySelector('meta[name="description"]')) report.errors.push('Нет meta description');
    if (!document.querySelector('link[rel="canonical"]')) report.warnings.push('Нет canonical');
    if (!document.querySelector('html[lang]')) report.errors.push('Нет lang');
    var title = document.querySelector('title');
    report.info.title = title ? title.textContent : null;
    report.info.titleLen = title ? title.textContent.length : 0;
    if (title && (title.textContent.length < 30 || title.textContent.length > 75)) {
      report.warnings.push('Длина title: ' + title.textContent.length + ' (оптимально 30–75)');
    }
    var desc = document.querySelector('meta[name="description"]');
    if (desc && (desc.content.length < 70 || desc.content.length > 200)) {
      report.warnings.push('Длина description: ' + desc.content.length + ' (оптимально 70–200)');
    }

    /* 7. Кнопки-ссылки: доступное имя */
    var nameless = [];
    Array.prototype.forEach.call(document.querySelectorAll('a, button'), function (el) {
      var name = (el.innerText || '').trim() || el.getAttribute('aria-label') || '';
      if (!name) nameless.push(el.className.slice(0, 30));
    });
    if (nameless.length) report.warnings.push('Ссылки без имени: ' + nameless.slice(0, 4).join(', '));

    /* 8. Телефоны: все tel: ссылки */
    report.info.phones = Array.prototype.map.call(
      document.querySelectorAll('a[href^="tel:"]'), function (a) { return a.getAttribute('href'); });
    report.info.uniquePhones = report.info.phones.filter(function (p, i, arr) { return arr.indexOf(p) === i; });

    /* 9. Анимации: элементы с бесконечной анимацией */
    var infinite = [];
    Array.prototype.forEach.call(document.querySelectorAll('body *'), function (el) {
      var a = getComputedStyle(el).animationName;
      if (a && a !== 'none' && getComputedStyle(el).animationIterationCount === 'infinite') {
        infinite.push(el.className.toString().slice(0, 26) + ':' + a);
      }
    });
    report.info.infiniteAnimations = infinite;

    /* 10. Пустые секции */
    var empty = [];
    Array.prototype.forEach.call(document.querySelectorAll('main section'), function (s) {
      if (s.getBoundingClientRect().height < 100) empty.push(s.id || s.className.slice(0, 24));
    });
    if (empty.length) report.errors.push('Пустые секции: ' + empty.join(', '));

    return report;
  }

  window.auditPage = audit;
  if (typeof module !== 'undefined') module.exports = audit;
  return audit();
})();
