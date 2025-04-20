const { Menu, app } = require('electron');

function updateDisplay(tray) {
  const lastRefreshedLabel = `Last Refreshed: ${new Date().toLocaleTimeString()}`;
  const contextMenu = Menu.buildFromTemplate([
    { label: 'GitBar', type: 'normal' },
    { label: 'Separator', type: 'separator' },
    { label: 'My PRs', type: 'normal' },
    { label: '🟢 feat(Stats): XYZ-123 Rework Stats f... ', type: 'normal' },
    { label: '❌ chore: XYZ-456 Deploy latest', type: 'normal' },
    { label: '⚠️ fix(Config): XYZ-789 Fix bug in con...', type: 'normal' },
    {
      label: 'More (3)',
      submenu: [
        { label: 'Subitem1', type: 'normal' },
        { label: 'Subitem2', type: 'checkbox' },
        { label: 'Subitem3', type: 'radio', checked: true },
      ],
    },
    { label: 'Separator', type: 'separator' },
    { label: 'Team PRs', type: 'normal' },
    { label: '🟢 feat(Stats): XYZ-123 Rework Stats f... ', type: 'normal' },
    { label: '❌ chore: XYZ-456 Deploy latest', type: 'normal' },
    { label: '⚠️ fix(Config): XYZ-789 Fix bug in con...', type: 'normal' },
    {
      label: 'More (3)',
      submenu: [
        { label: 'Subitem1', type: 'normal' },
        { label: 'Subitem2', type: 'checkbox' },
        { label: 'Subitem3', type: 'radio', checked: true },
      ],
    },
    { label: 'Separator', type: 'separator' },
    { label: 'Settings', type: 'normal' },
    { label: lastRefreshedLabel,
      type: 'normal',
      click: () => {
        console.log('Refreshing last refreshed label');
        startPeriodicUpdate(tray);
      },
     },
    {
      label: 'Notifier Button',
      type: 'normal',
      click: async () => {
        const NOTIFICATION_TITLE = 'Basic Notification';
        const NOTIFICATION_BODY = 'Notification from the Main process';

        new Notification({
          title: NOTIFICATION_TITLE,
          body: NOTIFICATION_BODY,
        }).show();
      },
    },
    { label: 'Separator', type: 'separator' },
    {
      label: 'Quit',
      type: 'normal',
      click: () => {
        console.log('Quitting application...');
        app.quit(); // Quit the application
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

function startPeriodicUpdate(tray) {
  updateDisplay(tray);
  setInterval(() => updateDisplay(tray), REFRESH_INTERVAL);
}

let updateIntervalId; // Store the interval ID globally

function startPeriodicUpdate(tray) {
  // Clear any existing interval
  if (updateIntervalId) {
    clearInterval(updateIntervalId);
  }

  // Start a new interval
  updateDisplay(tray);
  updateIntervalId = setInterval(() => updateDisplay(tray), REFRESH_INTERVAL);
}

module.exports = { startPeriodicUpdate };