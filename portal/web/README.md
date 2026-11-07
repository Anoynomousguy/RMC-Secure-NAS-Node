# Fortress — Files (web)

OneDrive-style web portal frontend for the Fortress NAS, built with React 19 +
Vite + Tailwind CSS v4 and Fluent-flavoured design tokens.

## Requirements

- Node.js 20+ (developed against v26)
- The Fortress API (or the bundled mock) reachable on `127.0.0.1:3000`

## Getting started

```bash
npm install

# in a second terminal: a tiny in-memory API for UI work
npm run mock-api        # listens on http://127.0.0.1:3000

npm run dev             # http://localhost:5173, proxies /api to 127.0.0.1:3000
```

Don't run `mock-api` while the real backend is running on port 3000.

## Environment variables

Copy `.env.example` to `.env.local` and adjust as needed:

| Variable            | Purpose                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `VITE_AUTHELIA_URL` | Sign-in portal URL used by the "Session required" panel. Defaults to `/`. |

## Build

```bash
npm run build           # tsc -b && vite build → dist/
npm run preview         # serve the production build locally
```

Deploy `dist/` as static files on the same origin as the API, behind Authelia
forward auth. The app never implements its own login form; any 401/403 shows a
"Session required" panel that links to the sign-in portal.

## What's inside

- `src/App.tsx` — shell: sidebar (260px, collapsible; overlay drawer under
  640px), header (search, theme toggle, account), section routing.
- `src/views/` — Home (quick access + storage), My files (full command bar),
  Recent (local history), Shared / Recycle bin (placeholders), Admin · Users.
- `src/components/FileBrowser.tsx` — list/tiles browsing, hover checkboxes,
  row overflow + right-click menus, drag-and-drop upload overlay.
- `src/components/CommandBar.tsx` — Create or upload / Upload split buttons,
  New folder, selection actions, Sort (Name/Modified, asc/desc), List/Tiles
  toggle, Refresh.
- `src/index.css` — Fluent design tokens as CSS variables, wired into the
  Tailwind theme; light/dark swap via `[data-theme]`.
- `mock/server.mjs` — zero-dependency mock of the API contract.

## Keyboard & accessibility

- `/` focuses search; `Esc` clears it.
- Rows: `Enter` opens, `Space` toggles selection, `Ctrl/Cmd`/`Shift`+click
  selects ranges; menus support arrow keys, `Home`/`End` and `Esc`.
- Dialogs trap focus, restore it on close and are `aria-modal`.
- All animations respect `prefers-reduced-motion`.

## Notes / contract nuances

- Folders show `—` in the Size column: the files API does not report folder
  item counts for arbitrary listings (Home quick-access cards resolve counts
  with a small per-folder request).
- Folder downloads show an explanatory toast — there is no archive endpoint.
- Admin browsing of another user's files is read-only; mutations are not sent
  with `user=` because the contract only documents it for reads.
- "Upload folder" flattens the directory (files land in the current folder).
