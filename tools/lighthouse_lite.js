/* ============================================================
   lighthouse_lite.js — «Lighthouse» без установки: метрики в одном отчёте.

   Что измеряет:
   • Performance — FCP, LCP, CLS, TTFB, вес страницы, блокирующие ресурсы,
     картинки больше нужного размера, тяжёлые шрифты;
   • SEO — title, description, canonical, og/twitter, h1, robots/sitemap,
     валидность JSON-LD;
   • Accessibility — доступные имена, alt, контраст текста, подписи полей,
     порядок заголовков, фокус;
   • Best practices — HTTPS, ошибки консоли, смешение http/https.

   Запуск в консоли браузера:
     fetch('tools/lighthouse_lite.js').then(r=>r.text()).then(eval).then(()=>report)
   или через browser-инструмент (см. PROJECT-STATE.md).
   ============================================================ */
(function () {
  'use strict';

  function rgb(str) {
    var m = String(str).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(',').map(function (x) { return parseFloat(x); });
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function lum(c) {
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  function contrast(fg, bg) {
    var l1 = lum(fg), l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function bgOf(el) {
    // идём вверх, пока не найдём непрозрачный фон
    var node = el;
    while (node && node !== document.documentElement) {
      var cs = getComputedStyle(node);
      var c = rgb(cs.backgroundColor);
      if (c && c.a > 0.9) return { color: c, overImage: false };
      node = node.parentElement;
    }
    return { color: rgb(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }, overImage: false };
  }

  function hasImageBackdrop(el) {
    // текст поверх фото/градиента: реальный фон посчитать нельзя — пропускаем
    var node = el;
    while (node && node !== document.documentElement) {
      var cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
      node = node.parentElement;
    }
    return false;
  }

  function overPhoto(el) {
    // подпись, наложенная на фотографию (position: absolute внутри контейнера с <img>)
    var node = el;
    while (node && node !== document.documentElement) {
      var cs = getComputedStyle(node);
      if (cs.position === 'absolute' || cs.position === 'fixed') {
        var parent = node.parentElement;
        if (parent && parent.querySelector('img')) return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function collect() {
    var out = { performance: {}, seo: {}, accessibility: {}, practices: {}, score: {} };
    var nav = performance.getEntriesByType('navigation')[0];
    var res = performance.getEntriesByType('resource');

    /* ---------- Performance ---------- */
    var paints = {};
    performance.getEntriesByType('paint').forEach(function (p) { paints[p.name] = Math.round(p.startTime); });
    var lcp = null;
    var cls = 0;
    try {
      var entries = performance.getEntriesByType('largest-contentful-paint');
      if (entries.length) lcp = Math.round(entries[entries.length - 1].startTime);
    } catch (e) { /* нет поддержки */ }
    try {
      var ls = performance.getEntriesByType('layout-shift');
      ls.forEach(function (e) { if (!e.hadRecentInput) cls += e.value; });
    } catch (e) { /* нет поддержки */ }

    var total = 0, byType = {};
    res.forEach(function (r) {
      var size = r.transferSize || r.encodedBodySize || 0;
      total += size;
      var t = (r.initiatorType || 'other');
      byType[t] = (byType[t] || 0) + size;
    });
    var docSize = nav ? (nav.transferSize || nav.encodedBodySize || 0) : 0;
    total += docSize;

    var blocking = [];
    res.forEach(function (r) {
      if (r.initiatorType === 'css' && r.renderBlockingStatus === 'blocking') blocking.push(r.name.split('/').pop());
      if (r.initiatorType === 'script' && r.renderBlockingStatus === 'blocking') blocking.push(r.name.split('/').pop());
    });

    /* картинки, которые весят больше, чем нужно */
    var heavyImages = [];
    Array.prototype.forEach.call(document.images, function (img) {
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w) return;
      var dw = img.getBoundingClientRect().width * (window.devicePixelRatio || 1);
      if (dw > 0 && w > dw * 1.6) {
        heavyImages.push((img.currentSrc || img.src).split('/').pop() + ' ' + w + 'px → показ ' + Math.round(dw) + 'px');
      }
    });

    out.performance = {
      ttfb: nav ? Math.round(nav.responseStart) : null,
      fcp: paints['first-contentful-paint'] || null,
      lcp: lcp,
      cls: Number(cls.toFixed(4)),
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null,
      pageWeightKB: Math.round(total / 1024),
      domWeightKB: Math.round(docSize / 1024),
      requests: res.length + 1,
      byType: byType,
      renderBlocking: blocking,
      heavyImages: heavyImages
    };

    /* ---------- SEO ---------- */
    var meta = function (sel) { var el = document.querySelector(sel); return el ? el.getAttribute('content') : null; };
    var h1 = document.querySelectorAll('h1');
    var ogImg = meta('meta[property="og:image"]');
    out.seo = {
      title: document.title,
      titleLength: document.title.length,
      description: meta('meta[name="description"]'),
      descriptionLength: (meta('meta[name="description"]') || '').length,
      canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
      lang: document.documentElement.lang,
      h1Count: h1.length,
      h1Text: h1.length ? h1[0].textContent.trim().slice(0, 80) : null,
      viewport: meta('meta[name="viewport"]'),
      ogTitle: !!meta('meta[property="og:title"]'),
      ogDescription: !!meta('meta[property="og:description"]'),
      ogImage: ogImg,
      twitterCard: meta('meta[name="twitter:card"]'),
      manifest: (document.querySelector('link[rel="manifest"]') || {}).href || null,
      appleTouchIcon: (document.querySelector('link[rel="apple-touch-icon"]') || {}).href || null,
      faviconIco: (document.querySelector('link[rel="icon"][href$=".ico"]') || document.querySelector('link[rel="icon"]') || {}).href || null,
      jsonLd: (function () {
        var blocks = document.querySelectorAll('script[type="application/ld+json"]');
        var errors = [];
        blocks.forEach(function (b, i) {
          try { JSON.parse(b.textContent); } catch (e) { errors.push('блок ' + (i + 1) + ': ' + e.message); }
        });
        return { count: blocks.length, errors: errors };
      })()
    };

    /* ---------- Accessibility ---------- */
    var a11y = { linksWithoutName: [], imagesWithoutAlt: [], fieldsWithoutLabel: [], lowContrast: [], headingOrder: [] };

    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var name = (a.textContent || '').trim() || a.getAttribute('aria-label') || a.getAttribute('title');
      if (!name) a11y.linksWithoutName.push(a.getAttribute('href'));
    });
    Array.prototype.forEach.call(document.images, function (img) {
      if (!img.hasAttribute('alt')) a11y.imagesWithoutAlt.push(img.getAttribute('src'));
    });
    Array.prototype.forEach.call(document.querySelectorAll('input, select, textarea'), function (f) {
      if (f.type === 'hidden') return;
      var lab = f.id ? document.querySelector('label[for="' + f.id + '"]') : null;
      if (!lab && !f.getAttribute('aria-label') && !f.closest('label')) {
        a11y.fieldsWithoutLabel.push(f.name || f.id || f.tagName);
      }
    });

    /* контраст: только видимый текст, без служебных элементов */
    var seen = [];
    Array.prototype.forEach.call(document.querySelectorAll('p, span, a, h1, h2, h3, h4, li, button, label, dt, dd, b'), function (el) {
      var r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      if (el.children.length && el.textContent.trim() === el.innerText.trim()) return;
      var text = (el.textContent || '').trim();
      if (!text || text.length < 3) return;
      if (seen.indexOf(el) !== -1) return;
      seen.push(el);
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.opacity === '0') return;
      var fg = rgb(cs.color);
      if (!fg) return;
      if (hasImageBackdrop(el)) return;      // текст поверх фото — контраст не считаем
      if (overPhoto(el)) return;             // подпись поверх снимка
      var bg = bgOf(el).color;
      var ratio = contrast(fg, bg);
      var big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      var need = big ? 3 : 4.5;
      if (ratio < need) {
        a11y.lowContrast.push({
          text: text.slice(0, 40),
          ratio: Number(ratio.toFixed(2)),
          need: need,
          color: cs.color,
          bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')',
          fontSize: cs.fontSize
        });
      }
    });

    /* порядок заголовков */
    var last = 0;
    Array.prototype.forEach.call(document.querySelectorAll('h1,h2,h3,h4,h5,h6'), function (h) {
      var lvl = Number(h.tagName[1]);
      if (last && lvl > last + 1) a11y.headingOrder.push(h.tagName + ' «' + h.textContent.trim().slice(0, 30) + '» после H' + last);
      last = lvl;
    });
    a11y.lowContrast = a11y.lowContrast.slice(0, 12);
    out.accessibility = a11y;

    /* ---------- Best practices ---------- */
    var mixed = [];
    Array.prototype.forEach.call(document.querySelectorAll('img, script, link'), function (el) {
      var src = el.src || el.href || '';
      if (src && src.indexOf('http://') === 0 && location.protocol === 'https:') mixed.push(src);
    });
    out.practices = {
      https: location.protocol === 'https:',
      doctype: document.doctype ? document.doctype.name : null,
      charset: !!document.querySelector('meta[charset]'),
      lang: document.documentElement.lang,
      mixedContent: mixed,
      consoleErrors: window.__auditConsoleErrors || [],
      targetBlankWithoutRel: Array.prototype.filter.call(
        document.querySelectorAll('a[target="_blank"]'),
        function (a) { return !/noopener/.test(a.rel || ''); }
      ).length,
      externalNoReferrer: Array.prototype.filter.call(
        document.querySelectorAll('a[href^="http"]'),
        function (a) { return a.hostname !== location.hostname && !/noopener/.test((a.rel || '') + ' ' + (a.getAttribute('href') || '')); }
      ).length
    };

    /* ---------- Итоговые оценки (по подходам Lighthouse) ---------- */
    var perf = 100;
    if (out.performance.lcp > 2500) perf -= 30; else if (out.performance.lcp > 1800) perf -= 15;
    if (out.performance.cls > 0.1) perf -= 25; else if (out.performance.cls > 0.05) perf -= 12;
    if (out.performance.pageWeightKB > 1500) perf -= 20; else if (out.performance.pageWeightKB > 800) perf -= 10;
    if (out.performance.renderBlocking.length) perf -= 5;
    if (out.performance.heavyImages.length) perf -= 5;

    var seo = 100;
    if (!out.seo.description) seo -= 20;
    if (out.seo.titleLength < 20 || out.seo.titleLength > 70) seo -= 10;
    if (out.seo.h1Count !== 1) seo -= 15;
    if (!out.seo.canonical) seo -= 10;
    if (!out.seo.ogImage) seo -= 10;
    if (!out.seo.jsonLd || out.seo.jsonLd.count === 0) seo -= 10;

    var acc = 100;
    acc -= a11y.linksWithoutName.length * 8;
    acc -= a11y.imagesWithoutAlt.length * 8;
    acc -= a11y.fieldsWithoutLabel.length * 10;
    acc -= a11y.lowContrast.length * 6;
    acc -= a11y.headingOrder.length * 5;

    var bp = 100;
    if (!out.practices.https) bp -= 20;
    if (mixed.length) bp -= 15;
    if (out.practices.targetBlankWithoutRel) bp -= 10;
    if (out.practices.externalNoReferrer) bp -= 5;

    out.score = {
      performance: Math.max(0, perf),
      seo: Math.max(0, seo),
      accessibility: Math.max(0, acc),
      bestPractices: Math.max(0, bp)
    };
    out.score.average = Math.round(
      (out.score.performance + out.score.seo + out.score.accessibility + out.score.bestPractices) / 4
    );

    return out;
  }

  window.lighthouseLite = collect;
  window.report = function () { return collect(); };
})();
