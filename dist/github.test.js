"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const github_service_1 = require("./github-service");
(0, globals_1.describe)("GitHubService", () => {
    (0, globals_1.test)("is exported", () => {
        (0, globals_1.expect)(typeof github_service_1.GitHubService).toBe("function");
    });
});
//# sourceMappingURL=github.test.js.map