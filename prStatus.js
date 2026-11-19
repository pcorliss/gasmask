function hasApproval(pr) {
  return pr.reviewDecision === 'APPROVED' ||
    (pr.latestOpinionatedReviews?.nodes || []).some(review => review.state === 'APPROVED');
}

function getPolicyStatus(pr) {
  const rollup = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup;
  const contexts = rollup?.contexts;
  // A truncated or unavailable check list cannot establish policy approval.
  if (rollup !== null && (!contexts || contexts.pageInfo?.hasNextPage !== false)) {
    return { state: 'unknown', label: 'Policy unknown', details: 'Check results are incomplete.' };
  }

  const checks = (contexts?.nodes || []).filter(check => {
    const name = check.context || check.name;
    // Ignore policy lint jobs and results for a previous target branch.
    return name === 'policy-bot' || name === `policy-bot: ${pr.baseRefName}`;
  });
  if (checks.length === 0) {
    return { state: 'absent', label: 'No policy result', details: 'No policy-bot result for the target branch.' };
  }

  const states = checks.map(check => check.context ? check.state :
    (check.status === 'COMPLETED' ? check.conclusion : 'PENDING'));
  const details = checks.map(check => `${check.context || check.name}: ${check.description || check.conclusion || check.state || check.status}`).join('\n');
  if (states.some(state => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE'].includes(state))) {
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

  const rollup = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup;
  if (['FAILURE', 'ERROR'].includes(rollup?.state)) return result('blocked', '⚠️ Checks failed');
  if (['PENDING', 'EXPECTED'].includes(rollup?.state)) return result('blocked', '⏳ Checks pending');
  if (policy.state === 'unknown') return result('blocked', '⏳ Status unknown');
  if (pr.mergeable !== 'MERGEABLE') return result('blocked', '⏳ Checking mergeability');
  // Approval alone is insufficient: GitHub must also report a clean merge.
  if (pr.mergeStateStatus === 'CLEAN' && (rollup === null || rollup?.state === 'SUCCESS')) {
    return result('ready', '✅ Ready to merge');
  }
  if (pr.mergeStateStatus === 'HAS_HOOKS') return result('blocked', '⏳ Merge hooks');
  if (pr.mergeStateStatus === 'BLOCKED') return result('blocked', '⚠️ Merge blocked');
  if (pr.mergeStateStatus === 'UNSTABLE') return result('blocked', '⚠️ Checks not passing');
  return result('blocked', '⏳ Checking mergeability');
}

module.exports = { getPolicyStatus, getPRReadiness, hasApproval };
