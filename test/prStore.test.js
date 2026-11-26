const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PRStore, normalizeFilters } = require('../prStore');

const now = Date.parse('2026-11-20T12:00:00Z');
const env = { GH_USER: 'me', GH_TEAMS: 'org/team', MAX_PR_AGE_DAYS: '14' };
const makePR = (number, fields = {}) => ({
  number, title: `PR ${number}`, url: `https://github.example/org/repo/pull/${number}`,
  createdAt: new Date(now - 86400000).toISOString(), updatedAt: new Date(now).toISOString(),
  repository: { name: 'repo', nameWithOwner: 'org/repo' }, author: { login: 'teammate' },
  isDraft: false, baseRefName: 'main', reviewDecision: null, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN',
  commits: { nodes: [{ commit: { statusCheckRollup: null } }] }, ...fields,
});
const result = (prs, total = prs.length, cursor = null) => ({ data: { search: {
  edges: prs.map(node => ({ node })), issueCount: total, pageInfo: { hasNextPage: Boolean(cursor), endCursor: cursor },
} } });
const members = async () => [{ login: 'me' }, { login: 'teammate' }];

test('older open PRs paginate without changing the tray or notifying', async () => {
  const calls = [];
  const old = Array.from({ length: 40 }, (_, i) => makePR(i + 1, { createdAt: '2020-01-01T00:00:00Z' }));
  const store = new PRStore({ env, now: () => now, github: {
    queryGitHubTeam: members,
    queryGitHub: async (query, options) => {
      calls.push({ query, ...options });
      if (options.first === 10) return result([]);
      return options.after ? result(old.slice(25), 40) : result(old.slice(0, 25), 40, 'next');
    },
  } });
  const alerts = []; store.on('notification', event => alerts.push(event));
  await store.poll();
  await store.searchBrowser({ scope: 'team', age: 'all' });
  assert.equal(store.getBrowserSnapshot().prs.length, 25);
  await store.loadMore();
  assert.equal(store.getBrowserSnapshot().prs.length, 40);
  assert.equal(store.browser.total, 40);
  assert.equal(store.browser.hasMore, false);
  assert.equal(store.getTraySnapshot().team.prs.length, 0);
  assert.deepEqual(alerts, []);
  assert(calls.filter(call => call.first === 10).every(call => call.query.includes('created:>=')));
  assert(calls.filter(call => call.first === 25).every(call => !call.query.includes('created:')));
});

test('server search keeps scope, age and repository restrictions and treats search qualifiers as text', async () => {
  const store = new PRStore({ env, now: () => now, github: { queryGitHubTeam: members } });
  const query = await store.buildQuery(normalizeFilters({ scope: 'team', search: 'is:closed', organization: 'org', repository: 'repo', author: 'teammate', age: 'older' }));
  assert.match(query, /is:pr is:open/);
  assert.match(query, /"is:closed" in:title/);
  assert.match(query, /created:<2026-11-06/);
  assert.match(query, /repo:org\/repo/);
  assert.match(query, /author:teammate/);
  assert(!query.includes('author:me '));
  assert.equal(await store.buildQuery(normalizeFilters({ scope: 'team', author: 'outsider' })), null);
  assert.throws(() => normalizeFilters({ organization: 'org', repository: 'repo is:closed' }), /repository name/);
});

test('organization searches cover all repositories and combine with My and Team scopes', async () => {
  const store = new PRStore({ env, github: { queryGitHubTeam: members } });
  for (const scope of ['mine', 'team']) {
    const query = await store.buildQuery(normalizeFilters({ scope, organization: 'other-org' }));
    assert.match(query, /org:other-org/);
    assert(!query.includes('repo:'));
    assert(query.includes(scope === 'mine' ? 'author:me' : 'author:teammate'));
    const repoQuery = await store.buildQuery(normalizeFilters({ scope, organization: 'other-org', repository: 'repo.name' }));
    assert.match(repoQuery, /repo:other-org\/repo.name/);
    assert(!repoQuery.includes('org:'));
  }
});

test('saved owner/repo filters migrate without changing scope, author, search, or age', () => {
  const legacy = { scope: 'team', repository: 'other-org/my.repo', author: 'teammate', search: '#123', age: 'older' };
  const current = { ...legacy, organization: 'other-org', repository: 'my.repo' };
  assert.deepEqual(normalizeFilters(legacy), current);
  assert.deepEqual(normalizeFilters(current), current);
  assert.equal(normalizeFilters({}).organization, '');
});

