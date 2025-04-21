# GasMask

TaskBar App to monitor a subset of PRs for your team and yourself.

## Quick Start

```sh
cp .env.sample .env
```

Update `.env` with your configuration

```toml
GH_TOKEN=ghp_userPAT
GH_USER=yourUser
GH_API_URL=https://api.github.com
GH_TEAMS=someOrg/someTeam
```

Run

```
npm i
npm start
```