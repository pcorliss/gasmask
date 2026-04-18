const fs = require("fs");
const path = require("path");
require("dotenv").config();

const GITHUB_TOKEN = process.env.GH_TOKEN;
const GH_API_URL = process.env.GH_API_URL;
const GH_GRAPHQL_URL = process.env.GH_GRAPHQL_URL;

async function queryGitHubTeam(org, team) {
  const fetch = globalThis.fetch ?? (await import("node-fetch")).default;

  const url = `${GH_API_URL}/orgs/${org}/teams/${team}/members`;

  console.log("URL:", url);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function queryGitHub(searchQuery) {
  const fetch = globalThis.fetch ?? (await import("node-fetch")).default;

  const graphQuery = fs.readFileSync(path.join(__dirname, "pr_query.graphql"), "utf8");
  const requestBody = graphQuery.replace("$query", searchQuery);

  console.log("Request Body:", requestBody);

  const response = await fetch(GH_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: requestBody }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

module.exports = { queryGitHub, queryGitHubTeam };