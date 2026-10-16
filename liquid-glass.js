/*!
 * liquid-glass.js
 * Figma "Glass" effect for the web: SVG displacement map + backdrop-filter.
 * No dependencies. The lens (refraction + dispersion) renders in Chromium
 * browsers; Safari and Firefox get a frosted-glass fallback.
 *
 * Usage:
 *   .glass-card { border-radius: 40px; }   // radius comes from your CSS
 *   LiquidGlass.apply(element, { refraction: 100, depth: 57, ... });
 */
(function (root) {
  'use strict';

  var DEFAULTS = {
    lightAngle: -45,      // Figma Light angle, degrees
    lightIntensity: 80,   // Figma Light %, 0–100
    refraction: 100,      // 0–100
    depth: 57,            // 1–100, width of the curved rim
    dispersion: 100,      // 0–100, chromatic fringe
    frost: 1,             // 0–100, backdrop blur
    splay: 100,           // 0–100, how far the bend reaches inward
    fillColor: '#ffffff', // layer fill colour
    fillOpacity: 10       // layer fill opacity %, 0–100
  };
  // Corner radius is not an option: set border-radius in your CSS and the
  // lens reads it from the element, so the shape and the map always match.

  var NS = 'http://www.w3.org/2000/svg';

  function supportsLens() {
    var ua = root.navigator && root.navigator.userAgentData;
    return !!(ua && ua.brands && ua.brands.some(function (b) { return /Chromium/.test(b.brand); }));
  }

  function hexToRgb(hex) {
    var h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) n = 0xffffff;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function fill(o) {
    var c = hexToRgb(o.fillColor);
    return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + +(o.fillOpacity / 100).toFixed(2) + ')';
  }

  function readRadius(el, w, h) {
    var v = getComputedStyle(el).borderTopLeftRadius || '0';
    var n = parseFloat(v) || 0;
    if (/%$/.test(v.trim())) n = (n / 100) * Math.min(w, h);
    return n;
  }

  function mapURI(w, h, o, radius) {
    var r = Math.min(radius || 0, w / 2, h / 2);
    var bezel = Math.max(2, (o.depth / 100) * Math.min(w, h) * 0.25);
    var soft = bezel * (0.3 + 0.9 * o.splay / 100);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">'
        + '<defs><linearGradient id="Y" x1="0" x2="0" y1="3%" y2="97%"><stop offset="0" stop-color="#0F0"/><stop offset="1" stop-color="#000"/></linearGradient>'
        + '<linearGradient id="X" x1="2%" x2="98%" y1="0" y2="0"><stop offset="0" stop-color="#F00"/><stop offset="1" stop-color="#000"/></linearGradient></defs>'
        + '<rect width="' + w + '" height="' + h + '" fill="#808080"/>'
        + '<g filter="blur(2px)"><rect width="' + w + '" height="' + h + '" fill="#000080"/>'
        + '<rect width="' + w + '" height="' + h + '" fill="url(#Y)" style="mix-blend-mode:screen"/>'
        + '<rect width="' + w + '" height="' + h + '" fill="url(#X)" style="mix-blend-mode:screen"/>'
        + '<rect x="' + bezel.toFixed(1) + '" y="' + bezel.toFixed(1) + '" width="' + (w - 2 * bezel).toFixed(1) + '" height="' + (h - 2 * bezel).toFixed(1)
        + '" rx="' + Math.max(0, r - bezel).toFixed(1) + '" fill="#808080" filter="blur(' + soft.toFixed(1) + 'px)"/></g></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function filterMarkup(id, w, h, o, radius) {
    var scale = (o.refraction / 100) * 160;
    var spread = (o.dispersion / 100) * 12;
    var channels = [
      ['R', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', scale + spread],
      ['G', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', scale],
      ['B', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', scale - spread]
    ];
    var s = '<filter id="' + id + '" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
        + '<feImage x="0" y="0" width="' + w + '" height="' + h + '" href="' + mapURI(w, h, o, radius) + '" result="map"/>';
    channels.forEach(function (c) {
      s += '<feDisplacementMap in="SourceGraphic" in2="map" scale="' + c[2].toFixed(1) + '" xChannelSelector="R" yChannelSelector="G"/>'
          + '<feColorMatrix type="matrix" values="' + c[1] + '" result="d' + c[0] + '"/>';
    });
    return s + '<feBlend in="dR" in2="dG" mode="screen" result="rg"/><feBlend in="rg" in2="dB" mode="screen"/></filter>';
  }

  function boxShadowList(o) {
    var a = (o.lightAngle - 90) * Math.PI / 180;           // direction toward the light
    var dx = -Math.cos(a) * 1.5, dy = -Math.sin(a) * 1.5;   // puts the highlight on the lit edge
    var k = o.lightIntensity / 100;
    var px = function (v) { return +v.toFixed(2) + 'px'; };
    return [
      'inset 0 0 0 1px rgba(255, 255, 255, ' + +(0.15 * k + 0.05).toFixed(2) + ')',
      'inset ' + px(dx) + ' ' + px(dy) + ' 0 rgba(255, 255, 255, ' + +(0.6 * k).toFixed(2) + ')',
      'inset ' + px(-dx) + ' ' + px(-dy) + ' 0 rgba(255, 255, 255, ' + +(0.2 * k).toFixed(2) + ')',
      'inset 0 0 12px rgba(255, 255, 255, ' + +(0.2 * k).toFixed(2) + ')',
      '0 8px 32px rgba(0, 0, 0, 0.2)'
    ];
  }

  function backdrop(id, o) {
    return 'blur(' + +((o.frost / 100) * 20).toFixed(1) + 'px) url(#' + id + ') saturate(1.5) brightness(1.1)';
  }

  function fallbackBackdrop(o) {
    return 'blur(' + +Math.max(8, (o.frost / 100) * 20).toFixed(1) + 'px) saturate(1.8) brightness(1.15)';
  }

  function apply(el, opts) {
    var o = Object.assign({}, DEFAULTS, opts);
    var lens = supportsLens();
    var id = el.dataset.lgId || (el.dataset.lgId = 'lg-' + Math.random().toString(36).slice(2, 8));
    var holder = document.getElementById(id + '-svg');
    if (!holder) {
      holder = document.createElementNS(NS, 'svg');
      holder.id = id + '-svg';
      holder.setAttribute('width', '0');
      holder.setAttribute('height', '0');
      holder.setAttribute('aria-hidden', 'true');
      holder.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
      document.body.appendChild(holder);
    }

    function render() {
      var w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      el.style.background = fill(o);
      el.style.boxShadow = boxShadowList(o).join(', ');
      el.style.isolation = 'isolate';
      if (lens) {
        holder.innerHTML = filterMarkup(id, w, h, o, readRadius(el, w, h));
        el.style.backdropFilter = backdrop(id, o);
      } else {
        el.style.backdropFilter = el.style.webkitBackdropFilter = fallbackBackdrop(o);
      }
    }

    var ro = new ResizeObserver(render);
    ro.observe(el);
    render();

    return {
      lens: lens,
      options: o,
      update: function (next) { Object.assign(o, next); render(); },
      destroy: function () { ro.disconnect(); holder.remove(); }
    };
  }

  root.LiquidGlass = {
    DEFAULTS: DEFAULTS,
    apply: apply,
    supportsLens: supportsLens,
    readRadius: readRadius,
    fill: fill,
    filterMarkup: filterMarkup,
    boxShadowList: boxShadowList,
    backdrop: backdrop,
    fallbackBackdrop: fallbackBackdrop
  };
})(window);