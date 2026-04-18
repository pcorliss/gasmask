class PRState {
  #myPRs = [];
  #teamPRs = [];
  #seenPRs = new Set();
  #firstRun = true;
  #teamMembers = new Set();
  #lastRefreshedTime = null;

  get myPRs() {
    return this.#myPRs;
  }

  set myPRs(prs) {
    this.#myPRs = prs;
  }

  get teamPRs() {
    return this.#teamPRs;
  }

  set teamPRs(prs) {
    this.#teamPRs = prs;
  }

  get firstRun() {
    return this.#firstRun;
  }

  set firstRun(value) {
    this.#firstRun = value;
  }

  get teamMembers() {
    return this.#teamMembers;
  }

  addTeamMember(login) {
    this.#teamMembers.add(login);
  }

  removeTeamMember(login) {
    this.#teamMembers.delete(login);
  }

  addSeenPR(url) {
    this.#seenPRs.add(url);
  }

  hasSeenPR(url) {
    return this.#seenPRs.has(url);
  }

  get lastRefreshedTime() {
    return this.#lastRefreshedTime;
  }

  setLastRefreshed() {
    this.#lastRefreshedTime = new Date().toLocaleTimeString();
  }

  isOldTeamPR(pr) {
    const minCreatedAt = Math.min(...this.#teamPRs.map((p) => p.createdAtTime));
    return pr.createdAtTime < minCreatedAt;
  }

  reset() {
    this.#myPRs = [];
    this.#teamPRs = [];
    this.#seenPRs = new Set();
    this.#firstRun = true;
    this.#teamMembers = new Set();
    this.#lastRefreshedTime = null;
  }
}

module.exports = { PRState };