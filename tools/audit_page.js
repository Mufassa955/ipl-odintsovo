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

    /* 2a. Наложения блоков: контентные элементы не должны перекрывать друг друга.
           Декоративные слои (absolute/fixed) и вложенность в родителя исключаем. */
    function isDecorative(el) {
      var s = getComputedStyle(el);
      if (s.position === 'absolute' || s.position === 'fixed') return true;
      if (el.closest('.hero__label, .footer__label, .marquee, .fab, .plan--top::before')) return true;
      if (el.closest('[aria-hidden="true"]')) return true;
      return false;
    }
    var leaves = Array.prototype.filter.call(
      document.querySelectorAll('main section, main section > .wrap > *, main section > .wrap > * > *'),
      function (el) {
        if (isDecorative(el)) return false;
        if (!el.firstElementChild) return false;          // только контейнеры с содержимым
        var r = el.getBoundingClientRect();
        return r.width > 80 && r.height > 60;
      }
    );
    var overlaps = [];
    for (var i = 0; i < leaves.length && overlaps.length < 6; i++) {
      var a = leaves[i], ra = a.getBoundingClientRect();
      for (var j = i + 1; j < leaves.length && overlaps.length < 6; j++) {
        var b = leaves[j];
        if (a.contains(b) || b.contains(a)) continue;   // вложенность — не наложение
        var rb = b.getBoundingClientRect();
        var ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        var oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ox > 8 && oy > 8) {
          overlaps.push(
            String(a.className).slice(0, 22) + ' × ' + String(b.className).slice(0, 22) +
            ' (' + Math.round(ox) + '×' + Math.round(oy) + ' px)'
          );
        }
      }
    }
    if (overlaps.length) report.errors.push('Наложения блоков: ' + overlaps.join(' | '));

    /* 2b. Вертикальный «съезд»: содержимое вылезает из своего контейнера */
    var vEscapes = [];
    Array.prototype.forEach.call(document.querySelectorAll('main *'), function (el) {
      if (isDecorative(el)) return;
      var s = getComputedStyle(el);
      if (s.overflow === 'visible' || s.overflowY === 'visible') {
        if (el.scrollHeight > el.clientHeight + 24 && el.clientHeight > 0) {
          var cls = String(el.className || '');
          if (!cls) return;
          vEscapes.push(cls.slice(0, 26) + ' (' + el.scrollHeight + '>' + el.clientHeight + ')');
        }
      }
    });
    if (vEscapes.length) report.warnings.push('Содержимое выше контейнера: ' + vEscapes.slice(0, 5).join(' | '));

    /* 2c. Обрезанный текст (overflow: hidden + обрезка) */
    var clipped = [];
    Array.prototype.forEach.call(document.querySelectorAll('main p, main h1, main h2, main h3, main li, main span'), function (el) {
      var s = getComputedStyle(el);
      if (s.overflow === 'hidden' || s.overflowY === 'hidden') {
        if (el.scrollHeight > el.clientHeight + 4 || el.scrollWidth > el.clientWidth + 4) {
          clipped.push(String(el.className || el.tagName).slice(0, 26));
        }
      }
    });
    if (clipped.length) report.warnings.push('Обрезанный текст: ' + clipped.slice(0, 5).join(' | '));

    /* 2d. Якоря секций не должны уезжать под липкую шапку */
    var headEl = document.querySelector('.head');
    if (headEl) {
      var headH = headEl.getBoundingClientRect().height;
      Array.prototype.forEach.call(document.querySelectorAll('main section[id]'), function (sec) {
        if (sec.id === 'top') return;           // начало страницы — отступ не нужен
        var m = parseFloat(getComputedStyle(sec).scrollMarginTop) || 0;
        if (m < headH - 1) {
          report.warnings.push('Якорь #' + sec.id + ' уезжает под шапку (scroll-margin ' + m + ' < ' + Math.round(headH) + ')');
        }
      });
    }

    /* 3. Изображения: alt и загрузка */
    var noAlt = [], broken = [], noDims = [];
    Array.prototype.forEach.call(document.images, function (img) {
      if (!img.hasAttribute('alt')) noAlt.push(img.getAttribute('src') || '?');
      if (img.complete && img.naturalWidth === 0) {
        // с srcset браузер грузит один из вариантов — проверяем, что хоть один доступен
        var candidates = (img.getAttribute('srcset') || '').split(',')
          .map(function (part) { return part.trim().split(/\s+/)[0]; })
          .filter(Boolean);
        var allBroken = candidates.length
          ? candidates.every(function (url) {
              var probe = new Image();
              probe.src = url;
              return probe.complete && probe.naturalWidth === 0;
            })
          : true;
        if (allBroken) broken.push(img.getAttribute('src') || '?');
      }
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
