export type GitHubMember = {
    login: string;
};
export interface CommitNode {
    commit: {
        statusCheckRollup: {
            state: string | null;
        };
    };
}
export interface PRNode {
    title: string;
    url: string;
    reviewDecision: string | null;
    commits: {
        nodes: CommitNode[];
    } | null;
    createdAt: string;
    createdAtTime?: number;
}
export interface SearchResponse {
    data: {
        search: {
            edges: Array<{
                node: PRNode;
            }>;
        };
    };
}
export type TeamMembersResponse = GitHubMember[];
export declare class GitHubService {
    #private;
    constructor();
    getTeamMembers(org: string, team: string): Promise<TeamMembersResponse>;
    searchPRs(searchQuery: string): Promise<SearchResponse>;
}
//# sourceMappingURL=github-service.d.ts.map