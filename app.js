/* ============================================================
   IPL в Одинцове — интерактив (минимальный JS)
   1) плавное появление блоков при прокрутке
   2) FAQ: одновременно открыт только один вопрос
   3) плавный переход по якорям с поправкой на липкую шапку
   Без JS сайт остаётся полностью рабочим — блоки просто видимы сразу.
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Режим статичного рендера: ?static=1 — без анимаций (для скриншотов, PDF, печати)
  if (location.search.indexOf('static=1') !== -1) {
    document.documentElement.classList.add('static');
  }

  /* ---------- 1. Появление блоков ---------- */
  var targets = document.querySelectorAll('main .section, .map');
  if (targets.length) {
    document.documentElement.classList.add('js');
    for (var i = 0; i < targets.length; i++) targets[i].classList.add('reveal');

    if (reduceMotion || !('IntersectionObserver' in window)) {
      for (var j = 0; j < targets.length; j++) targets[j].classList.add('is-visible');
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

      for (var k = 0; k < targets.length; k++) io.observe(targets[k]);

      // Страховка: если наблюдатель почему-то не сработал — показываем контент,
      // чтобы пользователь никогда не увидел пустую страницу.
      setTimeout(function () {
        for (var s = 0; s < targets.length; s++) {
          if (!targets[s].classList.contains('is-visible')) targets[s].classList.add('is-visible');
        }
      }, 4000);
    }
  }

  /* ---------- 2. FAQ: раскрывается только один вопрос ---------- */
  var checks = Array.prototype.slice.call(document.querySelectorAll('.faq__check'));
  checks.forEach(function (check) {
    check.addEventListener('change', function () {
      if (!check.checked) return;
      checks.forEach(function (other) { if (other !== check) other.checked = false; });
    });
  });

  /* ---------- 3. Галерея: раскрытие фото по клику ---------- */
  var grid = document.getElementById('galleryGrid');
  if (grid) {
    var items = Array.prototype.slice.call(grid.querySelectorAll('.gallery__item'));

    function closeAll() {
      items.forEach(function (it) {
        it.classList.remove('open');
        it.setAttribute('aria-expanded', 'false');
      });
    }

    function toggle(item) {
      var wasOpen = item.classList.contains('open');
      closeAll();
      if (!wasOpen) {
        item.classList.add('open');
        item.setAttribute('aria-expanded', 'true');
      }
    }

    items.forEach(function (item) {
      item.addEventListener('click', function () { toggle(item); });
      item.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          toggle(item);
        }
        if (event.key === 'Escape') closeAll();
      });
    });

    // Клик вне галереи сворачивает раскрытое фото
    document.addEventListener('click', function (event) {
      if (!grid.contains(event.target)) closeAll();
    });
  }

  /* ---------- 4. Имя: каждое слово с большой буквы ---------- */
  var nameField = document.getElementById('f-name');
  if (nameField) {
    nameField.addEventListener('input', function () {
      var value = nameField.value;
      // Заглавная буква в начале строки, после пробела и после дефиса
      // (Анна-Мария, Иван Петров), но не внутри слова
      var fixed = value.replace(/(^|[\s-])([a-zа-яё])/g, function (match, space, letter) {
        return space + letter.toUpperCase();
      });
      if (fixed !== value) {
        var pos = nameField.selectionStart;
        nameField.value = fixed;
        try { nameField.setSelectionRange(pos, pos); } catch (e) { /* нет поддержки */ }
      }
    });
  }

  /* ---------- 5. Телефон: +7 подставляется сам, курсор не убегает ----------
     Логика: пока поле в фокусе — внутри только цифры с префиксом «+7 »,
     поэтому Backspace/Delete работают как в обычном тексте.
     Красивое форматирование (+7 (916) 123-45-67) применяется только при blur. */
  var phone = document.getElementById('f-phone');
  if (phone) {
    var MAX_DIGITS = 10;

    function digitsOf(value) {
      var d = value.replace(/\D/g, '');
      // наш собственный префикс «+7 » — убираем, чтобы он не считался цифрой номера
      if (/^\s*\+?\s*7/.test(value)) d = d.replace(/^7/, '');
      // 11 цифр с восьмёркой или семёркой — это 8/7 + десятизначный номер: первую убираем
      if (d.length === 11 && (d.charAt(0) === '8' || d.charAt(0) === '7')) d = d.slice(1);
      return d;
    }

    function rawForm(d) {
      return d ? '+7 ' + d : '';
    }

    function prettyForm(d) {
      var out = '+7';
      if (d.length) out += ' (' + d.slice(0, 3);
      if (d.length >= 3) out += ') ' + d.slice(3, 6);
      if (d.length >= 6) out += '-' + d.slice(6, 8);
      if (d.length >= 8) out += '-' + d.slice(8, 10);
      return out;
    }

    /* Сколько цифр пользователя стоит левее каретки (без префикса «+7»).
       Именно эта величина нужна, чтобы после пересборки значения поставить
       каретку на то же место: иначе цифры перетасовываются
       («9161234567» превращалось в «+7 1769123456»). */
    function digitsBeforeCaret(value, pos) {
      var digits = value.slice(0, pos).replace(/\D/g, '');
      if (/^\s*\+?\s*7/.test(value)) digits = digits.replace(/^7/, '');   // префикс +7 не считаем
      return digits.length;
    }

    // При фокусе: убираем скобки и дефисы, чтобы можно было свободно править текст
    phone.addEventListener('focus', function () {
      var d = digitsOf(phone.value).slice(0, MAX_DIGITS);
      phone.value = rawForm(d) || '+7 ';
      var end = phone.value.length;
      try { phone.setSelectionRange(end, end); } catch (e) { /* нет поддержки */ }
    });

    // Во время набора: только цифры, форматирование не трогаем
    phone.addEventListener('input', function () {
      var before = digitsBeforeCaret(phone.value, phone.selectionStart || 0);
      var d = digitsOf(phone.value).slice(0, MAX_DIGITS);
      var next = rawForm(d);
      if (next !== phone.value) {
        phone.value = next;
        // каретка — после той же цифры: префикс «+7 » занимает три символа
        var pos = 3 + before;
        if (pos > next.length) pos = next.length;
        try { phone.setSelectionRange(pos, pos); } catch (e) { /* нет поддержки */ }
      }
    });

    // При выходе: красивое форматирование
    phone.addEventListener('blur', function () {
      var d = digitsOf(phone.value).slice(0, MAX_DIGITS);
      phone.value = d.length ? prettyForm(d) : '';
    });

    // Вставка из буфера: разбираем и переформатируем
    phone.addEventListener('paste', function () {
      setTimeout(function () {
        var d = digitsOf(phone.value).slice(0, MAX_DIGITS);
        phone.value = rawForm(d);
      }, 0);
    });
  }

  /* ---------- 5. Мобильное меню: закрывается после выбора пункта ---------- */
  var navToggle = document.getElementById('nav-toggle');
  var header = document.querySelector('.head');

  if (navToggle && header) {
    function closeNav() { navToggle.checked = false; }

    // выбрали пункт — закрываем
    Array.prototype.forEach.call(header.querySelectorAll('.nav a, .head__in .pill--sm'), function (link) {
      link.addEventListener('click', closeNav);
    });

    // клик вне шапки — закрываем
    document.addEventListener('click', function (event) {
      if (!navToggle.checked) return;
      if (!header.contains(event.target)) closeNav();
    });

    // Escape — закрываем
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeNav();
    });
  }

  /* ---------- 6. Якоря с учётом липкой шапки ---------- */
  var header = document.querySelector('.head');
  var links = Array.prototype.slice.call(document.querySelectorAll('a[href^="#"]'));

  links.forEach(function (link) {
    link.addEventListener('click', function (event) {
      var hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      var target = document.querySelector(hash);
      if (!target) return;

      event.preventDefault();
      var offset = (header ? header.offsetHeight : 0) + 14;
      var top = target.getBoundingClientRect().top + window.pageYOffset - offset;

      window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
      if (history.replaceState) history.replaceState(null, '', hash);
    });
  });
  /* ---------- 7. Ripple-эффект на кнопках ---------- */
  if (!reduceMotion) {
    Array.prototype.forEach.call(document.querySelectorAll('.pill'), function (btn) {
      btn.addEventListener('click', function (e) {
        var rect = btn.getBoundingClientRect();
        var size = Math.max(rect.width, rect.height);
        var x = e.clientX - rect.left - size / 2;
        var y = e.clientY - rect.top - size / 2;
        var ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        btn.appendChild(ripple);
        setTimeout(function () { ripple.remove(); }, 600);
      });
    });
  }
  /* ---------- 8. Плавающее напоминание + exit-intent ---------- */
  (function () {
    var KEY = 'ipl_sticky_dismissed';
    var DISMISS_DAYS = 7;
    var dismissed = false;
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var ts = parseInt(raw, 10);
        if (Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000) dismissed = true;
      }
    } catch (e) { /* ignore */ }

    var sticky = document.getElementById('stickyCta');
    var exitModal = document.getElementById('exitCta');
    if (!sticky || !exitModal) return;

    function showSticky() {
      if (dismissed) return;
      if (document.querySelector('.form__status') && document.querySelector('.form__status').textContent.indexOf('Готово') !== -1) return;
      sticky.removeAttribute('hidden');
      requestAnimationFrame(function () { sticky.classList.add('is-visible'); });
    }
    function hideSticky() {
      sticky.classList.remove('is-visible');
      setTimeout(function () { sticky.setAttribute('hidden', ''); }, 400);
    }
    function showExit() {
      if (dismissed) return;
      if (document.querySelector('.form__status') && document.querySelector('.form__status').textContent.indexOf('Готово') !== -1) return;
      exitModal.removeAttribute('hidden');
      requestAnimationFrame(function () { exitModal.classList.add('is-visible'); });
    }
    function hideExit() {
      exitModal.classList.remove('is-visible');
      setTimeout(function () { exitModal.setAttribute('hidden', ''); }, 300);
    }
    function dismissAll() {
      dismissed = true;
      try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* ignore */ }
      hideSticky();
      hideExit();
    }

    // Кнопки закрытия
    var stickyClose = sticky.querySelector('.sticky-cta__close');
    if (stickyClose) stickyClose.addEventListener('click', dismissAll);
    var exitClose = exitModal.querySelector('.exit-cta__close');
    if (exitClose) exitClose.addEventListener('click', dismissAll);

    // Закрытие модалки по клику на фон
    exitModal.addEventListener('click', function (e) {
      if (e.target === exitModal) dismissAll();
    });

    // Закрытие модалки по Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && exitModal.classList.contains('is-visible')) dismissAll();
    });

    if (reduceMotion) {
      // Без анимаций — показываем сразу (через 12 сек)
      setTimeout(showSticky, 12000);
    } else {
      // Полоска через 12 секунд
      setTimeout(showSticky, 12000);
    }

    // Exit-intent: движение мыши к верху экрана (десктоп)
    var exitShown = false;
    document.addEventListener('mouseleave', function (e) {
      if (exitShown || dismissed) return;
      if (e.clientY <= 5) {
        exitShown = true;
        showExit();
      }
    });

    // Exit-intent на мобильных: прокрутка вверх после значительной прокрутки вниз
    var lastScroll = 0;
    var scrolledDown = false;
    window.addEventListener('scroll', function () {
      var y = window.scrollY || window.pageYOffset;
      if (y > 600) scrolledDown = true;
      if (scrolledDown && y < lastScroll - 80 && !exitShown && !dismissed) {
        exitShown = true;
        showExit();
      }
      lastScroll = y;
    }, { passive: true });
  })();
})();
