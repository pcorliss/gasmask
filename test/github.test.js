const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createGitHubClient } = require('../github');

const env = { GH_TOKEN: 'test-token', GH_API_URL: 'https://github.example/api/v3', GH_GRAPHQL_URL: 'https://github.example/api/graphql' };
const response = data => ({ ok: true, json: async () => data });

test('PR search uses GraphQL variables, including pagination and quoted search text', async () => {
  const calls = [];
  const client = createGitHubClient({ env, fetcher: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return response({ data: { search: { edges: [], pageInfo: { hasNextPage: false } } } });
  } });
  const query = 'is:pr is:open "a quoted title"';
  await client.queryGitHub(query, { first: 25, after: 'cursor-25' });
  assert.deepEqual(calls[0].body.variables, { query, first: 25, after: 'cursor-25' });
  assert.equal(calls[0].body.operationName, 'PullRequests');
  assert(!calls[0].body.query.includes(query));
  assert(calls[0].body.query.includes('$after'));
});

test('merging fetches a fresh PR and submits the selected method with the expected head', async () => {
  const calls = [];
  const client = createGitHubClient({ env, fetcher: async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body });
    return response(body.operationName === 'PullRequestForMerge' ? { data: { node: { id: 'PR_1', state: 'OPEN' } } } :
      { data: { mergePullRequest: { pullRequest: { id: 'PR_1', merged: true } } } });
  } });
  assert.equal((await client.getPullRequest('PR_1')).state, 'OPEN');
  assert.deepEqual(calls[0].body.variables, { id: 'PR_1' });
  await client.mergePullRequest({ id: 'PR_1', headRefOid: 'a'.repeat(40), method: 'SQUASH' });
  assert.equal(calls[1].url, env.GH_GRAPHQL_URL);
  assert.deepEqual(calls[1].body.variables.input, { pullRequestId: 'PR_1', expectedHeadOid: 'a'.repeat(40), mergeMethod: 'SQUASH' });
});

test('failed or unconfirmed merges are surfaced without reporting success', async () => {
  for (const data of [{ errors: [{ message: 'Head branch was modified. Refresh and try again.' }] }, { data: { mergePullRequest: null } }]) {
    const client = createGitHubClient({ env, fetcher: async () => response(data) });
    await assert.rejects(client.mergePullRequest({ id: 'PR_1', headRefOid: 'old', method: 'MERGE' }), /modified|did not confirm/);
  }
  const client = createGitHubClient({ env, fetcher: async () => response({ data: { node: null } }) });
  await assert.rejects(client.getPullRequest('missing'), /could not load/);
});

test('team membership includes every REST page', async () => {
  const urls = [];
  const client = createGitHubClient({ env, fetcher: async url => {
    urls.push(url);
    return response(urls.length === 1 ? Array.from({ length: 100 }, (_, i) => ({ login: `member-${i}` })) : [{ login: 'last-member' }]);
  } });
  const members = await client.queryGitHubTeam('org', 'team');
  assert.equal(members.length, 101);
  assert.equal(members.at(-1).login, 'last-member');
  assert.match(urls[1], /per_page=100&page=2/);
});

test('GraphQL errors and HTTP failures are surfaced without credentials', async () => {
  const client = createGitHubClient({ env, fetcher: async () => response({ errors: [{ message: 'Query unavailable' }] }) });
  await assert.rejects(client.queryGitHub('is:open'), /Query unavailable/);
  const denied = createGitHubClient({ env, fetcher: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(denied.queryGitHub('is:open'), error => error.message.includes('401') && !error.message.includes(env.GH_TOKEN));
});
