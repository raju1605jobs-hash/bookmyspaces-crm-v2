# PII / Credential Exposure Remediation Plan — commit `43b6a15`

**Status:** Confirmed exposed, reachable from `main`, repo is public. Product Owner decision (2026-07-13): contain + purge. This sandbox has no GitHub credentials, so nothing below has been executed — these are exact steps for Raju to run.

## What's actually in commit `43b6a15`

Commit `43b6a15` ("Pre Phase 2 foundation migration backup", 2026-06-03) added `bookmyspaces/latest.json` and `bookmyspaces/logs.json` — captured Vercel function logs. Confirmed contents:

- **Customer PII:** at least one customer full name (Arijit Banerjee) and multiple full phone numbers in intl format (e.g. `919051459463`, `919830012345`, `919836014495`), plus message body text containing the customer's name and inquiry context.
- **Partial WhatsApp/Meta credential:** an access token prefix (`EAAZB65Ruc...`, first 10 chars of a 203-char token) and the Meta `PHONE_NUMBER_ID` (`1170851372767802`). The prefix alone doesn't grant access, but it narrows the token's identity and should be treated as a signal to rotate, not ignored.
- **Infra identifiers:** Vercel `deploymentId`/`projectId` — low sensitivity, not customer-impacting.

This commit is reachable from `main` and from two other local branches (`feature/v3-omnichannel-platform`, `remediation/phase-0-audit-followup`), and the remote (`github.com/raju1605jobs-hash/bookmyspaces-crm-v2`) is confirmed **public** — verified via anonymous, credential-disabled clone in Day 2's session.

## Step 1 — Contain (do this first, takes 2 minutes)

Make the repo private immediately. This stops *new* public access while the history purge is prepared; it does not remove what's already been cloned/cached, but it's the fastest containment step available.

GitHub UI: repo → Settings → General → Danger Zone → "Change visibility" → Private.

Or via `gh` CLI if you have it locally:
```bash
gh repo edit raju1605jobs-hash/bookmyspaces-crm-v2 --visibility private --accept-visibility-change-consequences
```

## Step 2 — Rotate the WhatsApp/Meta access token

Independent of the git purge — a token prefix leaked publicly for over a month (since 2026-06-03). Rotate it in the Meta developer dashboard and update `WHATSAPP_ACCESS_TOKEN` (or equivalent) in Vercel's environment variables. This is cheap insurance regardless of how the history purge goes.

## Step 3 — Purge the commit from history

Run this **locally**, on your own machine, with your own GitHub credentials — not in this sandbox.

```bash
# 1. Fresh clone (never do a history rewrite on a repo with uncommitted work)
git clone https://github.com/raju1605jobs-hash/bookmyspaces-crm-v2.git bms-purge
cd bms-purge

# 2. Install git-filter-repo if you don't have it
pip install git-filter-repo   # or: brew install git-filter-repo

# 3. Remove the two files from all history, on all branches
git filter-repo --path bookmyspaces/latest.json --path bookmyspaces/logs.json --invert-paths

# 4. Re-add the remote (filter-repo removes it as a safety measure)
git remote add origin https://github.com/raju1605jobs-hash/bookmyspaces-crm-v2.git

# 5. Force-push every branch and tag
git push origin --force --all
git push origin --force --tags
```

**Consequences you should know before running this:**
- Every commit hash after `43b6a15` changes on every branch that contains it (`main`, `feature/v3-omnichannel-platform`, `remediation/phase-0-audit-followup`). Anyone with a local clone (including this session's mounted copy) will need to re-clone or hard-reset to the new history — a normal `git pull` will conflict.
- Any open PRs referencing old commit hashes will show as unmergeable/stale and need to be re-based.
- GitHub's own caches (PR diffs, commit links in issues) may retain references to the old blob for a while even after the force-push; GitHub Support can be asked to purge cached views if you need certainty beyond the force-push itself.

## Step 4 — After the purge

1. Re-run the Day 2 anonymous-clone verification (`git clone --bare` with `GIT_TERMINAL_PROMPT=0` and `credential.helper=`) to confirm the commit is genuinely gone from a fresh clone, not just locally.
2. Decide whether to flip the repo back to public afterward, or leave it private — that's a separate call from the purge itself.
3. Already done in a prior session: `.gitignore` (line 42-47) excludes `latest.json`, `logs.json`, `logs.txt`, `deployed_route.txt` going forward, and the working-tree copies of these files are now empty placeholders. No action needed here — confirmed during this session.

## Step 5 — Notification assessment (not performed here)

Whether this exposure (customer names + phone numbers, publicly reachable for ~40 days) triggers any notification obligation depends on your jurisdiction's data protection law and isn't something I can determine for you — that's a legal question, not an engineering one. Flagging it so it isn't silently skipped.
