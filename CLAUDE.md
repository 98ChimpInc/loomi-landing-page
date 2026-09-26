# loomi-landing-page

## This repo is PUBLIC

`98ChimpInc/loomi-landing-page` is a public GitHub repo. A "hidden" page such as
`pilot.html` is only unlisted: anyone can find it in the repo, and anything
committed stays in public git history even after it's deleted.

Never commit internal docs, proposals, compliance reasoning, applicant data or
anything else not meant for the public. For a temporary page only the team
should see, use a Firebase preview channel deployed from a scratch folder
outside this repo:

```bash
firebase hosting:channel:deploy <id> --expires 7d --only staging --project loomi-app-d87ee
```

Deploy it with a hosting-only `firebase.json` that targets `staging`
(`loomi-staging`) and sends `X-Robots-Tag: noindex`. It auto-expires, is
never committed, and doesn't touch the live staging site.

## Where things deploy

| Site | Source | How |
|---|---|---|
| staging.loomi.kids | `main` | `.github/workflows/deploy-staging.yml` on every push. Sends `noindex` on everything. |
| www.loomi.kids | the release branch | GitHub Pages. Never touched by the staging workflow. See `.claude/commands/deploy-prod.md`. |

`firebase.json` here declares hosting only. Never add `firestore` or `storage`:
rules for the shared Firebase project deploy only from `loomi-app-ios/firebase/`
(see the README warning).
