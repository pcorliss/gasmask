const { Notification } = require("electron");
const { GitHubService } = require("./github-service");
const { PRState } = require("./pr-state");
const { CONFIG } = require("./config");
const { renderTaskBar } = require("./renderer");

class DisplayManager {
  #tray;
  #github;
  #state;
  #displayIntervalId = null;
  #teamIntervalId = null;

  constructor(tray) {
    this.#tray = tray;
    this.#github = new GitHubService();
    this.#state = new PRState();
  }

  #notify(title, body, url) {
    const notification = new Notification({
      title,
      body,
      silent: false,
    }).on("click", () => {
      if (url) require("electron").shell.openExternal(url);
    });
    notification.show();
  }

  async #checkMyPRChanges(newPRs) {
    newPRs.forEach((pr) => {
      const previousPR = this.#state.myPRs.find((p) => p.url === pr.url);
      if (!previousPR) return;

      const previousStatus = previousPR.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
      const currentStatus = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
      if (previousStatus !== "FAILURE" && currentStatus === "FAILURE") {
        this.#notify("CI Failed", `${pr.title} CI failure.`, pr.url);
      }

      const previousApproval = previousPR.reviewDecision;
      const currentApproval = pr.reviewDecision;
      if (previousApproval !== currentApproval) {
        this.#notify(`PR ${currentApproval}`, `${pr.title} PR ${previousApproval} -> ${currentApproval}.`, pr.url);
      }
    });
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
    } catch (error) {
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

      newPRs.forEach((pr) => {
        pr.createdAtTime = new Date(pr.createdAt).getTime();
        if (!this.#state.hasSeenPR(pr.url) && !this.#state.firstRun && !this.#state.isOldTeamPR(pr)) {
          this.#notify("New Team PR", pr.title, pr.url);
        }
      });

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

  async #updateTeamMembers() {
    const orgTeams = process.env.GH_TEAMS.split(",");

    for (const orgTeam of orgTeams) {
      const [org, team] = orgTeam.split("/");

      try {
        const data = await this.#github.getTeamMembers(org, team);
        console.log("Adding Team Members:", data);

        data.forEach((member) => {
          this.#state.addTeamMember(member.login);
        });

        console.log("Team Member Set:", this.#state.teamMembers);
        this.#state.removeTeamMember(process.env.GH_USER);
        console.log("Team After Filtering:", this.#state.teamMembers);
        this.#refresh();
      } catch (error) {
        console.error("Error fetching PRs:", error);
      }
    }
  }

  #render() {
    renderTaskBar(this.#tray, {
      myPRs: this.#state.myPRs,
      teamPRs: this.#state.teamPRs,
      lastRefreshedTime: this.#state.lastRefreshedTime,
    });
  }

  #refresh() {
    this.#updateMyPRs();
    this.#updateTeamPRs();
  }

  startPeriodicUpdate() {
    if (this.#displayIntervalId) clearInterval(this.#displayIntervalId);
    if (this.#teamIntervalId) clearInterval(this.#teamIntervalId);

    this.#updateTeamMembers();
    this.#teamIntervalId = setInterval(() => this.#updateTeamMembers(), CONFIG.teamRefreshIntervalMs);

    this.#refresh();
    this.#displayIntervalId = setInterval(() => this.#refresh(), CONFIG.refreshIntervalMs);
  }

  refresh() {
    this.#refresh();
  }
}

module.exports = { DisplayManager };