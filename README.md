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

### Staging at staging.loomi.kids

`main` is served by Firebase Hosting at **staging.loomi.kids**, so the held bundle can be looked at rather than only read as a diff. Production is unaffected: `www.loomi.kids` is GitHub Pages serving `release` and is not managed from `firebase.json`.

**Staging deploys itself.** `.github/workflows/deploy-staging.yml` publishes on every push to `main`, so the preview always matches the branch. Re-run it from the Actions tab, or deploy by hand if you need to:

```bash
firebase deploy --only hosting:staging
```

Add `[skip staging]` to a commit message to skip the deploy for a change that serves nothing, such as a docs-only or Apps Script-only commit.

The workflow authenticates with a service account key in the `FIREBASE_SERVICE_ACCOUNT` repo secret. Firebase Hosting IAM has no per-site granularity, so that account can deploy to any hosting site on the project; the workflow pins the staging target, and changing it takes a PR. Moving to Workload Identity Federation would remove the long-lived key and is the better end state.

Everything there carries `X-Robots-Tag: noindex`, because staging renders unreleased work and an indexed copy defeats the point of holding it. `scripts/`, `docs/`, `tools/` and `misc/` are excluded from the upload.

The pilot form refuses to submit from `staging.loomi.kids` ... `LIVE_HOSTS` in `pilot.html` is an exact-match list of the production domains plus localhost. A staging submission would otherwise post to the production Apps Script, which until the pilot deployment ships would file it into the live newsletter tab.

> **`firebase.json` here declares `hosting` and nothing else. Never add `firestore` or `storage` to it.**
>
> Every Loomi repo shares the project `loomi-app-d87ee`, and security rules live only in `loomi-app-ios/firebase/`. A `firebase deploy` from a repo that declares rules overwrites production rules for every client. That is not hypothetical: on 2026-07-01 `loomi-narration-pipeline` shipped its own `firestore.rules` and broke the App Store app for every user. Because this file declares only hosting, a bare `firebase deploy` from this directory can only touch hosting. Keep it that way.

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

## Launch runbook

Shipping the held bundle. Ordered, because several steps fail quietly if done out of sequence.

The failure mode this exists to prevent: on 2026-09-12 an end-to-end test of the applicant fan-out returned `HTTP 401` because the shared secret had been set in Secret Manager but never in the Apps Script properties. Two places, same value, and only one of them was written. Nothing in the code could have caught it, because from the script's side an empty property is indistinguishable from a wrong one.

### Before launch day

1. **Settle the open protocol values.** Age bands, the challenge and theme vocabularies, and the audience rule are defaults chosen during the build, not decisions. `TricycleLabz/loomi-workspace#1`. They are stamped on every applicant at intake, so changing them after recruitment starts means re-deriving existing rows.
2. **Confirm the cohort start date and capacity** on the `Pilot Config` tab. Both are read at request time, so they can change without a deploy ... but the date appears in the acknowledgement email and on the page, and moving it after families enrol is the one case the data contract warns about.
3. **Run 🌙 Loomi → 🧪 Pilot → Set up Pilot sheets once.** Safe to re-run. It creates the two tabs if missing and re-applies the text format to the Age band and Invitation code columns, without which Sheets reads a band like `2-3` as a date and a code like `2E3456` as a number.

### The secret, on both sides

The Cloud Function compares with `timingSafeEqual` after a length check, so a trailing newline is a total mismatch and every row 401s.

```bash
firebase functions:secrets:access PILOT_FANOUT_SECRET --project loomi-app-d87ee
```

That value goes in **two** places:

| Where | How |
|---|---|
| Secret Manager | already set by the workbench deploy |
| Apps Script properties | Apps Script → gear icon → Script Properties → `PILOT_FANOUT_SECRET` |

Verify rather than assume, by issuing a code on a throwaway row and checking the Notes column. Empty means the fan-out succeeded; `fan-out failed: HTTP 401 ...` means the secret does not match. Delete the row and the Firestore document afterwards.

### Launch day, in order

Both gates open together, or the site advertises a form that posts to an endpoint which does not understand it.

```bash
# 1. Site: promote the bundle to production
git checkout release
git pull --ff-only
git merge main
git push                       # Pages rebuilds in 1-2 min

# 2. Script: push, then cut a version and repoint the pinned deployment
cd scripts
clasp push --force
clasp create-version "pilot recruitment live"        # note the number it prints
clasp redeploy -V <that number> -d "pilot recruitment live" \
  AKfycbyG5r-zIpHmwh17xCEQR-a9tab8YPdKBfki0DXzTnbjBjTiMog3k2v5rLgnX-ukg9MXSQ
```

`clasp push` alone is not enough. It writes HEAD, and `doPost` is served by the pinned deployment above ... the id the live form posts to. Until it is repointed, a pilot submission falls through to the newsletter path and lands as a six-column row in the signups tab.

### Verify, in this order

1. `https://www.loomi.kids/pilot.html` loads
2. A real submission returns a proper outcome panel rather than an error
3. The row appears on `Pilot Applicants` with a derived band and audience segment
4. `applicants/{id}` exists in Firestore, where the id is the SHA-256 of the lowercased email
5. The newsletter form on the home page still works ... it shares the deployment that was just repointed

### After launch

The three manual email actions ... *Send Welcome Email to Selected Rows*, *Send Welcome Email to All Unsent*, and the Launch Campaign senders ... are safe again once Android is public. They run against HEAD and carry the dual-store copy, which is why they are off limits while the launch is held.

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

**Merging is not deploying.** A PR touching `scripts/Code.js` changes the repo and nothing else. The live script only moves when someone runs `clasp push`, and nothing detects the gap ... no CI, no warning, and no symptom until the spreadsheet menu quietly runs different logic from `main`. So after any merge that touches `Code.js`, push, and then verify rather than trusting the "Pushed 2 files" line:

```bash
# from a scratch directory, not the repo, so a stale remote cannot overwrite your work
mkdir -p /tmp/head-check && cp scripts/.clasp.json /tmp/head-check/
cd /tmp/head-check && clasp pull
diff /tmp/head-check/Code.js "$OLDPWD/scripts/Code.js" && echo "in sync"
```

Pull into a scratch directory rather than running `clasp pull` in the repo, which would overwrite `scripts/Code.js` with whatever the remote happens to hold.

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
