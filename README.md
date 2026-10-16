# Liquid Glass Studio

Tune a Figma-style Glass effect on your own image and copy the code.
Plain HTML/CSS/JS. No build step.

## Files
- `index.html` – the app
- `styles.css` – app styles
- `app.js` – controls, image upload, code output
- `liquid-glass.js` – the reusable library users copy into their own sites
- `netlify.toml` – Netlify config (publish the repo root)

## Run locally
Use any static server (the app fetches `liquid-glass.js` to show its source, so `file://` won't show that tab):

    npx serve .

## Deploy to Netlify
Option A: drag this folder onto https://app.netlify.com/drop
Option B: push to GitHub, then in Netlify choose "Add new site → Import an existing project". Leave the build command empty; publish directory is `.`.
Option C: `npx netlify-cli deploy --prod --dir .`

## Browser support
Refraction and dispersion render in Chromium (Chrome, Edge, Brave, Opera).
Safari and Firefox get a frosted-glass fallback with the same fill and highlight.
