# Liquid Glass Studio

Recreate Figma's **Glass** effect on the web with WebGL.
Tune the effect visually, then copy production-ready code into your own project.

**Live app:** https://liquid-glass-effect.netlify.app/

---

## Features

- **Figma-matched controls.** Light angle, Light, Refraction, Depth, Dispersion, Frost and Splay use the same names, ranges and calibration as Figma's Glass panel.
- **Fast on low-end devices.** The glass is drawn by one GPU shader pass, shares one WebGL context across the page, and is redrawn only when its size, position or image changes. Scrolling costs nothing extra.
- **Every modern browser.** Chrome, Edge, Safari and Firefox. Devices without hardware WebGL get a frosted CSS fallback automatically.
- **Live preview on your own image.** Upload or drag-and-drop any image. Files stay in the browser and are never uploaded.
- **Custom fill and torn edge.** Any tint colour and opacity, and an optional torn-paper edge on any side.
- **Copy-ready output:** a full HTML/CSS/JS example, a data-attribute version for CMS themes, the minified library, and the options as JSON.

---

## How it works in one sentence

The glass refracts a **known background**: the `background-image`, `<img>` or `<video>` behind it. WebGL cannot read live page content, so the glass is for use over images and video (hero sections, cards, sliders), not over text.

---

## Using the effect in your project

### 1. Add the library

Use whichever option suits your project. All of them deliver the same minified file.

