/** Automatic repetition could create untracked resources; require an explicit retry after repair. */
export class TunnelRecoveryRequiredError extends Error {}

/** Cloudflare rejected quick-tunnel provisioning; automatic retries would add load. */
export class TunnelRateLimitError extends Error {}
