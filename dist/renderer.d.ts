import type { PRNode } from "./github-service";
export interface MenuItem {
    label: string;
    type?: "normal" | "separator";
    click?: () => void;
}
export declare function createFooter(): MenuItem[];
export declare function renderPR(pr: PRNode): MenuItem;
export declare function lastRefreshedSection(lastRefreshedTime: string | null): MenuItem;
export interface RenderState {
    myPRs: PRNode[];
    teamPRs: PRNode[];
    lastRefreshedTime: string | null;
}
export declare function renderTaskBar(state: RenderState): MenuItem[];
export declare function buildMenu(state: RenderState): Electron.Menu;
//# sourceMappingURL=renderer.d.ts.map