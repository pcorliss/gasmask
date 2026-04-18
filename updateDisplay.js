const { Menu, app, Notification, shell } = require("electron");
const { queryGitHub, queryGitHubTeam } = require("./github");

const state = {
  myPRs: [],
  teamPRs: [],
  seenPRs: new Set(),
  firstRun: true,
  teamMembers: new Set(),
  lastRefreshedTime: null,
};

const REFRESH_INTERVAL = (parseInt(process.env.REFRESH_INTERVAL, 10) || 300) * 1000;
const TEAM_REFRESH_INTERVAL = 60 * 60 * 1000;

const PR_STATUS_MAP = {
  ERROR: "⚠️",
  EXPECTED: "🟠",
  FAILURE: "🔴",
  PENDING: "🟠",
  SUCCESS: "🟢",
  null: "",
};

const PR_APPROVAL_MAP = {
  APPROVED: "✅",
  CHANGES_REQUESTED: "❌",
  COMMENTED: "💬",
  DISMISSED: "⚠️",
  PENDING: "⏳",
  REVIEW_REQUIRED: "⏳",
  null: "",
};

const PR_TITLE_MAX_LENGTH = 50;

const FOOTER = [
  { label: "Separator", type: "separator" },
  {
    label: "Quit",
    type: "normal",
    click: () => {
      console.log("Quitting application...");
      app.quit();
    },
  },
];

function lastRefreshedSection(tray) {
  return {
    label: state.lastRefreshedTime ? `Last Refreshed: ${state.lastRefreshedTime}` : "Last Refreshed:",
    type: "normal",
    click: () => {
      console.log("Refreshing last refreshed label");
      startPeriodicUpdate(tray);
    },
  };
}

function renderPR(pr) {
  const ciStatus = PR_STATUS_MAP[pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state] ?? "";
  const approvalStatus = PR_APPROVAL_MAP[pr.reviewDecision] ?? "";
  const prTitleTruncated = pr.title.length > PR_TITLE_MAX_LENGTH
    ? pr.title.substring(0, PR_TITLE_MAX_LENGTH) + "..."
    : pr.title;
  const titleString = [ciStatus, approvalStatus, prTitleTruncated].filter(Boolean).join(" ");

  console.log(
    pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state,
    pr.reviewDecision,
    titleString
  );

  return {
    label: titleString,
    type: "normal",
    click: () => {
      console.log("Opening PR:", pr.url);
      shell.openExternal(pr.url);
    },
  };
}

function renderTaskBar(tray) {
  const menuItems = [
    { label: "My PRs", type: "normal" },
    { label: "Separator", type: "separator" },
    ...state.myPRs.map(renderPR),
    { label: "Separator", type: "separator" },
    { label: "Team PRs", type: "normal" },
    { label: "Separator", type: "separator" },
    ...state.teamPRs.map(renderPR),
    { label: "Separator", type: "separator" },
    lastRefreshedSection(tray),
    ...FOOTER,
  ];

  const contextMenu = Menu.buildFromTemplate(menuItems);
  tray.setContextMenu(contextMenu);
}

let displayIntervalId = null;
let teamIntervalId = null;

async function updateMyPRs(tray) {
  const query = `is:pr is:open author:${process.env.GH_USER}`;

  try {
    const data = await queryGitHub(query);
    const newPRs = data.data.search.edges.map((edge) => edge.node);

    console.log("My PRs:", newPRs);

    newPRs.forEach((pr) => {
      const previousPR = state.myPRs.find((p) => p.url === pr.url);
      if (previousPR) {
        const previousStatus = previousPR.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
        const currentStatus = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
        if (previousStatus !== "FAILURE" && currentStatus === "FAILURE") {
          const notification = new Notification({
            title: "CI Failed",
            body: `${pr.title} CI failure.`,
            silent: false,
          }).on("click", () => {
            shell.openExternal(pr.url);
          });
          notification.show();
        }

        const previousApproval = previousPR.reviewDecision;
        const currentApproval = pr.reviewDecision;
        if (previousApproval !== currentApproval) {
          const notification = new Notification({
            title: `PR ${currentApproval}`,
            body: `${pr.title} PR ${previousApproval} -> ${currentApproval}.`,
            silent: false,
          }).on("click", () => {
            shell.openExternal(pr.url);
          });
          notification.show();
        }
      }
    });

    state.myPRs = newPRs;
    state.lastRefreshedTime = new Date().toLocaleTimeString();
    renderTaskBar(tray);
  } catch (error) {
    console.error("Error fetching PRs:", error);
  }
}

