'use strict';

const api = window.gasmask;
const $ = id => document.getElementById(id);
const groupNames = { ready: 'Ready to merge', review: 'Needs review', blocked: 'Blocked / checking', draft: 'Drafts' };
let snapshot;
let view = { readiness: 'all', selectedURL: null };
let searchTimer;
let localError = '';
let detailKey = '';
let choicesKey = '';
let mergingURL = null;

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function relativeDate(value) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(elapsed)) return 'Unknown';
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function fullDate(value) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown';
}

function human(value) {
  if (!value) return 'No result';
  const text = value.replaceAll('_', ' ').toLowerCase();
  return text[0].toUpperCase() + text.slice(1);
}

function badge(state, text) { return node('span', `badge ${state}`, text); }

async function action(callback) {
  localError = '';
  try { await callback(); }
  catch (error) { localError = error.message; }
  renderError();
}

function saveView() { api.saveView(view).catch(error => { localError = error.message; renderError(); }); }

function updateBrowser(callback) {
  return action(async () => receive(await callback()));
}

function readFilters() {
  const organization = $('organization').value.trim();
  const sameOrganization = organization.toLowerCase() === snapshot?.browser.filters.organization.toLowerCase();
  return {
    scope: snapshot?.browser.filters.scope || 'mine', search: $('search').value,
    organization, repository: sameOrganization ? $('repository').value : '',
    author: $('author').value, age: $('age').value,
  };
}

function applyFilters() {
  clearTimeout(searchTimer);
  updateBrowser(() => api.search(readFilters()));
}

function receive(state) {
  // An IPC reply can arrive after a newer pushed update, including during startup.
  if (snapshot && state.stateVersion < snapshot.stateVersion) return;
  if (!snapshot || snapshot.viewVersion !== state.viewVersion || snapshot.browser.filters.scope !== state.browser.filters.scope) {
    view = { readiness: 'all', selectedURL: null, ...state.view };
  }
  snapshot = state;
  render();
}

function renderError() {
  const error = localError || snapshot?.browser.error;
  $('error').hidden = !error;
  const retained = snapshot?.browser.prs.length ? ' Previous results are still shown.' : '';
  $('error-text').textContent = error ? error + retained : '';
}

function renderRepositories() {
  const organization = $('organization').value.trim().toLowerCase();
  $('repository').disabled = !organization;
  $('repository').placeholder = organization ? 'All repositories' : 'Choose organization';
  const repositories = (snapshot?.browser.repositories || [])
    .filter(repo => repo.split('/')[0].toLowerCase() === organization)
    .map(repo => repo.split('/')[1]);
  $('repositories').replaceChildren(...repositories.map(repo => { const option = node('option'); option.value = repo; return option; }));
}

function renderControls() {
  const { filters, repositories, authors, ageFilterDays, loading, loadingMore } = snapshot.browser;
  document.querySelectorAll('[data-scope]').forEach(button => {
    const selected = button.dataset.scope === filters.scope;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $('view-title').textContent = filters.scope === 'team' ? 'Team PRs' : 'My PRs';
  $('view-description').textContent = filters.scope === 'team' ? 'Review work that needs your attention. Approved PRs come last.' : 'All your open pull requests, including older work.';
  $('author-field').hidden = filters.scope !== 'team';
  const key = JSON.stringify([repositories, authors]);
  if (key !== choicesKey) {
    choicesKey = key;
    const organizations = [...new Set(repositories.map(repo => repo.split('/')[0]))].sort();
    $('organizations').replaceChildren(...organizations.map(org => { const option = node('option'); option.value = org; return option; }));
    const all = node('option', '', 'All team members'); all.value = '';
    $('author').replaceChildren(all, ...authors.map(author => { const option = node('option', '', author); option.value = author; return option; }));
  }
  for (const key of ['search', 'organization', 'repository', 'author', 'age']) {
    if (document.activeElement !== $(key)) $(key).value = filters[key];
  }
  if ($('organization').value.trim().toLowerCase() !== filters.organization.toLowerCase()) $('repository').value = '';
  renderRepositories();
  $('age').options[1].textContent = `Last ${ageFilterDays} days`;
  $('age').options[2].textContent = `Over ${ageFilterDays} days ago`;
  $('refresh').disabled = loading || loadingMore;
  $('refresh').textContent = loading ? 'Refreshing…' : '↻ Refresh';
}

function renderReadiness() {
  const counts = Object.fromEntries(Object.keys(groupNames).map(key => [key, snapshot.browser.prs.filter(pr => pr.readiness.group === key).length]));
  const buttons = [['all', 'All loaded', snapshot.browser.prs.length], ...Object.entries(groupNames).map(([key, name]) => [key, name, counts[key]])].map(([key, name, count]) => {
    const button = node('button', 'filter-chip');
    button.type = 'button';
    button.dataset.readiness = key;
    button.classList.toggle('active', view.readiness === key);
    button.setAttribute('aria-pressed', String(view.readiness === key));
    button.append(node('span', '', name), node('span', 'chip-count', count));
    button.addEventListener('click', () => { view.readiness = key; saveView(); render(); });
    return button;
  });
  $('readiness-filters').replaceChildren(...buttons);
}

function selectPR(url, focus = false) {
  view.selectedURL = url;
  saveView();
  // Keep the clicked row in the DOM so the second click can produce a dblclick.
  for (const row of $('pr-rows').querySelectorAll('.pr-row')) {
    const selected = row.dataset.url === url;
    row.classList.toggle('selected', selected);
    row.setAttribute('aria-selected', String(selected));
    row.tabIndex = selected ? 0 : -1;
  }
  renderDetails();
  if (focus) {
    const row = [...$('pr-rows').querySelectorAll('.pr-row')].find(row => row.dataset.url === url);
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: 'nearest' });
  }
}

