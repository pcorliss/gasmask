import type { PRNode } from "./github-service";
export declare class PRState {
    #private;
    get myPRs(): PRNode[];
    set myPRs(prs: PRNode[]);
    get teamPRs(): PRNode[];
    set teamPRs(prs: PRNode[]);
    get firstRun(): boolean;
    set firstRun(value: boolean);
    get teamMembers(): Set<string>;
    addTeamMember(login: string): void;
    removeTeamMember(login: string): void;
    addSeenPR(url: string): void;
    hasSeenPR(url: string): boolean;
    get lastRefreshedTime(): string | null;
    setLastRefreshed(): void;
    isOldTeamPR(pr: PRNode): boolean;
    reset(): void;
}
//# sourceMappingURL=pr-state.d.ts.map