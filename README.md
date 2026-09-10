# Loomi Landing Page

Marketing site for [Loomi](https://apps.apple.com/app/loomi-sleep-stories-for-kids/id6757821754), the bedtime story app for children aged 0–6.

Live at **[www.loomi.kids](https://www.loomi.kids)**.

## Stack

- Static HTML / CSS / JS — no build step, no framework
- **GitHub Pages** deploys the `release` branch automatically to `www.loomi.kids` (custom domain via `CNAME`). `main` is the staging integration branch; merging to `main` does **not** publish
- Deploys go live 1–2 min after a push to `release`
- **Google Apps Script** (in `scripts/Code.js`) handles the "Stay in touch" newsletter form and sends welcome + launch-campaign emails from `hello@loomi.kids`
- Assets (mascot, wordmark, video demo, App Store badge) live in `assets/`

## Local development

```bash
python3 -m http.server 8081
# open http://localhost:8081
```

That's it. Any edit to an `.html` file shows on next refresh.

## Deploy

Two branches, two roles:

- **`main`** ... staging. Feature PRs target `main`. Merges here do **not** touch the live site. Use it to stack up changes and preview them locally without them ever going live prematurely.
- **`release`** ... what `www.loomi.kids` serves. GitHub Pages redeploys 1–2 min after any push to this branch.

Ship what's on `main` to production:

```bash
git checkout release
git pull --ff-only
git merge --ff-only main   # or a plain merge if release has diverged
git push
```

To ship only a subset of what's on `main`, cherry-pick specific commits onto `release` instead of merging the whole branch.

For non-critical changes: hard-refresh (Cmd+Shift+R) is often needed because the site's `<script>` and `<img>` tags don't carry cache-busting query strings by default. See [Cache-busting](#cache-busting) below.

### Rolling back a bad release

The Pages source is a branch, so a rollback is just moving `release` backwards:

```bash
git checkout release
git reset --hard <good-commit-sha>
git push --force-with-lease
```

`main` is untouched. Pages rebuilds from the older commit in 1–2 minutes.

### Currently pending on `main` ... the held bundle

`release` is deliberately behind `main` by several commits. Everything that has landed on `main` since the current `release` tip is being held back, and it now carries **two independent things**:

1. **The Android launch.** The Google Play badges on `index.html` do not go live until the Android app is publicly available on Google Play.
2. **Pilot recruitment.** `pilot.html` and the Apps Script screening pipeline for the 21-day study.

These are coupled by a decision, not by necessity. Ruling on 2026-09-10: ship them together rather than run a second promotion for recruitment alone. Revisit if the Android launch slips ... the pilot cohort has a start date, so recruitment cannot wait indefinitely.

See what is currently in the bundle:

```bash
git log --oneline release..main
```

Ship rule while the bundle is pending: **promote `main → release` in one shot, not piecemeal.** The Android CTAs, the voice work, the copy fixes, and the install-page platform-aware redirect are entangled across several commits (PR #21 in particular bundled multiple concerns), so cherry-picking a subset is fragile. If a change genuinely must ship before the bundle does, cut it as a small dedicated PR straight onto `release`.

**The Apps Script has a second gate of its own.** Promoting the site is not enough to make the pilot form work, and the two gates are separate:

| | Gate | Currently |
|---|---|---|
| Site | the `release` branch | held at the pre-Android tip |
| Form endpoint (`doPost`) | the pinned deployment `AKfycbyG...` | pinned at `@11`, pre-pilot |

`clasp push` writes HEAD only, so the pilot pipeline is already staged there while production still runs `@11`. Until someone runs `clasp create-version` + `clasp redeploy`, `pilot.html` would post to an endpoint with no pilot branch. Both gates open together on launch day.

**Do not run these three menu items until Android is public:** *Send Welcome Email to Selected Rows*, *Send Welcome Email to All Unsent*, and the Launch Campaign senders. Menu functions run against HEAD, which now carries the dual-store email copy, so they would announce Google Play early. The automatic welcome email is fired by `doPost` and served by the pinned `@11`, so it stays iOS-only. The Pilot menu items are unaffected and safe to use for sheet setup.

Once the bundle ships, both gates open, this section goes away, and the `main → release` cadence returns to routine.

## Repo layout

```
├── index.html              # Main landing page (hero, CTAs, comparison, formula, voices, research)
├── install.html            # Auto-redirect to App Store (catches old TestFlight install links)
├── privacy.html            # Privacy policy
├── terms.html              # Terms of service
├── support.html            # Support page (App Review 1.5 requirement)
├── components/footer.js    # Shared footer (privacy/terms/support links + brand line)
├── scripts/
│   ├── Code.js             # Google Apps Script — form handler + welcome/campaign emails
│   ├── appsscript.json     # Apps Script manifest
│   └── .clasp.json         # (gitignored) clasp script ID
├── assets/                 # Mascot, wordmark, videos, App Store badge, starfield tile, voice portraits
├── favicon.ico, favicon-*.png, apple-touch-icon.png, android-chrome-*.png
├── site.webmanifest        # PWA manifest (Android home-screen icons)
└── CNAME                   # www.loomi.kids
```

## Apps Script sync

The web form on `index.html` POSTs to a deployed Google Apps Script web app. `scripts/Code.js` is the source of truth; the live script is a separate runtime.

**Push local edits to the live script:**

```bash
cd scripts
clasp push --force
```

**Gotcha — web-app deployment is version-pinned.**

Menu-triggered functions (welcome email, launch-campaign senders) run against `HEAD` and pick up `clasp push` immediately.

The form endpoint (`doPost`) is served by a **pinned deployment** (`AKfycby...` in the URL that `index.html` fetches). `clasp push` alone does **not** update it. To update the live form behaviour:

```bash
cd scripts
clasp push --force
clasp create-version "what changed"                          # note the version number, e.g. 12
clasp redeploy -V 12 -d "what changed" AKfycbyG5r-zIpHmwh17xCEQR-a9tab8YPdKBfki0DXzTnbjBjTiMog3k2v5rLgnX-ukg9MXSQ
```

The deployment ID above is the current public form endpoint. Get the list with `clasp list-deployments`.

**First-time setup** on a new machine:

```bash
npm install -g @google/clasp
clasp login   # sign in as the account that owns the script
```

Login expires periodically — re-run `clasp login` when `clasp push` returns `invalid_grant`.

**Sign in as the right account.** The script is owned by `shahin@tricyclelabz.com`, not the 98chimp account. If `clasp` reports `The caller does not have permission` the token is valid but the account is wrong ... check with `clasp show-authorized-user`, then `clasp logout && clasp login`.

## Screenshots

PR screenshots are captured with `tools/screenshot.mjs`, which drives Chrome over the DevTools Protocol. No dependencies: it uses the global `WebSocket` in Node 22+.

```bash
python3 -m http.server 8765                                    # serve the site
node tools/screenshot.mjs http://localhost:8765/pilot.html out.png 390 2
# args: <url> <out.png> [cssWidth=390] [scale=2] [desktop]
```

Pass `desktop` as the fifth argument to turn mobile emulation off. Output is the **full page** at `cssWidth`, so nothing is cut off the bottom either. Shrink for committing with `magick out.png -strip -resize 50% -colors 128 PNG8:out.png`.

**Why not `chrome --screenshot`:** Chrome's headless screenshot flag clamps the layout viewport to a **500px minimum**. Ask it for 390 and it lays the page out at 500, then crops the image to 390 ... so the capture looks broken while the page is fine. This bit once and blocked a merge. `Emulation.setDeviceMetricsOverride`, which the script uses, has no such floor.

## Cache-busting

Changed image URLs use a `?v=N` query so Gmail's image proxy (and email-client image caches) refetch. Current version is `?v=2` — bump to `?v=3` when the mascot or apple-touch-icon changes again.

Applied in:
- `scripts/Code.js` — email `<img>` tags for `loomi-logo-header.png` and `apple-touch-icon.png`
- `index.html` — hero `<img>` for `loomi-logo-header.png`

Not versioned (self-heals via browser cache within the 10-minute `max-age`):
- Favicon `<link>` tags in HTML head
- Static assets not referenced by email

## Regenerating the mascot icon set

When the mascot art changes, drop the new square PNG at `assets/loomi-logo.png` (750×750 recommended) and run:

```bash
SRC=assets/loomi-logo.png
magick "$SRC" -strip -filter Lanczos -resize 16x16   favicon-16x16.png
magick "$SRC" -strip -filter Lanczos -resize 32x32   favicon-32x32.png
magick "$SRC" -strip -filter Lanczos -resize 180x180 apple-touch-icon.png
magick "$SRC" -strip -filter Lanczos -resize 192x192 android-chrome-192x192.png
magick "$SRC" -strip -filter Lanczos -resize 512x512 android-chrome-512x512.png
magick "$SRC" -strip -filter Lanczos -define icon:auto-resize=16,32,48 favicon.ico
```

Requires ImageMagick 7 (`brew install imagemagick`). Filenames are unchanged so no HTML/webmanifest edits are needed. Bump the cache-busting version if the hero logo also changed.

## Workflow

Every change goes through a feature branch → PR → merge (per `~/.claude/CLAUDE.md`). Branch names: `shahin/<issue-number>-<short-description>`. Feature PRs target `main` (staging). To publish, promote the accumulated `main` commits to `release` (see [Deploy](#deploy)).