test('organization and repository filters reject invalid or ambiguous combinations', () => {
  assert.throws(() => normalizeFilters({ organization: 'org is:closed' }), /organization name/);
  assert.throws(() => normalizeFilters({ organization: 'org/repo' }), /organization name/);
  assert.throws(() => normalizeFilters({ repository: 'repo' }), /Choose an organization/);
  assert.throws(() => normalizeFilters({ organization: 'other', repository: 'org/repo' }), /repository name/);
  assert.throws(() => normalizeFilters({ organization: '', repository: 'org/repo' }), /repository name/);
  assert.deepEqual(normalizeFilters({ organization: ' org ', repository: ' repo ' }), {
    scope: 'mine', search: '', organization: 'org', repository: 'repo', author: '', age: 'all',
  });
});

test('slower searches cannot replace newer filters or results', async () => {
  const requests = [];
  const store = new PRStore({ env, github: { queryGitHub: query => new Promise(resolve => requests.push({ query, resolve })) } });
  const first = store.searchBrowser({ search: 'first' });
  await new Promise(resolve => setImmediate(resolve));
  const second = store.searchBrowser({ search: 'second' });
  await new Promise(resolve => setImmediate(resolve));
  requests[1].resolve(result([makePR(2)])); await second;
  requests[0].resolve(result([makePR(1)])); await first;
  assert.equal(store.browser.filters.search, 'second');
  assert.deepEqual(store.browser.ids, [makePR(2).url]);
  assert(!store.records.has(makePR(1).url));
});

test('refresh preserves loaded pages and retains them on failure', async () => {
  let fail = false;
  const prs = Array.from({ length: 50 }, (_, i) => makePR(i + 1));
  const store = new PRStore({ env, github: { queryGitHub: async (_query, { after }) => {
    if (fail) throw new Error('Offline');
    return after ? result(prs.slice(25), 50) : result(prs.slice(0, 25), 50, 'next');
  } } });
  await store.searchBrowser({}); await store.loadMore(); await store.refreshBrowser();
  assert.equal(store.browser.ids.length, 50);
  fail = true; await store.refreshBrowser();
  assert.equal(store.browser.ids.length, 50);
  assert.equal(store.browser.error, 'Offline');
  assert.equal(store.browser.loading, false);
});

test('historical discoveries never become new team notifications on a later poll', async () => {
  let team = [makePR(1)];
  const store = new PRStore({ env, now: () => now, github: {
    queryGitHubTeam: members,
    queryGitHub: async query => result(query.includes('author:teammate') ? team : []),
  } });
  const alerts = []; store.on('notification', event => alerts.push(event));
  await store.poll();
  team = [makePR(2, { createdAt: new Date(now - 3600000).toISOString() })];
  await store.poll();
  assert.deepEqual(alerts, []);
  team = [makePR(3, { createdAt: new Date(now + 1000).toISOString() })];
  await store.poll(); await store.poll();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].title, 'New Team PR');
});

test('browser refresh does not consume or generate notification transitions', async () => {
  const checks = state => ({ nodes: [{ commit: { statusCheckRollup: { state, contexts: { pageInfo: { hasNextPage: false }, nodes: [{ context: 'policy-bot: main', state }] } } } }] });
  let current = makePR(1, { commits: checks('PENDING') });
  const store = new PRStore({ env, github: { queryGitHubTeam: members, queryGitHub: async query => result(query.includes('author:me') ? [current] : []) } });
  const alerts = []; store.on('notification', event => alerts.push(event));
  await store.poll();
  current = makePR(1, { commits: checks('SUCCESS') });
  await store.searchBrowser({});
  assert.deepEqual(alerts, []);
  await store.poll();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].title, 'PR approved');
});

