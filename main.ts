import * as path from "path";
import { app, nativeImage, Tray, BrowserWindow, ipcMain } from "electron";
import { DisplayManager } from "./display";
import { type AppSettings, SettingsManager } from "./settings";

const rootDir = path.join(__dirname, "..");

let displayManager: DisplayManager;
let settingsWindow: BrowserWindow | null = null;
let settingsManager: SettingsManager;

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 450,
    height: 500,
    resizable: false,
    title: "GasMask Settings",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  settingsWindow.loadFile(path.join(rootDir, "settings.html"));

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

ipcMain.handle("get-settings", () => {
  return displayManager?.settings ?? {};
});

ipcMain.handle("save-settings", (_event, settings: AppSettings) => {
  if (displayManager) {
    displayManager.saveSettings(settings);
  }
});

if (process.env.NODE_ENV === "development") {
  console.log("Auto-reload enabled");
  require("electron-reload")(rootDir, {
    electron: path.join(rootDir, "node_modules", ".bin", "electron"),
    awaitWriteFinish: true,
  });
} else {
  console.log("Auto-reload disabled");
}

app.whenReady().then(() => {
  settingsManager = new SettingsManager();
  settingsManager.applyToEnv();

  const icon = nativeImage.createFromPath(path.join(rootDir, "static", "images", "gas-mask-16.png"));
  const tray = new Tray(icon);

  (tray as Tray & { refresh: () => void }).refresh = () => displayManager.refresh();

  tray.setToolTip("GasMask - PR Monitor");
  app.dock?.hide();

  displayManager = new DisplayManager(tray, openSettingsWindow);
  displayManager.startPeriodicUpdate();
});