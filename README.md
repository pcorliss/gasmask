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

...

### Roadmap

- [ ] Notifications
  - [ ] My CI Failures
  - [ ] MY PR Approvals
  - [ ] New Team PRs
  - [ ] Mentions
- [ ] Determine minimial PAT permissions
- [ ] Document PAT configuration
- [ ] Get more info on a PR with a sub-menu
- [ ] Merge my PRs via sub-menu
- [ ] Other PR Group - Controlled via a custom search
- [ ] TypeScript rewrite
- [ ] Properly organize
- [ ] Test Coverage
- [ ] Settings page insted of .env file
- [ ] Package as a MacOS App
- [ ] Cross Platform Support