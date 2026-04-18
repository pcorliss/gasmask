const fs = require("fs");
const path = require("path");

class GitHubService {
  #token;
  #apiUrl;
  #graphqlUrl;

  constructor() {
    this.#token = process.env.GH_TOKEN;
    this.#apiUrl = process.env.GH_API_URL;
    this.#graphqlUrl = process.env.GH_GRAPHQL_URL;
  }

  async #fetch(url, options = {}) {
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

    return response.json();
  }

  async getTeamMembers(org, team) {
    const url = `${this.#apiUrl}/orgs/${org}/teams/${team}/members`;
    console.log("URL:", url);
    return this.#fetch(url, { method: "GET" });
  }

  async searchPRs(searchQuery) {
    const graphQuery = fs.readFileSync(path.join(__dirname, "pr_query.graphql"), "utf8");
    const requestBody = graphQuery.replace("$query", searchQuery);

    console.log("Request Body:", requestBody);

    return this.#fetch(this.#graphqlUrl, {
      method: "POST",
      body: JSON.stringify({ query: requestBody }),
    });
  }
}

module.exports = { GitHubService };