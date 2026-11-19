const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const prStatus = require('../prStatus');

function makePR(title, policyState = 'SUCCESS', fields = {}) {
  return {
    title, url: `https://github.example/repo/pull/${title}`,
    createdAt: new Date().toISOString(), baseRefName: 'main', isDraft: false,
    reviewDecision: null, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN',
    commits: { nodes: [{ commit: { statusCheckRollup: {
      state: policyState,
      contexts: { pageInfo: { hasNextPage: false }, nodes: [{
        context: 'policy-bot: main', state: policyState,
        description: policyState === 'SUCCESS' ? 'All rules are approved' : '0/1 rules approved',
      }] },
    } } }] },
    ...fields,
  };
}

async function startMenu(split = 'true') {
  let menu;
  let queryCount = 0;
  const opened = [];
  const errors = [];
  const timers = [];
  const data = {
    mine: [makePR('my-ready'), makePR('my-review', 'PENDING'), makePR('my-draft', 'SUCCESS', { isDraft: true })],
    team: [makePR('team-review', 'PENDING'), makePR('team-ready'), makePR('team-behind', 'SUCCESS', { mergeStateStatus: 'BEHIND' }),
      makePR('old', 'SUCCESS', { createdAt: '2000-01-01T00:00:00Z' })],
  };
  class Notification {
    on() { return this; }
    show() {}
  }
  const modules = {
    electron: {
      Menu: { buildFromTemplate: items => items }, app: { quit() {} }, Notification,
      shell: { openExternal: url => opened.push(url) },
    },
    './prStatus': prStatus,
    './github': {
      queryGitHubTeam: async () => [{ login: 'me' }, { login: 'teammate' }],
      queryGitHub: async query => {
        queryCount++;
        const prs = query.includes('author:me') ? data.mine : data.team;
        return { data: { search: { edges: prs.map(node => ({ node })) } } };
      },
    },
  };
  const context = vm.createContext({
    require: name => modules[name], module: { exports: {} },
    process: { env: { GH_USER: 'me', GH_TEAMS: 'org/team', MAX_PR_AGE_DAYS: '14', SPLIT_PRS_BY_READINESS: split } },
    console: { log() {}, error: (...args) => errors.push(args) },
    setInterval: callback => { timers.push(callback); return timers.length; },
    clearInterval() {},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../updateDisplay.js'), 'utf8'), context);
  context.module.exports.startPeriodicUpdate({ setContextMenu: items => { menu = items; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, []);
  return {
    menu: () => menu, queryCount: () => queryCount, opened, data,
    refresh: async () => { timers.at(-1)(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(errors, []); },
  };
}

test('both PR lists split by readiness and retain policy details and links', async () => {
  const app = await startMenu();
  const labels = app.menu().map(item => item.label);
  for (const label of [
    'My PRs — Ready to merge (1)', 'My PRs — Needs review (1)', 'My PRs — Drafts (1)',
    'Team PRs — Ready to merge (1)', 'Team PRs — Needs review (1)', 'Team PRs — Blocked / checking (1)',
  ]) assert(labels.includes(label), label);
  assert(!labels.some(label => label?.endsWith(' — old')));
  const pending = app.menu().find(item => item.label?.endsWith(' — my-review'));
  assert.match(pending.label, /Needs review · Policy pending/);
  assert.match(pending.toolTip, /0\/1 rules approved/);
  pending.click();
  assert.deepEqual(app.opened, [app.data.mine[1].url]);
  assert.match(app.menu().find(item => item.label?.endsWith(' — team-behind')).label, /Update branch · Policy approved/);
});

test('the menu toggle changes both lists without another GitHub request', async () => {
  const app = await startMenu();
  const queryCount = app.queryCount();
  app.menu().find(item => item.type === 'checkbox').click({ checked: false });
  assert.equal(app.menu().find(item => item.type === 'checkbox').checked, false);
  assert(app.menu().some(item => item.label === 'My PRs (3)'));
  assert(app.menu().some(item => item.label === 'Team PRs (3)'));
  assert(!app.menu().some(item => item.label?.startsWith('Team PRs —')));
  assert.match(app.menu().find(item => item.label?.endsWith(' — team-ready')).label, /Ready to merge · Policy approved/);
  app.menu().find(item => item.type === 'checkbox').click({ checked: true });
  assert(app.menu().some(item => item.label === 'Team PRs — Ready to merge (1)'));
  assert.equal(app.queryCount(), queryCount);
});

test('the environment selects the initial layout', async () => {
  const app = await startMenu('false');
  assert.equal(app.menu().find(item => item.type === 'checkbox').checked, false);
  assert(app.menu().some(item => item.label === 'My PRs (3)'));
});

test('refresh moves PRs as policy changes and handles empty lists', async () => {
  const app = await startMenu();
  app.data.mine[1] = makePR('my-review');
  app.data.team = [];
  await app.refresh();
  assert(app.menu().some(item => item.label === 'My PRs — Ready to merge (2)'));
  assert(!app.menu().some(item => item.label?.startsWith('My PRs — Needs review')));
  assert(app.menu().some(item => item.label === 'Team PRs (0)'));
});
