const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getPolicyStatus, getPRReadiness, hasApproval } = require('../prStatus');

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
