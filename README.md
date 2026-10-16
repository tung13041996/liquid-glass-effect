# Liquid Glass Studio

Recreate Figma's **Glass** effect on the web with CSS, SVG and a small JavaScript helper.
Tune the effect visually, then copy production-ready code into your own project.

**Live app:** https://liquid-glass-effect.netlify.app/

---

## Features

- **Figma-matched controls.** Light angle, Light, Refraction, Depth, Dispersion, Frost and Splay use the same names and ranges as Figma's Glass panel.
- **Live preview on your own image.** Upload or drag-and-drop any image. Files are processed locally in the browser and never uploaded.
- **Custom fill.** Pick any tint colour and opacity for the glass layer.
- **Precise input.** Every value can be set with its slider or typed directly (↑/↓ steps by 1, Shift+↑/↓ by 10).
- **Copy-ready output** in four formats:
  - **Responsive (JS):** recommended; adapts to any element size
  - **Static CSS + SVG:** no library required, fixed to one size
  - **liquid-glass.min.js:** the minified library, also available via the Download button
  - **Options JSON:** for saving or sharing presets

---

## Using the effect in your project

### 1. Add the library

Use whichever option suits your project. All of them deliver the same minified file (about 5 KB).

**Download**
Get `liquid-glass.min.js` from the [latest release](https://github.com/tung13041996/liquid-glass-effect/releases/latest) or with the **Download** button in the [live app](https://liquid-glass-effect.netlify.app/), then include it on your page:

```html
<script src="liquid-glass.min.js"></script>
```

**CDN (jsDelivr)**
Pin a version tag for production:

```html
<script src="https://cdn.jsdelivr.net/gh/tung13041996/liquid-glass-effect@v1.0.0/dist/liquid-glass.min.js"></script>
```

### 2. Style the element

Size and corner radius come from your own CSS. The library reads them automatically.

```html
<div class="glass-card">Your content</div>

<style>
  .glass-card {
    position: relative;
    width: 420px;
    max-width: 100%;
    height: 260px;
    border-radius: 40px;
  }
</style>
```

### 3. Apply the effect

```html
<script>
  document.querySelectorAll('.glass-card').forEach(function (el) {
    LiquidGlass.apply(el, {
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
  });
</script>
```

The easiest way to get these values is to tune the effect in the [live app](https://liquid-glass-effect.netlify.app/) and copy the generated snippet.

### Options

| Option           | Type   | Default     | Range      | Description |
|------------------|--------|-------------|------------|-------------|
| `lightAngle`     | number | `-45`       | -180 – 180 | Direction of the light, in degrees. The highlight sits on the lit edge. |
| `lightIntensity` | number | `80`        | 0 – 100    | Strength of the edge highlight, in %. |
| `refraction`     | number | `100`       | 0 – 100    | How strongly the background bends near the edges. |
| `depth`          | number | `57`        | 1 – 100    | Thickness of the curved rim. |
| `dispersion`     | number | `100`       | 0 – 100    | Chromatic (rainbow) fringe where the glass bends. |
| `frost`          | number | `1`         | 0 – 100    | Background blur. 0 is clear glass. |
| `splay`          | number | `100`       | 0 – 100    | How far the bend spreads toward the centre. |
| `fillColor`      | string | `'#ffffff'` | hex colour | Tint colour of the glass layer. |
| `fillOpacity`    | number | `10`        | 0 – 100    | Tint opacity, in %. |

### API

```js
const glass = LiquidGlass.apply(element, options);

glass.update({ refraction: 60 }); // change options and re-render
glass.update({});                 // re-render, e.g. after changing border-radius
glass.destroy();                  // stop observing and remove the generated SVG filter
glass.lens;                       // true if the browser renders the full lens effect
```

The effect redraws automatically when the element is resized.

---

## Browser support

| Browser                              | Result |
|--------------------------------------|--------|
| Chrome, Edge, Brave, Opera (Chromium)| Full effect: refraction, dispersion, highlight, tint |
| Safari, Firefox                      | Frosted-glass fallback with the same tint and highlight |

Safari and Firefox do not support SVG filters inside `backdrop-filter`, so the library detects this and falls back automatically. No extra code is needed.

---

## How it works

1. A displacement map is generated as an SVG image at the element's exact size. It is neutral in the centre and graded toward the edges, shaped by **Depth**, **Splay** and the element's `border-radius`.
2. An SVG filter applies the map with `feDisplacementMap` (**Refraction**). Red, green and blue are displaced by slightly different amounts and recombined (**Dispersion**).
3. The filter is applied to the background through `backdrop-filter`, together with `blur()` (**Frost**).
4. The tint comes from the element's `background`; the light comes from inset `box-shadow` layers (**Light angle**, **Light**).

The result closely approximates Figma's Glass effect but is not pixel-identical, as Figma renders it with a GPU shader.

### Performance

Each glass element runs a GPU-heavy filter. For best results, use only a few glass elements per screen and avoid animating their size.

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

1. Update `version` in `package.json` (for example `1.0.1`).
2. Run `npm run build` and commit.
3. Tag and push:

   ```bash
   git tag v1.0.1
   git push origin main --tags
   ```

GitHub Actions then publishes a release with `liquid-glass.min.js` attached, and the jsDelivr URL for that tag becomes available.

GitHub's **Download ZIP** and release source archives contain only `dist/liquid-glass.min.js` and this README, configured in `.gitattributes`. To work on the code, clone the repository instead.

### Project structure

```
.
├── src/
│   └── liquid-glass.js       # Library source (edit this)
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
