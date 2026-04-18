import * as fs from "fs";
import * as path from "path";

export type GitHubMember = {
  login: string;
};

export interface CommitNode {
  commit: {
    statusCheckRollup: {
      state: string | null;
    };
  };
}

export interface PRNode {
  title: string;
  url: string;
  reviewDecision: string | null;
  commits: {
    nodes: CommitNode[];
  } | null;
  createdAt: string;
  createdAtTime?: number;
}

export interface SearchResponse {
  data: {
    search: {
      edges: Array<{ node: PRNode }>;
    };
  };
}

export type TeamMembersResponse = GitHubMember[];

export class GitHubService {
  #token: string;
  #apiUrl: string;
  #graphqlUrl: string;

  constructor() {
    this.#token = process.env.GH_TOKEN ?? "";
    this.#apiUrl = process.env.GH_API_URL ?? "";
    this.#graphqlUrl = process.env.GH_GRAPHQL_URL ?? "";
  }

  async #fetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    const fetch = globalThis.fetch ?? (await import("node-fetch")).default;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.#token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async getTeamMembers(org: string, team: string): Promise<TeamMembersResponse> {
    const url = `${this.#apiUrl}/orgs/${org}/teams/${team}/members`;
    console.log("URL:", url);
    return this.#fetch<TeamMembersResponse>(url, { method: "GET" });
  }

  async searchPRs(searchQuery: string): Promise<SearchResponse> {
    const graphQuery = fs.readFileSync(path.join(__dirname, "..", "pr_query.graphql"), "utf8");
    const requestBody = graphQuery.replace("$query", searchQuery);

    console.log("Request Body:", requestBody);

    return this.#fetch<SearchResponse>(this.#graphqlUrl, {
      method: "POST",
      body: JSON.stringify({ query: requestBody }),
    });
  }
}