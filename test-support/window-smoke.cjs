const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, screen, nativeTheme } = require('electron');
const { PRStore } = require('../prStore');
const { createWindowController } = require('../window');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gasmask-window-test-'));
app.setPath('userData', directory);
app.setName('GasMask Window Test');
app.commandLine.appendSwitch('disable-background-networking');
nativeTheme.themeSource = 'light';
const now = Date.now();
const titles = [
  'Add deployment health checks for background workers',
  'Update dependency versions across service templates',
  'Protect application resources during cluster upgrades',
  'Consolidate environment configuration defaults',
  'Improve build cache handling for shared packages',
  'Document the service ownership handover process',
  'Reduce retry delays for scheduled maintenance jobs',
  'Prepare the next release of the deployment tooling',
];
function fixture(i, mine) {
  const variant = i % 8;
  const policy = [0, 5, 7].includes(variant) ? 'PENDING' : 'SUCCESS';
  const check = variant === 1 ? 'FAILURE' : 'SUCCESS';
  const organization = i % 4 === 0 ? 'tools' : 'platform';
  const repository = organization === 'tools' ? (i % 8 === 0 ? 'cli' : 'services') : ['services', 'infrastructure', 'configuration'][i % 3];
  const number = (mine ? 4100 : 5100) + i;
  return {
    id: `PR_${number}`, state: 'OPEN', headRefOid: number.toString(16).padStart(40, '0'),
    number, title: titles[variant], url: `https://github.example/${organization}/${repository}/pull/${number}`,
    repository: { name: repository, nameWithOwner: `${organization}/${repository}`, viewerPermission: 'WRITE', mergeCommitAllowed: true, squashMergeAllowed: true, rebaseMergeAllowed: false }, author: { login: mine ? 'me' : i % 2 ? 'sam' : 'taylor' },
    createdAt: new Date(now - (i + 2) * 86400000).toISOString(), updatedAt: new Date(now - (i + 1) * 1800000).toISOString(),
    isDraft: variant === 7, baseRefName: 'main', reviewDecision: variant === 5 ? 'CHANGES_REQUESTED' : null,
    mergeable: variant === 3 ? 'CONFLICTING' : 'MERGEABLE', mergeStateStatus: variant === 2 ? 'BEHIND' : variant === 3 ? 'DIRTY' : policy === 'PENDING' || check === 'FAILURE' ? 'BLOCKED' : 'CLEAN',
    latestOpinionatedReviews: { nodes: policy === 'SUCCESS' ? [{ state: 'APPROVED', author: { login: 'alex' } }] : [] },
    commits: { nodes: [{ commit: { statusCheckRollup: {
      state: check === 'FAILURE' || variant === 4 ? 'FAILURE' : policy,
      contexts: { pageInfo: { hasNextPage: false }, nodes: [
        ...(variant === 6 ? [] : [{ context: 'policy-bot: main', state: policy, description: policy === 'SUCCESS' ? 'All rules are approved' : '0/1 rules approved' }]),
        ...(variant === 4 ? [{ name: 'Build and unit tests', status: 'COMPLETED', conclusion: 'FAILURE', checkSuite: { app: { id: 'actions' }, workflowRun: { runNumber: 1, workflow: { id: 'build' } } } }] : []),
        { name: 'Build and unit tests', status: 'COMPLETED', conclusion: check, detailsUrl: 'https://github.example/platform/services/actions/runs/123', checkSuite: { app: { id: 'actions' }, workflowRun: { runNumber: 2, workflow: { id: 'build' } } } },
        { name: 'Configuration validation', status: 'COMPLETED', conclusion: 'SUCCESS' },
      ] },
    } } }] },
  };
}
const mine = Array.from({ length: 70 }, (_, i) => fixture(i, true));
const team = Array.from({ length: 70 }, (_, i) => fixture(i, false));
let offline = false;
const queries = [];
const merged = new Set();
const mergeCalls = [];
const confirmations = [];
let confirmResponse = 0;
let rejectMerge = false;
const github = {
  getPullRequest: async id => [...mine, ...team].find(pr => pr.id === id),
  mergePullRequest: async request => {
    mergeCalls.push(request);
    await wait(100);
    if (rejectMerge) throw new Error('A required check is now pending.');
    merged.add(request.id);
  },
  queryGitHubTeam: async () => [{ login: 'me' }, { login: 'sam' }, { login: 'taylor' }],
  queryGitHub: async (query, { first, after }) => {
    queries.push(query);
    if (offline) throw new Error('Test connection is offline.');
    let prs = (query.includes('author:me') ? mine : team).filter(pr => !merged.has(pr.id));
    if (query.includes('draft:false')) prs = prs.filter(pr => !pr.isDraft);
    const repo = query.match(/repo:([\w./-]+)/)?.[1];
    if (repo) prs = prs.filter(pr => pr.repository.nameWithOwner === repo);
    const organization = query.match(/org:([\w-]+)/)?.[1];
    if (organization) prs = prs.filter(pr => pr.repository.nameWithOwner.split('/')[0] === organization);
    const older = query.match(/created:<([^ ]+)/)?.[1];
    if (older) prs = prs.filter(pr => new Date(pr.createdAt) < new Date(older));
    const recent = query.match(/created:>=([^ ]+)/)?.[1];
    if (recent) prs = prs.filter(pr => new Date(pr.createdAt) >= new Date(recent));
    const search = query.match(/("(?:[^"\\]|\\.)*") in:title/)?.[1];
    if (search) prs = prs.filter(pr => pr.title.toLowerCase().includes(JSON.parse(search).toLowerCase()));
    const index = Number(after) || 0;
    const next = index + first;
    return { data: { search: { issueCount: prs.length, edges: prs.slice(index, next).map(node => ({ node })), pageInfo: { hasNextPage: next < prs.length, endCursor: next < prs.length ? String(next) : null } } } };
  },
};
let controller;
let window;
const errors = [];
const opened = [];
const alerts = [];
const store = new PRStore({ github, env: { GH_USER: 'me', GH_TEAMS: 'platform/team', MAX_PR_AGE_DAYS: '14' } });
store.on('notification', event => alerts.push(event));
app.on('web-contents-created', (_event, contents) => {
  contents.on('preload-error', (_event, _path, error) => errors.push(error.message));
  contents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
  contents.on('render-process-gone', (_event, details) => errors.push(details.reason));
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { if (await predicate()) return; await wait(30); }
  throw new Error(`Timed out: ${label}`);
}
const evaluate = source => window.webContents.executeJavaScript(source, true);
const idle = async () => { await wait(60); await until(() => !store.browser.loading && !store.browser.loadingMore, 'PR data'); };
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const changeFilter = async (id, value) => {
  await evaluate(`{
    const field = document.getElementById(${JSON.stringify(id)});
    field.value = ${JSON.stringify(value)};
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new Event('change'));
  }`);
  await idle();
};
const choices = id => evaluate(`[...document.getElementById(${JSON.stringify(id)}).options].map(option => option.value)`);

app.whenReady().then(async () => {
  try {
    controller = createWindowController({ app, BrowserWindow, ipcMain, screen, store,
      shell: { openExternal: async url => { opened.push(url); } },
      dialog: { showMessageBox: async (_window, options) => { confirmations.push(options); return { response: confirmResponse }; } },
    });
    window = controller.open();
    window.webContents.setBackgroundThrottling(false);
    await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
    await until(() => evaluate('Boolean(window.gasmask && document.querySelector("#pr-rows .pr-row"))'), 'renderer and preload');
    await idle();
    assert.equal(store.browser.ids.length, 25);
    assert.equal(await evaluate('document.querySelectorAll("#pr-rows .pr-row").length'), 25);
    assert.match(await evaluate('document.querySelector("#result-count").textContent'), /25 of 70/);
    assert.equal(await evaluate('document.querySelector("#repository").disabled'), true);
    assert.deepEqual(await choices('organizations'), ['platform', 'tools']);
    await click('#load-more'); await idle();
    await until(() => evaluate('document.querySelectorAll("#pr-rows .pr-row").length === 50'), 'second page');
    app.focus({ steal: true });
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const position = await evaluate(`(() => { const rect = document.querySelector('#pr-rows .pr-row').getBoundingClientRect(); return { x: Math.round(rect.left + 40), y: Math.round(rect.top + 25) }; })()`);
    for (const clickCount of [1, 2]) {
      window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount, ...position });
      window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount, ...position });
      await wait(60);
    }
    await until(() => evaluate('!document.querySelector("#detail-panel").hidden'), 'details panel');
    const selectedURL = await evaluate('document.querySelector(".pr-row.selected").dataset.url');
    await until(() => opened.length === 1, 'double-click opens GitHub');
    assert.equal(opened[0], selectedURL);
    await click('#open-pr');
    await until(() => opened.length === 2, 'browser link');
    assert.equal(opened[1], selectedURL);
    await click('#refresh'); await idle();
    assert.equal(store.browser.ids.length, 50);
    assert.equal(await evaluate('document.querySelector(".pr-row.selected").dataset.url'), selectedURL);

    offline = true;
    await click('#refresh'); await idle();
    assert.equal(store.browser.ids.length, 50);
    await until(() => evaluate('!document.querySelector("#error").hidden'), 'error banner');
    offline = false;
    await click('#retry'); await idle();

    assert.equal(await evaluate('Boolean(document.querySelector("#merge-pr"))'), true);
    assert.equal(await evaluate('document.querySelector(".pr-row.selected td:nth-child(3)").textContent'), 'Passed');
    assert.equal(await evaluate('[...document.querySelectorAll(".check-result")].some(item => item.textContent === "Failure")'), false);
    assert.deepEqual(await choices('merge-method'), ['MERGE', 'SQUASH']);
    await evaluate('document.querySelector("#merge-method").value = "SQUASH"');
    const mergeScreenshot = path.join(directory, 'window-merge.png');
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.writeFileSync(mergeScreenshot, (await window.webContents.capturePage()).toPNG());
    await click('#merge-pr');
    await until(() => confirmations.length === 1, 'merge confirmation');
    await until(() => evaluate('!document.querySelector("#merge-pr").disabled'), 'cancelled merge');
    assert.equal(await evaluate('document.querySelector("#merge-method").value'), 'SQUASH');
    assert.equal(mergeCalls.length, 0);
    assert.match(confirmations[0].detail, /Target branch: main\nMethod: Squash and merge/);
    assert.equal(confirmations[0].defaultId, 0);
    assert(store.records.has(selectedURL));

    confirmResponse = 1; rejectMerge = true;
    await click('#merge-pr');
    await until(() => evaluate('document.querySelector("#merge-pr").disabled'), 'pending merge');
    await until(() => evaluate('document.querySelector("#error-text").textContent.includes("required check")'), 'merge rejection');
    assert(store.records.has(selectedURL));
    rejectMerge = false;
    await evaluate('document.querySelector("#merge-method").value = "SQUASH"');
    await click('#merge-pr');
    await until(() => evaluate('!document.querySelector("#notice").hidden'), 'successful merge');
    await idle();
    assert.equal(mergeCalls.length, 2);
    assert.equal(mergeCalls.at(-1).method, 'SQUASH');
    assert.equal(mergeCalls.at(-1).headRefOid, mine.find(pr => pr.url === selectedURL).headRefOid);
    assert(!store.records.has(selectedURL));
    assert(!store.browser.ids.includes(selectedURL));
    assert(!store.tray.mine.ids.includes(selectedURL));
    assert.equal(await evaluate('document.querySelector("#detail-panel").hidden'), true);
    await click('[data-readiness="review"]'); await click('#pr-rows .pr-row');
    assert.equal(await evaluate('Boolean(document.querySelector("#merge-pr"))'), false);
    await click('[data-readiness="all"]');

    await changeFilter('organization', 'tools');
    assert.equal(store.browser.filters.scope, 'mine');
    assert(store.browser.total > 0);
    assert(store.getBrowserSnapshot().prs.every(pr => pr.repository.nameWithOwner.startsWith('tools/')));
    await changeFilter('repository', 'cli');
    assert(store.browser.total > 0);
    assert(store.getBrowserSnapshot().prs.every(pr => pr.repository.nameWithOwner === 'tools/cli'));

    await click('[data-scope="team"]'); await idle();
    await until(() => evaluate('document.querySelector("#view-title").textContent === "Team PRs"'), 'team view');
    assert.equal(store.browser.filters.scope, 'team');
    await click('[data-readiness="ready"]'); await click('#pr-rows .pr-row');
    assert.equal(await evaluate('Boolean(document.querySelector("#merge-pr"))'), false);
    await click('[data-readiness="all"]');
    assert.equal(await evaluate('[...document.querySelectorAll(".group-row")].at(-1).textContent.startsWith("Ready to merge")'), true);
    await click('#pr-rows .pr-row');
    app.focus({ steal: true });
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const screenshot = path.join(directory, 'window.png');
    fs.writeFileSync(screenshot, (await window.webContents.capturePage()).toPNG());
    window.setSize(1000, 620);
    await until(() => evaluate('window.innerWidth === 1000'), 'minimum window size');
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    assert.equal(await evaluate(`[...document.querySelectorAll('#filters input, #filters select, #clear-filters')]
      .filter(field => field.getClientRects().length).every(field => {
        const rect = field.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= window.innerWidth && rect.width >= 30;
      })`), true);
    assert.equal(await evaluate('document.querySelector("#list-scroll").clientHeight >= 150'), true);
    const compactScreenshot = path.join(directory, 'window-compact.png');
    fs.writeFileSync(compactScreenshot, (await window.webContents.capturePage()).toPNG());
    window.setSize(1280, 820);

    await changeFilter('organization', 'platform');
    assert.equal(store.browser.filters.organization, 'platform');
    assert.equal(store.browser.filters.repository, '');
    assert(queries.at(-1).includes('org:platform'));
    assert(store.browser.total > 0);
    assert(store.getBrowserSnapshot().prs.every(pr => pr.repository.nameWithOwner.startsWith('platform/')));
    assert.deepEqual(await choices('repositories'), ['configuration', 'infrastructure', 'services']);
    await changeFilter('repository', 'services');
    assert.equal(store.browser.filters.repository, 'services');
    assert(store.browser.total > 0);
    assert(store.getBrowserSnapshot().prs.every(pr => pr.repository.nameWithOwner === 'platform/services'));
    await evaluate('document.querySelector("#age").value = "older"; document.querySelector("#age").dispatchEvent(new Event("change"))');
    await idle();
    assert(queries.at(-1).includes('created:<'));
    await changeFilter('organization', 'tools');
    assert.equal(store.browser.filters.repository, '');
    assert.equal(store.browser.filters.age, 'older');
    assert.equal(await evaluate('document.querySelector("#repository").value'), '');
    assert.deepEqual(await choices('repositories'), ['cli', 'services']);
    assert(store.browser.total > 0);
    assert(store.getBrowserSnapshot().prs.every(pr => pr.repository.nameWithOwner.startsWith('tools/')));
    await changeFilter('repository', 'cli');
    await changeFilter('organization', '');
    assert.equal(store.browser.filters.repository, '');
    assert.equal(await evaluate('document.querySelector("#repository").disabled'), true);
    assert.deepEqual(await choices('repositories'), []);
    assert(!queries.at(-1).includes('org:') && !queries.at(-1).includes('repo:'));
    await changeFilter('organization', 'not-loaded-yet');
    await changeFilter('repository', 'new-repo');
    assert(queries.at(-1).includes('repo:not-loaded-yet/new-repo'));
    assert.equal(store.browser.error, null);
    await click('#clear-filters'); await idle();
    await evaluate('document.querySelector("#search").value = "deployment"; document.querySelector("#filters").dispatchEvent(new Event("submit", {cancelable:true}))');
    await idle();
    assert(store.getBrowserSnapshot().prs.every(pr => /deployment/i.test(pr.title)));
    await click('#clear-filters'); await idle();
    await evaluate('document.querySelector("#pr-rows .pr-row").focus(); document.querySelector("#pr-rows .pr-row").dispatchEvent(new KeyboardEvent("keydown", {key:"ArrowDown", bubbles:true}))');
    assert.equal(await evaluate('document.activeElement.classList.contains("selected")'), true);
    await click('[data-readiness="ready"]');
    assert.equal(await evaluate('[...document.querySelectorAll(".group-row")].every(row => row.textContent.startsWith("Ready to merge"))'), true);
    assert.equal(await evaluate('[...document.querySelectorAll(".pr-row")].filter(row => row.tabIndex === 0).length'), 1);
    controller.open({ scope: 'team' }); await idle();
    assert.equal(await evaluate('document.querySelector("[data-readiness=all]").getAttribute("aria-pressed")'), 'true');

    assert.equal(await evaluate('typeof require'), 'undefined');
    assert.equal(await evaluate('typeof process'), 'undefined');
    assert.match(await evaluate('window.gasmask.openURL("file:///etc/passwd").catch(error => error.message)'), /not part/);
    const bad = { ...team[0], title: '<img src=x onerror="window.untrustedRan=true">' };
    store.saveRecords([bad]); store.changed();
    await wait(100);
    assert.equal(await evaluate('Boolean(window.untrustedRan)'), false);
    assert.equal(await evaluate('document.querySelectorAll("#pr-rows img").length'), 0);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
    assert.deepEqual(alerts, []);
    assert.deepEqual(errors, []);

    // Discover new PRs after the window has already loaded, including a missed push event.
    controller.open({ scope: 'mine' }); await idle();
    const previousState = await evaluate('window.gasmask.getState()');
    const manualPR = { ...fixture(96, true), title: 'New PR discovered by manual refresh', createdAt: new Date().toISOString() };
    mine.unshift(manualPR);
    const sendDescriptor = Object.getOwnPropertyDescriptor(window.webContents, 'send');
    const send = window.webContents.send.bind(window.webContents);
    let droppedUpdates = 0;
    Object.defineProperty(window.webContents, 'send', { configurable: true, value: (channel, ...args) => {
      if (channel === 'gasmask:state') droppedUpdates++;
      else send(channel, ...args);
    } });
    try {
      await click('#refresh'); await idle();
      await until(() => evaluate(`Boolean(document.querySelector('[data-url="${manualPR.url}"]'))`), 'new PR rendered from refresh reply');
    } finally {
      if (sendDescriptor) Object.defineProperty(window.webContents, 'send', sendDescriptor);
      else delete window.webContents.send;
    }
    assert(droppedUpdates > 0);
    send('gasmask:state', previousState);
    await wait(100);
    assert.equal(await evaluate(`Boolean(document.querySelector('[data-url="${manualPR.url}"]'))`), true);

    const focusPR = { ...fixture(98, true), title: 'New PR discovered on return', createdAt: new Date().toISOString() };
    mine.unshift(focusPR);
    window.emit('focus'); await idle();
    await until(() => evaluate(`Boolean(document.querySelector('[data-url="${focusPR.url}"]'))`), 'new PR after refocus');
    const reloadPR = { ...fixture(100, true), title: 'New PR discovered after reload', createdAt: new Date().toISOString() };
    mine.unshift(reloadPR);
    window.webContents.reload();
    await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
    await idle();
    await until(() => evaluate(`Boolean(document.querySelector('[data-url="${reloadPR.url}"]'))`), 'new PR after renderer reload');

    controller.open({ scope: 'team' }); await idle();
    await changeFilter('organization', 'tools');
    await changeFilter('repository', 'cli');
    await click('#pr-rows .pr-row'); await wait(100);
    window.close();
    assert.equal(window.isDestroyed(), false);
    assert.equal(window.isVisible(), false);
    assert.equal(store.browserActive, false);
    const hiddenPR = { ...fixture(104, false), title: 'New PR discovered after reopening', createdAt: new Date().toISOString() };
    team.unshift(hiddenPR);
    assert.equal(controller.open(), window);
    await idle();
    await until(() => evaluate(`Boolean(document.querySelector('[data-url="${hiddenPR.url}"]'))`), 'new PR after reopen');
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    assert.equal(await evaluate('document.querySelector("#organization").value'), 'tools');
    assert.equal(await evaluate('document.querySelector("#repository").value'), 'cli');
    const preferences = JSON.parse(fs.readFileSync(path.join(directory, 'window-preferences.json'), 'utf8'));
    assert.equal(preferences.filters.scope, 'team');
    assert.equal(preferences.filters.organization, 'tools');
    assert.equal(preferences.filters.repository, 'cli');
    assert(preferences.bounds.width >= 1000);
    assert.deepEqual(errors, []);
    console.log('PASS: Electron window, pagination, filters, details, double-click, merge flows, new PRs on refresh/focus/reload/reopen, stale event protection, and renderer isolation');
    console.log(`SCREENSHOT=${screenshot}`);
    console.log(`COMPACT_SCREENSHOT=${compactScreenshot}`);
    console.log(`MERGE_SCREENSHOT=${mergeScreenshot}`);
    controller.quit(); store.stop(); app.exit(0);
  } catch (error) {
    console.error(error.stack);
    console.error('Renderer errors:', errors);
    console.error('Refresh diagnostic:', JSON.stringify({ filters: store.browser.filters, ids: store.browser.ids,
      queries: queries.slice(-3),
      ui: await evaluate(`({ title: document.querySelector('#view-title').textContent, count: document.querySelector('#result-count').textContent,
        readiness: document.querySelector('[data-readiness][aria-pressed=true]')?.dataset.readiness, stateVersion: snapshot?.stateVersion,
        rows: [...document.querySelectorAll('.pr-row')].map(row => row.dataset.url) })`).catch(() => null),
    }));
    controller?.quit(); store.stop(); app.exit(1);
  }
});
