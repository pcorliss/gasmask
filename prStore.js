const { EventEmitter } = require('node:events');
const { getPRReadiness, getTeamPRReadiness, getOtherChecks, getPolicyStatus, getCheckState } = require('./prStatus');

const DAY = 86400000;
const PAGE_SIZE = 25;
const DEFAULT_FILTERS = { scope: 'mine', search: '', organization: '', repository: '', author: '', age: 'all' };
const MERGE_METHODS = { MERGE: 'mergeCommitAllowed', SQUASH: 'squashMergeAllowed', REBASE: 'rebaseMergeAllowed' };

function normalizeFilters(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const text = key => typeof value[key] === 'string' ? value[key].trim().slice(0, 200) : '';
  const filters = {
    scope: value.scope === 'team' ? 'team' : 'mine',
    search: text('search'), organization: text('organization'), repository: text('repository'), author: text('author'),
    age: ['recent', 'older'].includes(value.age) ? value.age : 'all',
  };
  // Preserve selections saved before organization and repository were separate filters.
  if (value.organization === undefined && /^[\w-]+\/[\w.-]+$/.test(filters.repository)) {
    [filters.organization, filters.repository] = filters.repository.split('/');
  }
  if (filters.organization && !/^[\w-]+$/.test(filters.organization)) throw new Error('Use a GitHub organization name.');
  if (filters.repository && !/^[\w.-]+$/.test(filters.repository)) throw new Error('Use a repository name without the organization.');
  if (filters.repository && !filters.organization) throw new Error('Choose an organization before a repository.');
  if (filters.author && !/^[\w-]+$/.test(filters.author)) throw new Error('Use a GitHub username for the author.');
  if (filters.scope === 'mine') filters.author = '';
  return filters;
}

class PRStore extends EventEmitter {
  constructor({ github, env = process.env, now = Date.now } = {}) {
    super();
    this.github = github || require('./github');
    this.env = env;
    this.now = now;
    this.maxAgeDays = Number(env.MAX_PR_AGE_DAYS) > 0 ? Number(env.MAX_PR_AGE_DAYS) : null;
    this.ageFilterDays = this.maxAgeDays || 14;
    this.refreshIntervalMs = Math.max(10, Number(env.REFRESH_INTERVAL) || 300) * 1000;
    this.browserRefreshIntervalMs = Math.min(this.refreshIntervalMs, 30000);
    this.records = new Map();
    this.mergedURLs = new Set();
    this.mergingURLs = new Set();
    this.members = [];
    this.membersUpdatedAt = null;
    this.teamBaseline = null;
    this.seenTeam = new Set();
    this.previousMine = new Map();
    this.browserGeneration = 0;
    this.browserActive = false;
    this.tray = Object.fromEntries(['mine', 'team'].map(scope => [scope, { ids: [], total: 0, loading: false, error: null, updatedAt: null }]));
    this.browser = { filters: { ...DEFAULT_FILTERS }, ids: [], total: 0, hasMore: false, cursor: null, loading: false, loadingMore: false, error: null, updatedAt: null };
  }

  changed() { this.emit('change'); }

  async ensureMembers() {
    if (this.membersUpdatedAt !== null && this.now() - this.membersUpdatedAt < 60 * 60 * 1000) return this.members;
    if (this.membersRequest) return this.membersRequest;
    this.membersRequest = (async () => {
      const members = new Set();
      const teams = (this.env.GH_TEAMS || '').split(',').map(team => team.trim()).filter(Boolean);
      for (const orgTeam of teams) {
        const [org, team] = orgTeam.split('/');
        if (!org || !team) throw new Error('Configure GH_TEAMS as organization/team.');
        for (const member of await this.github.queryGitHubTeam(org, team)) members.add(member.login);
      }
      members.delete(this.env.GH_USER);
      this.members = [...members].sort();
      this.membersUpdatedAt = this.now();
      return this.members;
    })();
    try { return await this.membersRequest; }
    finally { this.membersRequest = null; }
  }

