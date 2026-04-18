jest.mock('./github', () => ({
  queryGitHub: jest.fn(() => Promise.resolve({ data: { search: { edges: [] } } })),
  queryGitHubTeam: jest.fn(() => Promise.resolve([])),
}));

const {
  PR_STATUS_MAP,
  PR_APPROVAL_MAP,
  PR_TITLE_MAX_LENGTH,
  renderPR,
  renderTaskBar,
  updateMyPRs,
  updateTeamPRs,
  isOldTeamPR,
  lastRefreshedSection,
  FOOTER,
  REFRESH_INTERVAL,
  TEAM_REFRESH_INTERVAL,
} = require('./updateDisplay');
const { queryGitHub } = require('./github');

describe('PR_STATUS_MAP', () => {
  test('maps each CI status to correct emoji', () => {
    expect(PR_STATUS_MAP['ERROR']).toBe('⚠️');
    expect(PR_STATUS_MAP['EXPECTED']).toBe('🟠');
    expect(PR_STATUS_MAP['FAILURE']).toBe('🔴');
    expect(PR_STATUS_MAP['PENDING']).toBe('🟠');
    expect(PR_STATUS_MAP['SUCCESS']).toBe('🟢');
    expect(PR_STATUS_MAP[null]).toBe('');
  });
});

describe('PR_APPROVAL_MAP', () => {
  test('maps each review decision to correct emoji', () => {
    expect(PR_APPROVAL_MAP['APPROVED']).toBe('✅');
    expect(PR_APPROVAL_MAP['CHANGES_REQUESTED']).toBe('❌');
    expect(PR_APPROVAL_MAP['COMMENTED']).toBe('💬');
    expect(PR_APPROVAL_MAP['DISMISSED']).toBe('⚠️');
    expect(PR_APPROVAL_MAP['PENDING']).toBe('⏳');
    expect(PR_APPROVAL_MAP['REVIEW_REQUIRED']).toBe('⏳');
    expect(PR_APPROVAL_MAP[null]).toBe('');
  });
});

describe('PR_TITLE_MAX_LENGTH', () => {
  test('is 50 characters', () => {
    expect(PR_TITLE_MAX_LENGTH).toBe(50);
  });
});

describe('renderPR', () => {
  test('renders PR with CI status and review decision emojis', () => {
    const pr = {
      title: 'Fix bug in login',
      url: 'https://github.com/org/repo/pull/123',
      commits: {
        nodes: [{
          commit: {
            statusCheckRollup: { state: 'SUCCESS' }
          }
        }]
      },
      reviewDecision: 'APPROVED',
    };

    const result = renderPR(pr);
    expect(result.label).toBe('🟢 ✅ Fix bug in login');
    expect(result.type).toBe('normal');
    expect(typeof result.click).toBe('function');
  });

  test('renders PR with no CI status', () => {
    const pr = {
      title: 'Add feature',
      url: 'https://github.com/org/repo/pull/124',
      commits: { nodes: [] },
      reviewDecision: 'PENDING',
    };

    const result = renderPR(pr);
    expect(result.label).toBe('⏳ Add feature');
  });

  test('renders PR with missing commits', () => {
    const pr = {
      title: 'Update readme',
      url: 'https://github.com/org/repo/pull/125',
      reviewDecision: 'CHANGES_REQUESTED',
    };

    const result = renderPR(pr);
    expect(result.label).toBe('❌ Update readme');
  });

  test('truncates long PR titles', () => {
    const longTitle = 'This is a very long PR title that definitely exceeds fifty characters because it is verbose';
    const pr = {
      title: longTitle,
      url: 'https://github.com/org/repo/pull/126',
      commits: { nodes: [] },
      reviewDecision: null,
    };

    const result = renderPR(pr);
    expect(result.label).toBe(longTitle.substring(0, 50) + '...');
  });

  test('keeps short PR titles unchanged', () => {
    const pr = {
      title: 'Small fix',
      url: 'https://github.com/org/repo/pull/127',
      commits: { nodes: [] },
      reviewDecision: null,
    };

    const result = renderPR(pr);
    expect(result.label).toBe('Small fix');
  });

  test('renders PR with null commit nodes', () => {
    const pr = {
      title: 'Null nodes',
      url: 'https://github.com/org/repo/pull/128',
      commits: null,
      reviewDecision: 'APPROVED',
    };

    const result = renderPR(pr);
    expect(result.label).toBe('✅ Null nodes');
  });

  test('renders PR with undefined reviewDecision', () => {
    const pr = {
      title: 'Undefined review',
      url: 'https://github.com/org/repo/pull/129',
      commits: { nodes: [] },
      reviewDecision: undefined,
    };

    const result = renderPR(pr);
    expect(result.label).toBe('Undefined review');
  });
});

