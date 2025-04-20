const fetch = require('node-fetch');

async function refreshGitHub(owner, repo, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
    }

    const pullRequests = await response.json();
    return pullRequests.map(pr => ({
      title: pr.title,
      number: pr.number,
      url: pr.html_url,
      user: pr.user.login,
    }));
  } catch (error) {
    console.error('Error fetching GitHub PRs:', error);
    throw error;
  }
}

module.exports = { refreshGitHub };