function isOldTeamPR(pr) {
  const minCreatedAt = Math.min(...state.teamPRs.map((p) => p.createdAtTime));
  return pr.createdAtTime < minCreatedAt;
}

async function updateTeamPRs(tray) {
  console.log("Team Members:", state.teamMembers);

  if (state.teamMembers.size === 0) {
    console.log("Done updating team prs");
    return;
  }

  const query = "is:pr is:open draft:false";
  const authorQuery = [...state.teamMembers].map((member) => ` author:${member}`).join("");

  console.log("Query:", query + authorQuery);

  try {
    const data = await queryGitHub(query + authorQuery);
    const newPRs = data.data.search.edges.map((edge) => edge.node);

    newPRs.forEach((pr) => {
      pr.createdAtTime = new Date(pr.createdAt).getTime();
      if (!state.seenPRs.has(pr.url) && !state.firstRun && !isOldTeamPR(pr)) {
        const notification = new Notification({
          title: "New Team PR",
          body: pr.title,
          silent: false,
        }).on("click", () => {
          shell.openExternal(pr.url);
        });
        notification.show();
      }
    });

    state.firstRun = false;

    newPRs.forEach((pr) => {
      state.seenPRs.add(pr.url);
    });

    state.teamPRs = newPRs;
    console.log("Team PRs:", state.teamPRs);
    state.lastRefreshedTime = new Date().toLocaleTimeString();
    renderTaskBar(tray);
  } catch (error) {
    console.error("Error fetching PRs:", error);
  }

  console.log("Done updating team prs");
}

async function updateTeamMembers(tray) {
  const orgTeams = process.env.GH_TEAMS.split(",");

  for (const orgTeam of orgTeams) {
    const [org, team] = orgTeam.split("/");

    try {
      const data = await queryGitHubTeam(org, team);
      console.log("Adding Team Members:", data);

      data.forEach((member) => {
        state.teamMembers.add(member.login);
      });

      console.log("Team Member Set:", state.teamMembers);
      state.teamMembers.delete(process.env.GH_USER);
      console.log("Team After Filtering:", state.teamMembers);
      updateDisplay(tray);
    } catch (error) {
      console.error("Error fetching PRs:", error);
    }
  }
}

function updateDisplay(tray) {
  updateMyPRs(tray);
  updateTeamPRs(tray);
}

function startPeriodicUpdate(tray) {
  if (displayIntervalId) {
    clearInterval(displayIntervalId);
  }
  if (teamIntervalId) {
    clearInterval(teamIntervalId);
  }

  updateTeamMembers(tray);
  teamIntervalId = setInterval(() => updateTeamMembers(tray), TEAM_REFRESH_INTERVAL);

  updateDisplay(tray);
  displayIntervalId = setInterval(() => updateDisplay(tray), REFRESH_INTERVAL);
}

module.exports = {
  startPeriodicUpdate,
  renderPR,
  renderTaskBar,
  updateMyPRs,
  updateTeamPRs,
  isOldTeamPR,
  lastRefreshedSection,
  FOOTER,
  PR_STATUS_MAP,
  PR_APPROVAL_MAP,
  PR_TITLE_MAX_LENGTH,
  REFRESH_INTERVAL,
  TEAM_REFRESH_INTERVAL,
  state,
};