test('CI notifications ignore superseded failures but report a newly failing workflow', async () => {
  const check = (runNumber, conclusion) => ({ name: 'Lint', status: 'COMPLETED', conclusion,
    checkSuite: { app: { id: 'actions' }, workflowRun: { runNumber, workflow: { id: 'lint' } } },
  });
  let current = makePR(1, { commits: { nodes: [{ commit: { statusCheckRollup: {
    state: 'SUCCESS', contexts: { pageInfo: { hasNextPage: false }, nodes: [check(2, 'SUCCESS')] },
  } } }] } });
  const store = new PRStore({ env, github: { queryGitHubTeam: members, queryGitHub: async query => result(query.includes('author:me') ? [current] : []) } });
  const alerts = []; store.on('notification', event => alerts.push(event));
  await store.poll();
  current = structuredClone(current);
  const rollup = current.commits.nodes[0].commit.statusCheckRollup;
  rollup.state = 'FAILURE'; rollup.contexts.nodes.push(check(1, 'FAILURE'));
  await store.poll();
  assert.deepEqual(alerts, []);
  current = structuredClone(current);
  current.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.push(check(3, 'FAILURE'));
  await store.poll();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].title, 'CI Failed');
});

test('only known HTTP links can be opened from the window', () => {
  const store = new PRStore({ env, github: {} });
  store.saveRecords([makePR(1)]);
  assert(store.canOpenURL(makePR(1).url));
  assert(!store.canOpenURL('https://unrelated.example'));
  assert(!store.canOpenURL('file:///etc/passwd'));
  assert(!store.canOpenURL('javascript:alert(1)'));
});

test('bad pagination leaves previous results available and cannot loop', async () => {
  let calls = 0;
  const prs = Array.from({ length: 25 }, (_, i) => makePR(i + 1));
  const store = new PRStore({ env, github: { queryGitHub: async () => { calls++; return result(prs, 50, 'same'); } } });
  await store.searchBrowser({});
  await store.loadMore();
  assert.equal(calls, 2);
  assert.equal(store.browser.ids.length, 25);
  assert.match(store.browser.error, /next page/);
});

test('background refresh does not interrupt an in-progress window search', async () => {
  let resolveSearch;
  const store = new PRStore({ env, github: {
    queryGitHubTeam: members,
    queryGitHub: async (_query, { first }) => first === 10 ? result([]) : new Promise(resolve => { resolveSearch = resolve; }),
  } });
  store.browserActive = true;
  const search = store.searchBrowser({});
  await new Promise(resolve => setImmediate(resolve));
  const generation = store.browserGeneration;
  await store.refresh({ automatic: true });
  assert.equal(store.browserGeneration, generation);
  resolveSearch(result([makePR(1)]));
  await search;
  assert.equal(store.browser.ids.length, 1);
});

test('an open window discovers new PRs within 30 seconds independently of the tray interval', async context => {
  context.mock.timers.enable({ apis: ['setInterval'] });
  let prs = [makePR(1)];
  const alerts = [];
  const store = new PRStore({ env: { ...env, REFRESH_INTERVAL: '300' }, github: {
    queryGitHubTeam: members,
    queryGitHub: async () => result(prs),
  } });
  context.after(() => store.stop());
  store.on('notification', event => alerts.push(event));
  store.browserActive = true;
  await store.searchBrowser({});
  store.start(); await new Promise(resolve => setImmediate(resolve));
  prs = [makePR(2), makePR(1)];
  context.mock.timers.tick(30000);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(store.browser.ids, [makePR(2).url, makePR(1).url]);
  assert.deepEqual(store.tray.mine.ids, [makePR(1).url]);
  assert.deepEqual(alerts, []);
  store.browserActive = false;
  prs = [makePR(3)];
  context.mock.timers.tick(30000);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(store.browser.ids, [makePR(2).url, makePR(1).url]);
});

function mergeFixture() {
  const pr = makePR(1, {
    id: 'PR_1', state: 'OPEN', headRefOid: 'a'.repeat(40), author: { login: 'me' },
    repository: { name: 'repo', nameWithOwner: 'org/repo', viewerPermission: 'WRITE', mergeCommitAllowed: true, squashMergeAllowed: true, rebaseMergeAllowed: false },
  });
  const calls = [];
  const store = new PRStore({ env, github: {
    getPullRequest: async () => pr,
    mergePullRequest: async request => { calls.push(request); },
    queryGitHubTeam: members,
    // Simulate GitHub search indexing lag after a merge.
    queryGitHub: async query => result(query.includes('author:me') ? [pr] : []),
  } });
  store.browserActive = true;
  store.saveRecords([pr]);
  store.browser.ids = [pr.url]; store.browser.total = 1;
  store.tray.mine.ids = [pr.url]; store.tray.mine.total = 1;
  return { store, pr, calls, request: { url: pr.url, headRefOid: pr.headRefOid, method: 'SQUASH' } };
}

