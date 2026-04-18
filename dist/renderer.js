"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFooter = createFooter;
exports.renderPR = renderPR;
exports.lastRefreshedSection = lastRefreshedSection;
exports.renderTaskBar = renderTaskBar;
exports.buildMenu = buildMenu;
const electron_1 = require("electron");
const config_1 = require("./config");
function createFooter() {
    return [
        { label: "Separator", type: "separator" },
        {
            label: "Quit",
            type: "normal",
            click: () => {
                console.log("Quitting application...");
                electron_1.app.quit();
            },
        },
    ];
}
function renderPR(pr) {
    const ciState = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null;
    const ciStatus = config_1.CONFIG.ciStatusEmoji[ciState ?? ""] ?? "";
    const approvalStatus = config_1.CONFIG.approvalEmoji[pr.reviewDecision ?? ""] ?? "";
    const prTitleTruncated = pr.title.length > config_1.CONFIG.titleMaxLength
        ? pr.title.substring(0, config_1.CONFIG.titleMaxLength) + "..."
        : pr.title;
    const titleString = [ciStatus, approvalStatus, prTitleTruncated].filter(Boolean).join(" ");
    console.log(ciState, pr.reviewDecision, titleString);
    return {
        label: titleString,
        type: "normal",
        click: () => {
            console.log("Opening PR:", pr.url);
            electron_1.shell.openExternal(pr.url);
        },
    };
}
function lastRefreshedSection(lastRefreshedTime) {
    return {
        label: lastRefreshedTime ? `Last Refreshed: ${lastRefreshedTime}` : "Last Refreshed:",
        type: "normal",
        click: () => {
            console.log("Refreshing last refreshed label");
        },
    };
}
function renderTaskBar(state) {
    const menuItems = [
        { label: "My PRs", type: "normal" },
        { label: "Separator", type: "separator" },
        ...state.myPRs.map(renderPR),
        { label: "Separator", type: "separator" },
        { label: "Team PRs", type: "normal" },
        { label: "Separator", type: "separator" },
        ...state.teamPRs.map(renderPR),
        { label: "Separator", type: "separator" },
        lastRefreshedSection(state.lastRefreshedTime),
        ...createFooter(),
    ];
    return menuItems;
}
function buildMenu(state) {
    const template = renderTaskBar(state);
    return electron_1.Menu.buildFromTemplate(template);
}
//# sourceMappingURL=renderer.js.map