const { Menu, app, shell } = require('electron');
const { PRStore } = require('./prStore');
const { getPRReadiness, getTeamPRReadiness, getCheckState, hasApproval } = require('./prStatus');

let myPRs = [];
let teamPRs = [];
let activeStore;
let onStoreChange;
let openWindow = () => {};
let trayState;
let lastRefreshedLabel = "Last Refreshed:";
let splitPRsByReadiness = process.env.SPLIT_PRS_BY_READINESS !== 'false';

const PR_STATUS_MAP = {
  "ERROR": "⚠️",
  "EXPECTED": "🟠",
  "FAILURE": "🔴",
  "PENDING": "🟠",
  "SUCCESS": "🟢",
  null: "",
};

const PR_LABEL_MAX_LENGTH = 110;

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
      activeStore.refresh();
    },
  };
}

function renderPR(pr, readiness, groupLabel) {
  const ciStatus = PR_STATUS_MAP[getCheckState(pr)] || "";
  const [readinessIcon, ...readinessWords] = readiness.label.split(' ');
  const repeatsHeading = groupLabel &&
    (readinessWords.join(' ') === groupLabel || readiness.group === 'draft');
  const iconOnly = repeatsHeading || readiness.label === '🔄 Rebase needed';
  const statusLabel = iconOnly ? `${readinessIcon} ${readiness.policy.label}` :
    `${readiness.label} · ${readiness.policy.label}`;
  const repoName = pr.repository?.name || pr.repository?.nameWithOwner?.split('/').pop();
  const prReference = [repoName, pr.number && `#${pr.number}`].filter(Boolean).join('');
  const prefix = `${[ciStatus, statusLabel].filter(Boolean).join(' ')} — ${prReference ? prReference + ': ' : ''}`;
  // Spend the space saved by compact statuses on the title.
  const titleBudget = Math.max(20, PR_LABEL_MAX_LENGTH - Array.from(prefix).length);
  const titleCharacters = Array.from(pr.title);
  const prTitleTruncated = titleCharacters.length > titleBudget ?
    titleCharacters.slice(0, titleBudget - 1).join('') + '…' : pr.title;
  const titleString = prefix + prTitleTruncated;
  const reviewLabel = pr.reviewDecision || (hasApproval(pr) ? 'Has approval' : 'No approvals');
  const fullReference = `${pr.repository?.nameWithOwner || repoName || 'Unknown repository'}${pr.number ? '#' + pr.number : ''}`;
  return {
    label: titleString,
    toolTip: `${pr.title}\n${fullReference}\nAuthor: ${pr.author?.login || 'Unknown'}\n${readiness.label}\n${readiness.policy.details}\nReviews: ${reviewLabel}\nMerge state: ${pr.mergeStateStatus || 'UNKNOWN'}`,
    type: 'normal',
    click: () => {
      console.log('Opening PR:', pr.url);
      shell.openExternal(pr.url);
    }
  }
}

function renderPRSection(title, prs, { readyLast = false, getReadiness = getPRReadiness } = {}) {
  const entries = prs.map(pr => ({ pr, readiness: getReadiness(pr) }));
  if (!splitPRsByReadiness || prs.length === 0) {
    const orderedPRs = readyLast ? [
      ...entries.filter(entry => entry.readiness.group !== 'ready'),
      ...entries.filter(entry => entry.readiness.group === 'ready'),
    ] : entries;
    return [
      { label: `${title} (${prs.length})`, type: 'normal', enabled: false },
      { type: 'separator' },
      ...orderedPRs.map(({ pr, readiness }) => renderPR(pr, readiness)),
    ];
  }

  const groups = [
    ['review', 'Needs review'],
    ['blocked', 'Blocked / checking'],
    ['draft', 'Drafts'],
  ];
  const readyGroup = ['ready', 'Ready to merge'];
  if (readyLast) groups.push(readyGroup);
  else groups.unshift(readyGroup);
  const items = [];
  groups.forEach(([group, label]) => {
    const groupedPRs = entries.filter(entry => entry.readiness.group === group);
    if (groupedPRs.length === 0) return;
    if (items.length > 0) items.push({ type: 'separator' });
    items.push(
      { label: `${title} — ${label} (${groupedPRs.length})`, type: 'normal', enabled: false },
      { type: 'separator' },
      ...groupedPRs.map(({ pr, readiness }) => renderPR(pr, readiness, label)),
    );
  });
  return items;
}

function renderTaskBar(tray) {
  let menuItems = [
    { label: 'Open GasMask…', click: () => openWindow() },
    { type: 'separator' },
    ...renderPRSection('My PRs', myPRs),
    { label: 'View all My PRs…', click: () => openWindow({ scope: 'mine' }) },
    ...(trayState?.mine.error ? [{ label: 'My PRs refresh failed — retry', click: () => activeStore.refresh() }] : []),
    { label: 'Separator', type: 'separator' },
    ...renderPRSection('Team PRs', teamPRs, { readyLast: true, getReadiness: getTeamPRReadiness }),
    { label: 'View all Team PRs…', click: () => openWindow({ scope: 'team' }) },
    ...(trayState?.team.error ? [{ label: 'Team PRs refresh failed — retry', click: () => activeStore.refresh() }] : []),
    { type: 'separator' },
    {
      label: 'Split PRs by readiness',
      type: 'checkbox',
      checked: splitPRsByReadiness,
      click: (menuItem) => {
        splitPRsByReadiness = menuItem.checked;
        renderTaskBar(tray);
      },
    },
    lastRefreshedSection(tray),
    ...FOOTER,
  ];

  const contextMenu = Menu.buildFromTemplate(menuItems);
  tray.setContextMenu(contextMenu);
}

function startPeriodicUpdate(tray, { store = new PRStore(), showWindow = () => {} } = {}) {
  if (activeStore && onStoreChange) activeStore.off('change', onStoreChange);
  activeStore = store;
  openWindow = showWindow;
  onStoreChange = () => {
    trayState = store.getTraySnapshot();
    myPRs = trayState.mine.prs;
    teamPRs = trayState.team.prs;
    const lastUpdate = Math.max(trayState.mine.updatedAt || 0, trayState.team.updatedAt || 0);
    lastRefreshedLabel = lastUpdate ? `Last Refreshed: ${new Date(lastUpdate).toLocaleTimeString()}` : 'Refreshing…';
    renderTaskBar(tray);
  };
  store.on('change', onStoreChange);
  onStoreChange();
  store.start();
}

module.exports = { startPeriodicUpdate };
