# Y2K Web Radio

A 2000s-styled streaming radio application built with **Vite + React + React Router**,
using the [Radio-Browser API](https://www.radio-browser.info/).

## Local development

```bash
npm install
npm run dev      # http://localhost:3000
```

## Build

```bash
npm run build    # outputs static files to ./dist
npm run preview  # serve the built ./dist locally to verify
```

## Deploying to Cloudflare Pages

> **This is a build step app, not a static HTML file.** The source `index.html`
> loads `/src/main.tsx` (TypeScript/JSX), which a browser cannot run directly.
> It **must** be compiled with `npm run build` first, and Cloudflare must serve
> the generated `dist/` folder. Serving the un-built repository root is what
> produces a **blank white page**.

### Option A — Git integration (recommended)

Connect the repo in the Cloudflare dashboard and set:

| Setting                  | Value           |
| ------------------------ | --------------- |
| Project name             | `static-fm`     |
| Production branch        | `main`          |
| Framework preset         | `Vite`          |
| Build command            | `npm run build` |
| Build output directory   | `dist`          |

The project name becomes the public URL — `https://static-fm.pages.dev`.
A Pages project's `*.pages.dev` subdomain is fixed at creation and cannot be
renamed later; to change it, create a new project with the desired name (or
attach a custom domain).

The included `wrangler.toml` already declares `pages_build_output_dir = "dist"`,
and `.node-version` pins the Node version, so a fresh Pages project should pick
these up automatically. If you previously created the project with the output
directory left blank or set to `/`, change it to `dist` and redeploy.

### Option B — Direct upload / Wrangler

```bash
npm run build
npx wrangler pages deploy dist
```

Upload the **`dist/`** folder, never the project root.

### SPA routing

`public/_redirects` contains `/* /index.html 200` so client-side routes
(`/station/:name`, `/frequency`) resolve to the app on deep links / refresh.

## Optional stream proxy

`cloudflare-worker.js` is a separate Cloudflare Worker that proxies radio
streams and the directory API to add CORS headers. It is **not** required for
the page to load. To use it, deploy the worker and set the build-time env var
`VITE_WORKER_PROXY_URL` to its URL; otherwise the app calls the radio-browser
mirrors directly.

The worker only accepts requests from allowed caller origins (to stop third
parties using it as a free relay) and blocks internal/link-local/metadata
destinations. By default it allows `*.pages.dev` and localhost; set the
`ALLOWED_ORIGINS` worker environment variable (comma-separated hostnames or
`.suffix` matches) if you serve the site from a custom domain.

Note: the audio visualizer needs CORS-enabled audio, so it only animates when
`VITE_WORKER_PROXY_URL` is set. Without the proxy, playback still works but the
spectrum stays flat (the browser marks the cross-origin stream as tainted).
