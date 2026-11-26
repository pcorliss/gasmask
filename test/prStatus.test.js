const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getPolicyStatus, getPRReadiness, getTeamPRReadiness, getOtherChecks, getCheckState, hasApproval } = require('../prStatus');

function pr({ checks, checkState = 'SUCCESS', hasNextPage = false, ...fields } = {}) {
  return {
    baseRefName: 'main',
    isDraft: false,
    reviewDecision: null,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    commits: { nodes: [{ commit: { statusCheckRollup: {
      state: checkState,
      contexts: {
        pageInfo: { hasNextPage },
        nodes: checks || [{ context: 'policy-bot: main', state: 'SUCCESS', description: 'All rules are approved' }],
      },
    } } }] },
    ...fields,
  };
}

test('policy approval works when GitHub has no native review decision', () => {
  const result = getPRReadiness(pr());
  assert.equal(result.group, 'ready');
  assert.equal(result.policy.state, 'approved');
  assert.match(result.policy.details, /All rules are approved/);
});

test('an individual approval does not satisfy pending policy rules', () => {
  const pullRequest = pr({
    latestOpinionatedReviews: { nodes: [{ state: 'APPROVED' }] },
    checks: [{ context: 'policy-bot: main', state: 'PENDING', description: '0/1 rules approved' }],
  });
  assert.equal(hasApproval(pullRequest), true);
  assert.equal(getPRReadiness(pullRequest).group, 'review');
  assert.equal(getPolicyStatus(pullRequest).state, 'pending');
  assert.match(getPolicyStatus(pullRequest).details, /0\/1 rules approved/);
});

