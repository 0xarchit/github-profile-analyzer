/**
 * Public surface of the `@/lib/github` module.
 * Import everything from here — not from individual sub-files.
 */

export { getProfileSummary, calculateDetailedStreaks } from "./profile";
export {
  checkStarStatus,
  verifyAndInjectStar,
  getRepoStarCount,
  normalizeUsername,
} from "./star-gate";
export {
  getFallbackToken,
  githubFetchWithTimeout,
  fetchGitHubGraphQL,
  fetchGitHubRest,
  extractGraphQLErrorMessage,
  hasNextPageFromLink,
  GITHUB_TOKENS,
  GITHUB_FETCH_TIMEOUT_MS,
} from "./http";
