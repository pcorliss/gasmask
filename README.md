# GasMask

A tray app and desktop window for tracking your pull requests and your team's review work.

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

### Full window

Choose **Open GasMask…** in the tray, or **View all My PRs…** / **View all Team PRs…**.
To open the window immediately at startup, run `npm start -- --window`.

The window lists open PRs of any age. Search titles or PR numbers, filter by organization,
repository, team author, or creation age, and use **Load more** to fetch the next 25 results.
Choose an organization to search all its repositories, then optionally choose a repository.
Both fields suggest names from loaded PRs and accept typed names. Changing the organization
clears the repository selection.
The recent/older age boundary uses `MAX_PR_AGE_DAYS`, or 14 days when unset.
Readiness filters and group counts apply to loaded results; the footer shows how many of the
matching PRs have been loaded. GitHub search returns at most 1,000 results per query; use narrower
filters for larger sets. Merged and closed PRs are excluded.

Select a row for full PR details, policy results, reviews, and links to individual checks.
**Other checks** excludes policy-bot. Double-click a row, use **Open in GitHub**, or press Enter
on a focused row to open the PR.
Arrow keys move between rows, Escape closes the details panel, and Cmd/Ctrl+K focuses search.

Ready-to-merge PRs in **My PRs** show a merge action in the details panel when your token has
write access. Choose an allowed merge method, then confirm the PR and target branch.
GasMask checks the latest status before merging and rejects changed commits. GitHub still
enforces branch protections. Successful merges refresh the window and tray.

Closing the window keeps the tray and notifications running. Window size, filters, and view
preferences are saved locally. Refresh preserves loaded pages and selection; failed requests
retain the previous results. Browsing older PRs does not generate notifications or change the
tray's age filter. The tray shows up to ten recently updated PRs per section.
The open window refreshes every 30 seconds (or `REFRESH_INTERVAL` when shorter), and when
you return to it. **Refresh** fetches the current view immediately. The tray and notifications
continue to use `REFRESH_INTERVAL`.

Run `npm test` for data and tray tests. Run `npm run test:window` for the Electron smoke test;
it uses fixture PRs and a temporary profile, without live credentials or notifications.

### PR readiness

My PRs and Team PRs show policy-bot status and merge readiness. Use **Split PRs by readiness**
in the tray menu to group each list into **Ready to merge**, **Needs review**, **Blocked / checking**,
and **Drafts**. Empty groups are hidden. Set `SPLIT_PRS_BY_READINESS=false` in `.env` to start
with one list per section; menu changes last until the app exits.
Team PRs that are ready to merge appear last in both layouts, so PRs needing attention come first.
Approved Team PRs with passing checks also go in this group when only a branch update remains:
🔄 **Rebase needed** means the branch is behind; 🛠️ **Rebase conflicts** means the author must resolve conflicts.
For My PRs, both remain blockers.

Grouped rows omit readiness wording that repeats the heading, while retaining status icons,
policy results, and specific blockers. Each row includes `repository#number`, with the full title,
repository, PR number, and author available on hover. Title truncation uses the space left by the status text.

Policy status comes from `policy-bot` or `policy-bot: <target branch>` on the latest commit.
**Policy approved** means policy-bot passed. Apart from the Team rebase cases above, **Ready to merge**
requires GitHub to report a clean, conflict-free merge, no outstanding required reviews, and passing checks (or no checks).
Missing policy results are labelled explicitly; unknown or incomplete check data cannot establish
readiness. On macOS, hover over a PR for the full policy result, review status, and merge state.
The coloured circle shows the overall check status, which includes policy-bot.
For repeated checks on the same commit, a newer run of the same workflow supersedes older
runs. Checks from different workflows or apps remain separate; incomplete results cannot
establish readiness.

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
- [X] Inspect PR details in a full window
- [X] Filter out team drafts
- [X] Don't notify on old PRs
- [ ] Set icon for notifications
- [X] Merge ready My PRs from the details panel
- [ ] Other PR Group - Controlled via a custom search
- [ ] TypeScript rewrite
- [ ] Properly organize
- [X] Automated data, tray, and window tests
- [ ] Settings page insted of .env file
- [ ] Package as a MacOS App
- [ ] Cross Platform Support
