const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

function createGitHubClient({ env = process.env, fetcher } = {}) {
  async function request(url, body) {
    if (!url || !env.GH_TOKEN) throw new Error('Configure GH_TOKEN and the GitHub API URLs in .env.');
    const fetch = fetcher || (await import('node-fetch')).default;
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}. Check your connection and token permissions.`);
    const data = await response.json();
    if (data.errors?.length) throw new Error(data.errors.map(error => error.message).join('; '));
    return data;
  }

  async function queryGitHubTeam(org, team) {
    const members = [];
    for (let page = 1; ; page++) {
      const data = await request(`${env.GH_API_URL}/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(team)}/members?per_page=100&page=${page}`);
      if (!Array.isArray(data)) throw new Error('GitHub returned an invalid team member list.');
      members.push(...data);
      if (data.length < 100) return members;
    }
  }

  async function queryGitHub(query, { first = 25, after = null } = {}) {
    const graphQuery = fs.readFileSync(path.join(__dirname, 'pr_query.graphql'), 'utf8');
    const data = await request(env.GH_GRAPHQL_URL, {
      query: graphQuery,
      operationName: 'PullRequests',
      variables: { query, first, after },
    });
    if (!data.data?.search?.edges || !data.data.search.pageInfo) throw new Error('GitHub returned an incomplete PR list.');
    return data;
  }

  async function getPullRequest(id) {
    const data = await request(env.GH_GRAPHQL_URL, {
      query: fs.readFileSync(path.join(__dirname, 'pr_query.graphql'), 'utf8'),
      operationName: 'PullRequestForMerge',
      variables: { id },
    });
    if (!data.data?.node?.id) throw new Error('GitHub could not load this pull request.');
    return data.data.node;
  }

  async function mergePullRequest({ id, headRefOid, method }) {
    const data = await request(env.GH_GRAPHQL_URL, {
      query: `mutation MergePullRequest($input: MergePullRequestInput!) {
        mergePullRequest(input: $input) { pullRequest { id merged url } }
      }`,
      variables: { input: { pullRequestId: id, expectedHeadOid: headRefOid, mergeMethod: method } },
    });
    if (data.data?.mergePullRequest?.pullRequest?.merged !== true) throw new Error('GitHub did not confirm the merge. Refresh the PR before trying again.');
  }

  return { queryGitHub, queryGitHubTeam, getPullRequest, mergePullRequest };
}

module.exports = { ...createGitHubClient(), createGitHubClient };