for (const [reason, fields, group] of [
  ['draft', { isDraft: true }, 'draft'],
  ['required review', { reviewDecision: 'REVIEW_REQUIRED' }, 'review'],
  ['requested changes', { reviewDecision: 'CHANGES_REQUESTED' }, 'review'],
  ['merge conflicts', { mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }, 'blocked'],
  ['outdated branch', { mergeStateStatus: 'BEHIND' }, 'blocked'],
  ['GitHub block', { mergeStateStatus: 'BLOCKED' }, 'blocked'],
  ['unknown merge', { mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' }, 'blocked'],
  ['missing merge data', { mergeable: undefined, mergeStateStatus: undefined }, 'blocked'],
  ['merge hooks', { mergeStateStatus: 'HAS_HOOKS' }, 'blocked'],
  ['non-passing optional checks', { mergeStateStatus: 'UNSTABLE' }, 'blocked'],
  ['failed CI', { checkState: 'FAILURE' }, 'blocked'],
  ['pending CI', { checkState: 'PENDING' }, 'blocked'],
  ['truncated checks', { hasNextPage: true }, 'blocked'],
  ['missing check data', { commits: { nodes: [] } }, 'blocked'],
]) {
  test(`policy passing cannot hide ${reason}`, () => {
    assert.equal(getPRReadiness(pr(fields)).group, group);
  });
}

test('policy lint jobs and results for a different target are not approvals', () => {
  const result = getPolicyStatus(pr({ checks: [
    { name: 'Lint .policy.yml', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { context: 'policy-bot: master', state: 'SUCCESS' },
  ] }));
  assert.equal(result.state, 'absent');
});

test('the policy result follows a retargeted PR', () => {
  const result = getPolicyStatus(pr({ baseRefName: 'release', checks: [
    { context: 'policy-bot: main', state: 'SUCCESS' },
    { context: 'policy-bot: release', state: 'PENDING' },
  ] }));
  assert.equal(result.state, 'pending');
});

test('a generic policy context is supported', () => {
  assert.equal(getPolicyStatus(pr({ checks: [{ context: 'policy-bot', state: 'SUCCESS' }] })).state, 'approved');
});

test('a failed policy result takes precedence over passing results', () => {
  const pullRequest = pr({ checks: [
    { context: 'policy-bot', state: 'SUCCESS' },
    { context: 'policy-bot: main', state: 'FAILURE' },
  ] });
  assert.equal(getPolicyStatus(pullRequest).state, 'failed');
  assert.equal(getPRReadiness(pullRequest).group, 'blocked');
});

for (const [status, conclusion, expected] of [
  ['COMPLETED', 'SUCCESS', 'approved'],
  ['IN_PROGRESS', null, 'pending'],
  ['QUEUED', null, 'pending'],
  ['COMPLETED', 'FAILURE', 'failed'],
  ['COMPLETED', 'TIMED_OUT', 'failed'],
  ['COMPLETED', 'CANCELLED', 'failed'],
  ['COMPLETED', 'NEUTRAL', 'unknown'],
  ['COMPLETED', 'SKIPPED', 'unknown'],
]) {
  test(`policy check run ${status}/${conclusion} is ${expected}`, () => {
    assert.equal(getPolicyStatus(pr({ checks: [{ name: 'policy-bot: main', status, conclusion }] })).state, expected);
  });
}

test('a clean PR without checks can be ready without claiming policy passed', () => {
  const result = getPRReadiness(pr({ commits: { nodes: [{ commit: { statusCheckRollup: null } }] } }));
  assert.equal(result.group, 'ready');
  assert.equal(result.policy.state, 'absent');
});

test('native GitHub protections still apply when no policy result exists', () => {
  assert.equal(getPRReadiness(pr({ checks: [], mergeStateStatus: 'BLOCKED' })).group, 'blocked');
  assert.equal(getPRReadiness(pr({ checks: [], reviewDecision: 'REVIEW_REQUIRED' })).group, 'review');
});

test('dismissed reviews do not count as approvals', () => {
  assert.equal(hasApproval(pr({ latestOpinionatedReviews: { nodes: [{ state: 'DISMISSED' }] } })), false);
});

const rebaseCases = [
  [{ mergeStateStatus: 'BEHIND' }, '🔄 Rebase needed'],
  [{ mergeStateStatus: 'DIRTY', mergeable: 'CONFLICTING' }, '🛠️ Rebase conflicts'],
];

for (const [fields, label] of rebaseCases) {
  test(`approved Team PRs show ${label} in the ready group; My PRs remain blocked`, () => {
    const pullRequest = pr(fields);
    assert.equal(getTeamPRReadiness(pullRequest).group, 'ready');
    assert.equal(getTeamPRReadiness(pullRequest).label, label);
    assert.equal(getPRReadiness(pullRequest).group, 'blocked');
  });
}

test('Team rebase grouping accepts native or individual approval when policy is absent', () => {
  for (const [fields] of rebaseCases) {
    for (const approval of [
      { reviewDecision: 'APPROVED' },
      { latestOpinionatedReviews: { nodes: [{ state: 'APPROVED' }] } },
    ]) {
      assert.equal(getTeamPRReadiness(pr({ ...fields, ...approval, checks: [] })).group, 'ready');
    }
  }
});

for (const [reason, fields] of [
  ['no approval', { checks: [] }],
  ['required reviews', { reviewDecision: 'REVIEW_REQUIRED' }],
  ['requested changes', { reviewDecision: 'CHANGES_REQUESTED' }],
  ['draft', { isDraft: true }],
  ['pending policy', { reviewDecision: 'APPROVED', checks: [{ context: 'policy-bot: main', state: 'PENDING' }] }],
  ['failed policy', { reviewDecision: 'APPROVED', checks: [{ context: 'policy-bot: main', state: 'FAILURE' }] }],
  ['unknown policy', { hasNextPage: true }],
  ['failed checks', { checkState: 'FAILURE' }],
  ['pending checks', { checkState: 'PENDING' }],
]) {
  test(`Team rebase grouping does not hide ${reason}`, () => {
    for (const [rebaseFields] of rebaseCases) {
      assert.notEqual(getTeamPRReadiness(pr({ ...rebaseFields, ...fields })).group, 'ready');
    }
  });
}

test('Team rebase grouping does not bypass other merge blockers', () => {
  for (const mergeStateStatus of ['BLOCKED', 'UNKNOWN', 'UNSTABLE', 'HAS_HOOKS']) {
    assert.equal(getTeamPRReadiness(pr({ mergeStateStatus })).group, 'blocked');
  }
  assert.equal(getTeamPRReadiness(pr({ mergeStateStatus: 'BEHIND', mergeable: 'UNKNOWN' })).group, 'blocked');
});

test('other checks can pass while policy is pending', () => {
  const pullRequest = pr({ checkState: 'PENDING', checks: [
    { context: 'policy-bot: main', state: 'PENDING' },
    { name: 'Build', status: 'COMPLETED', conclusion: 'SUCCESS' },
  ] });
  assert.equal(getPolicyStatus(pullRequest).state, 'pending');
  assert.equal(getOtherChecks(pullRequest).state, 'passed');
  assert.deepEqual(getOtherChecks(pullRequest).checks.map(check => check.name), ['Build']);
});

test('other checks distinguish absent, incomplete and failed results', () => {
  assert.equal(getOtherChecks(pr()).state, 'none');
  assert.equal(getOtherChecks(pr({ hasNextPage: true })).state, 'unknown');
  assert.equal(getOtherChecks(pr({ checks: [{ name: 'Build', status: 'COMPLETED', conclusion: 'FAILURE' }] })).state, 'failed');
});

const workflowCheck = (runNumber, conclusion, fields = {}) => ({
  name: 'Lint Pull Request Title & Body', status: 'COMPLETED', conclusion,
  detailsUrl: `https://github.example/actions/runs/${runNumber}`,
  checkSuite: { app: { id: 'github-actions' }, workflowRun: { runNumber, workflow: { id: 'linting-jobs' } } },
  ...fields,
});
const approvedPolicy = { context: 'policy-bot: main', state: 'SUCCESS' };

test('a successful newer workflow run supersedes a failed run on the same commit', () => {
  const old = workflowCheck(10, 'FAILURE', { completedAt: '2026-11-26T13:30:00Z' });
  const latest = workflowCheck(11, 'SUCCESS', { completedAt: '2026-11-26T13:21:31Z' });
  for (const checks of [[old, latest, approvedPolicy], [approvedPolicy, latest, old]]) {
    const pullRequest = pr({ checkState: 'FAILURE', checks });
    assert.equal(getPRReadiness(pullRequest).group, 'ready');
    assert.equal(getCheckState(pullRequest), 'SUCCESS');
    assert.equal(getOtherChecks(pullRequest).state, 'passed');
    assert.deepEqual(getOtherChecks(pullRequest).checks, [latest]);
  }
});

test('a newer failed or running workflow cannot be hidden by an older success', () => {
  for (const latest of [workflowCheck(11, 'FAILURE'), workflowCheck(11, null, { status: 'QUEUED' })]) {
    const pullRequest = pr({ checkState: 'FAILURE', checks: [approvedPolicy, latest, workflowCheck(10, 'SUCCESS')] });
    assert.equal(getPRReadiness(pullRequest).group, 'blocked');
    assert.equal(getOtherChecks(pullRequest).state, latest.conclusion ? 'failed' : 'pending');
    assert.equal(getCheckState(pullRequest), latest.conclusion ? 'FAILURE' : 'PENDING');
  }
});

test('checks with the same name from different workflows or apps remain independent', () => {
  for (const checkSuite of [
    { app: { id: 'github-actions' }, workflowRun: { runNumber: 11, workflow: { id: 'another-workflow' } } },
    { app: { id: 'another-app' }, workflowRun: { runNumber: 11, workflow: { id: 'linting-jobs' } } },
    null,
  ]) {
    const pullRequest = pr({ checkState: 'FAILURE', checks: [approvedPolicy, workflowCheck(10, 'FAILURE'), workflowCheck(11, 'SUCCESS', { checkSuite })] });
    assert.equal(getPRReadiness(pullRequest).group, 'blocked');
    assert.equal(getOtherChecks(pullRequest).checks.length, 2);
  }
});

test('ambiguous same-run duplicates and incomplete lists cannot establish readiness', () => {
  const sameRun = pr({ checkState: 'FAILURE', checks: [approvedPolicy, workflowCheck(11, 'FAILURE'), workflowCheck(11, 'SUCCESS')] });
  assert.equal(getPRReadiness(sameRun).group, 'blocked');
  assert.equal(getOtherChecks(sameRun).checks.length, 2);
  const truncated = pr({ checkState: 'FAILURE', hasNextPage: true, checks: [approvedPolicy, workflowCheck(10, 'FAILURE'), workflowCheck(11, 'SUCCESS')] });
  assert.equal(getPRReadiness(truncated).group, 'blocked');
  assert.equal(getCheckState(truncated), 'FAILURE');
  assert.equal(getOtherChecks(truncated).state, 'unknown');
  const missing = pr();
  missing.commits.nodes[0].commit.statusCheckRollup.contexts.nodes = null;
  assert.equal(getPRReadiness(missing).group, 'blocked');
  assert.equal(getOtherChecks(missing).state, 'unknown');
});

test('superseded failures do not hide current failures, pending checks, or native blockers', () => {
  const checks = [approvedPolicy, workflowCheck(10, 'FAILURE'), workflowCheck(11, 'SUCCESS')];
  for (const current of [
    { context: 'deploy', state: 'FAILURE' },
    { context: 'deploy', state: 'PENDING' },
    workflowCheck(11, 'FAILURE', { name: 'Build' }),
  ]) assert.equal(getPRReadiness(pr({ checkState: 'FAILURE', checks: [...checks, current] })).group, 'blocked');
  for (const mergeStateStatus of ['BLOCKED', 'DIRTY', 'BEHIND', 'UNKNOWN', 'UNSTABLE', 'HAS_HOOKS']) {
    assert.equal(getPRReadiness(pr({ checkState: 'FAILURE', checks, mergeStateStatus })).group, 'blocked');
  }
  assert.equal(getPRReadiness(pr({ checkState: 'FAILURE', checks, reviewDecision: 'REVIEW_REQUIRED' })).group, 'review');
});

test('policy check runs and Team rebase grouping also use the current workflow results', () => {
  const policyChecks = [workflowCheck(10, 'FAILURE', { name: 'policy-bot: main' }), workflowCheck(11, 'SUCCESS', { name: 'policy-bot: main' })];
  assert.equal(getPolicyStatus(pr({ checkState: 'FAILURE', checks: policyChecks })).state, 'approved');
  for (const [fields] of rebaseCases) {
    assert.equal(getTeamPRReadiness(pr({ ...fields, checkState: 'FAILURE', checks: [approvedPolicy, workflowCheck(10, 'FAILURE'), workflowCheck(11, 'SUCCESS')] })).group, 'ready');
  }
});
