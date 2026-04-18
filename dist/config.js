"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = void 0;
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
exports.CONFIG = {
    refreshIntervalMs: (parseInt(process.env.REFRESH_INTERVAL ?? "300", 10) || 300) * 1000,
    teamRefreshIntervalMs: 60 * 60 * 1000,
    titleMaxLength: 50,
    ciStatusEmoji: {
        ERROR: "⚠️",
        EXPECTED: "🟠",
        FAILURE: "🔴",
        PENDING: "🟠",
        SUCCESS: "🟢",
        null: "",
    },
    approvalEmoji: {
        APPROVED: "✅",
        CHANGES_REQUESTED: "❌",
        COMMENTED: "💬",
        DISMISSED: "⚠️",
        PENDING: "⏳",
        REVIEW_REQUIRED: "⏳",
        null: "",
    },
};
//# sourceMappingURL=config.js.map