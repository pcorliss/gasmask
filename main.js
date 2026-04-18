const path = require("path");
const { app, Tray, nativeImage } = require("electron/main");
const { DisplayManager } = require("./display");

if (process.env.NODE_ENV === "development") {
  console.log("Auto-reload enabled");
  require("electron-reload")(path.join(__dirname), {
    electron: path.join(__dirname, "node_modules", ".bin", "electron"),
    awaitWriteFinish: true,
  });
} else {
  console.log("Auto-reload disabled");
}

let tray;
let displayManager;

app.whenReady().then(() => {
  const icon = nativeImage.createFromPath(path.join(__dirname, "static", "images", "gas-mask-16.png"));
  tray = new Tray(icon);

  tray.setToolTip("This is my application.");
  app.dock.hide();

  tray.refresh = () => displayManager.refresh();

  displayManager = new DisplayManager(tray);
  displayManager.startPeriodicUpdate();
});