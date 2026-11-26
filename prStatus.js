const FAILED_CHECK_STATES = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE']);

function checkResult(check) {
  return check.context ? check.state : (check.status === 'COMPLETED' ? check.conclusion : 'PENDING');
}

function currentChecks(pr) {
  const checks = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes || [];
  const latest = new Map();
  const entries = checks.map(check => {
    const suite = check.checkSuite;
    const run = suite?.workflowRun;
    // A newer invocation of the same workflow supersedes its older checks on this commit.
    // Keep unrelated apps/workflows and ambiguous duplicates within one run independent.
    const key = check.name && suite?.app?.id && run?.workflow?.id && Number.isInteger(run.runNumber) && run.runNumber > 0
      ? JSON.stringify([suite.app.id, run.workflow.id, check.name]) : null;
    if (key) latest.set(key, Math.max(latest.get(key) || 0, run.runNumber));
    return { check, key, runNumber: run?.runNumber };
  });
  return entries.filter(({ key, runNumber }) => !key || runNumber === latest.get(key)).map(({ check }) => check);
}

function getCheckState(pr) {
  const rollup = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup;
  if (rollup === null) return null;
  const checks = currentChecks(pr);
  // GitHub's rollup can still include superseded failures. Only recompute from a complete list.
  if (rollup?.contexts?.pageInfo?.hasNextPage !== false || !Array.isArray(rollup.contexts.nodes) || checks.length === rollup.contexts.nodes.length) return rollup?.state;
  const states = checks.map(checkResult);
  if (states.some(state => FAILED_CHECK_STATES.has(state))) return 'FAILURE';
  if (states.some(state => ['PENDING', 'EXPECTED'].includes(state))) return 'PENDING';
  if (states.some(state => !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(state))) return 'UNKNOWN';
  return 'SUCCESS';
}

function hasApproval(pr) {
  return pr.reviewDecision === 'APPROVED' ||
    (pr.latestOpinionatedReviews?.nodes || []).some(review => review.state === 'APPROVED');
}

function getPolicyStatus(pr) {
  const rollup = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup;
  const contexts = rollup?.contexts;
  // A truncated or unavailable check list cannot establish policy approval.
  if (rollup !== null && (!Array.isArray(contexts?.nodes) || contexts.pageInfo?.hasNextPage !== false)) {
    return { state: 'unknown', label: 'Policy unknown', details: 'Check results are incomplete.' };
  }

  const checks = currentChecks(pr).filter(check => {
    const name = check.context || check.name;
    // Ignore policy lint jobs and results for a previous target branch.
    return name === 'policy-bot' || name === `policy-bot: ${pr.baseRefName}`;
  });
  if (checks.length === 0) {
    return { state: 'absent', label: 'No policy result', details: 'No policy-bot result for the target branch.' };
  }

  const states = checks.map(checkResult);
  const details = checks.map(check => `${check.context || check.name}: ${check.description || check.conclusion || check.state || check.status}`).join('\n');
  if (states.some(state => FAILED_CHECK_STATES.has(state))) {
    return { state: 'failed', label: 'Policy failed', details };
  }
  if (states.some(state => ['PENDING', 'EXPECTED'].includes(state))) {
    return { state: 'pending', label: 'Policy pending', details };
  }
  if (states.every(state => state === 'SUCCESS')) {
    return { state: 'approved', label: 'Policy approved', details };
  }
  return { state: 'unknown', label: 'Policy unknown', details };
}

function getPRReadiness(pr) {
  const policy = getPolicyStatus(pr);
  const result = (group, label) => ({ group, label, policy });
  if (pr.isDraft) return result('draft', '📝 Draft');
  if (policy.state === 'failed') return result('blocked', '⚠️ Blocked');
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return result('review', '❌ Changes requested');
  if (policy.state === 'pending' || pr.reviewDecision === 'REVIEW_REQUIRED') {
    return result('review', '⏳ Needs review');
  }
  if (pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY') {
    return result('blocked', '⚠️ Merge conflicts');
  }
  if (pr.mergeStateStatus === 'BEHIND') return result('blocked', '⏳ Update branch');

  const checkState = getCheckState(pr);
  if (['FAILURE', 'ERROR'].includes(checkState)) return result('blocked', '⚠️ Checks failed');
  if (['PENDING', 'EXPECTED'].includes(checkState)) return result('blocked', '⏳ Checks pending');
  if (policy.state === 'unknown') return result('blocked', '⏳ Status unknown');
  if (pr.mergeable !== 'MERGEABLE') return result('blocked', '⏳ Checking mergeability');
  // Approval alone is insufficient: GitHub must also report a clean merge.
  if (pr.mergeStateStatus === 'CLEAN' && (checkState === null || checkState === 'SUCCESS')) {
    return result('ready', '✅ Ready to merge');
  }
  if (pr.mergeStateStatus === 'HAS_HOOKS') return result('blocked', '⏳ Merge hooks');
  if (pr.mergeStateStatus === 'BLOCKED') return result('blocked', '⚠️ Merge blocked');
  if (pr.mergeStateStatus === 'UNSTABLE') return result('blocked', '⚠️ Checks not passing');
  return result('blocked', '⏳ Checking mergeability');
}

function getTeamPRReadiness(pr) {
  const readiness = getPRReadiness(pr);
  if (readiness.group !== 'blocked') return readiness;

  const approved = readiness.policy.state === 'approved' ||
    (readiness.policy.state === 'absent' && hasApproval(pr));
  const checkState = getCheckState(pr);
  if (!approved || (checkState !== null && checkState !== 'SUCCESS')) return readiness;

  // Review is complete; the author can handle the remaining branch update.
  if (pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY') {
    return { ...readiness, group: 'ready', label: '🛠️ Rebase conflicts' };
  }
  if (pr.mergeStateStatus === 'BEHIND' && pr.mergeable === 'MERGEABLE') {
    return { ...readiness, group: 'ready', label: '🔄 Rebase needed' };
  }
  return readiness;
}

function getOtherChecks(pr) {
  const rollup = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup;
  const contexts = rollup?.contexts;
  const checks = currentChecks(pr).filter(check => !/^policy-bot(?::|$)/.test(check.context || check.name || ''));
  const states = checks.map(checkResult);
  let state = 'passed';
  if (states.some(value => FAILED_CHECK_STATES.has(value))) state = 'failed';
  else if (rollup !== null && (!Array.isArray(contexts?.nodes) || contexts.pageInfo?.hasNextPage !== false)) state = 'unknown';
  else if (states.some(value => ['PENDING', 'EXPECTED'].includes(value))) state = 'pending';
  else if (states.some(value => !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(value))) state = 'unknown';
  else if (!checks.length) state = 'none';
  return { state, label: { passed: 'Passed', failed: 'Failed', pending: 'Pending', unknown: 'Unknown', none: 'None' }[state], checks };
}

module.exports = { getPolicyStatus, getPRReadiness, getTeamPRReadiness, getOtherChecks, getCheckState, hasApproval };
