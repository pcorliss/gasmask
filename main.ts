import * as path from "path";
import { app, nativeImage } from "electron";
import type { NativeImage, Tray } from "electron";
import { DisplayManager } from "./display";

if (process.env.NODE_ENV === "development") {
  console.log("Auto-reload enabled");
  require("electron-reload")(path.join(__dirname), {
    electron: path.join(__dirname, "node_modules", ".bin", "electron"),
    awaitWriteFinish: true,
  });
} else {
  console.log("Auto-reload disabled");
}

let displayManager: DisplayManager;

app.whenReady().then(() => {
  const icon = nativeImage.createFromPath(path.join(__dirname, "static", "images", "gas-mask-16.png"));
  const tray = new (app as unknown as { Tray: new (image: NativeImage) => Tray }).Tray(icon);

  (tray as Tray & { refresh: () => void }).refresh = () => displayManager.refresh();

  tray.setToolTip("This is my application.");
  app.dock?.hide();

  displayManager = new DisplayManager(tray);
  displayManager.startPeriodicUpdate();
});