/**
 * Premium RPC paths that require either an API key or a Pro session.
 *
 * Single source of truth consumed by both the server gateway (auth enforcement)
 * and the web client runtime (token injection).
 */
// PRO UNLOCKED: no paths are treated as premium on the client side
export const PREMIUM_RPC_PATHS = new Set<string>([]);
