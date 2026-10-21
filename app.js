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

  /* ---------- 3. Якоря с учётом липкой шапки ---------- */
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
})();
