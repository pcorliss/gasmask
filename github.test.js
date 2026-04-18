const { queryGitHub, queryGitHubTeam } = require('./github');

describe('github module exports', () => {
  test('exports queryGitHub and queryGitHubTeam functions', () => {
    expect(typeof queryGitHub).toBe('function');
    expect(typeof queryGitHubTeam).toBe('function');
  });
});

describe('queryGitHubTeam', () => {
  test('is an async function', async () => {
    const result = queryGitHubTeam('org', 'team');
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toThrow();
  });
});

describe('queryGitHub', () => {
  test('is an async function', async () => {
    const result = queryGitHub('is:pr author:me');
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toThrow();
  });
});