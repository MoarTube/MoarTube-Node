/** Automatic repetition could create untracked resources; require an explicit retry after repair. */
export class TunnelRecoveryRequiredError extends Error {}
