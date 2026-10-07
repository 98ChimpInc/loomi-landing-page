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

`main` is served by Firebase Hosting at **staging.loomi.kids**, so `main` can be looked at rather than only read as a diff. Production is unaffected: `www.loomi.kids` is GitHub Pages serving `release` and is not managed from `firebase.json`.

**Staging deploys itself.** `.github/workflows/deploy-staging.yml` publishes on every push to `main`, so the preview always matches the branch. Re-run it from the Actions tab, or deploy by hand if you need to:

```bash
firebase deploy --only hosting:staging
```

The workflow authenticates with a service account key in the `FIREBASE_SERVICE_ACCOUNT` repo secret. Firebase Hosting IAM has no per-site granularity, so that account can deploy to any hosting site on the project; the workflow pins the staging target, and changing it takes a PR. Moving to Workload Identity Federation would remove the long-lived key and is the better end state.

Everything there carries `X-Robots-Tag: noindex`, because staging renders unreleased work and an indexed copy defeats the point of holding it. `scripts/`, `docs/`, `tools/` and `misc/` are excluded from the upload.

The pilot form refuses to submit from `staging.loomi.kids` ... `LIVE_HOSTS` in `pilot.html` is an exact-match list of the production domains plus localhost. A staging submission would otherwise post to the production Apps Script, which until the pilot deployment ships would file it into the live newsletter tab.

> **`firebase.json` here declares `hosting` and nothing else. Never add `firestore` or `storage` to it.**
>
> Every Loomi repo shares the project `loomi-app-d87ee`, and security rules live only in `TricycleLabz/loomi-firebase` (`firestore.rules`, `storage.rules`), deployed only with its `scripts/deploy_firebase.sh`. A `firebase deploy` from a repo that declares rules overwrites production rules for every client. That is not hypothetical: on 2026-07-01 `loomi-narration-pipeline` shipped its own `firestore.rules` and broke the App Store app for every user. Because this file declares only hosting, a bare `firebase deploy` from this directory can only touch hosting. Keep it that way.

### Launch runbook

The pilot launch runbook, the Pilot Applicants sheet layout and the fan-out secret procedure are internal docs in the private `TricycleLabz/loomi-workspace` repo, at `docs/landing-page/launch-runbook.md`.

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

### Email feedback forwarding

Every 15 minutes, `forwardFeedbackEmails` sends new replies to `hello@loomi.kids` from pilot applicants (anyone on the Pilot Applicants sheet, under any of their iCloud addresses: an applicant at mac.com also writes as the same name at me.com or icloud.com) to the `emailFeedbackIntake` Cloud Function in `TricycleLabz/loomi-firebase`, which files each one as a GitHub issue with names and addresses redacted. Mail from anyone else goes only when someone puts its thread under the `to-ticket` label in Gmail. It runs on HEAD, so `clasp push` is the deploy; no version or redeploy.

**Script properties** (Apps Script → gear icon → Script Properties):

| Property | Value |
|---|---|
| `FEEDBACK_FORWARD_ENABLED` | `true` to run. Anything else is off: the kill switch |
| `EMAIL_INTAKE_SECRET` | Same value as `EMAIL_INTAKE_SECRET` in Secret Manager, byte for byte. A mismatch logs a 401 and stops every run |
| `FEEDBACK_FORWARD_ACCOUNT` | The co-founder account the forwarder runs as. hello@ is a Google Group, so its mail lands in each member's inbox. Unset means hello@ is its own account |
| `FEEDBACK_FORWARD_SINCE`, `FEEDBACK_FORWARD_DONE` | Written by the script: the cursor and the messages answered recently. Don't edit |

**Start it** signed in to the spreadsheet as the account in `FEEDBACK_FORWARD_ACCOUNT` (or as hello@): 🧪 Pilot → **Start email feedback forwarding**. A time trigger reads the mailbox of whoever installs it, so the script refuses any other account. The first `clasp push` with this code adds two scopes (triggers, and reading the signed-in account's address), so the menu item asks that account to authorise them. Unverified: whether the owner must also re-authorise for the pinned form deployment, so check the form still submits after that push. The first run sets the cursor and files nothing older.

**Group delivery.** That account's hello@ group subscription must be **Each email**: a digest or "No email" leaves its inbox empty and nothing is filed. `to-ticket` is a per-mailbox label, so it only counts when applied in that account's Gmail. Mail from tricyclelabz.com or loomi.kids is the team's and is never filed, so a co-founder's reply in a `to-ticket` thread leaves the customer's message to go. Mail from a domain with a strict DMARC policy (iCloud, Yahoo, AOL) reaches the inbox From the group itself, as `"Name via Welcome" <hello@tricyclelabz.com>`; the forwarder reads the author from the group's `X-Original-From` / `X-Original-Sender` headers instead, never `Reply-To`.

**Labels** on a thread after it is processed:

- `ticketed` ... filed, or already filed
- `ticket-skipped` ... automated mail (auto-reply, bounce, no-reply), or a labelled thread with nothing sent in
- `ticket-failed` ... the function rejected the payload; the reason is in the Apps Script execution log

Applicant replies get a label only when they fail. Remove the result label from a `to-ticket` thread to send it again. A 5xx, a 429 or an unreachable function stops the run without moving the cursor, so the next run retries.

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
