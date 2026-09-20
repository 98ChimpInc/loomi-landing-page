Promote the landing page from staging (main) to production (release branch → GitHub Pages → www.loomi.kids).

## Steps

1. Confirm you are on the `main` branch. If not, switch to it.
2. Show the user what commits will be promoted:
   ```bash
   git log --oneline release..main
   ```
   If empty, tell the user prod is already up to date and stop.
3. Fast-forward `release` to `main` and push:
   ```bash
   git checkout release && git merge main --ff-only && git push origin release && git checkout main
   ```
4. Wait for the GitHub Pages build to complete:
   ```bash
   gh api repos/98ChimpInc/loomi-landing-page/pages/builds --jq '.[0] | {status, created_at}'
   ```
   If status is not `built`, wait a few seconds and check again.
5. Verify the live site by navigating the browser to `https://www.loomi.kids/pilot.html`, hard-refresh, and take a screenshot to confirm the deploy landed.
6. Report what shipped.
