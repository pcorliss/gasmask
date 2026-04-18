import type { PRNode } from "./github-service";

export class PRState {
  #myPRs: PRNode[] = [];
  #teamPRs: PRNode[] = [];
  #seenPRs = new Set<string>();
  #firstRun = true;
  #teamMembers = new Set<string>();
  #lastRefreshedTime: string | null = null;

  get myPRs(): PRNode[] {
    return this.#myPRs;
  }

  set myPRs(prs: PRNode[]) {
    this.#myPRs = prs;
  }

  get teamPRs(): PRNode[] {
    return this.#teamPRs;
  }

  set teamPRs(prs: PRNode[]) {
    this.#teamPRs = prs;
  }

  get firstRun(): boolean {
    return this.#firstRun;
  }

  set firstRun(value: boolean) {
    this.#firstRun = value;
  }

  get teamMembers(): Set<string> {
    return this.#teamMembers;
  }

  addTeamMember(login: string): void {
    this.#teamMembers.add(login);
  }

  removeTeamMember(login: string): void {
    this.#teamMembers.delete(login);
  }

  addSeenPR(url: string): void {
    this.#seenPRs.add(url);
  }

  hasSeenPR(url: string): boolean {
    return this.#seenPRs.has(url);
  }

  get lastRefreshedTime(): string | null {
    return this.#lastRefreshedTime;
  }

  setLastRefreshed(): void {
    this.#lastRefreshedTime = new Date().toLocaleTimeString();
  }

  isOldTeamPR(pr: PRNode): boolean {
    const times = this.#teamPRs.map((p) => p.createdAtTime).filter((t): t is number => t !== undefined);
    if (times.length === 0) return false;
    const minCreatedAt = Math.min(...times);
    return (pr.createdAtTime ?? 0) < minCreatedAt;
  }

  reset(): void {
    this.#myPRs = [];
    this.#teamPRs = [];
    this.#seenPRs = new Set();
    this.#firstRun = true;
    this.#teamMembers = new Set();
    this.#lastRefreshedTime = null;
  }
}