# tv-home

The live part of **Home**, my custom home screen for a 2018 Samsung TV (Tizen 4).

The TV has a small packaged app installed on it — a loader. On every launch the loader fetches the
files listed in [`manifest.json`](manifest.json) from this repo and runs them inside its own page,
so the Tizen APIs (launching apps, reading the installed app list) keep working. It keeps the last
good copy on the TV, so Home still opens when this repo or the network is unreachable.

**Changing Home is a push to this repo. No reinstall, no TV remote, no developer mode.**

## Files

| File | What it is |
| --- | --- |
| `manifest.json` | What to load and in what order. Adding a new file means adding it here. |
| `app.js` | The home screen itself: clock, shelf, app launching, overlays, remote keys. |
| `catalog.js` | The app list and my greeting name. The file to edit for everyday tweaks. |
| `style.css` | All the styling. |
| `qrcode.js` | QR encoder for the guest Wi-Fi sheet. Third party, rarely touched. |

Written in plain ES5 — no `let`, no arrow functions, no template strings, no `fetch`, no CSS grid
or `gap`. The TV's browser engine is from 2018 and will simply stop at anything newer.

The fonts and the app icon stay inside the packaged app on the TV, not here. `style.css` refers to
them with relative paths (`fonts/outfit-400.woff2`), which resolve against the packaged page.

## How a change reaches the TV

1. Edit a file here and push to `main`.
2. Wait for GitHub Pages to publish (usually under a minute — the Actions tab shows it).
3. Open Home on the TV.

The loader renders from its cached copy immediately, then checks this repo in the background. If
Home has just opened and nothing has been pressed yet, it swaps the new version in by itself. If
the remote is already being used, it shows *"Update ready — press the blue button to reload"*
instead, so the screen never changes under your hands.

Updates are detected by comparing file contents, so `version` in `manifest.json` is only a label.
There is nothing to bump and nothing to forget.

## If a change breaks Home

The loader watches the first five seconds after it starts fetched code. If that code throws, the
loader drops its cache, remembers the broken version, falls back to the copy packaged on the TV,
and refuses to install that same version again. Home keeps opening. Fix the file, push, and the
next launch picks the fix up.

## Hosting

GitHub Pages serves this repo from `main` at the repository root, which is what the loader reads
first. It also knows how to fall back to `raw.githubusercontent.com` and jsDelivr for the same
repo, so Home still updates if Pages is having a bad day.

## Not in this repo

No signing keys, no certificates, no `.wgt` packages, no `tools/` directory. Those live only on my
laptop, and `.gitignore` here is set up to refuse them. This repo is public; the loader fetches it
over plain HTTPS with no credentials.
