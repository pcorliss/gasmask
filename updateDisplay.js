const { Menu, app, Notification, shell } = require('electron');
const { queryGitHub, queryGitHubTeam } = require('./github');

let myPRs = [];
let teamPRs = [];
let seenPRs = new Set();
let firstRun = true;
let teamMembers = new Set();
let lastRefreshedLabel = "Last Refreshed:";

const PR_STATUS_MAP = {
  "ERROR": "⚠️",
  "EXPECTED": "🟠",
  "FAILURE": "🔴",
  "PENDING": "🟠",
  "SUCCESS": "🟢",
  null: "",
};

const PR_APPROVAL_MAP = {
  "APPROVED": "✅",
  "CHANGES_REQUESTED": "❌",
  "COMMENTED": "💬",
  "DISMISSED": "⚠️",
  "PENDING": "⏳",
  "REVIEW_REQUIRED": "⏳",
  null: "",
};

const PR_TITLE_MAX_LENGTH = 50;

const FOOTER = [
  { label: 'Separator', type: 'separator' },
  {
    label: 'Quit',
    type: 'normal',
    click: () => {
      console.log('Quitting application...');
      app.quit(); // Quit the application
    },
  },
];

function lastRefreshedSection(tray) {
  return {
    label: lastRefreshedLabel,
    type: 'normal',
    click: () => {
      console.log('Refreshing last refreshed label');
      startPeriodicUpdate(tray);
    },
  };
}

function renderPR(pr) {
  const ciStatus = PR_STATUS_MAP[pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state] || "";
  const approvalStatus = PR_APPROVAL_MAP[pr.reviewDecision] || "";
  const prTitleTruncated = pr.title.length > PR_TITLE_MAX_LENGTH ? pr.title.substring(0, PR_TITLE_MAX_LENGTH) + '...' : pr.title;
  titleString = [ciStatus, approvalStatus, prTitleTruncated].filter(Boolean).join(" ");
  console.log(
    pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state,
    pr.reviewDecision,
    titleString
  );
  return {
    label: titleString,
    type: 'normal',
    click: () => {
      console.log('Opening PR:', pr.url);
      shell.openExternal(pr.url);
    }
  }
}

function renderTaskBar(tray) {
  let menuItems = [
    { label: 'My PRs', type: 'normal' },
    { label: 'Separator', type: 'separator' },
    ...myPRs.map(renderPR),
    { label: 'Separator', type: 'separator' },
    { label: 'Team PRs', type: 'normal' },
    { label: 'Separator', type: 'separator' },
    ...teamPRs.map(renderPR),
    { label: 'Separator', type: 'separator' },
    lastRefreshedSection(tray),
    ...FOOTER,
  ];

  const contextMenu = Menu.buildFromTemplate(menuItems);
  tray.setContextMenu(contextMenu);
}

function updateMyPRs(tray) {
  query = `is:pr is:open author:${process.env.GH_USER}`;
  queryGitHub(query)
    .then((data) => {
      newPRs = data.data.search.edges.map((edge) => edge.node);
      console.log('My PRs:', newPRs);
      // Find PRs where CI status changed to red
      newPRs.forEach((pr) => {
        const previousPR = myPRs.find((p) => p.url === pr.url);
        if (previousPR) {
          const previousStatus = previousPR.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
          const currentStatus = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
          if (previousStatus !== "FAILURE" && currentStatus === "FAILURE") {
            const notification = new Notification({
              title: "CI Failed",
              body: `${pr.title} CI failure.`,
              silent: false,
            }).on('click', () => {
              shell.openExternal(pr.url);
            }
            );
            notification.show();
          }

          const previousApproval = previousPR.reviewDecision;
          const currentApproval = pr.reviewDecision;
          if (previousApproval != currentApproval) {
            const notification = new Notification({
              title: `PR ${currentApproval}`,
              body: `${pr.title} PR ${previousApproval} -> ${currentApproval}.`,
              silent: false,
            }).on('click', () => {
              shell.openExternal(pr.url);
            });
            notification.show();
          }
        }
      });
      myPRs = newPRs;
      lastRefreshedLabel = `Last Refreshed: ${new Date().toLocaleTimeString()}`;
      renderTaskBar(tray);
    })
    .catch((error) => {
      console.error('Error fetching PRs:', error);
    });
}

function isOldTeamPR(pr) {
  const minCreatedAt = Math.min(...teamPRs.map(pr => pr.createdAtTime));
  return pr.createdAtTime < minCreatedAt;
}

function updateTeamPRs(tray) {
  console.log('Team Members:', teamMembers);
  if (teamMembers.size != 0) {
    let query = "is:pr is:open draft:false";
    teamMembers.forEach(member => {
      query += ` author:${member}`;
    });
    console.log("Query:", query);
    queryGitHub(query)
      .then((data) => {
        newPRs = data.data.search.edges.map((edge) => edge.node);

        newPRs.forEach((pr) => {
          pr.createdAtTime = new Date(pr.createdAt).getTime();
          if (!seenPRs.has(pr.url) && !firstRun && !isOldTeamPR(pr)) {
            const notification = new Notification({
              title: "New Team PR",
              body: `${pr.title}`,
              silent: false,
            }).on('click', () => {
              shell.openExternal(pr.url);
            });
            notification.show();
          }
        });

        firstRun = false;

        newPRs.forEach((pr) => {
          seenPRs.add(pr.url);
        });

        teamPRs = newPRs
        console.log('Team PRs:', teamPRs);
        lastRefreshedLabel = `Last Refreshed: ${new Date().toLocaleTimeString()}`;
        renderTaskBar(tray);
      })
      .catch((error) => {
        console.error('Error fetching PRs:', error);
      });
  }
  console.log("Done updating team prs");
}

function updateTeamMembers(tray) {
  process.env.GH_TEAMS.split(',').forEach((orgTeam) => {
    const [org, team] = orgTeam.split('/');
    queryGitHubTeam(org, team)
      .then((data) => {
        console.log('Adding Team Members:', data);
        data.forEach((member) => {
          teamMembers.add(member.login);
        });
        console.log('Team Member Set:', teamMembers);
        teamMembers.delete(process.env.GH_USER);
        console.log('Team After Filtering:', teamMembers);
        updateDisplay(tray);
      })
      .catch((error) => {
        console.error('Error fetching PRs:', error);
      });
  })
}

function updateDisplay(tray) {
  updateMyPRs(tray);
  updateTeamPRs(tray);
}

const REFRESH_INTERVAL = (process.env.REFRESH_INTERVAL || 300) * 1000;
const TEAM_REFRESH_INTERVAL = 60 * 60 * 1000; // 60 minutes

let displayIntervalId = null;
let teamIntervalId = null;

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

module.exports = { startPeriodicUpdate };