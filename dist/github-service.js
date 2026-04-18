"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class GitHubService {
    #token;
    #apiUrl;
    #graphqlUrl;
    constructor() {
        this.#token = process.env.GH_TOKEN ?? "";
        this.#apiUrl = process.env.GH_API_URL ?? "";
        this.#graphqlUrl = process.env.GH_GRAPHQL_URL ?? "";
    }
    async #fetch(url, options = {}) {
        const fetch = globalThis.fetch ?? (await Promise.resolve().then(() => __importStar(require("node-fetch")))).default;
        const response = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${this.#token}`,
                "Content-Type": "application/json",
                ...options.headers,
            },
        });
        if (!response.ok) {
            throw new Error(`GitHub API returned status ${response.status}: ${response.statusText}`);
        }
        return response.json();
    }
    async getTeamMembers(org, team) {
        const url = `${this.#apiUrl}/orgs/${org}/teams/${team}/members`;
        console.log("URL:", url);
        return this.#fetch(url, { method: "GET" });
    }
    async searchPRs(searchQuery) {
        const graphQuery = fs.readFileSync(path.join(__dirname, "..", "pr_query.graphql"), "utf8");
        const requestBody = graphQuery.replace("$query", searchQuery);
        console.log("Request Body:", requestBody);
        return this.#fetch(this.#graphqlUrl, {
            method: "POST",
            body: JSON.stringify({ query: requestBody }),
        });
    }
}
exports.GitHubService = GitHubService;
//# sourceMappingURL=github-service.js.map