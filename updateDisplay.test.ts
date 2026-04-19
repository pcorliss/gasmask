import { describe, test, expect } from "@jest/globals";
import { CONFIG } from "./config";
import { PRState } from "./pr-state";
import { renderPR, createFooter, lastRefreshedSection } from "./renderer";
import { GitHubService } from "./github-service";
import { DisplayManager } from "./display";

describe("CONFIG", () => {
  test("has ciStatusEmoji map", () => {
    expect(CONFIG.ciStatusEmoji["ERROR"]).toBe("⚠️");
    expect(CONFIG.ciStatusEmoji["SUCCESS"]).toBe("🟢");
    expect(CONFIG.ciStatusEmoji["null"]).toBe("");
  });

  test("has approvalEmoji map", () => {
    expect(CONFIG.approvalEmoji["APPROVED"]).toBe("✅");
    expect(CONFIG.approvalEmoji["CHANGES_REQUESTED"]).toBe("❌");
    expect(CONFIG.approvalEmoji["null"]).toBe("");
  });

  test("titleMaxLength is 50", () => {
    expect(CONFIG.titleMaxLength).toBe(50);
  });

  test("refreshIntervalMs is defined", () => {
    expect(CONFIG.refreshIntervalMs).toBeGreaterThan(0);
  });

  test("teamRefreshIntervalMs is 60 minutes", () => {
    expect(CONFIG.teamRefreshIntervalMs).toBe(60 * 60 * 1000);
  });
});

describe("renderPR", () => {
  test("renders PR with CI status and review decision emojis", () => {
    const pr = {
      title: "Fix bug in login",
      url: "https://github.com/org/repo/pull/123",
      reviewDecision: "APPROVED",
      commits: {
        nodes: [{
          commit: {
            statusCheckRollup: { state: "SUCCESS" },
          },
        }],
      },
      createdAt: "2024-01-01",
    };

    const result = renderPR(pr);
    expect(result.label).toBe("🟢 ✅ Fix bug in login");
    expect(result.type).toBe("normal");
    expect(typeof result.click).toBe("function");
  });

  test("renders PR with no CI status", () => {
    const pr = {
      title: "Add feature",
      url: "https://github.com/org/repo/pull/124",
      commits: { nodes: [] },
      reviewDecision: "PENDING",
      createdAt: "2024-01-01",
    };

    const result = renderPR(pr);
    expect(result.label).toBe("⏳ Add feature");
  });

  test("renders PR with missing commits", () => {
    const pr = {
      title: "Update readme",
      url: "https://github.com/org/repo/pull/125",
      reviewDecision: "CHANGES_REQUESTED",
      commits: null,
      createdAt: "2024-01-01",
    };

    const result = renderPR(pr);
    expect(result.label).toBe("❌ Update readme");
  });

  test("truncates long PR titles", () => {
    const longTitle = "This is a very long PR title that definitely exceeds fifty characters because it is verbose";
    const pr = {
      title: longTitle,
      url: "https://github.com/org/repo/pull/126",
      commits: null,
      reviewDecision: null,
      createdAt: "2024-01-01",
    };

    const result = renderPR(pr);
    expect(result.label).toBe(longTitle.substring(0, 50) + "...");
  });

  test("keeps short PR titles unchanged", () => {
    const pr = {
      title: "Small fix",
      url: "https://github.com/org/repo/pull/127",
      commits: null,
      reviewDecision: null,
      createdAt: "2024-01-01",
    };

    const result = renderPR(pr);
    expect(result.label).toBe("Small fix");
  });

  test("renders PR with null commits", () => {
    const pr = {
      title: "Null nodes",
      url: "https://github.com/org/repo/pull/128",
      commits: null,
      reviewDecision: "APPROVED",
      createdAt: "2024-01-01",
    };

    const result = renderPR(pr);
    expect(result.label).toBe("✅ Null nodes");
  });
});

describe("createFooter", () => {
  test("is an array of menu items", () => {
    expect(Array.isArray(createFooter(() => {}))).toBe(true);
    expect(createFooter(() => {}).length).toBeGreaterThan(0);
  });

  test("has separator, settings, and quit items", () => {
    const labels = createFooter(() => {}).map((item) => item.label);
    expect(labels).toContain("Separator");
    expect(labels).toContain("Settings");
    expect(labels).toContain("Quit");
  });
});

describe("lastRefreshedSection", () => {
  test("returns menu item with label", () => {
    const result = lastRefreshedSection("10:00:00", () => {});
    expect(result.label).toBe("Last Refreshed: 10:00:00");
    expect(result.type).toBe("normal");
  });

  test("returns menu item with null time", () => {
    const result = lastRefreshedSection(null, () => {});
    expect(result.label).toBe("Last Refreshed:");
  });
});

describe("PRState", () => {
  test("initializes with empty arrays", () => {
    const state = new PRState();
    expect(state.myPRs).toEqual([]);
    expect(state.teamPRs).toEqual([]);
  });

  test("can add team members", () => {
    const state = new PRState();
    state.addTeamMember("testuser");
    expect(state.teamMembers.has("testuser")).toBe(true);
  });

  test("can remove team members", () => {
    const state = new PRState();
    state.addTeamMember("testuser");
    state.removeTeamMember("testuser");
    expect(state.teamMembers.has("testuser")).toBe(false);
  });

  test("can track seen PRs", () => {
    const state = new PRState();
    state.addSeenPR("https://github.com/pr/1");
    expect(state.hasSeenPR("https://github.com/pr/1")).toBe(true);
    expect(state.hasSeenPR("https://github.com/pr/2")).toBe(false);
  });

  test("can set last refreshed time", () => {
    const state = new PRState();
    state.setLastRefreshed();
    expect(state.lastRefreshedTime).toBeDefined();
  });
});

describe("GitHubService", () => {
  test("is exported as a class", () => {
    expect(typeof GitHubService).toBe("function");
  });
});

describe("DisplayManager", () => {
  test("is exported as a class", () => {
    expect(typeof DisplayManager).toBe("function");
  });
});