test('confirmed merge removes the PR from both views even when search still returns it', async () => {
  const { store, pr, calls, request } = mergeFixture();
  assert.deepEqual(store.getBrowserSnapshot().prs[0].mergeMethods, ['MERGE', 'SQUASH']);
  const result = await store.mergePR(request, async (current, method) => {
    assert.equal(current.id, pr.id); assert.equal(method, 'SQUASH'); return true;
  });
  assert.deepEqual(result, { merged: true });
  assert.deepEqual(calls, [{ id: pr.id, headRefOid: pr.headRefOid, method: 'SQUASH' }]);
  assert.equal(store.getBrowserSnapshot().prs.length, 0);
  assert.equal(store.getTraySnapshot().mine.prs.length, 0);
  assert.equal(store.browser.total, 0);
  assert.equal(store.records.has(pr.url), false);
});

test('cancelling a merge sends no mutation and keeps the PR available', async () => {
  const { store, pr, calls, request } = mergeFixture();
  assert.deepEqual(await store.mergePR(request, async () => false), { merged: false });
  assert.deepEqual(calls, []);
  assert.equal(store.getBrowserSnapshot().prs[0].url, pr.url);
  assert.equal(store.mergingURLs.size, 0);
});

test('Team PRs and unknown PRs cannot be merged through IPC', async () => {
  const { store, calls, request } = mergeFixture();
  await assert.rejects(store.mergePR({ ...request, url: 'https://unknown.example' }, async () => true), /Select a ready PR/);
  store.browser.filters.scope = 'team';
  assert.deepEqual(store.getBrowserSnapshot().prs[0].mergeMethods, []);
  await assert.rejects(store.mergePR(request, async () => true), /My PRs/);
  assert.deepEqual(calls, []);
});

for (const [name, change] of [
  ['someone else’s PR', { author: { login: 'teammate' } }],
  ['closed PR', { state: 'CLOSED' }],
  ['draft', { isDraft: true }],
  ['outdated branch', { mergeStateStatus: 'BEHIND' }],
  ['requested changes', { reviewDecision: 'CHANGES_REQUESTED' }],
  ['incomplete checks', { commits: { nodes: [] } }],
  ['read-only permission', { repository: { viewerPermission: 'READ', squashMergeAllowed: true } }],
  ['disabled method', { repository: { viewerPermission: 'WRITE', mergeCommitAllowed: true, squashMergeAllowed: false } }],
]) {
  test(`merge recheck rejects ${name}`, async () => {
    const { store, pr, calls, request } = mergeFixture();
    store.github.getPullRequest = async () => ({ ...pr, ...change });
    let confirmed = false;
    await assert.rejects(store.mergePR(request, async () => { confirmed = true; return true; }), /no longer ready/);
    assert.equal(confirmed, false); assert.deepEqual(calls, []);
  });
}

test('a changed head or target branch invalidates the selected PR before and after confirmation', async () => {
  for (const change of [{ headRefOid: 'b'.repeat(40) }, { baseRefName: 'release' }]) {
    for (const duringConfirmation of [false, true]) {
      const { store, pr, calls, request } = mergeFixture();
      let current = duringConfirmation ? pr : { ...pr, ...change };
      store.github.getPullRequest = async () => current;
      await assert.rejects(store.mergePR(request, async () => { current = { ...pr, ...change }; return true; }), /PR has changed/);
      assert.deepEqual(calls, []);
    }
  }
  const { store, request } = mergeFixture();
  await assert.rejects(store.mergePR({ ...request, headRefOid: 'old' }, async () => true), /PR has changed/);
});

test('concurrent merge requests cannot submit duplicate mutations', async () => {
  const { store, calls, request } = mergeFixture();
  let confirm;
  const first = store.mergePR(request, () => new Promise(resolve => { confirm = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(store.mergePR(request, async () => true), /already in progress/);
  confirm(true); await first;
  assert.equal(calls.length, 1);
});

test('GitHub merge rejection retains the PR and releases the pending action', async () => {
  const { store, pr, request } = mergeFixture();
  store.github.mergePullRequest = async () => { throw new Error('Required check has not succeeded.'); };
  await assert.rejects(store.mergePR(request, async () => true), /Required check/);
  assert.equal(store.getBrowserSnapshot().prs[0].url, pr.url);
  assert.equal(store.mergingURLs.size, 0);
  assert.equal(store.mergedURLs.size, 0);
});
