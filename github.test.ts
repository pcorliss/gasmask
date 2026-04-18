import { describe, test, expect } from "@jest/globals";
import { GitHubService } from "./github-service";

describe("GitHubService", () => {
  test("is exported", () => {
    expect(typeof GitHubService).toBe("function");
  });
});