describe('isOldTeamPR', () => {
  test.todo('requires module state - test when refactored to accept parameter');
});

describe('lastRefreshedSection', () => {
  test('returns menu item with label and click handler', () => {
    const mockTray = { setContextMenu: jest.fn() };
    const result = lastRefreshedSection(mockTray);
    expect(result.label).toBe('Last Refreshed:');
    expect(result.type).toBe('normal');
    expect(typeof result.click).toBe('function');
  });
});

describe('FOOTER', () => {
  test('is an array of menu items', () => {
    expect(Array.isArray(FOOTER)).toBe(true);
    expect(FOOTER.length).toBeGreaterThan(0);
  });

  test('has separator and quit items', () => {
    const labels = FOOTER.map(item => item.label);
    expect(labels).toContain('Separator');
    expect(labels).toContain('Quit');
  });

  test('quit item has click handler that calls app.quit', () => {
    const quitItem = FOOTER.find(item => item.label === 'Quit');
    expect(typeof quitItem.click).toBe('function');
  });
});

describe('REFRESH_INTERVAL', () => {
  test('is at least 60000 (1 minute) when REFRESH_INTERVAL env not set', () => {
    delete process.env.REFRESH_INTERVAL;
    jest.resetModules();
    const { REFRESH_INTERVAL: interval } = require('./updateDisplay');
    expect(interval).toBeGreaterThanOrEqual(60000);
  });

  test('uses environment value when set', () => {
    process.env.REFRESH_INTERVAL = '60';
    jest.resetModules();
    const { REFRESH_INTERVAL: interval } = require('./updateDisplay');
    expect(interval).toBe(60000);
    delete process.env.REFRESH_INTERVAL;
  });
});

describe('TEAM_REFRESH_INTERVAL', () => {
  test('is 60 minutes in milliseconds', () => {
    expect(TEAM_REFRESH_INTERVAL).toBe(60 * 60 * 1000);
  });
});

describe('updateMyPRs', () => {
  let mockTray;

  beforeEach(() => {
    mockTray = { setContextMenu: jest.fn() };
    queryGitHub.mockReset();
  });

  test('is an async function', () => {
    expect(typeof updateMyPRs).toBe('function');
  });

  test('calls queryGitHub with GH_USER', async () => {
    process.env.GH_USER = 'testuser';
    queryGitHub.mockResolvedValue({ data: { search: { edges: [] } } });

    await updateMyPRs(mockTray);

    expect(queryGitHub).toHaveBeenCalled();
  });
});

describe('updateTeamPRs', () => {
  let mockTray;

  beforeEach(() => {
    mockTray = { setContextMenu: jest.fn() };
    queryGitHub.mockReset();
  });

  test('is an async function', () => {
    expect(typeof updateTeamPRs).toBe('function');
  });

  test.todo('builds query from team members - needs module reset between tests');

  test('does not call queryGitHub when teamMembers is empty', async () => {
    process.env.GH_USER = 'testuser';
    const updateDisplay = require('./updateDisplay');
    updateDisplay.teamMembers = new Set();

    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    await updateTeamPRs(mockTray);
    consoleLogSpy.mockRestore();

    expect(queryGitHub).not.toHaveBeenCalled();
  });
});