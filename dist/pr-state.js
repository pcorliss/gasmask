"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRState = void 0;
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
        const times = this.#teamPRs.map((p) => p.createdAtTime).filter((t) => t !== undefined);
        if (times.length === 0)
            return false;
        const minCreatedAt = Math.min(...times);
        return (pr.createdAtTime ?? 0) < minCreatedAt;
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
exports.PRState = PRState;
//# sourceMappingURL=pr-state.js.map