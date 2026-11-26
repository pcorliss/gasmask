const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { normalizeFilters, DEFAULT_FILTERS } = require('./prStore');

function createWindowController({ app, BrowserWindow, ipcMain, shell, screen, dialog, store }) {
  const preferencePath = path.join(app.getPath('userData'), 'window-preferences.json');
  const pagePath = path.join(__dirname, 'index.html');
  const pageURL = pathToFileURL(pagePath).href;
  let preferences = {};
  try { preferences = JSON.parse(fs.readFileSync(preferencePath, 'utf8')); }
  catch { /* First launch has no preferences. */ }
  if (!preferences || typeof preferences !== 'object') preferences = {};
  try { preferences.filters = normalizeFilters(preferences.filters); }
  catch { preferences.filters = { ...DEFAULT_FILTERS }; }
  let window;
  let quitting = false;
  let saveTimer;
  let viewVersion = 0;
  let stateVersion = 0;

  function save() {
    try {
      fs.mkdirSync(path.dirname(preferencePath), { recursive: true });
      fs.writeFileSync(preferencePath, JSON.stringify(preferences, null, 2), { mode: 0o600 });
    } catch (error) { console.error('Could not save window preferences:', error.message); }
  }

  function state() {
    return { browser: store.getBrowserSnapshot(), view: preferences.view || { readiness: 'all', selectedURL: null }, viewVersion, stateVersion };
  }

  function publish() {
    if (window && !window.isDestroyed() && !window.webContents.isLoadingMainFrame()) window.webContents.send('gasmask:state', state());
  }
  store.on('change', () => { stateVersion++; publish(); });

  function refreshVisible() {
    if (!window || window.isDestroyed() || !window.isVisible() || window.isMinimized()) return;
    store.refreshBrowser({ automatic: true }).catch(error => console.error('Could not refresh PR view:', error.message));
  }

  function authorize(event) {
    if (!window || event.sender !== window.webContents || event.senderFrame?.url !== pageURL) throw new Error('This action is only available in the GasMask window.');
  }

  function handle(channel, action) {
    ipcMain.handle(channel, async (event, value) => {
      authorize(event);
      try { return { ok: true, value: await action(value) }; }
      catch (error) { return { ok: false, error: error.message }; }
    });
  }

  handle('gasmask:get-state', state);
  handle('gasmask:search', async value => {
    preferences.filters = normalizeFilters(value);
    save();
    await store.searchBrowser(preferences.filters);
    return state();
  });
  handle('gasmask:refresh', async () => { await store.refreshBrowser(); return state(); });
  handle('gasmask:load-more', async () => { await store.loadMore(); return state(); });
  handle('gasmask:open-url', async url => {
    if (typeof url !== 'string' || !store.canOpenURL(url)) throw new Error('This link is not part of the loaded PR results.');
    await shell.openExternal(url);
  });
  handle('gasmask:merge-pr', request => store.mergePR(request, async (pr, method) => {
    const methods = { MERGE: 'Create a merge commit', SQUASH: 'Squash and merge', REBASE: 'Rebase and merge' };
    const { response } = await dialog.showMessageBox(window, {
      type: 'question', title: 'Merge pull request',
      message: `Merge ${pr.repository.nameWithOwner}#${pr.number}?`,
      detail: `${pr.title}\n\nTarget branch: ${pr.baseRefName}\nMethod: ${methods[method]}`,
      buttons: ['Cancel', methods[method]], defaultId: 0, cancelId: 0, noLink: true,
    });
    return response === 1;
  }));
  handle('gasmask:save-view', value => {
    preferences.view = {
      readiness: ['all', 'ready', 'review', 'blocked', 'draft'].includes(value?.readiness) ? value.readiness : 'all',
      selectedURL: typeof value?.selectedURL === 'string' && store.records.has(value.selectedURL) ? value.selectedURL : null,
    };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 250);
  });

  function bounds() {
    const saved = preferences.bounds;
    const base = { width: 1280, height: 820 };
    if (!saved || !['width', 'height', 'x', 'y'].every(key => Number.isFinite(saved[key]))) return base;
    const display = screen?.getDisplayMatching(saved)?.workArea;
    if (!display) return base;
    const width = Math.min(Math.max(1000, saved.width), display.width);
    const height = Math.min(Math.max(620, saved.height), display.height);
    return { width, height, x: Math.max(display.x, Math.min(saved.x, display.x + display.width - width)), y: Math.max(display.y, Math.min(saved.y, display.y + display.height - height)) };
  }

  function open(options) {
    const alreadyVisible = window && !window.isDestroyed() && window.isVisible();
    const filters = options ? normalizeFilters({ ...DEFAULT_FILTERS, ...options }) : preferences.filters;
    if (options) {
      preferences.view = { readiness: options.readiness || 'all', selectedURL: null };
      viewVersion++;
    }
    preferences.filters = filters;
    if (!window || window.isDestroyed()) {
      window = new BrowserWindow({
        ...bounds(), minWidth: 1000, minHeight: 620,
        title: 'GasMask', backgroundColor: '#f5f7f9', show: false,
        ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => { if (url !== pageURL) event.preventDefault(); });
      window.webContents.on('did-finish-load', () => { publish(); refreshVisible(); });
      // isLoadingMainFrame can remain true during did-finish-load. Flush any skipped updates.
      window.webContents.on('did-stop-loading', publish);
      window.on('focus', refreshVisible);
      window.on('restore', refreshVisible);
      window.on('close', event => {
        preferences.bounds = window.getBounds();
        save();
        if (!quitting) {
          event.preventDefault();
          window.hide();
          store.browserActive = false;
          app.dock?.hide();
        }
      });
      for (const event of ['resize', 'move']) window.on(event, () => {
        preferences.bounds = window.getBounds();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 250);
      });
      window.once('ready-to-show', () => { app.dock?.show(); window.show(); window.focus(); });
      window.loadFile(pagePath);
    } else {
      app.dock?.show();
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
    store.browserActive = true;
    if (!alreadyVisible || options) store.searchBrowser(filters).catch(error => console.error('Could not open PR view:', error.message));
    else refreshVisible();
    return window;
  }

  return {
    open,
    getWindow: () => window,
    quit: () => { quitting = true; clearTimeout(saveTimer); save(); },
  };
}

module.exports = { createWindowController };