**Download**
Get `liquid-glass.min.js` from the [latest release](https://github.com/tung13041996/liquid-glass-effect/releases/latest) or with the **Download** button in the [live app](https://liquid-glass-effect.netlify.app/), then include it on your page:

```html
<script src="liquid-glass.min.js"></script>
```

**CDN (jsDelivr)**
Pin a version tag for production:

```html
<script src="https://cdn.jsdelivr.net/gh/tung13041996/liquid-glass-effect@v2.1.1/dist/liquid-glass.min.js"></script>
```

### 2. Structure: background, glass layer, content

```html
<div class="card">
  <img class="card__image" src="photo.jpg" alt="">        <!-- or a div with background-image, or a <video> -->
  <div class="card__glass" data-liquid-glass></div>       <!-- the glass -->
  <div class="card__content">Your content</div>
</div>
```

```css
.card { position: relative; }
.card__image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.card__glass { position: absolute; left: 40px; bottom: 40px; width: 420px; height: 220px; border-radius: 32px; }
.card__content { position: relative; z-index: 1; }   /* keeps the content above the glass */
```

- **Size and corner radius** come from your CSS. The library reads them.
- **Content** must sit in a sibling with `position: relative` (or absolute) and `z-index: 1`. Otherwise the absolutely positioned glass paints over it.
- **Background position** is matched exactly for `background-size` (`cover`, `contain`, lengths, `auto`), `background-position`, `object-fit` and `object-position`.

### 3. Apply the effect

```html
<script>
  LiquidGlass.apply(document.querySelector('.card__glass'), {
    source: '.card__image',   // optional: found automatically if left out
    lightAngle: -45,
    lightIntensity: 80,
    refraction: 100,
    depth: 57,
    dispersion: 100,
    frost: 1,
    splay: 100,
    fillColor: '#ffffff',
    fillOpacity: 10
  });
</script>
```

Or, for CMS themes such as WordPress, put the options on the element and apply every glass with one call:

```html
<div class="card__glass" data-liquid-glass='{"depth":57,"dispersion":49,"frost":11}'></div>

<script src="liquid-glass.min.js"></script>
<script>LiquidGlass.init();</script>
```

When `source` is left out, the library looks for the nearest `[data-liquid-glass-source]`, `<img>`, `<video>` or element with a `background-image` that sits behind the glass.

The easiest way to get the values is to tune the effect in the [live app](https://liquid-glass-effect.netlify.app/) and copy the generated snippet.

### Options

| Option           | Type   | Default     | Range      | Description |
|------------------|--------|-------------|------------|-------------|
| `lightAngle`     | number | `-45`       | -180 – 180 | Direction of the light, in degrees. 0 = from the top. |
| `lightIntensity` | number | `80`        | 0 – 100    | Brightness of the 1px rim and the soft glow, in %. |
| `refraction`     | number | `100`       | 0 – 100    | How strongly the curved edge bends the image: up to `refraction × depth` px at the edge. |
| `depth`          | number | `57`        | 1 – 100    | How far the curved edge reaches inward, in px. Capped at half the shorter side. |
| `dispersion`     | number | `100`       | 0 – 100    | Rainbow splitting along the curved edge. |
| `frost`          | number | `1`         | 0 – 100    | Background blur, radius `frost ÷ 2` px. 0 is clear glass. |
| `splay`          | number | `100`       | 0 – 100    | How far the projected light spreads on the glass. Does not change the refraction. |
| `fillColor`      | string | `'#ffffff'` | hex colour | Tint colour of the glass layer. |
| `fillOpacity`    | number | `10`        | 0 – 100    | Tint opacity, in %. |
| `tear`           | string | `'none'`    | `'none'`, `'top'`, `'bottom'`, `'left'`, `'right'` | Cuts a torn-paper edge into that side of the glass. |
| `tearDepth`      | number | `8`         | 0 – 40     | How far the tear reaches into the glass, in px. |
| `tearSeed`       | number | `1`         | any        | Picks a different tear pattern. The same seed always gives the same shape. |
| `source`         | element or selector | `null` | | The background to refract. Found automatically when `null`. |
| `maxDpr`         | number | `1.5`       | 0.5 – 3    | Pixel-ratio cap for the glass canvas. Lower is faster on high-DPI screens. |
| `live`           | boolean | `false`    |            | Redraw every frame while visible, for backgrounds animated with CSS. Videos redraw automatically while playing. |
| `allowSoftware`  | boolean | `false`    |            | Use WebGL even when the browser renders it without a GPU (slow). By default those devices get the CSS fallback. |

### API

```js
const glass = LiquidGlass.apply(element, options);
const all = LiquidGlass.init('[data-liquid-glass]', sharedOptions);  // returns an array

glass.update({ refraction: 60 }); // change options and redraw
glass.redraw();                   // only needed if JS moves the glass with no user interaction (e.g. a timer)
glass.refresh();                  // redraw everything; reloads the image if its URL changed
glass.destroy();                  // remove the canvas, mask and styles
glass.renderer;                   // 'webgl' or 'css' (fallback)
```

The glass redraws automatically when it or its background is resized or moved: on scroll (parallax, sticky layouts), while dragging or after any pointer, touch or keyboard interaction, during CSS transitions and animations, and while a `<video>` source plays. Positions are re-checked cheaply for a short time after each of these events, and the glass is only redrawn if it actually moved. It is skipped while off screen.

---

## Browser support

| Situation | Result |
|-----------|--------|
| Chrome, Edge, Safari, Firefox with a GPU | Full effect: refraction, dispersion, light, tint, torn edge |
| No WebGL, or WebGL without a GPU (old or blocklisted drivers) | Frosted CSS glass with the same tint, highlight and torn edge |
| Background image from another domain without CORS headers | Frosted CSS glass (the browser does not allow reading the image) |
| WebGL context lost (GPU reset) | Frosted CSS glass until the context is restored |

---

## How it works

1. The background image is uploaded once as a texture (downscaled to 2048 px at most). For **Frost**, a Gaussian-blurred copy (radius `frost ÷ 2` px) is made once on the GPU and cached.
2. A fragment shader draws the glass as a single lens. Within **Depth** px of the edge, each pixel shows the image from further inside, along the normal of a pill-shaped curve (corners rounded by half the shorter side). The bend is `refraction × depth` px at the edge and fades inward as t<sup>3.5</sup>. This makes straight lines behind the glass bow toward its edges, as in Figma.
3. **Dispersion** samples red with 10% more bend and blue with 10% less than green, in the same pass.
4. The fill is blended on top, then a 1px rim that is brightest where the edge faces the light (**Light angle**, **Light**) and a faint glow inside the curve whose spread follows **Splay**.
5. One shared WebGL canvas renders every glass and copies the result into a small canvas inside each glass layer, placed under its content (`z-index: -1` in an isolated layer).
6. An optional torn edge is a generated `mask-image` on the glass layer.

### Calibration

The formulas were fitted to Figma's own render of a real Glass layer (374×387 px, Depth 92, Refraction 81, Dispersion 100, Frost 2, Splay 99, Light 309° at 80%, black 10% fill) by comparing every pixel. Against that render, the average colour error is 3.9 / 255 (v2.0: 15.8; no glass: 20.2). The remaining difference is mostly the text and button that sit on the glass in the design.

Figma does not publish its shader, so results are very close but not pixel-identical. **Splay** is calibrated from one sample only; Figma's help centre defines it as the spread of the light, which is how it is used here.

When matching a design, copy the layer's **fill** as well: Figma's fill is part of the glass layer, and dark designs often use a black fill (`fillColor: '#000000'`).

### Performance

Measured while scrolling a page with ten image cards, each with a glass layer (Chromium with software rendering, a worst case close to a low-end laptop):

| Renderer | Normal CPU | CPU 4× slower |
|----------|-----------|---------------|
| No glass | 60 fps | 60 fps |
| v1 (SVG `backdrop-filter`) | ~30 fps | ~29 fps |
| **v2 WebGL** | **~54–60 fps** | **~60 fps** |
| v2 WebGL redrawing every frame (`live: true`) | ~59 fps | ~49 fps |
| v2 CSS fallback | 60 fps | 60 fps |

The SVG version re-ran its filter on every scrolled frame. The WebGL version draws once and only redraws when something changes.

---

## Upgrading from v1

- The glass now refracts a background **image or video** instead of whatever is behind it on the page. Glass over live page content (for example a fixed header over text) gets no refraction; use plain frosted CSS there.
- Add a background element and, if needed, `source`. Put content in a sibling with `position: relative; z-index: 1`.
- All Figma options and the torn edge are unchanged.

---

## Development

The app is plain HTML, CSS and JavaScript. Node.js is only needed to build the minified library.

```bash
git clone https://github.com/tung13041996/liquid-glass-effect.git
cd liquid-glass-effect
npm install
npm start          # builds, then serves the app at http://localhost:3000
```

### Building the library

Edit `src/liquid-glass.js`, then run:

```bash
npm run build      # writes dist/liquid-glass.min.js
```

Commit `dist/liquid-glass.min.js` together with your source changes. CI fails the build if the committed file is out of date.

### Releasing a new version

1. Update `version` in `package.json` (for example `2.0.1`).
2. Run `npm run build` and commit.
3. Tag and push:

   ```bash
   git tag v2.0.1
   git push origin main --tags
   ```

GitHub Actions then publishes a release with `liquid-glass.min.js` attached, and the jsDelivr URL for that tag becomes available.

GitHub's **Download ZIP** and release source archives contain only `dist/liquid-glass.min.js` and this README, configured in `.gitattributes`. To work on the code, clone the repository instead.

### Project structure

```
.
├── src/
│   └── liquid-glass.js       # Library source: WebGL renderer (edit this)
├── dist/
│   └── liquid-glass.min.js   # Built library (the file users download)
├── scripts/
│   └── build.mjs             # Minifies src → dist with Terser
├── assets/
│   └── default-bg.webp       # Default preview background
├── .github/workflows/
│   ├── ci.yml                # Checks dist is up to date on every push
│   └── release.yml           # Publishes a release on version tags
├── index.html                # App markup
├── styles.css                # App styles
├── app.js                    # Controls, image upload and code generation
├── netlify.toml              # Netlify configuration
├── package.json
└── README.md
```

### Deployment

The app is hosted on [Netlify](https://www.netlify.com/) at https://liquid-glass-effect.netlify.app/.
No build command is required because the built library is committed; the publish directory is the repository root.

---

## Author

Built by [Tung Nguyen](https://github.com/tung13041996).
