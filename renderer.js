const { Menu, app, shell } = require("electron");
const { CONFIG } = require("./config");

function createFooter(app) {
  return [
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
}

function renderPR(pr) {
  const ciStatus = CONFIG.ciStatusEmoji[pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state] ?? "";
  const approvalStatus = CONFIG.approvalEmoji[pr.reviewDecision] ?? "";
  const prTitleTruncated = pr.title.length > CONFIG.titleMaxLength
    ? pr.title.substring(0, CONFIG.titleMaxLength) + "..."
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

function lastRefreshedSection(tray, lastRefreshedTime) {
  return {
    label: lastRefreshedTime ? `Last Refreshed: ${lastRefreshedTime}` : "Last Refreshed:",
    type: "normal",
    click: () => {
      console.log("Refreshing last refreshed label");
      tray.refresh();
    },
  };
}

function renderTaskBar(tray, { myPRs, teamPRs, lastRefreshedTime }) {
  const menuItems = [
    { label: "My PRs", type: "normal" },
    { label: "Separator", type: "separator" },
    ...myPRs.map(renderPR),
    { label: "Separator", type: "separator" },
    { label: "Team PRs", type: "normal" },
    { label: "Separator", type: "separator" },
    ...teamPRs.map(renderPR),
    { label: "Separator", type: "separator" },
    lastRefreshedSection(tray, lastRefreshedTime),
    ...createFooter(app),
  ];

  const contextMenu = Menu.buildFromTemplate(menuItems);
  tray.setContextMenu(contextMenu);
}

module.exports = { renderPR, renderTaskBar, createFooter };