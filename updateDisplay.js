const { Menu, app, Notification } = require('electron');
const { queryGitHub } = require('./github');

let myPRs = [];
let teamPRs = [];
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
  titleString = [ciStatus, approvalStatus, prTitleTruncated].join("|");
  console.log(
    pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state,
    pr.reviewDecision,
    titleString
  );
  return { label: titleString, type: 'normal' }
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

function updateDisplay(tray) {
  lastRefreshedLabel = `Last Refreshed: ${new Date().toLocaleTimeString()}`;
  queryGitHub(process.env.GH_USER)
    .then((data) => {
      myPRs = data.data.search.edges.map((edge) => edge.node);
      console.log('My PRs:', myPRs);
      renderTaskBar(tray);
    })
    .catch((error) => {
      console.error('Error fetching PRs:', error);
    });
}

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

let updateIntervalId; // Store the interval ID globally

function startPeriodicUpdate(tray) {
  if (updateIntervalId) {
    clearInterval(updateIntervalId);
  }

  updateDisplay(tray);
  updateIntervalId = setInterval(() => updateDisplay(tray), REFRESH_INTERVAL);
}

module.exports = { startPeriodicUpdate };