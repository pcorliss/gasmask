import { config as dotenvConfig } from "dotenv";

dotenvConfig();

export interface Config {
  refreshIntervalMs: number;
  teamRefreshIntervalMs: number;
  titleMaxLength: number;
  ciStatusEmoji: Record<string, string>;
  approvalEmoji: Record<string, string>;
}

export const CONFIG: Config = {
  get refreshIntervalMs() {
    return (parseInt(process.env.REFRESH_INTERVAL ?? "300", 10) || 300) * 1000;
  },
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