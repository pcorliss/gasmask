const path = require('node:path');
const { app, Tray, nativeImage, BrowserWindow, ipcMain, shell, screen, dialog, Notification } = require('electron');
// Load configuration before creating the store or reading refresh settings.
require('dotenv').config();
const { PRStore } = require('./prStore');
const { startPeriodicUpdate } = require('./updateDisplay');
const { createWindowController } = require('./window');

if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
    awaitWriteFinish: true,
  });
}

let tray;
let store;
let windowController;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => windowController?.open());
  app.on('activate', () => { if (windowController?.getWindow()) windowController.open(); });
  app.on('window-all-closed', () => { /* The tray keeps running. */ });
  app.on('before-quit', () => { store?.stop(); windowController?.quit(); });

  app.whenReady().then(() => {
    store = new PRStore();
    windowController = createWindowController({ app, BrowserWindow, ipcMain, shell, screen, dialog, store });
    store.on('notification', ({ title, body, url }) => {
      new Notification({ title, body, silent: false })
        .on('click', () => { if (store.canOpenURL(url)) shell.openExternal(url); })
        .show();
    });
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'static', 'images', 'gas-mask-16.png')));
    tray.setToolTip('GasMask — pull requests');
    app.dock?.hide();
    startPeriodicUpdate(tray, { store, showWindow: options => windowController.open(options) });
    if (process.argv.includes('--window')) windowController.open();
  });
}
