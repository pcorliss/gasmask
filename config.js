require("dotenv").config();

const CONFIG = {
  refreshIntervalMs: (parseInt(process.env.REFRESH_INTERVAL, 10) || 300) * 1000,
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

module.exports = { CONFIG };