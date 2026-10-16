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
    - **liquid-glass.js:** the library source
    - **Options JSON:** for saving or sharing presets

---

## Using the effect in your project

### 1. Add the library

Download [`liquid-glass.js`](https://liquid-glass-effect.netlify.app/liquid-glass.js) and include it on your page.

```html
<script src="liquid-glass.js"></script>
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

The app is plain HTML, CSS and JavaScript, with no dependencies or build step.

```bash
git clone https://github.com/tung13041996/liquid-glass-effect.git
cd liquid-glass-effect
npx serve .
```

Then open http://localhost:3000.

Use a local server rather than opening `index.html` directly, because the app fetches `liquid-glass.js` to display its source.

### Project structure

```
.
├── index.html          # App markup
├── styles.css          # App styles
├── app.js              # Controls, image upload and code generation
├── liquid-glass.js     # Reusable library (the file users copy)
├── assets/
│   └── default-bg.webp # Default preview background
├── netlify.toml        # Netlify configuration
└── README.md
```

### Deployment

The site is deployed on [Netlify](https://www.netlify.com/) from the `main` branch. Pushes to `main` publish automatically, and pull requests get a deploy preview.
No build command is required; the publish directory is the repository root.

---

## Author

Built by [Tung Nguyen](https://github.com/tung13041996).