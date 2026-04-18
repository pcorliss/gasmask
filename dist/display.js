"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisplayManager = void 0;
const electron_1 = require("electron");
const github_service_1 = require("./github-service");
const pr_state_1 = require("./pr-state");
const config_1 = require("./config");
const renderer_1 = require("./renderer");
class DisplayManager {
    #tray;
    #github;
    #state;
    #displayIntervalId = null;
    #teamIntervalId = null;
    constructor(tray) {
        this.#tray = tray;
        this.#github = new github_service_1.GitHubService();
        this.#state = new pr_state_1.PRState();
    }
    #notify(title, body, url) {
        const notification = new electron_1.Notification({
            title,
            body,
            silent: false,
        }).on("click", () => {
            if (url)
                electron_1.shell.openExternal(url);
        });
        notification.show();
    }
    async #checkMyPRChanges(newPRs) {
        for (const pr of newPRs) {
            const previousPR = this.#state.myPRs.find((p) => p.url === pr.url);
            if (!previousPR)
                continue;
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
    async #updateMyPRs() {
        const query = `is:pr is:open author:${process.env.GH_USER}`;
        try {
            const data = await this.#github.searchPRs(query);
            const newPRs = data.data.search.edges.map((edge) => edge.node);
            console.log("My PRs:", newPRs);
            await this.#checkMyPRChanges(newPRs);
            this.#state.myPRs = newPRs;
            this.#state.setLastRefreshed();
            this.#render();
        }
        catch (error) {
            console.error("Error fetching PRs:", error);
        }
    }
    async #updateTeamPRs() {
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
        }
        catch (error) {
            console.error("Error fetching PRs:", error);
        }
        console.log("Done updating team prs");
    }
    async #updateTeamMembers() {
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
            }
            catch (error) {
                console.error("Error fetching PRs:", error);
            }
        }
    }
    #render() {
        const menu = (0, renderer_1.buildMenu)({
            myPRs: this.#state.myPRs,
            teamPRs: this.#state.teamPRs,
            lastRefreshedTime: this.#state.lastRefreshedTime,
        });
        this.#tray.setContextMenu(menu);
    }
    #refresh() {
        void this.#updateMyPRs();
        void this.#updateTeamPRs();
    }
    startPeriodicUpdate() {
        if (this.#displayIntervalId)
            clearInterval(this.#displayIntervalId);
        if (this.#teamIntervalId)
            clearInterval(this.#teamIntervalId);
        void this.#updateTeamMembers();
        this.#teamIntervalId = setInterval(() => void this.#updateTeamMembers(), config_1.CONFIG.teamRefreshIntervalMs);
        this.#refresh();
        this.#displayIntervalId = setInterval(() => this.#refresh(), config_1.CONFIG.refreshIntervalMs);
    }
    refresh() {
        this.#refresh();
    }
}
exports.DisplayManager = DisplayManager;
//# sourceMappingURL=display.js.map