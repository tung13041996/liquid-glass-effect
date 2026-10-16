(function () {
  'use strict';
  var LG = window.LiquidGlass;
  var $ = function (id) { return document.getElementById(id); };

  var FIGMA = Object.assign({}, LG.DEFAULTS, { width: 420, height: 260 });
  var state = Object.assign({}, FIGMA);
  var RANGES = ['lightAngle', 'lightIntensity', 'refraction', 'depth', 'dispersion', 'frost', 'splay', 'fillOpacity', 'radius', 'width', 'height'];
  var UNITS = { lightAngle: '°', lightIntensity: '%', fillOpacity: '%', radius: 'px', width: 'px', height: 'px' };

  var stage = $('stage'), glass = $('glass'), bg = $('bg');
  var activeTab = 'script';
  var libSource = '';

  /* ---------- glass ---------- */
  function glassOptions() {
    var o = {};
    Object.keys(LG.DEFAULTS).forEach(function (k) { o[k] = state[k]; });
    return o;
  }
  function applySize() {
    glass.style.width = state.width + 'px';
    glass.style.height = state.height + 'px';
  }
  applySize();
  var inst = LG.apply(glass, glassOptions());

  $('status').innerHTML = inst.lens
    ? '<b>Lens on.</b> Full refraction in this browser.'
    : '<b>Frosted fallback.</b> Open in Chrome or Edge for refraction.';

  /* ---------- controls ---------- */
  function label(k) { return state[k] + (UNITS[k] || ''); }
  function syncControls() {
    RANGES.forEach(function (k) {
      var i = $(k); i.value = state[k]; i.nextElementSibling.textContent = label(k);
    });
    $('fillColor').value = state.fillColor;
    $('fillColorText').value = state.fillColor;
    $('fillColorText').removeAttribute('aria-invalid');
  }
  var raf = 0;
  function refresh() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      applySize();
      inst.update(glassOptions());
      writeCode();
    });
  }

  RANGES.forEach(function (k) {
    $(k).addEventListener('input', function (e) {
      state[k] = +e.target.value;
      e.target.nextElementSibling.textContent = label(k);
      refresh();
    });
  });

  $('fillColor').addEventListener('input', function (e) {
    state.fillColor = e.target.value;
    $('fillColorText').value = state.fillColor;
    $('fillColorText').removeAttribute('aria-invalid');
    refresh();
  });
  $('fillColorText').addEventListener('input', function (e) {
    var v = e.target.value.trim();
    if (v[0] !== '#') v = '#' + v;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
      if (v.length === 4) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
      state.fillColor = v.toLowerCase();
      $('fillColor').value = state.fillColor;
      e.target.removeAttribute('aria-invalid');
      refresh();
    } else {
      e.target.setAttribute('aria-invalid', 'true');
    }
  });
  $('fillColorText').addEventListener('blur', function (e) {
    e.target.value = state.fillColor;
    e.target.removeAttribute('aria-invalid');
  });

  $('reset').addEventListener('click', function () {
    state = Object.assign({}, FIGMA);
    syncControls();
    refresh();
  });

  /* ---------- image upload ---------- */
  var objectUrl = null;
  function setImage(file) {
    if (!file || !/^image\//.test(file.type)) {
      $('status').innerHTML = '<b>That file is not an image.</b> Use JPG, PNG, WebP, GIF or SVG.';
      return;
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    bg.style.backgroundImage = 'url("' + objectUrl + '")';
    stage.classList.add('has-image');
    $('clearImage').hidden = false;
  }
  $('upload').addEventListener('change', function (e) { setImage(e.target.files[0]); e.target.value = ''; });
  $('clearImage').addEventListener('click', function () {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    bg.style.backgroundImage = '';
    stage.classList.remove('has-image');
    $('clearImage').hidden = true;
  });
  ['dragenter', 'dragover'].forEach(function (t) {
    stage.addEventListener(t, function (e) { e.preventDefault(); stage.classList.add('dragging'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    stage.addEventListener(t, function (e) { e.preventDefault(); stage.classList.remove('dragging'); });
  });
  stage.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) setImage(f);
  });

  /* ---------- drag glass ---------- */
  var drag = null;
  glass.addEventListener('pointerdown', function (e) {
    var gr = glass.getBoundingClientRect();
    drag = { dx: e.clientX - gr.left, dy: e.clientY - gr.top };
    glass.setPointerCapture(e.pointerId);
  });
  glass.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var sr = stage.getBoundingClientRect();
    var x = e.clientX - sr.left - drag.dx, y = e.clientY - sr.top - drag.dy;
    glass.style.transform = 'none';
    glass.style.left = Math.max(-glass.offsetWidth / 2, Math.min(x, sr.width - glass.offsetWidth / 2)) + 'px';
    glass.style.top = Math.max(-glass.offsetHeight / 2, Math.min(y, sr.height - glass.offsetHeight / 2)) + 'px';
  });
  ['pointerup', 'pointercancel'].forEach(function (t) { glass.addEventListener(t, function () { drag = null; }); });
  $('center').addEventListener('click', function () {
    glass.style.left = '50%'; glass.style.top = '50%'; glass.style.transform = 'translate(-50%, -50%)';
  });

  /* ---------- code output ---------- */
  function optionsLiteral(indent) {
    var o = glassOptions();
    return '{\n' + Object.keys(o).map(function (k) {
      return indent + '  ' + k + ': ' + (typeof o[k] === 'string' ? "'" + o[k] + "'" : o[k]);
    }).join(',\n') + '\n' + indent + '}';
  }

  function scriptCode() {
    return '<!-- 1. Your element -->\n'
      + '<div class="glass-card">Your content</div>\n\n'
      + '<!-- 2. Size it however you like. The map follows its real size. -->\n'
      + '<style>\n  .glass-card { position: relative; width: ' + state.width + 'px; max-width: 100%; height: ' + state.height + 'px; }\n</style>\n\n'
      + '<!-- 3. Load liquid-glass.js (see the liquid-glass.js tab) and apply -->\n'
      + '<script src="liquid-glass.js"><\/script>\n'
      + '<script>\n'
      + "  document.querySelectorAll('.glass-card').forEach(function (el) {\n"
      + '    LiquidGlass.apply(el, ' + optionsLiteral('    ') + ');\n'
      + '  });\n'
      + '<\/script>\n';
  }

  function prettyFilter(markup) {
    return markup
      .replace(/></g, '>\n<')
      .split('\n')
      .map(function (l) { return /^<\/?filter/.test(l) ? '  ' + l : '    ' + l; })
      .join('\n');
  }

  function staticCode() {
    var w = Math.round(glass.offsetWidth), h = Math.round(glass.offsetHeight);
    var o = glassOptions(), id = 'lg-glass';
    var fb = LG.fallbackBackdrop(o);
    return '/* CSS */\n'
      + '.glass-card {\n'
      + '  position: relative;\n'
      + '  width: ' + w + 'px;\n'
      + '  height: ' + h + 'px;\n'
      + '  border-radius: ' + o.radius + 'px;\n'
      + '  background: ' + LG.fill(o) + ';\n'
      + '  backdrop-filter: ' + LG.backdrop(id, o) + ';\n'
      + '  box-shadow:\n    ' + LG.boxShadowList(o).join(',\n    ') + ';\n'
      + '  isolation: isolate;\n'
      + '}\n\n'
      + '/* Safari and Firefox: no SVG lens, so use frosted glass */\n'
      + '.no-lens .glass-card {\n'
      + '  backdrop-filter: ' + fb + ';\n'
      + '  -webkit-backdrop-filter: ' + fb + ';\n'
      + '}\n\n'
      + '<!-- SVG: paste once anywhere in <body>. Sized for ' + w + '×' + h + 'px. -->\n'
      + '<svg width="0" height="0" style="position:absolute" aria-hidden="true">\n'
      + prettyFilter(LG.filterMarkup(id, w, h, o)) + '\n'
      + '</svg>\n\n'
      + '<!-- JS: one line, flags browsers without the lens -->\n'
      + '<script>\n'
      + "  if (!(navigator.userAgentData && navigator.userAgentData.brands.some(function (b) { return /Chromium/.test(b.brand); }))) document.documentElement.classList.add('no-lens');\n"
      + '<\/script>\n';
  }

  var NOTES = {
    script: 'Recommended. Works at any size and redraws the lens when the element resizes.',
    static: 'No library needed, but the SVG is fixed to the current glass size. Generate again if the size changes.',
    lib: 'Save this as liquid-glass.js next to your page.',
    json: 'All current settings, for saving or sharing a preset.'
  };

  function writeCode() {
    var out = '';
    if (activeTab === 'script') out = scriptCode();
    else if (activeTab === 'static') out = staticCode();
    else if (activeTab === 'lib') out = libSource || 'Loading liquid-glass.js…';
    else out = JSON.stringify(state, null, 2);
    $('code').textContent = out;
    $('resultNote').textContent = NOTES[activeTab];
  }

  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role=tab]'));
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.setAttribute('aria-selected', String(x === t)); });
      activeTab = t.id.replace('tab-', '');
      writeCode();
    });
  });

  fetch('liquid-glass.js').then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.text();
  }).then(function (t) {
    libSource = t;
    if (activeTab === 'lib') writeCode();
  }).catch(function () {
    libSource = '// Could not load liquid-glass.js. Download it from the project files instead.';
    if (activeTab === 'lib') writeCode();
  });

  $('copy').addEventListener('click', function (e) {
    var b = e.currentTarget, text = $('code').textContent;
    function done() { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1400); }
    function fallback() {
      var r = document.createRange(); r.selectNodeContents($('code'));
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      b.textContent = 'Press Ctrl+C';
      setTimeout(function () { b.textContent = 'Copy'; }, 2000);
    }
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (_) { fallback(); }
  });

  // keep static output accurate when the stage clamps the glass (max-width on small screens)
  new ResizeObserver(function () { if (activeTab === 'static') writeCode(); }).observe(glass);

  syncControls();
  writeCode();
})();
