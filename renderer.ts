import { Menu, app, shell } from "electron";
import { CONFIG } from "./config";
import type { PRNode } from "./github-service";

export interface MenuItem {
  label: string;
  type?: "normal" | "separator";
  click?: () => void;
}

export function createFooter(onSettingsClick: () => void): MenuItem[] {
  return [
    {
      label: "Settings",
      type: "normal",
      click: onSettingsClick,
    },
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

export function renderPR(pr: PRNode): MenuItem {
  const ciState = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null;
  const ciStatus = CONFIG.ciStatusEmoji[ciState ?? ""] ?? "";
  const approvalStatus = CONFIG.approvalEmoji[pr.reviewDecision ?? ""] ?? "";
  const prTitleTruncated = pr.title.length > CONFIG.titleMaxLength
    ? pr.title.substring(0, CONFIG.titleMaxLength) + "..."
    : pr.title;
  const titleString = [ciStatus, approvalStatus, prTitleTruncated].filter(Boolean).join(" ");

  console.log(ciState, pr.reviewDecision, titleString);

  return {
    label: titleString,
    type: "normal",
    click: () => {
      console.log("Opening PR:", pr.url);
      shell.openExternal(pr.url);
    },
  };
}

export function lastRefreshedSection(lastRefreshedTime: string | null): MenuItem {
  return {
    label: lastRefreshedTime ? `Last Refreshed: ${lastRefreshedTime}` : "Last Refreshed:",
    type: "normal",
    click: () => {
      console.log("Refreshing last refreshed label");
    },
  };
}

export interface RenderState {
  myPRs: PRNode[];
  teamPRs: PRNode[];
  lastRefreshedTime: string | null;
}

export interface RenderState {
  myPRs: PRNode[];
  teamPRs: PRNode[];
  lastRefreshedTime: string | null;
}

export function renderTaskBar(state: RenderState, onSettingsClick: () => void): MenuItem[] {
  const menuItems: MenuItem[] = [
    { label: "My PRs", type: "normal" },
    { label: "Separator", type: "separator" },
    ...state.myPRs.map(renderPR),
    { label: "Separator", type: "separator" },
    { label: "Team PRs", type: "normal" },
    { label: "Separator", type: "separator" },
    ...state.teamPRs.map(renderPR),
    { label: "Separator", type: "separator" },
    lastRefreshedSection(state.lastRefreshedTime),
    ...createFooter(onSettingsClick),
  ];

  return menuItems;
}

export function buildMenu(state: RenderState, onSettingsClick: () => void): Electron.Menu {
  const template = renderTaskBar(state, onSettingsClick);
  return Menu.buildFromTemplate(template);
}