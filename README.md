# GasMask

TaskBar App to monitor a subset of PRs for your team and yourself.

## Quick Start

Create an `.env` file with your configuration

```sh
GH_TOKEN=ghp_userPAT
GH_USER=yourUser
GH_API_URL=https://api.github.com
GH_GRAPHQL_URL=https://api.github.com/graphql
GH_TEAMS=someOrg/someTeam
MAX_PR_AGE_DAYS=14
```

`MAX_PR_AGE_DAYS` is optional and unset by default. When set, PRs older than this many days (by creation date) are hidden from the tray menu.

Run

```sh
npm i
npm start
```

### PR readiness

My PRs and Team PRs show policy-bot status and merge readiness. Use **Split PRs by readiness**
in the tray menu to group each list into **Ready to merge**, **Needs review**, **Blocked / checking**,
and **Drafts**. Empty groups are hidden. Set `SPLIT_PRS_BY_READINESS=false` in `.env` to start
with one list per section; menu changes last until the app exits.

Policy status comes from `policy-bot` or `policy-bot: <target branch>` on the latest commit.
**Policy approved** means policy-bot passed. **Ready to merge** also requires GitHub to report a
clean, conflict-free merge, no outstanding required reviews, and passing checks (or no checks).
Missing policy results are labelled explicitly; unknown or incomplete check data cannot establish
readiness. On macOS, hover over a PR for the full policy result, review status, and merge state.
The coloured circle shows the overall check status, which includes policy-bot.

### GitHub PAT Permissions

Create a [Personal access tokens (classic)](https://github.com/settings/tokens) with the following permissions.

```
repo
read:org
```

### Roadmap

- [ ] Notifications
  - [X] My CI Failures transition from anything -> Red
  - [X] My PR Approvals transition from anything -> Approved
  - [X] New Team PRs -> New Team PRs since last refresh
  - [ ] Mentions & Team Mentions
- [ ] Get more info on a PR with a sub-menu
- [X] Filter out team drafts
- [X] Don't notify on old PRs
- [ ] Set icon for notifications
- [ ] Merge my PRs via sub-menu
- [ ] Other PR Group - Controlled via a custom search
- [ ] TypeScript rewrite
- [ ] Properly organize
- [ ] Test Coverage
- [ ] Settings page insted of .env file
- [ ] Package as a MacOS App
- [ ] Cross Platform Support
