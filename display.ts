import { Notification, shell, nativeImage } from "electron";
import { GitHubService } from "./github-service";
import type { PRNode } from "./github-service";
import { PRState } from "./pr-state";
import { CONFIG } from "./config";
import { buildMenu } from "./renderer";
import { SettingsManager, type AppSettings } from "./settings";
import * as path from "path";

const rootDir = path.join(__dirname, "..");

export class DisplayManager {
  #tray: Electron.Tray;
  #github: GitHubService;
  #state: PRState;
  #settings: SettingsManager;
  #displayIntervalId: ReturnType<typeof setInterval> | null = null;
  #teamIntervalId: ReturnType<typeof setInterval> | null = null;
  #onOpenSettings: () => void;

  constructor(tray: Electron.Tray, onOpenSettings: () => void) {
    this.#tray = tray;
    this.#onOpenSettings = onOpenSettings;
    this.#settings = new SettingsManager();
    this.#settings.applyToEnv();
    this.#github = new GitHubService();
    this.#state = new PRState();
  }

  get settings(): AppSettings {
    return this.#settings.settings;
  }

  saveSettings(settings: AppSettings): void {
    this.#settings.save(settings);
    this.#settings.applyToEnv();
  }

  #notify(title: string, body: string, url?: string): void {
    const icon = nativeImage.createFromPath(path.join(rootDir, "static", "images", "gas-mask-16.png"));
    const notification = new Notification({
      title,
      body,
      silent: false,
      icon: icon.isEmpty() ? undefined : icon,
    }).on("click", () => {
      if (url) shell.openExternal(url);
    });
    notification.show();
  }

  async #checkMyPRChanges(newPRs: PRNode[]): Promise<void> {
    for (const pr of newPRs) {
      const previousPR = this.#state.myPRs.find((p) => p.url === pr.url);
      if (!previousPR) continue;

      const previousStatus = previousPR.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null;
      const currentStatus = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null;
      if (previousStatus !== "FAILURE" && currentStatus === "FAILURE") {
        this.#notify("CI Failed", `${pr.title} CI failure.`, pr.url);
      }

      const previousApproval = previousPR.reviewDecision;
      const currentApproval = pr.reviewDecision;
      if (previousApproval !== currentApproval) {
        this.#notify(`PR ${currentApproval}`, `${pr.title} PR ${previousApproval} -> ${currentApproval}.`, pr.url);
      }
    }
  }

  async #updateMyPRs(): Promise<void> {
    const query = `is:pr is:open author:${process.env.GH_USER}`;

    try {
      const data = await this.#github.searchPRs(query);
      const newPRs = data.data.search.edges.map((edge) => edge.node);

      console.log("My PRs:", newPRs);
      await this.#checkMyPRChanges(newPRs);

      this.#state.myPRs = newPRs;
      this.#state.setLastRefreshed();
      this.#render();
    } catch (error) {
      console.error("Error fetching PRs:", error);
    }
  }

  async #updateTeamPRs(): Promise<void> {
    console.log("Team Members:", this.#state.teamMembers);

    if (this.#state.teamMembers.size === 0) {
      console.log("Done updating team prs");
      return;
    }

    const query = "is:pr is:open draft:false";
    const authorQuery = [...this.#state.teamMembers].map((member) => ` author:${member}`).join("");
    console.log("Query:", query + authorQuery);

    try {
      const data = await this.#github.searchPRs(query + authorQuery);
      const newPRs = data.data.search.edges.map((edge) => edge.node);

      for (const pr of newPRs) {
        pr.createdAtTime = new Date(pr.createdAt).getTime();
        if (!this.#state.hasSeenPR(pr.url) && !this.#state.firstRun && !this.#state.isOldTeamPR(pr)) {
          this.#notify("New Team PR", pr.title, pr.url);
        }
      }

      this.#state.firstRun = false;
      newPRs.forEach((pr) => this.#state.addSeenPR(pr.url));

      this.#state.teamPRs = newPRs;
      console.log("Team PRs:", this.#state.teamPRs);
      this.#state.setLastRefreshed();
      this.#render();
    } catch (error) {
      console.error("Error fetching PRs:", error);
    }

    console.log("Done updating team prs");
  }

  async #updateTeamMembers(): Promise<void> {
    const orgTeams = (process.env.GH_TEAMS ?? "").split(",");

    for (const orgTeam of orgTeams) {
      const [org, team] = orgTeam.split("/");

      try {
        const data = await this.#github.getTeamMembers(org, team);
        console.log("Adding Team Members:", data);

        data.forEach((member) => {
          this.#state.addTeamMember(member.login);
        });

        console.log("Team Member Set:", this.#state.teamMembers);
        this.#state.removeTeamMember(process.env.GH_USER ?? "");
        console.log("Team After Filtering:", this.#state.teamMembers);
        this.#refresh();
      } catch (error) {
        console.error("Error fetching PRs:", error);
      }
    }
  }

  #render(): void {
    const menu = buildMenu({
      myPRs: this.#state.myPRs,
      teamPRs: this.#state.teamPRs,
      lastRefreshedTime: this.#state.lastRefreshedTime,
    }, this.#onOpenSettings);
    this.#tray.setContextMenu(menu);
  }

  #refresh(): void {
    void this.#updateMyPRs();
    void this.#updateTeamPRs();
  }

  startPeriodicUpdate(): void {
    if (this.#displayIntervalId) clearInterval(this.#displayIntervalId);
    if (this.#teamIntervalId) clearInterval(this.#teamIntervalId);

    void this.#updateTeamMembers();
    this.#teamIntervalId = setInterval(() => void this.#updateTeamMembers(), CONFIG.teamRefreshIntervalMs);

    this.#refresh();
    this.#displayIntervalId = setInterval(() => this.#refresh(), CONFIG.refreshIntervalMs);
  }

  refresh(): void {
    this.#refresh();
  }
}