"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const config_1 = require("./config");
const pr_state_1 = require("./pr-state");
const renderer_1 = require("./renderer");
const github_service_1 = require("./github-service");
const display_1 = require("./display");
(0, globals_1.describe)("CONFIG", () => {
    (0, globals_1.test)("has ciStatusEmoji map", () => {
        (0, globals_1.expect)(config_1.CONFIG.ciStatusEmoji["ERROR"]).toBe("⚠️");
        (0, globals_1.expect)(config_1.CONFIG.ciStatusEmoji["SUCCESS"]).toBe("🟢");
        (0, globals_1.expect)(config_1.CONFIG.ciStatusEmoji["null"]).toBe("");
    });
    (0, globals_1.test)("has approvalEmoji map", () => {
        (0, globals_1.expect)(config_1.CONFIG.approvalEmoji["APPROVED"]).toBe("✅");
        (0, globals_1.expect)(config_1.CONFIG.approvalEmoji["CHANGES_REQUESTED"]).toBe("❌");
        (0, globals_1.expect)(config_1.CONFIG.approvalEmoji["null"]).toBe("");
    });
    (0, globals_1.test)("titleMaxLength is 50", () => {
        (0, globals_1.expect)(config_1.CONFIG.titleMaxLength).toBe(50);
    });
    (0, globals_1.test)("refreshIntervalMs is defined", () => {
        (0, globals_1.expect)(config_1.CONFIG.refreshIntervalMs).toBeGreaterThan(0);
    });
    (0, globals_1.test)("teamRefreshIntervalMs is 60 minutes", () => {
        (0, globals_1.expect)(config_1.CONFIG.teamRefreshIntervalMs).toBe(60 * 60 * 1000);
    });
});
(0, globals_1.describe)("renderPR", () => {
    (0, globals_1.test)("renders PR with CI status and review decision emojis", () => {
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
        const result = (0, renderer_1.renderPR)(pr);
        (0, globals_1.expect)(result.label).toBe("🟢 ✅ Fix bug in login");
        (0, globals_1.expect)(result.type).toBe("normal");
        (0, globals_1.expect)(typeof result.click).toBe("function");
    });
    (0, globals_1.test)("renders PR with no CI status", () => {
        const pr = {
            title: "Add feature",
            url: "https://github.com/org/repo/pull/124",
            commits: { nodes: [] },
            reviewDecision: "PENDING",
            createdAt: "2024-01-01",
        };
        const result = (0, renderer_1.renderPR)(pr);
        (0, globals_1.expect)(result.label).toBe("⏳ Add feature");
    });
    (0, globals_1.test)("renders PR with missing commits", () => {
        const pr = {
            title: "Update readme",
            url: "https://github.com/org/repo/pull/125",
            reviewDecision: "CHANGES_REQUESTED",
            commits: null,
            createdAt: "2024-01-01",
        };
        const result = (0, renderer_1.renderPR)(pr);
        (0, globals_1.expect)(result.label).toBe("❌ Update readme");
    });
    (0, globals_1.test)("truncates long PR titles", () => {
        const longTitle = "This is a very long PR title that definitely exceeds fifty characters because it is verbose";
        const pr = {
            title: longTitle,
            url: "https://github.com/org/repo/pull/126",
            commits: null,
            reviewDecision: null,
            createdAt: "2024-01-01",
        };
        const result = (0, renderer_1.renderPR)(pr);
        (0, globals_1.expect)(result.label).toBe(longTitle.substring(0, 50) + "...");
    });
    (0, globals_1.test)("keeps short PR titles unchanged", () => {
        const pr = {
            title: "Small fix",
            url: "https://github.com/org/repo/pull/127",
            commits: null,
            reviewDecision: null,
            createdAt: "2024-01-01",
        };
        const result = (0, renderer_1.renderPR)(pr);
        (0, globals_1.expect)(result.label).toBe("Small fix");
    });
    (0, globals_1.test)("renders PR with null commits", () => {
        const pr = {
            title: "Null nodes",
            url: "https://github.com/org/repo/pull/128",
            commits: null,
            reviewDecision: "APPROVED",
            createdAt: "2024-01-01",
        };
        const result = (0, renderer_1.renderPR)(pr);
        (0, globals_1.expect)(result.label).toBe("✅ Null nodes");
    });
});
(0, globals_1.describe)("createFooter", () => {
    (0, globals_1.test)("is an array of menu items", () => {
        (0, globals_1.expect)(Array.isArray((0, renderer_1.createFooter)())).toBe(true);
        (0, globals_1.expect)((0, renderer_1.createFooter)().length).toBeGreaterThan(0);
    });
    (0, globals_1.test)("has separator and quit items", () => {
        const labels = (0, renderer_1.createFooter)().map((item) => item.label);
        (0, globals_1.expect)(labels).toContain("Separator");
        (0, globals_1.expect)(labels).toContain("Quit");
    });
});
(0, globals_1.describe)("lastRefreshedSection", () => {
    (0, globals_1.test)("returns menu item with label", () => {
        const result = (0, renderer_1.lastRefreshedSection)("10:00:00");
        (0, globals_1.expect)(result.label).toBe("Last Refreshed: 10:00:00");
        (0, globals_1.expect)(result.type).toBe("normal");
    });
    (0, globals_1.test)("returns menu item with null time", () => {
        const result = (0, renderer_1.lastRefreshedSection)(null);
        (0, globals_1.expect)(result.label).toBe("Last Refreshed:");
    });
});
(0, globals_1.describe)("PRState", () => {
    (0, globals_1.test)("initializes with empty arrays", () => {
        const state = new pr_state_1.PRState();
        (0, globals_1.expect)(state.myPRs).toEqual([]);
        (0, globals_1.expect)(state.teamPRs).toEqual([]);
    });
    (0, globals_1.test)("can add team members", () => {
        const state = new pr_state_1.PRState();
        state.addTeamMember("testuser");
        (0, globals_1.expect)(state.teamMembers.has("testuser")).toBe(true);
    });
    (0, globals_1.test)("can remove team members", () => {
        const state = new pr_state_1.PRState();
        state.addTeamMember("testuser");
        state.removeTeamMember("testuser");
        (0, globals_1.expect)(state.teamMembers.has("testuser")).toBe(false);
    });
    (0, globals_1.test)("can track seen PRs", () => {
        const state = new pr_state_1.PRState();
        state.addSeenPR("https://github.com/pr/1");
        (0, globals_1.expect)(state.hasSeenPR("https://github.com/pr/1")).toBe(true);
        (0, globals_1.expect)(state.hasSeenPR("https://github.com/pr/2")).toBe(false);
    });
    (0, globals_1.test)("can set last refreshed time", () => {
        const state = new pr_state_1.PRState();
        state.setLastRefreshed();
        (0, globals_1.expect)(state.lastRefreshedTime).toBeDefined();
    });
});
(0, globals_1.describe)("GitHubService", () => {
    (0, globals_1.test)("is exported as a class", () => {
        (0, globals_1.expect)(typeof github_service_1.GitHubService).toBe("function");
    });
});
(0, globals_1.describe)("DisplayManager", () => {
    (0, globals_1.test)("is exported as a class", () => {
        (0, globals_1.expect)(typeof display_1.DisplayManager).toBe("function");
    });
});
//# sourceMappingURL=updateDisplay.test.js.map