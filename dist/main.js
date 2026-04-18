"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const electron_1 = require("electron");
const display_1 = require("./display");
const rootDir = path.join(__dirname, "..");
if (process.env.NODE_ENV === "development") {
    console.log("Auto-reload enabled");
    require("electron-reload")(rootDir, {
        electron: path.join(rootDir, "node_modules", ".bin", "electron"),
        awaitWriteFinish: true,
    });
}
else {
    console.log("Auto-reload disabled");
}
let displayManager;
electron_1.app.whenReady().then(() => {
    const icon = electron_1.nativeImage.createFromPath(path.join(rootDir, "static", "images", "gas-mask-16.png"));
    const tray = new electron_1.Tray(icon);
    tray.refresh = () => displayManager.refresh();
    tray.setToolTip("This is my application.");
    electron_1.app.dock?.hide();
    displayManager = new display_1.DisplayManager(tray);
    displayManager.startPeriodicUpdate();
});
//# sourceMappingURL=main.js.map