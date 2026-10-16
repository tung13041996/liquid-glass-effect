(function () {
  'use strict';
  var LG = window.LiquidGlass;
  var $ = function (id) { return document.getElementById(id); };

  var FIGMA = Object.assign({}, LG.DEFAULTS, { width: 420, height: 260 });
  var state = Object.assign({}, FIGMA);
  var RANGES = ['lightAngle', 'lightIntensity', 'refraction', 'depth', 'dispersion', 'frost', 'splay', 'fillOpacity', 'width', 'height'];

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
  function syncControls() {
    RANGES.forEach(function (k) {
      $(k).value = state[k];
      $(k + '-num').value = state[k];
      $(k + '-num').removeAttribute('aria-invalid');
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
    var slider = $(k), num = $(k + '-num');
    var min = +slider.min, max = +slider.max;

    function setValue(v) {
      state[k] = v;
      slider.value = v;
      refresh();
    }

    // slider -> number field
    slider.addEventListener('input', function () {
      num.value = slider.value;
      num.removeAttribute('aria-invalid');
      setValue(+slider.value);
    });

    // typing: apply live while the value is valid and in range
    num.addEventListener('input', function () {
      var v = Number(num.value);
      if (num.value.trim() === '' || !isFinite(v) || v < min || v > max) {
        num.setAttribute('aria-invalid', 'true');
        return;
      }
      num.removeAttribute('aria-invalid');
      setValue(Math.round(v));
    });

    // leaving the field or pressing Enter: clamp to range and round
    function commit() {
      var v = Number(num.value);
      if (num.value.trim() === '' || !isFinite(v)) v = state[k];
      v = Math.round(Math.min(max, Math.max(min, v)));
      num.value = v;
      num.removeAttribute('aria-invalid');
      if (v !== state[k]) setValue(v);
    }
    num.addEventListener('change', commit);
    num.addEventListener('blur', commit);
    num.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { commit(); num.select(); }
      else if (e.key === 'Escape') { num.value = state[k]; num.removeAttribute('aria-invalid'); num.blur(); }
      else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.shiftKey) {
        e.preventDefault();
        var step = e.key === 'ArrowUp' ? 10 : -10;
        num.value = Math.min(max, Math.max(min, state[k] + step));
        setValue(+num.value);
      }
    });
    num.addEventListener('focus', function () { num.select(); });
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

  function radius() {
    return Math.round(LG.readRadius(glass, glass.offsetWidth, glass.offsetHeight));
  }

  function scriptCode() {
    return '<!-- 1. Your element -->\n'
      + '<div class="glass-card">Your content</div>\n\n'
      + '<!-- 2. Size and round it in CSS. The lens follows its real size and border-radius. -->\n'
      + '<style>\n  .glass-card { position: relative; width: ' + state.width + 'px; max-width: 100%; height: ' + state.height + 'px; border-radius: ' + radius() + 'px; }\n</style>\n\n'
      + '<!-- 3. Load liquid-glass.min.js (use the Download button) and apply -->\n'
      + '<script src="liquid-glass.min.js"><\/script>\n'
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
    var o = glassOptions(), id = 'lg-glass', r = radius();
    var fb = LG.fallbackBackdrop(o);
    return '/* CSS */\n'
      + '.glass-card {\n'
      + '  position: relative;\n'
      + '  width: ' + w + 'px;\n'
      + '  height: ' + h + 'px;\n'
      + '  border-radius: ' + r + 'px;\n'
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
      + prettyFilter(LG.filterMarkup(id, w, h, o, r)) + '\n'
      + '</svg>\n\n'
      + '<!-- JS: one line, flags browsers without the lens -->\n'
      + '<script>\n'
      + "  if (!(navigator.userAgentData && navigator.userAgentData.brands.some(function (b) { return /Chromium/.test(b.brand); }))) document.documentElement.classList.add('no-lens');\n"
      + '<\/script>\n';
  }

  var NOTES = {
    script: 'Recommended. Works at any size and redraws the lens when the element resizes.',
    static: 'No library needed, but the SVG is fixed to the current glass size. Generate again if the size changes.',
    lib: 'Minified library. Download it, or save this as liquid-glass.min.js next to your page.',
    json: 'All current settings, for saving or sharing a preset.'
  };

  function writeCode() {
    var out = '';
    if (activeTab === 'script') out = scriptCode();
    else if (activeTab === 'static') out = staticCode();
    else if (activeTab === 'lib') out = libSource || 'Loading liquid-glass.min.js…';
    else out = JSON.stringify(state, null, 2);
    $('code').textContent = out;
    $('code').classList.toggle('wrap', activeTab === 'lib');
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

  fetch('dist/liquid-glass.min.js').then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.text();
  }).then(function (t) {
    libSource = t;
    if (activeTab === 'lib') writeCode();
  }).catch(function () {
    libSource = '// Could not load liquid-glass.min.js. Use the Download button instead.';
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
