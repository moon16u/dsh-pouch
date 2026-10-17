import type { Context as HostContext } from "@deepseek-ai/cordis";

/** Authenticated route serving the on-disk directory of one Session. */
export declare const SESSION_COPY_DIRECTORY_PATH = "/api/dsh-session-copy/directory";

/**
 * Register the read-only directory route on the connection service.
 * @param ctx - Host context carrying the connection service.
 */
export declare function apply(ctx: HostContext): void;