function renderList() {
  const browser = snapshot.browser;
  const scroll = $('list-scroll');
  const scrollTop = scroll.scrollTop;
  const focusedURL = document.activeElement?.closest('.pr-row')?.dataset.url;
  const visible = browser.prs.filter(pr => view.readiness === 'all' || pr.readiness.group === view.readiness);
  const focusURL = visible.some(pr => pr.url === view.selectedURL) ? view.selectedURL : visible[0]?.url;
  const order = browser.filters.scope === 'team' ? ['review', 'blocked', 'draft', 'ready'] : ['ready', 'review', 'blocked', 'draft'];
  const rows = [];
  for (const group of order) {
    const prs = visible.filter(pr => pr.readiness.group === group);
    if (!prs.length) continue;
    const heading = node('tr', 'group-row');
    const label = node('th', '', groupNames[group]); label.colSpan = 4; label.scope = 'rowgroup';
    label.append(node('span', 'group-count', prs.length)); heading.append(label); rows.push(heading);
    for (const pr of prs) {
      const row = node('tr', 'pr-row');
      row.dataset.url = pr.url;
      row.tabIndex = focusURL === pr.url ? 0 : -1;
      row.classList.toggle('selected', view.selectedURL === pr.url);
      row.setAttribute('aria-selected', String(view.selectedURL === pr.url));
      const identity = node('td');
      const title = node('div', 'pr-title');
      if (pr.readiness.label.startsWith('🔄') || pr.readiness.label.startsWith('🛠')) {
        const icon = node('span', 'rebase-icon', pr.readiness.label.split(' ')[0]);
        icon.title = pr.readiness.label; icon.setAttribute('aria-label', pr.readiness.label); title.append(icon);
      }
      title.append(document.createTextNode(pr.title));
      const reference = `${pr.repository.name}#${pr.number}`;
      identity.append(title, node('div', 'pr-meta', `${reference} · ${pr.author?.login || 'Unknown author'} · opened ${relativeDate(pr.createdAt)}`));
      if (pr.reviewDecision === 'CHANGES_REQUESTED') identity.append(node('div', 'pr-reason', '❌ Changes requested'));
      else if (group === 'blocked') identity.append(node('div', 'pr-reason', pr.readiness.label));
      const policy = node('td');
      const policyNames = { approved: 'Approved', pending: 'Pending', failed: 'Failed', absent: 'Not reported', unknown: 'Unknown' };
      const policyBadge = badge(pr.readiness.policy.state, policyNames[pr.readiness.policy.state]);
      policyBadge.title = pr.readiness.policy.details; policy.append(policyBadge);
      const checks = node('td'); checks.append(badge(pr.otherChecks.state, pr.otherChecks.label));
      const updated = node('td', 'updated-cell', relativeDate(pr.updatedAt || pr.createdAt)); updated.title = fullDate(pr.updatedAt || pr.createdAt);
      row.append(identity, policy, checks, updated);
      row.title = 'Double-click to open in GitHub';
      row.addEventListener('click', () => selectPR(pr.url));
      row.addEventListener('dblclick', () => action(() => api.openURL(pr.url)));
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); action(() => api.openURL(pr.url)); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const all = [...$('pr-rows').querySelectorAll('.pr-row')];
          const index = all.findIndex(item => item.dataset.url === pr.url);
          const next = all[index + (event.key === 'ArrowDown' ? 1 : -1)];
          if (next) selectPR(next.dataset.url, true);
        }
      });
      rows.push(row);
    }
  }
  $('pr-rows').replaceChildren(...rows);
  $('empty').hidden = Boolean(visible.length);
  $('pr-table').hidden = !visible.length;
  if (!visible.length) {
    $('empty-title').textContent = browser.loading ? 'Loading open PRs…' : browser.error ? 'Could not load this view' : 'No matching PRs';
    $('empty-description').textContent = browser.loading ? 'Fetching the latest results from GitHub.' : browser.error ? 'Retry when your connection is available.' : browser.hasMore ? 'No matches in the loaded results. Load more to check the remaining PRs.' : 'Try changing the organization, repository, author, age, or readiness filter.';
  }
  scroll.scrollTop = scrollTop;
  if (focusedURL) [...$('pr-rows').querySelectorAll('.pr-row')].find(row => row.dataset.url === focusedURL)?.focus({ preventScroll: true });
  const total = browser.total || 0;
  $('result-count').textContent = browser.loading && !browser.prs.length ? 'Loading…' : `${browser.prs.length} of ${total} matching open PRs loaded${view.readiness !== 'all' ? ` · ${visible.length} shown` : ''}`;
  const limit = !browser.hasMore && browser.prs.length < total && browser.prs.length >= 1000;
  $('sync-status').textContent = limit ? 'GitHub search limit reached. Narrow the organization, repository, or age filter.' : `${browser.updatedAt ? `Updated ${new Date(browser.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ` : ''}Groups reflect loaded results.`;
  $('load-more').hidden = !browser.hasMore;
  $('load-more').disabled = browser.loading || browser.loadingMore;
  $('load-more').textContent = browser.loadingMore ? 'Loading…' : 'Load more';
}

function section(title) {
  const item = node('section', 'detail-section'); item.append(node('h3', '', title)); return item;
}

function renderDetails() {
  const pr = snapshot.browser.prs.find(pr => pr.url === view.selectedURL);
  $('detail-panel').hidden = !pr;
  $('workspace').classList.toggle('has-detail', Boolean(pr));
  if (!pr) { detailKey = ''; return; }
  const key = JSON.stringify([pr, mergingURL]);
  if (key === detailKey) return;
  detailKey = key;
  const focused = $('detail-panel').contains(document.activeElement) ? document.activeElement.id : '';
  const top = node('div', 'detail-top', 'PULL REQUEST DETAILS');
  const close = node('button', 'close-detail', '×'); close.id = 'close-detail'; close.setAttribute('aria-label', 'Close PR details');
  close.addEventListener('click', () => { view.selectedURL = null; saveView(); render(); }); top.append(close);
  const title = node('h2', 'detail-title', pr.title);
  const reference = node('div', 'detail-reference', `${pr.repository.nameWithOwner}#${pr.number}\n${pr.author?.login || 'Unknown author'} → ${pr.baseRefName}`);
  const actions = node('div', 'detail-actions');
  const methods = pr.mergeMethods || [];
  const open = node('button', `button ${methods.length ? 'secondary' : 'primary'}`, 'Open in GitHub ↗'); open.id = 'open-pr'; open.addEventListener('click', () => action(() => api.openURL(pr.url)));
  actions.append(open);
  if (methods.length) {
    const names = { MERGE: 'Create a merge commit', SQUASH: 'Squash and merge', REBASE: 'Rebase and merge' };
    const method = node('select'); method.id = 'merge-method'; method.dataset.url = pr.url;
    for (const value of methods) { const option = node('option', '', names[value]); option.value = value; method.append(option); }
    const previousMethod = $('merge-method');
    if (previousMethod?.dataset.url === pr.url && methods.includes(previousMethod.value)) method.value = previousMethod.value;
    if (methods.length > 1) {
      const label = node('label', 'merge-method'); label.append(node('span', '', 'Merge method'), method); actions.append(label);
    }
    method.disabled = Boolean(mergingURL);
    const merge = node('button', 'button primary', mergingURL === pr.url ? 'Merging…' : methods.length === 1 ? `${names[methods[0]]}…` : 'Merge…');
    merge.id = 'merge-pr'; merge.disabled = Boolean(mergingURL);
    merge.addEventListener('click', () => action(async () => {
      if (mergingURL) return;
      const chosenMethod = method.value;
      mergingURL = pr.url; renderDetails();
      $('notice').hidden = true;
      try {
        const result = await api.mergePR({ url: pr.url, headRefOid: pr.headRefOid, method: chosenMethod });
        if (result.merged) {
          $('notice').textContent = `Merged ${pr.repository.nameWithOwner}#${pr.number}.`;
          $('notice').hidden = false;
          if (view.selectedURL === pr.url) { view.selectedURL = null; saveView(); }
        }
      } finally { mergingURL = null; renderDetails(); }
    }));
    actions.append(merge);
  }
  const readiness = section('Readiness');
  readiness.append(node('div', 'detail-status', pr.readiness.label));
  if (pr.readiness.label.startsWith('🔄')) readiness.append(node('p', '', 'Review is complete. The author needs to update the branch before merging.'));
  if (pr.readiness.label.startsWith('🛠')) readiness.append(node('p', '', 'Review is complete. The author needs to resolve merge conflicts before merging.'));
  const policy = section('Policy-bot'); policy.append(badge(pr.readiness.policy.state, pr.readiness.policy.label), node('p', '', pr.readiness.policy.details));
  const reviews = section('GitHub reviews');
  reviews.append(node('p', '', pr.reviewDecision ? human(pr.reviewDecision) : 'No overall GitHub review decision.'));
  for (const review of pr.latestOpinionatedReviews?.nodes || []) reviews.append(node('p', '', `${review.author?.login || 'Reviewer'} · ${human(review.state)}`));
  const checks = section('Other checks');
  if (!pr.otherChecks.checks.length) checks.append(node('p', '', pr.otherChecks.state === 'unknown' ? 'Check results are incomplete.' : 'No other checks reported.'));
  for (const check of pr.otherChecks.checks) {
    const item = node('div', 'check-row');
    const url = check.targetUrl || check.detailsUrl;
    const name = node(url ? 'button' : 'span', url ? 'check-link' : '', check.context || check.name);
    if (url) name.addEventListener('click', () => action(() => api.openURL(url)));
    item.append(name, node('span', 'check-result', human(check.state || check.conclusion || check.status))); checks.append(item);
  }
  if (pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.pageInfo.hasNextPage) checks.append(node('p', '', 'Additional checks are available on GitHub.'));
  const dates = section('Activity'); const dateList = node('dl', 'dates');
  dateList.append(node('dt', '', 'Created'), node('dd', '', fullDate(pr.createdAt)), node('dt', '', 'Updated'), node('dd', '', fullDate(pr.updatedAt)));
  dates.append(dateList);
  $('detail-panel').replaceChildren(top, title, reference, actions, readiness, policy, reviews, checks, dates);
  if (focused) $(focused)?.focus({ preventScroll: true });
}

function render() {
  if (!snapshot) return;
  renderControls(); renderReadiness(); renderError(); renderList(); renderDetails();
}

$('filters').addEventListener('submit', event => { event.preventDefault(); applyFilters(); });
$('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(applyFilters, 350); });
$('organization').addEventListener('input', () => { $('repository').value = ''; renderRepositories(); });
$('organization').addEventListener('change', () => { $('repository').value = ''; renderRepositories(); applyFilters(); });
for (const id of ['repository', 'author', 'age']) $(id).addEventListener('change', applyFilters);
$('clear-filters').addEventListener('click', () => {
  clearTimeout(searchTimer); view.readiness = 'all'; view.selectedURL = null; saveView();
  updateBrowser(() => api.search({ scope: snapshot.browser.filters.scope }));
});
document.querySelectorAll('[data-scope]').forEach(button => button.addEventListener('click', () => {
  clearTimeout(searchTimer); view = { readiness: 'all', selectedURL: null }; saveView();
  updateBrowser(() => api.search({ scope: button.dataset.scope }));
}));
$('refresh').addEventListener('click', () => updateBrowser(() => api.refresh()));
$('retry').addEventListener('click', () => updateBrowser(() => api.refresh()));
$('load-more').addEventListener('click', () => updateBrowser(() => api.loadMore()));
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('search').focus(); }
  if (event.key === 'Escape' && view.selectedURL) { view.selectedURL = null; saveView(); render(); }
});
if (api) {
  const unsubscribe = api.onState(receive);
  window.addEventListener('beforeunload', unsubscribe);
  action(async () => receive(await api.getState()));
} else {
  localError = 'Open GasMask through Electron to connect to your PRs.'; renderError();
}
