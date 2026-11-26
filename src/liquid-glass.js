/*!
 * liquid-glass.js v__VERSION__
 * https://liquid-glass-effect.netlify.app/
 * Figma "Glass" effect for the web, rendered with WebGL.
 * The glass refracts a known background (an image, <img> or <video>) in one
 * GPU shader pass. One WebGL context is shared by every glass on the page,
 * and each glass is redrawn only when something changes. Where WebGL is not
 * available, or only in slow software mode, it falls back to frosted CSS glass.
 *
 * Usage:
 *   <div class="card">
 *     <div class="card_image"></div>                       <!-- background-image, <img> or <video> -->
 *     <div class="card_glass" data-liquid-glass></div>    <!-- the glass layer, border-radius in CSS -->
 *     <div class="card_text" style="position:relative;z-index:1">…</div>
 *   </div>
 *   LiquidGlass.apply(document.querySelector('.card_glass'), { source: '.card_image', refraction: 100, depth: 57 });
 */
(function (root) {
  'use strict';

  var DEFAULTS = {
    lightAngle: -45,      // degrees, 0 = light from the top, -45 = top-left
    lightIntensity: 80,   // %, 0–100
    refraction: 100,      // 0–100
    depth: 57,            // px, 1–100: width of the curved bevel
    dispersion: 100,      // 0–100: chromatic fringe
    frost: 1,             // 0–100: background blur
    splay: 100,           // 0–100: how far the bend spreads toward the centre
    fillColor: '#ffffff', // layer fill colour
    fillOpacity: 10,      // %, 0–100
    tear: 'none',         // torn-paper edge: 'none' | 'top' | 'bottom' | 'left' | 'right'
    tearDepth: 8,         // px, 0–40
    tearSeed: 1,          // any number: changes the tear pattern
    source: null,         // background to refract: element or selector; null = find it automatically
    maxDpr: 1.5,          // pixel-ratio cap for the canvas (1–3); lower = faster on high-DPI screens
    live: false,          // redraw every frame while visible (for CSS-animated backgrounds)
    allowSoftware: false  // also use WebGL when the browser renders it without a GPU (slow)
  };
  // Corner radius is not an option: set border-radius in your CSS and the
  // glass reads it from the element, so the shape always matches.

  // Calibration measured against Figma's own render (pixel fit on a real
  // Glass layer: 374×387, Depth 92, Refraction 81, Dispersion 100, Frost 2).
  var K = {
    refraction: 1.0,   // bend at the edge = refraction × depth px
    falloff: 3.5,      // bend fades inward as t^3.5 across the depth band
    dispersion: 0.1,   // red bends 10% more, blue 10% less, at dispersion 100
    frost: 0.5,        // blur sigma = frost / 2 px
    glow: 0.07,        // soft light inside the bevel (overlay), spread by Splay
    glowBlur: 0.35,    // glow softness, × depth
    rim: 0.6,          // 1px specular rim peak
    opposite: 0.85,    // brightness on the edge facing away from the light
    floor: 0.04        // brightness on edges side-on to the light
  };
  var MAX_TEXTURE = 2048;  // source images are downscaled to this before upload
  var MAX_CANVAS = 4096;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

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
    return Math.min(n, w / 2, h / 2);
  }

  // Inset shadows that approximate the light in the CSS fallback.
  function boxShadowList(o) {
    var a = o.lightAngle * Math.PI / 180;
    var lx = Math.sin(a), ly = -Math.cos(a);
    var I = clamp(o.lightIntensity, 0, 100) / 100;
    var px = function (v) { return +v.toFixed(2) + 'px'; };
    var w = function (v) { return 'rgba(255, 255, 255, ' + +clamp(v, 0, 1).toFixed(2) + ')'; };
    var bevel = Math.max(1, clamp(o.depth, 0, 100));
    if (I <= 0) return ['none'];
    return [
      'inset ' + px(-lx) + ' ' + px(-ly) + ' 0 ' + w(K.rim * I),
      'inset ' + px(lx) + ' ' + px(ly) + ' 0 ' + w(K.rim * I * K.opposite),
      'inset ' + px(-lx * bevel * 0.25) + ' ' + px(-ly * bevel * 0.25) + ' ' + px(bevel * 0.6) + ' ' + px(-bevel * 0.3) + ' ' + w(K.glow * I * 0.35)
    ];
  }

  function fallbackBackdrop(o) {
    return 'blur(' + +Math.max(6, clamp(o.frost, 0, 100) * K.frost).toFixed(2) + 'px) saturate(1.4)';
  }

  /* ------------------------------------------------------------------ *
   * Shaders (GLSL ES 1.0, so they run on WebGL 1 and 2)
   * ------------------------------------------------------------------ */
  var VERT = 'attribute vec2 a_pos;varying vec2 v_uv;'
    + 'void main(){v_uv=a_pos;gl_Position=vec4(a_pos*2.0-1.0,0.0,1.0);}';

  var PREC = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';

  // Separable Gaussian blur for Frost, run once per source image (not per frame).
  var BLUR = PREC
    + 'varying vec2 v_uv;uniform sampler2D u_tex;uniform vec2 u_texel;uniform vec2 u_dir;uniform float u_sigma;uniform float u_step;'
    + 'void main(){'
    + ' vec4 sum=texture2D(u_tex,v_uv);float wsum=1.0;'
    + ' for(int i=1;i<=12;i++){'
    + '  float o=float(i)*u_step;float w=exp(-0.5*o*o/(u_sigma*u_sigma));'
    + '  vec2 d=u_dir*u_texel*o;'
    + '  sum+=(texture2D(u_tex,v_uv+d)+texture2D(u_tex,v_uv-d))*w;wsum+=2.0*w;'
    + ' }'
    + ' gl_FragColor=sum/wsum;'
    + '}';

  // The glass: rounded-rect distance field → edge normal → refraction with
  // per-channel dispersion → fill → overlay glow → specular rim.
  var GLASS = PREC
    + 'varying vec2 v_uv;'
    + 'uniform sampler2D u_img;uniform vec4 u_imgRect;'
    + 'uniform vec2 u_size;uniform float u_dpr,u_radius,u_bevel,u_shift,u_power,u_disp,u_splay;'
    + 'uniform vec2 u_L;uniform float u_I,u_reach,u_sigma;uniform vec3 u_fill;uniform float u_fillA;'
    + 'const float GLOW=' + K.glow.toFixed(4) + ',RIM=' + K.rim.toFixed(4) + ',OPP=' + K.opposite.toFixed(4) + ',FLOOR=' + K.floor.toFixed(4) + ';'
    + 'float sdRR(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return min(max(q.x,q.y),0.0)+length(max(q,0.0))-r;}'
    + 'float phi(float x){float z=abs(x)*0.70710678;float t=1.0/(1.0+0.3275911*z);'
    + ' float e=1.0-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*exp(-z*z);'
    + ' return x>=0.0?0.5*(1.0+e):0.5*(1.0-e);}'
    + 'float axisG(float f){if(f<0.4)return 1.0+(FLOOR-1.0)*(f/0.4);if(f<=0.6)return FLOOR;return FLOOR+(OPP-FLOOR)*((f-0.6)/0.4);}'
    + 'vec4 samp(vec2 c){vec2 uv=(c-u_imgRect.xy)/u_imgRect.zw;'
    + ' float inside=step(0.0,uv.x)*step(0.0,uv.y)*step(uv.x,1.0)*step(uv.y,1.0);'
    + ' return texture2D(u_img,clamp(uv,0.0,1.0))*inside;}'
    + 'void main(){'
    + ' vec2 px=vec2(v_uv.x*u_size.x,(1.0-v_uv.y)*u_size.y);'
    + ' vec2 hb=u_size*0.5;vec2 p=px-hb;'
    + ' float d=sdRR(p,hb,u_radius);'
    + ' float cov=clamp(0.5-d*u_dpr,0.0,1.0);'
    + ' if(cov<=0.0){gl_FragColor=vec4(0.0);return;}'
    + ' vec2 g=vec2(sdRR(p+vec2(0.5,0.0),hb,u_radius)-sdRR(p-vec2(0.5,0.0),hb,u_radius),'
    + '             sdRR(p+vec2(0.0,0.5),hb,u_radius)-sdRR(p-vec2(0.0,0.5),hb,u_radius));'
    + ' vec2 n=length(g)>0.0?normalize(g):vec2(0.0);'                 // edge normal (for the light)
    // Refraction direction: normal of a pill/circle (corners rounded by half the
    // short side). The glass behaves like one lens: every point within Depth of the
    // edge shows the image from further inside, most strongly at the edge.
    + ' float rn=min(hb.x,hb.y);vec2 q=abs(p)-hb+rn;vec2 m;'
    + ' if(q.x>0.0&&q.y>0.0)m=sign(p)*normalize(q);else if(q.x>q.y)m=vec2(sign(p.x),0.0);else m=vec2(0.0,sign(p.y));'
    + ' float t=clamp(1.0+d/u_bevel,0.0,1.0);'
    + ' vec2 off=-m*pow(t,u_power)*u_shift;'
    + ' vec4 cG=samp(px+off);vec3 col;float a;'
    + ' if(u_disp>0.0){vec4 cR=samp(px+off*(1.0+u_disp));vec4 cB=samp(px+off*(1.0-u_disp));'
    + '  a=max(max(cR.a,cG.a),cB.a);col=vec3(cR.r,cG.g,cB.b);}'
    + ' else{a=cG.a;col=cG.rgb;}'
    + ' vec4 base=vec4(col,a);'                                   // premultiplied backdrop
    + ' base=vec4(u_fill*u_fillA,u_fillA)+base*(1.0-u_fillA);'    // fill
    + ' if(u_I>0.0){'
    + '  float band=u_sigma>0.0?phi((d+u_bevel)/u_sigma)-phi((d-u_bevel)/u_sigma):step(-u_bevel,d);'
    + '  float f=clamp((1.0-dot(p,u_L)/u_reach)*0.5,0.0,1.0);'
    + '  float gA=band*axisG(f)*GLOW*u_I*u_splay;'
    + '  vec3 b=base.a>0.0?base.rgb/base.a:vec3(0.0);'
    + '  vec3 ov=mix(2.0*b,vec3(1.0),step(0.5,b));'                // overlay with white
    + '  base.rgb=mix(b,ov,gA)*base.a;'
    + '  float dt=dot(n,u_L);'
    + '  float br=FLOOR+(1.0-FLOOR)*pow(abs(dt),1.2)*(dt>=0.0?1.0:OPP);'
    + '  float rA=clamp(1.5+d,0.0,1.0)*RIM*u_I*br;'
    + '  base=vec4(vec3(rA),rA)+base*(1.0-rA);'                    // rim on top
    + ' }'
    + ' gl_FragColor=base*cov;'
    + '}';

  /* ------------------------------------------------------------------ *
   * Shared WebGL context
   * ------------------------------------------------------------------ */
  var G = null;            // { gl, canvas, glass, blur, quad, lost }
  var instances = [];

  function compile(gl, vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u };
  }

  function setupGL() {
    var gl = G.gl;
    G.glass = compile(gl, VERT, GLASS);
    G.blur = compile(gl, VERT, BLUR);
    G.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, G.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    G.lost = false;
  }

  // Some browsers hand out WebGL without a GPU (SwiftShader, llvmpipe, Microsoft
  // Basic Render Driver). It works but is slow, so treat it like no WebGL.
  function isSoftware(gl) {
    try {
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      var name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
      return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
    } catch (e) { return false; }
  }

  function getGL(allowSoftware) {
    if (G) return G.lost ? null : G;
    var attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: !allowSoftware };
    function ctxOf(c) {
      try { return c.getContext('webgl2', attrs) || c.getContext('webgl', attrs); } catch (e) { return null; }
    }
    // Preferred: render on an OffscreenCanvas and hand each frame to the glass's
    // own canvas with transferToImageBitmap, which always delivers the frame just drawn.
    // Fallback: a detached <canvas> copied with drawImage (drawing buffer kept so the copy is current).
    var canvas = null, gl = null, offscreen = false;
    if (typeof OffscreenCanvas !== 'undefined' && typeof ImageBitmapRenderingContext !== 'undefined') {
      canvas = new OffscreenCanvas(1, 1);
      gl = ctxOf(canvas);
      offscreen = !!gl && typeof canvas.transferToImageBitmap === 'function';
    }
    if (!offscreen) {
      canvas = document.createElement('canvas');
      attrs.preserveDrawingBuffer = true;
      gl = ctxOf(canvas);
    }
    if (!gl) return null;
    if (!allowSoftware && isSoftware(gl)) return null;
    G = { gl: gl, canvas: canvas, offscreen: offscreen, lost: false };
    try { setupGL(); } catch (e) { G = null; return null; }
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault(); G.lost = true;
      instances.forEach(function (i) { i._contextLost(); });
    });
    canvas.addEventListener('webglcontextrestored', function () {
      try { setupGL(); } catch (e) { return; }
      instances.forEach(function (i) { i._contextRestored(); });
    });
    return G;
  }

  function newTexture(gl) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function newTarget(gl, w, h) {
    var tex = newTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex: tex, fb: fb, w: w, h: h };
  }

  function freeTarget(gl, t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }

  /* ------------------------------------------------------------------ *
   * Background sources: where the image is and how it is drawn
   * ------------------------------------------------------------------ */
  function bgUrl(el) {
    var m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(getComputedStyle(el).backgroundImage || '');
    return m ? m[1] : null;
  }

  function isSource(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    return tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || !!bgUrl(el);
  }

  // Finds the background behind `el`: the closest ancestor's descendant that is
  // an image/video/background-image, does not contain the glass, and overlaps it.
  function findSource(el) {
    var r = el.getBoundingClientRect(), node = el.parentElement, depth = 0;
    while (node && depth < 6) {
      var marked = node.querySelector('[data-liquid-glass-source]');
      if (marked && !marked.contains(el)) return marked;
      var all = node.querySelectorAll('*'), best = null;
      for (var i = 0; i < all.length && i < 400; i++) {
        var c = all[i];
        if (c === el || c.contains(el) || el.contains(c) || !isSource(c)) continue;
        var cr = c.getBoundingClientRect();
        if (cr.right > r.left && cr.left < r.right && cr.bottom > r.top && cr.top < r.bottom) { best = c; break; }
      }
      if (best) return best;
      if (isSource(node)) return node;           // the background is on the container itself
      node = node.parentElement; depth++;
    }
    return null;
  }

  function parseLen(v, total, fallback) {
    if (v == null || v === 'auto') return fallback;
    if (/%$/.test(v)) return parseFloat(v) / 100 * total;
    return parseFloat(v) || 0;
  }

  function posKeyword(v) {
    return { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' }[v] || v;
  }

  // Where the source image is drawn on screen: { x, y, w, h } in page px.
  function drawRect(src, nw, nh) {
    var r = src.getBoundingClientRect(), W = r.width, H = r.height, cs = getComputedStyle(src);
    var dw = W, dh = H, fit, pos;
    if (src.tagName === 'IMG' || src.tagName === 'VIDEO' || src.tagName === 'CANVAS') {
      fit = cs.objectFit || (src.tagName === 'VIDEO' ? 'contain' : 'fill');
      pos = (cs.objectPosition || '50% 50%').split(/\s+/);
      if (fit === 'cover' || fit === 'contain' || fit === 'scale-down') {
        var s = fit === 'cover' ? Math.max(W / nw, H / nh) : Math.min(W / nw, H / nh);
        if (fit === 'scale-down') s = Math.min(1, s);
        dw = nw * s; dh = nh * s;
      } else if (fit === 'none') { dw = nw; dh = nh; }
    } else {
      var size = (cs.backgroundSize || 'auto').split(',')[0].trim();
      pos = [posKeyword((cs.backgroundPositionX || '0%').split(',')[0].trim()), posKeyword((cs.backgroundPositionY || '0%').split(',')[0].trim())];
      if (size === 'cover' || size === 'contain') {
        var k = size === 'cover' ? Math.max(W / nw, H / nh) : Math.min(W / nw, H / nh);
        dw = nw * k; dh = nh * k;
      } else {
        var parts = size.split(/\s+/);
        var sw = parseLen(parts[0], W, null), sh = parseLen(parts[1] || 'auto', H, null);
        if (sw == null && sh == null) { dw = nw; dh = nh; }
        else if (sw == null) { dh = sh; dw = nw * sh / nh; }
        else if (sh == null) { dw = sw; dh = nh * sw / nw; }
        else { dw = sw; dh = sh; }
      }
    }
    var px = parseLen(pos[0], W - dw, (W - dw) / 2), py = parseLen(pos[1] || '50%', H - dh, (H - dh) / 2);
    return { x: r.left + px, y: r.top + py, w: dw, h: dh };
  }

  var sources = []; // shared per source element: { el, tex, w, h, nw, nh, blurred, ready, video }

  function sourceFor(el) {
    for (var i = 0; i < sources.length; i++) if (sources[i].el === el) return sources[i];
    var s = { el: el, users: 0, ready: false, failed: false, video: el.tagName === 'VIDEO', blurred: {} };
    sources.push(s);
    loadSource(s);
    return s;
  }

  function notify(s) {
    instances.forEach(function (i) { if (i._src === s) i._schedule(true); });
  }

  function loadSource(s) {
    var el = s.el;
    function done(img) {
      s.img = img;
      s.nw = img.naturalWidth || img.videoWidth || img.width;
      s.nh = img.naturalHeight || img.videoHeight || img.height;
      if (!s.nw || !s.nh) { s.failed = true; notify(s); return; }
      s.ready = upload(s);
      if (!s.ready) s.failed = true;
      notify(s);
    }
    if (el.tagName === 'VIDEO') {
      if (el.readyState >= 2) done(el);
      else el.addEventListener('loadeddata', function () { done(el); }, { once: true });
      return;
    }
    if (el.tagName === 'CANVAS') { done(el); return; }
    var url = el.tagName === 'IMG' ? (el.currentSrc || el.src) : bgUrl(el);
    if (!url) { s.failed = true; return; }
    s.url = url;
    var img = new Image();
    try { if (new URL(url, location.href).origin !== location.origin) img.crossOrigin = 'anonymous'; } catch (e) { /* data: URLs */ }
    img.decoding = 'async';
    img.onload = function () { done(img); };
    img.onerror = function () { s.failed = true; notify(s); };
    img.src = url;
  }

  // Uploads the source (downscaled to MAX_TEXTURE) into a texture.
  function upload(s) {
    if (!G || G.lost) return false;
    var gl = G.gl, src = s.img, w = s.nw, h = s.nh, k = Math.min(1, MAX_TEXTURE / Math.max(w, h));
    if (k < 1) {
      w = Math.round(w * k); h = Math.round(h * k);
      if (!s.scratch) s.scratch = document.createElement('canvas');
      s.scratch.width = w; s.scratch.height = h;
      s.scratch.getContext('2d').drawImage(src, 0, 0, w, h);
      src = s.scratch;
    }
    if (!s.tex) s.tex = newTexture(gl);
    gl.bindTexture(gl.TEXTURE_2D, s.tex);
    try {
      if (s.w === w && s.h === h) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch (e) { return false; }                 // cross-origin image without CORS
    s.w = w; s.h = h;
    s.uploads = (s.uploads || 0) + 1;
    return true;
  }

  // Blurred copy of a source for Frost, cached per blur size.
  function blurredTexture(s, sigma) {
    var gl = G.gl, key = sigma.toFixed(1), b = s.blurred[key];
    if (b && b.frame === s.uploads) return b.b.tex;
    if (b && (b.a.w !== s.w || b.a.h !== s.h)) { freeTarget(gl, b.a); freeTarget(gl, b.b); delete s.blurred[key]; b = null; }
    if (!b) {
      var keys = Object.keys(s.blurred);
      if (keys.length >= 2) { freeTarget(gl, s.blurred[keys[0]].a); freeTarget(gl, s.blurred[keys[0]].b); delete s.blurred[keys[0]]; }
      b = s.blurred[key] = { a: newTarget(gl, s.w, s.h), b: newTarget(gl, s.w, s.h) };
    }
    var P = G.blur;
    gl.useProgram(P.p);
    gl.viewport(0, 0, s.w, s.h);
    gl.uniform2f(P.u.u_texel, 1 / s.w, 1 / s.h);
    gl.uniform1f(P.u.u_sigma, sigma);
    gl.uniform1f(P.u.u_step, Math.max(1, sigma * 3 / 12));
    gl.uniform1i(P.u.u_tex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.a.fb);
    gl.bindTexture(gl.TEXTURE_2D, s.tex);
    gl.uniform2f(P.u.u_dir, 1, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.b.fb);
    gl.bindTexture(gl.TEXTURE_2D, b.a.tex);
    gl.uniform2f(P.u.u_dir, 0, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    b.frame = s.uploads;
    return b.b.tex;
  }

  // Seeded random numbers, so a tear keeps its shape across redraws.
  function rng(seed) {
    var a = (Math.floor(seed) || 1) * 2654435761 >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 1D value noise, smoothly interpolated between random points `step` px apart.
  function noise1d(len, step, rand) {
    var pts = [], out = new Float32Array(len), n = Math.ceil(len / step) + 2;
    for (var i = 0; i < n; i++) pts.push(rand());
    for (var x = 0; x < len; x++) {
      var f = x / step, k = Math.floor(f), t = f - k;
      t = t * t * (3 - 2 * t);
      out[x] = pts[k] + (pts[k + 1] - pts[k]) * t;
    }
    return out;
  }

  /*
   * Torn-paper mask for one edge: a ragged profile (coarse and fine noise plus
   * occasional spikes), a speckled transition band and a few loose crumbs.
   * Returns CSS mask values, or null when the edge is not torn.
   */
  function tearMask(w, h, o) {
    var edge = o.tear, depth = clamp(+o.tearDepth || 0, 0, 40);
    if (!/^(top|bottom|left|right)$/.test(edge) || depth <= 0) return null;
    var vertical = edge === 'left' || edge === 'right';
    var len = vertical ? h : w;
    var band = Math.ceil(depth) + 3;
    var rand = rng(o.tearSeed);
    var coarse = noise1d(len, 9, rand), fine = noise1d(len, 2, rand);
    var c = document.createElement('canvas');
    c.width = vertical ? band : len; c.height = vertical ? len : band;
    var ctx = c.getContext('2d'), img = ctx.createImageData(c.width, c.height), D = img.data;

    for (var x = 0; x < len; x++) {
      var e = depth * (0.15 + 0.55 * coarse[x] + 0.3 * fine[x]);
      if (rand() < 0.08) e = Math.min(depth, e + depth * 0.6 * rand());   // spikes
      for (var y = 0; y < band; y++) {
        // y counts inward from the outer edge
        var a;
        if (y >= e + 1.5) a = 255;
        else if (y >= e - 1.5) a = rand() < (y - e + 1.5) / 3 ? 255 : 0;   // speckle
        else a = rand() < 0.035 * (y / (e || 1)) ? 255 : 0;                // crumbs
        var px, py;
        if (edge === 'bottom') { px = x; py = band - 1 - y; }
        else if (edge === 'top') { px = x; py = y; }
        else if (edge === 'left') { px = y; py = x; }
        else { px = band - 1 - y; py = x; }
        D[(py * c.width + px) * 4 + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);

    var rest = 'calc(100% - ' + band + 'px)';
    return {
      image: 'linear-gradient(#000, #000), url("' + c.toDataURL('image/png') + '")',
      size: vertical ? rest + ' 100%, ' + band + 'px 100%' : '100% ' + rest + ', 100% ' + band + 'px',
      position: { top: 'left bottom, left top', bottom: 'left top, left bottom', left: 'right top, left top', right: 'left top, right top' }[edge],
      repeat: 'no-repeat'
    };
  }

  function setMask(el, m) {
    var st = el.style;
    st.maskImage = st.webkitMaskImage = m ? m.image : '';
    st.maskSize = st.webkitMaskSize = m ? m.size : '';
    st.maskPosition = st.webkitMaskPosition = m ? m.position : '';
    st.maskRepeat = st.webkitMaskRepeat = m ? m.repeat : '';
  }

  /* ------------------------------------------------------------------ *
   * Redraw scheduling: only glass that is visible and has changed
   * ------------------------------------------------------------------ */
  var frameReq = 0, watching = false, settleUntil = 0;

  function tick() {
    frameReq = 0;
    var again = false, settling = performance.now() < settleUntil;
    instances.forEach(function (i) {
      if (settling && i._visible) i._dirtyGeom = true;   // re-check positions while things may still move
      if (i._tick()) again = true;
    });
    if (again || settling) frameReq = requestAnimationFrame(tick);
  }

  function requestTick() { if (!frameReq) frameReq = requestAnimationFrame(tick); }

  function onScroll() {
    // positions can change on scroll (parallax, sticky); check once next frame
    instances.forEach(function (i) { if (i._visible) i._dirtyGeom = true; });
    requestTick();
  }

  // Anything that can move a glass or its background without resizing it:
  // dragging, hover/click effects, CSS transitions and animations. For a short
  // time after such an event, positions are re-checked every frame; the glass is
  // only redrawn if it actually moved relative to its background.
  function onInteract(e) {
    var ms = /^(transitionrun|transitionstart|animationstart|animationiteration)$/.test(e.type) ? 1200 : 400;
    settleUntil = Math.max(settleUntil, performance.now() + ms);
    onScroll();
  }

  function watch() {
    if (watching) return;
    watching = true;
    var opt = { passive: true, capture: true };
    root.addEventListener('scroll', onScroll, opt);
    root.addEventListener('resize', onScroll, { passive: true });
    ['pointerdown', 'pointermove', 'pointerup', 'touchmove', 'wheel', 'keyup', 'click',
      'transitionrun', 'transitionstart', 'transitionend', 'animationstart', 'animationiteration', 'animationend'
    ].forEach(function (t) { root.addEventListener(t, onInteract, opt); });
  }

  /* ------------------------------------------------------------------ *
   * Glass instance
   * ------------------------------------------------------------------ */
  function resolveSource(el, o) {
    if (o.source && o.source.nodeType === 1) return o.source;
    if (typeof o.source === 'string') {
      var scope = el.parentElement, found = null;
      while (scope && !found) { found = scope.querySelector(o.source); scope = scope.parentElement; }
      return found;
    }
    return findSource(el);
  }

  function apply(el, opts) {
    var o = Object.assign({}, DEFAULTS, opts);
    var self = { options: o, renderer: 'css', _visible: true, _dirtyGeom: true, _dirtyLook: true };
    var canvas = null, ctx2d = null, lastGeom = '', lastTear = '';
    var cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    el.style.isolation = 'isolate';

    function useCSS() {
      self.renderer = 'css';
      if (canvas) canvas.style.display = 'none';
      el.style.background = fill(o);
      el.style.boxShadow = boxShadowList(o).join(', ');
      el.style.backdropFilter = el.style.webkitBackdropFilter = fallbackBackdrop(o);
    }

    function useGL() {
      self.renderer = 'webgl';
      el.style.background = 'transparent';
      el.style.boxShadow = '';
      el.style.backdropFilter = el.style.webkitBackdropFilter = '';
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;border-radius:inherit';
        el.insertBefore(canvas, el.firstChild);
        ctx2d = canvas.getContext(G && G.offscreen ? 'bitmaprenderer' : '2d');
      }
      canvas.style.display = 'block';
    }

    function setupSource() {
      var srcEl = resolveSource(el, o);
      if (self._src) self._src.users--;
      self._src = srcEl && getGL(o.allowSoftware) ? sourceFor(srcEl) : null;
      if (self._src) self._src.users++;
    }

    function updateTear(w, h) {
      var key = [w, h, o.tear, o.tearDepth, o.tearSeed].join();
      if (key !== lastTear) { setMask(el, tearMask(w, h, o)); lastTear = key; }
    }

    function draw(rect) {
      var s = self._src, gl = G.gl, w = rect.width, h = rect.height;
      if (s.video && s.ready && !s.el.paused) upload(s);
      var dpr = clamp(Math.min(root.devicePixelRatio || 1, o.maxDpr), 0.5, 3);
      var W = Math.max(1, Math.min(MAX_CANVAS, Math.round(w * dpr))), H = Math.max(1, Math.min(MAX_CANVAS, Math.round(h * dpr)));
      var c = G.canvas;

      var d = drawRect(s.el, s.nw, s.nh);
      var frostPx = clamp(o.frost, 0, 100) * K.frost;
      var sigmaTex = frostPx * s.w / Math.max(1, d.w);
      var tex = sigmaTex >= 0.3 ? blurredTexture(s, Math.min(sigmaTex, 40)) : s.tex;

      var bevel = Math.max(1, Math.min(clamp(o.depth, 0, 100), Math.min(w, h) / 2));
      var a = o.lightAngle * Math.PI / 180, lx = Math.sin(a), ly = -Math.cos(a);
      var fc = hexToRgb(o.fillColor);
      var P = G.glass, u = P.u;
      if (G.offscreen) { if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } }
      else if (c.width < W || c.height < H) { c.width = Math.max(c.width, W); c.height = Math.max(c.height, H); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.u_img, 0);
      gl.uniform4f(u.u_imgRect, d.x - rect.left, d.y - rect.top, d.w, d.h);
      gl.uniform2f(u.u_size, w, h);
      gl.uniform1f(u.u_dpr, dpr);
      gl.uniform1f(u.u_radius, readRadius(el, w, h));
      gl.uniform1f(u.u_bevel, bevel);
      gl.uniform1f(u.u_shift, bevel * clamp(o.refraction, 0, 100) / 100 * K.refraction);
      gl.uniform1f(u.u_power, K.falloff);
      gl.uniform1f(u.u_splay, clamp(o.splay, 0, 100) / 100);
      gl.uniform1f(u.u_disp, clamp(o.dispersion, 0, 100) / 100 * K.dispersion);
      gl.uniform2f(u.u_L, lx, ly);
      gl.uniform1f(u.u_I, clamp(o.lightIntensity, 0, 100) / 100);
      gl.uniform1f(u.u_reach, (w * Math.abs(lx) + h * Math.abs(ly)) / 2 || 1);
      gl.uniform1f(u.u_sigma, bevel > 3 ? bevel * K.glowBlur : 0);
      gl.uniform3f(u.u_fill, fc[0] / 255, fc[1] / 255, fc[2] / 255);
      gl.uniform1f(u.u_fillA, clamp(o.fillOpacity, 0, 100) / 100);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      if (G.offscreen) {
        ctx2d.transferFromImageBitmap(c.transferToImageBitmap());
      } else {
        ctx2d.clearRect(0, 0, W, H);
        ctx2d.drawImage(c, 0, c.height - H, W, H, 0, 0, W, H);
      }
    }

    // Called by the shared frame loop. Returns true to keep the loop running.
    self._tick = function () {
      if (!self._visible) return false;
      var s = self._src;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      updateTear(Math.round(r.width), Math.round(r.height));
      if (!s || s.failed || !G || G.lost) { if (self.renderer !== 'css' || self._dirtyLook) { useCSS(); self._dirtyLook = false; } return false; }
      if (!s.ready) { if (self.renderer !== 'css') useCSS(); return false; }
      var anim = o.live || (s.video && !s.el.paused && !s.el.ended);
      var geom = '';
      if (self._dirtyGeom || anim) {
        var sr = s.el.getBoundingClientRect();
        geom = [r.left - sr.left, r.top - sr.top, r.width, r.height, sr.width, sr.height].map(Math.round).join();
      }
      if (self.renderer !== 'webgl') { useGL(); self._dirtyLook = true; }
      if (anim || self._dirtyLook || (self._dirtyGeom && geom !== lastGeom)) {
        draw(r);
        lastGeom = geom || lastGeom;
      }
      self._dirtyGeom = self._dirtyLook = false;
      return anim;
    };

    self._schedule = function (look) { if (look) self._dirtyLook = true; self._dirtyGeom = true; requestTick(); };
    self._contextLost = function () { useCSS(); };
    self._contextRestored = function () {
      sources.forEach(function (s) { s.tex = null; s.w = s.h = 0; s.blurred = {}; if (s.img) s.ready = upload(s); });
      self._schedule(true);
    };

    var ro = new ResizeObserver(function () { self._schedule(true); });
    ro.observe(el);
    var io = new IntersectionObserver(function (entries) {
      self._visible = entries[entries.length - 1].isIntersecting;
      if (self._visible) self._schedule(true);
    }, { rootMargin: '100px' });
    io.observe(el);

    setupSource();
    if (self._src) ro.observe(self._src.el);
    if (self._src && self._src.video) {
      ['play', 'seeked', 'loadeddata'].forEach(function (ev) { self._src.el.addEventListener(ev, function () { self._schedule(true); }); });
    }
    useCSS();                      // frosted until the image is ready
    instances.push(self);
    watch();
    self._schedule(true);

    self.update = function (next) {
      next = next || {};
      Object.assign(o, next);
      if ('source' in next || 'allowSoftware' in next) { setupSource(); if (self._src) ro.observe(self._src.el); }
      if (self.renderer === 'css') useCSS();
      self._schedule(true);
    };
    // Redraws everything; reloads the source if its image URL has changed.
    self.refresh = function () {
      lastTear = '';
      var s = self._src;
      if (s && !s.video && s.el.tagName !== 'CANVAS') {
        var url = s.el.tagName === 'IMG' ? (s.el.currentSrc || s.el.src) : bgUrl(s.el);
        if (url && url !== s.url) { s.ready = false; s.failed = false; loadSource(s); }
      }
      self._schedule(true);
    };
    // Call after moving the glass or its background with JS (drag, custom animation).
    self.redraw = function () { self._dirtyGeom = true; requestTick(); };
    self.destroy = function () {
      ro.disconnect(); io.disconnect();
      instances = instances.filter(function (i) { return i !== self; });
      if (self._src) self._src.users--;
      if (canvas) canvas.remove();
      setMask(el, null);
      el.style.background = el.style.boxShadow = el.style.backdropFilter = el.style.webkitBackdropFilter = '';
    };
    return self;
  }

  // Applies the glass to every element with data-liquid-glass. The attribute
  // can hold JSON options: <div data-liquid-glass='{"depth":40,"dispersion":0}'>
  function init(selector, opts) {
    return Array.prototype.map.call(document.querySelectorAll(selector || '[data-liquid-glass]'), function (el) {
      var own = {};
      try { own = JSON.parse(el.getAttribute('data-liquid-glass') || '{}') || {}; } catch (e) { /* not JSON */ }
      return apply(el, Object.assign({}, opts, own));
    });
  }

  function supportsWebGL(allowSoftware) { return !!getGL(allowSoftware); }

  root.LiquidGlass = {
    DEFAULTS: DEFAULTS,
    apply: apply,
    init: init,
    supportsWebGL: supportsWebGL,
    fill: fill,
    boxShadowList: boxShadowList,
    fallbackBackdrop: fallbackBackdrop,
    tearMask: tearMask
  };
})(window);
