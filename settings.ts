import * as fs from "fs";
import * as path from "path";

let settingsPath: string;

export function setSettingsPath(userDataPath: string): void {
  settingsPath = path.join(userDataPath, "settings.json");
}

export interface AppSettings {
  GH_TOKEN?: string;
  GH_USER?: string;
  GH_API_URL?: string;
  GH_GRAPHQL_URL?: string;
  GH_TEAMS?: string;
  REFRESH_INTERVAL?: number;
}

const defaultSettings: AppSettings = {
  GH_API_URL: "https://api.github.com",
  GH_GRAPHQL_URL: "https://api.github.com/graphql",
  REFRESH_INTERVAL: 300,
};

export class SettingsManager {
  #settings: AppSettings;

  constructor() {
    this.#settings = this.load();
  }

  load(): AppSettings {
    try {
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, "utf8");
        return { ...defaultSettings, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
    return { ...defaultSettings };
  }

  save(settings: AppSettings): void {
    this.#settings = settings;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }

  get settings(): AppSettings {
    return this.#settings;
  }

  applyToEnv(): void {
    for (const [key, value] of Object.entries(this.#settings)) {
      if (value !== undefined && value !== "") {
        process.env[key] = String(value);
      }
    }
  }
}