  async buildQuery(filters, { tray = false } = {}) {
    if (!this.env.GH_USER) throw new Error('Configure GH_USER in .env.');
    let authors = [this.env.GH_USER];
    if (filters.scope === 'team') {
      authors = await this.ensureMembers();
      if (filters.author) authors = authors.filter(author => author === filters.author);
    }
    if (!authors.length) return null;
    const parts = ['is:pr', 'is:open', 'sort:updated-desc'];
    if (filters.scope === 'team') parts.push('draft:false');
    parts.push(...authors.map(author => `author:${author}`));
    if (filters.repository) parts.push(`repo:${filters.organization}/${filters.repository}`);
    else if (filters.organization) parts.push(`org:${filters.organization}`);
    if (filters.search) {
      if (/^#?\d+$/.test(filters.search)) parts.push(filters.search.replace(/^#/, ''));
      else parts.push(JSON.stringify(filters.search), 'in:title');
    }
    const ageDays = tray ? this.maxAgeDays : this.ageFilterDays;
    const age = tray ? (this.maxAgeDays ? 'recent' : 'all') : filters.age;
    if (age !== 'all') {
      const cutoff = new Date(this.now() - ageDays * DAY).toISOString();
      parts.push(`created:${age === 'older' ? '<' : '>='}${cutoff}`);
    }
    return parts.join(' ');
  }

  async page(query, after = null, first = PAGE_SIZE) {
    if (!query) return { prs: [], total: 0, hasMore: false, cursor: null };
    const result = (await this.github.queryGitHub(query, { after, first })).data.search;
    const nodes = result.edges.map(edge => edge.node).filter(pr => pr?.url);
    // Search indexing can briefly return a PR after GitHub has confirmed its merge.
    const prs = nodes.filter(pr => !this.mergedURLs.has(pr.url));
    const hasMore = Boolean(result.pageInfo.hasNextPage);
    const cursor = result.pageInfo.endCursor;
    if (hasMore && (!cursor || cursor === after)) throw new Error('GitHub could not provide the next page. Try refreshing.');
    return { prs, total: Math.max(0, result.issueCount - (nodes.length - prs.length)), hasMore, cursor };
  }

  withinTrayAge(pr) {
    return !this.maxAgeDays || this.now() - new Date(pr.createdAt).getTime() <= this.maxAgeDays * DAY;
  }

  saveRecords(prs) { for (const pr of prs) if (!this.mergedURLs.has(pr.url)) this.records.set(pr.url, pr); }

  mergeMethods(pr) {
    if (!pr?.id || !pr.headRefOid || pr.state !== 'OPEN' ||
        pr.author?.login?.toLowerCase() !== this.env.GH_USER?.toLowerCase() ||
        !['WRITE', 'MAINTAIN', 'ADMIN'].includes(pr.repository?.viewerPermission) ||
        getPRReadiness(pr).group !== 'ready') return [];
    return Object.entries(MERGE_METHODS).filter(([, field]) => pr.repository[field] === true).map(([method]) => method);
  }

  async mergePR({ url, headRefOid, method } = {}, confirm) {
    if (this.browser.filters.scope !== 'mine' || !this.browser.ids.includes(url)) throw new Error('Select a ready PR in My PRs to merge.');
    const original = this.records.get(url);
    if (!this.mergeMethods(original).includes(method)) throw new Error('This PR is not ready to merge with that method. Refresh its status.');
    if (headRefOid !== original.headRefOid) throw new Error('The PR has changed. Refresh and review it before merging.');
    if (this.mergingURLs.has(url)) throw new Error('A merge is already in progress for this PR.');
    this.mergingURLs.add(url);
    try {
      // Check the latest policy, checks, permissions and allowed methods before confirming.
      const checkCurrent = async () => {
        const current = await this.github.getPullRequest(original.id);
        if (current.id !== original.id || current.url !== url || current.headRefOid !== headRefOid || current.baseRefName !== original.baseRefName) {
          throw new Error('The PR has changed. Refresh and review it before merging.');
        }
        this.saveRecords([current]); this.changed();
        if (!this.mergeMethods(current).includes(method)) throw new Error('This PR is no longer ready to merge with that method. Refresh its status.');
        return current;
      };
      const current = await checkCurrent();
      if (!await confirm(current, method)) return { merged: false };
      await checkCurrent();
      // GitHub enforces branch protections and rejects a different head commit atomically.
      await this.github.mergePullRequest({ id: current.id, headRefOid, method });
      this.mergedURLs.add(url);
      this.records.delete(url);
      this.previousMine.delete(url);
      for (const state of [this.browser, ...Object.values(this.tray)]) {
        if (state.ids.includes(url)) {
          state.ids = state.ids.filter(id => id !== url);
          state.total = Math.max(state.ids.length, state.total - 1);
        }
      }
      this.changed();
      await this.refresh();
      return { merged: true };
    } finally { this.mergingURLs.delete(url); }
  }

  notifyFromPoll(scope, prs) {
    if (scope === 'mine') {
      for (const pr of prs) {
        const previous = this.previousMine.get(pr.url);
        if (!previous || !this.withinTrayAge(pr)) continue;
        const approved = item => item.reviewDecision === 'APPROVED' || getPolicyStatus(item).state === 'approved';
        if (getCheckState(previous) !== 'FAILURE' && getCheckState(pr) === 'FAILURE') this.emit('notification', { title: 'CI Failed', body: `${pr.title} CI failure.`, url: pr.url });
        if (!approved(previous) && approved(pr)) this.emit('notification', { title: 'PR approved', body: pr.title, url: pr.url });
        else if (pr.reviewDecision && previous.reviewDecision !== pr.reviewDecision) this.emit('notification', { title: `PR ${pr.reviewDecision}`, body: pr.title, url: pr.url });
      }
      this.previousMine = new Map(prs.map(pr => [pr.url, pr]));
    } else {
      for (const pr of prs) {
        if (this.teamBaseline !== null && !this.seenTeam.has(pr.url) && new Date(pr.createdAt).getTime() > this.teamBaseline && this.withinTrayAge(pr)) {
          this.emit('notification', { title: 'New Team PR', body: pr.title, url: pr.url });
        }
        this.seenTeam.add(pr.url);
      }
      if (this.teamBaseline === null) this.teamBaseline = this.now();
    }
  }

  async pollScope(scope) {
    const state = this.tray[scope];
    state.loading = true;
    this.changed();
    try {
      const query = await this.buildQuery({ ...DEFAULT_FILTERS, scope }, { tray: true });
      const page = await this.page(query, null, 10);
      this.notifyFromPoll(scope, page.prs);
      this.saveRecords(page.prs);
      Object.assign(state, { ids: page.prs.filter(pr => this.withinTrayAge(pr)).map(pr => pr.url), total: page.total, error: null, updatedAt: this.now() });
    } catch (error) { state.error = error.message; }
    finally { state.loading = false; this.changed(); }
  }

  async poll() {
    if (this.pollRequest) return this.pollRequest;
    this.pollRequest = Promise.all(['mine', 'team'].map(scope => this.pollScope(scope)));
    try { await this.pollRequest; }
    finally { this.pollRequest = null; }
  }

  async refresh({ automatic = false } = {}) {
    await Promise.all([this.poll(), this.browserActive ? this.refreshBrowser({ automatic }) : Promise.resolve()]);
  }

  start() {
    if (this.timer) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), this.refreshIntervalMs);
    this.browserTimer = setInterval(() => this.refreshBrowser({ automatic: true }), this.browserRefreshIntervalMs);
    this.timer.unref?.();
    this.browserTimer.unref?.();
  }

  stop() { clearInterval(this.timer); clearInterval(this.browserTimer); this.timer = null; this.browserTimer = null; }

  searchBrowser(value) {
    const filters = normalizeFilters(value);
    const changed = JSON.stringify(filters) !== JSON.stringify(this.browser.filters);
    return this.loadBrowser(filters, { desired: changed ? PAGE_SIZE : Math.max(PAGE_SIZE, this.browser.ids.length), reset: changed });
  }

  refreshBrowser({ automatic = false } = {}) {
    if (automatic && (!this.browserActive || this.browser.loading || this.browser.loadingMore || this.mergingURLs.size)) return Promise.resolve();
    return this.loadBrowser(this.browser.filters, { desired: Math.max(PAGE_SIZE, this.browser.ids.length) });
  }

  loadMore() {
    if (this.browser.loading || this.browser.loadingMore || !this.browser.hasMore) return Promise.resolve();
    return this.loadBrowser(this.browser.filters, { more: true, desired: PAGE_SIZE });
  }

  async loadBrowser(filters, { more = false, desired = PAGE_SIZE, reset = false } = {}) {
    const generation = ++this.browserGeneration;
    if (reset) Object.assign(this.browser, { ids: [], total: 0, cursor: null, hasMore: false, updatedAt: null });
    Object.assign(this.browser, { filters, loading: !more, loadingMore: more, error: null });
    this.changed();
    try {
      const query = await this.buildQuery(filters);
      if (generation !== this.browserGeneration) return;
      let cursor = more ? this.browser.cursor : null;
      let page;
      const results = new Map();
      const cursors = new Set(cursor ? [cursor] : []);
      do {
        page = await this.page(query, cursor);
        if (generation !== this.browserGeneration) return;
        if (page.hasMore && cursors.has(page.cursor)) throw new Error('GitHub repeated a page. Try refreshing.');
        cursors.add(page.cursor);
        for (const pr of page.prs) results.set(pr.url, pr);
        cursor = page.cursor;
      } while (!more && page.hasMore && results.size < desired);
      this.saveRecords([...results.values()]);
      const ids = [...new Set([...(more ? this.browser.ids : []), ...results.keys()])];
      Object.assign(this.browser, { ids, total: page.total, hasMore: page.hasMore, cursor, error: null, updatedAt: this.now() });
    } catch (error) {
      if (generation === this.browserGeneration) this.browser.error = error.message;
    } finally {
      if (generation === this.browserGeneration) {
        this.browser.loading = false;
        this.browser.loadingMore = false;
        this.changed();
      }
    }
  }

  getTraySnapshot() {
    return Object.fromEntries(Object.entries(this.tray).map(([scope, state]) => [scope, {
      ...state, prs: state.ids.map(id => this.records.get(id)).filter(Boolean),
    }]));
  }

  getBrowserSnapshot() {
    const readiness = this.browser.filters.scope === 'team' ? getTeamPRReadiness : getPRReadiness;
    return {
      ...this.browser,
      prs: this.browser.ids.map(id => this.records.get(id)).filter(Boolean).map(pr => ({ ...pr, readiness: readiness(pr), otherChecks: getOtherChecks(pr), mergeMethods: this.browser.filters.scope === 'mine' ? this.mergeMethods(pr) : [] })),
      repositories: [...new Set([...this.records.values()].map(pr => pr.repository?.nameWithOwner).filter(Boolean))].sort(),
      authors: this.members,
      ageFilterDays: this.ageFilterDays,
    };
  }

  canOpenURL(url) {
    try { if (!['https:', 'http:'].includes(new URL(url).protocol)) return false; }
    catch { return false; }
    for (const pr of this.records.values()) {
      if (pr.url === url) return true;
      if (pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes?.some(check => check.targetUrl === url || check.detailsUrl === url)) return true;
    }
    return false;
  }
}

module.exports = { PRStore, normalizeFilters, DEFAULT_FILTERS };
