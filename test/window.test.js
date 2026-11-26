const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { PRStore } = require('../prStore');
const { createWindowController } = require('../window');

const tick = () => new Promise(resolve => setImmediate(resolve));
const pr = number => ({
  number, title: `PR ${number}`, url: `https://github.example/org/repo/pull/${number}`,
  repository: { name: 'repo', nameWithOwner: 'org/repo' }, author: { login: 'me' },
  createdAt: '2026-11-20T12:00:00Z', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN',
  commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
});

async function fixture(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gasmask-window-unit-'));
  let prs = [pr(1)];
  const store = new PRStore({ env: { GH_USER: 'me' }, github: {
    queryGitHub: async () => ({ data: { search: {
      edges: prs.map(node => ({ node })), issueCount: prs.length, pageInfo: { hasNextPage: false, endCursor: null },
    } } }),
  } });
  class Window extends EventEmitter {
    constructor() {
      super(); this.visible = false; this.loading = false; this.messages = [];
      this.webContents = new EventEmitter();
      this.webContents.isLoadingMainFrame = () => this.loading;
      this.webContents.send = (channel, value) => this.messages.push({ channel, value });
      this.webContents.setWindowOpenHandler = () => {};
    }
    loadFile() { queueMicrotask(() => { this.webContents.emit('did-finish-load'); this.emit('ready-to-show'); }); }
    isVisible() { return this.visible; }
    isDestroyed() { return false; }
    isMinimized() { return false; }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    focus() { this.emit('focus'); }
    getBounds() { return { x: 0, y: 0, width: 1280, height: 820 }; }
    close() { this.emit('close', { preventDefault() {} }); }
  }
  const handlers = new Map();
  const controller = createWindowController({
    app: { getPath: () => directory }, BrowserWindow: Window, store,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
  });
  context.after(() => { controller.quit(); store.stop(); fs.rmSync(directory, { recursive: true, force: true }); });
  const window = controller.open(); await tick();
  const event = { sender: window.webContents, senderFrame: { url: pathToFileURL(path.join(__dirname, '..', 'index.html')).href } };
  return { store, window, controller, setPRs: value => { prs = value; }, invoke: channel => handlers.get(channel)(event) };
}

test('returning to an already visible window fetches newly created PRs', async context => {
  const { store, controller, setPRs } = await fixture(context);
  setPRs([pr(2), pr(1)]);
  controller.open(); await tick();
  assert.deepEqual(store.browser.ids, [pr(2).url, pr(1).url]);
});

test('refocusing and reopening the window fetch new PRs without waiting for the tray poll', async context => {
  const { store, window, controller, setPRs } = await fixture(context);
  setPRs([pr(2), pr(1)]);
  window.emit('focus'); await tick();
  assert.deepEqual(store.browser.ids, [pr(2).url, pr(1).url]);
  window.close();
  setPRs([pr(3), pr(2), pr(1)]);
  controller.open(); await tick();
  assert.deepEqual(store.browser.ids, [pr(3).url, pr(2).url, pr(1).url]);
});

test('Refresh replies with the new snapshot even when publishing is temporarily unavailable', async context => {
  const { window, setPRs, invoke } = await fixture(context);
  window.loading = true;
  window.messages.length = 0;
  setPRs([pr(2), pr(1)]);
  const reply = await invoke('gasmask:refresh');
  assert.equal(reply.ok, true);
  assert.deepEqual(window.messages, []);
  assert.deepEqual(reply.value.browser.prs.map(item => item.url), [pr(2).url, pr(1).url]);
  window.loading = false;
  window.webContents.emit('did-stop-loading');
  assert.deepEqual(window.messages.at(-1).value.browser.prs.map(item => item.url), [pr(2).url, pr(1).url]);
});
