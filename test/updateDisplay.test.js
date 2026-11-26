const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const prStatus = require('../prStatus');
const { PRStore } = require('../prStore');

function makePR(title, policyState = 'SUCCESS', fields = {}) {
  return {
    title, url: `https://github.example/repo/pull/${title}`,
    number: 42, repository: { name: 'repo', nameWithOwner: 'team/repo' }, author: { login: 'teammate' },
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
  const windows = [];
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
    './prStore': { PRStore },
    './github': {
      queryGitHubTeam: async () => [{ login: 'me' }, { login: 'teammate' }],
      queryGitHub: async query => {
        queryCount++;
        const prs = query.includes('author:me') ? data.mine : data.team;
        return { data: { search: { edges: prs.map(node => ({ node })), issueCount: prs.length, pageInfo: { hasNextPage: false, endCursor: null } } } };
      },
    },
  };
  const context = vm.createContext({
    require: name => modules[name], module: { exports: {} },
    process: { env: { GH_USER: 'me', GH_TEAMS: 'org/team', MAX_PR_AGE_DAYS: '14', SPLIT_PRS_BY_READINESS: split } },
    console: { log() {}, error: (...args) => errors.push(args) },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../updateDisplay.js'), 'utf8'), context);
  const store = new PRStore({ github: modules['./github'], env: context.process.env });
  store.start = () => {};
  context.module.exports.startPeriodicUpdate({ setContextMenu: items => { menu = items; } }, { store, showWindow: options => windows.push(options) });
  await store.poll();
  assert.deepEqual(errors, []);
  return {
    menu: () => menu, queryCount: () => queryCount, opened, data, windows,
    refresh: async () => { await store.poll(); assert.deepEqual(errors, []); },
  };
}

test('both PR lists split by readiness and retain policy details and links', async () => {
  const app = await startMenu();
  const labels = app.menu().map(item => item.label);
  assert.deepEqual(Array.from(labels.filter(label => /^(My|Team) PRs —/.test(label))), [
    'My PRs — Ready to merge (1)', 'My PRs — Needs review (1)', 'My PRs — Drafts (1)',
    'Team PRs — Needs review (1)', 'Team PRs — Ready to merge (2)',
  ]);
  assert(!labels.some(label => label?.endsWith(': old')));
  const pending = app.menu().find(item => item.label?.endsWith(': my-review'));
  assert.equal(pending.label, '🟠 ⏳ Policy pending — repo#42: my-review');
  assert.equal(app.menu().find(item => item.label?.endsWith(': team-ready')).label, '🟢 ✅ Policy approved — repo#42: team-ready');
  assert.equal(app.menu().find(item => item.label?.endsWith(': my-draft')).label, '🟢 📝 Policy approved — repo#42: my-draft');
  assert.match(pending.toolTip, /0\/1 rules approved/);
  assert.match(pending.toolTip, /team\/repo#42/);
  assert.match(pending.toolTip, /Author: teammate/);
  pending.click();
  assert.deepEqual(app.opened, [app.data.mine[1].url]);
  assert.match(app.menu().find(item => item.label?.endsWith(': team-behind')).label, /🔄 Policy approved/);
});

test('the menu toggle changes both lists without another GitHub request', async () => {
  const app = await startMenu();
  const queryCount = app.queryCount();
  app.menu().find(item => item.type === 'checkbox').click({ checked: false });
  assert.equal(app.menu().find(item => item.type === 'checkbox').checked, false);
  assert(app.menu().some(item => item.label === 'My PRs (3)'));
  assert(app.menu().some(item => item.label === 'Team PRs (3)'));
  assert(!app.menu().some(item => item.label?.startsWith('Team PRs —')));
  assert.match(app.menu().find(item => item.label?.endsWith(': team-ready')).label, /Ready to merge · Policy approved/);
  assert.match(app.menu().find(item => item.label?.endsWith(': my-review')).label, /Needs review · Policy pending/);
  assert.match(app.menu().find(item => item.label?.endsWith(': my-draft')).label, /Draft · Policy approved/);
  const teamRows = app.menu().filter(item => /: team-/.test(item.label));
  assert.deepEqual(Array.from(teamRows, item => item.label.split(': ').at(-1)), ['team-review', 'team-ready', 'team-behind']);
  app.menu().find(item => item.type === 'checkbox').click({ checked: true });
  assert(app.menu().some(item => item.label === 'Team PRs — Ready to merge (2)'));
  assert.equal(app.menu().find(item => item.label?.endsWith(': team-ready')).label, '🟢 ✅ Policy approved — repo#42: team-ready');
  assert.equal(app.queryCount(), queryCount);
});

test('superseded workflow failures show a green ready PR in the tray', async () => {
  const app = await startMenu();
  const rollup = app.data.mine[0].commits.nodes[0].commit.statusCheckRollup;
  rollup.state = 'FAILURE';
  for (const [runNumber, conclusion] of [[1, 'FAILURE'], [2, 'SUCCESS']]) {
    rollup.contexts.nodes.push({ name: 'Lint', status: 'COMPLETED', conclusion,
      checkSuite: { app: { id: 'actions' }, workflowRun: { runNumber, workflow: { id: 'lint' } } },
    });
  }
  await app.refresh();
  assert.equal(app.menu().find(item => item.label?.endsWith(': my-ready')).label, '🟢 ✅ Policy approved — repo#42: my-ready');
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

test('Team rebase and conflict indicators persist in both layouts without changing My PR grouping', async () => {
  const app = await startMenu();
  const behind = makePR('behind', 'SUCCESS', { mergeStateStatus: 'BEHIND' });
  const conflicts = makePR('conflicts', 'SUCCESS', { mergeStateStatus: 'DIRTY', mergeable: 'CONFLICTING' });
  app.data.mine = [behind, conflicts];
  app.data.team = [behind, conflicts, makePR('needs-review', 'PENDING')];
  await app.refresh();
  assert(app.menu().some(item => item.label === 'My PRs — Blocked / checking (2)'));
  assert(!app.menu().some(item => item.label?.startsWith('My PRs — Ready to merge')));
  assert(app.menu().some(item => item.label === 'Team PRs — Ready to merge (2)'));
  const teamStart = app.menu().findIndex(item => item.label === 'Team PRs — Ready to merge (2)');
  const teamRows = app.menu().slice(teamStart).filter(item => item.toolTip);
  assert.match(teamRows[0].label, /🔄 Policy approved/);
  assert.doesNotMatch(teamRows[0].label, /Rebase needed/);
  assert.match(teamRows[0].toolTip, /🔄 Rebase needed/);
  assert.match(teamRows[1].label, /🛠️ Rebase conflicts/);
  assert.match(teamRows[1].toolTip, /🛠️ Rebase conflicts/);

  app.menu().find(item => item.type === 'checkbox').click({ checked: false });
  const flatStart = app.menu().findIndex(item => item.label === 'Team PRs (3)');
  const flatRows = app.menu().slice(flatStart).filter(item => item.toolTip);
  assert.match(flatRows[0].label, /Needs review/);
  assert.match(flatRows[1].label, /🔄 Policy approved/);
  assert.doesNotMatch(flatRows[1].label, /Rebase needed/);
  assert.match(flatRows[2].label, /🛠️ Rebase conflicts/);
});


test('tray opens the window in the requested scope', async () => {
  const app = await startMenu();
  app.menu().find(item => item.label === 'View all Team PRs…').click();
  app.menu().find(item => item.label === 'View all My PRs…').click();
  app.menu().find(item => item.label === 'Open GasMask…').click();
  assert.equal(app.windows[0].scope, 'team');
  assert.equal(app.windows[1].scope, 'mine');
  assert.equal(app.windows[2], undefined);
});
