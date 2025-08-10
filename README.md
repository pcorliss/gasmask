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
```

Run

```sh
npm i
npm start
```

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
- [ ] Merge my PRs via sub-menu
- [ ] Other PR Group - Controlled via a custom search
- [ ] TypeScript rewrite
- [ ] Properly organize
- [ ] Test Coverage
- [ ] Settings page insted of .env file
- [ ] Package as a MacOS App
- [ ] Cross Platform Support