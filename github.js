const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
const GITHUB_TOKEN = process.env.GH_TOKEN; // Ensure your token is set in the environment

async function queryGitHub(author) {
  const fetch = (await import('node-fetch')).default; // Dynamically import node-fetch
  // Load the GraphQL query from the file
  const query = fs.readFileSync(path.join(__dirname, 'pr_query.graphql'), 'utf8');

  const requestBody = query.replace('$author', author);

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

module.exports = { queryGitHub };

