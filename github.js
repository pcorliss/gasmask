const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const GITHUB_GRAPHQL_URL = process.env.GH_API_URL + '/graphql';
const GITHUB_TOKEN = process.env.GH_TOKEN;

async function queryGitHubTeam(org, team) {
  const fetch = (await import('node-fetch')).default; // Dynamically import node-fetch
  const url = process.env.GH_API_URL + `/orgs/${org}/teams/${team}/members`

  console.log('URL:', url);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  // Parse the response
  if (!response.ok) {
    throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

async function queryGitHub(query) {
  const fetch = (await import('node-fetch')).default; // Dynamically import node-fetch
  // Load the GraphQL query from the file
  const graphQuery = fs.readFileSync(path.join(__dirname, 'pr_query.graphql'), 'utf8');

  const requestBody = graphQuery.replace('$query', query);

  console.log('Request Body:', requestBody);

  // Make the POST request
  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({query: requestBody}),
  });

  // Parse the response
  if (!response.ok) {
    throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

module.exports = { queryGitHub, queryGitHubTeam };

