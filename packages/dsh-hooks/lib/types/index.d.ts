export declare const name = "dsh-hooks";
/** Profile entry id; migrate legacy profile overrides when upgrading. */
export declare const entryId = "dsh-hooks";
export interface CommandHooksConfig {
  /** File-only emergency gate, true by default; individual trust is always required. */
  commandHooksEnabled?: boolean;
  /** Version-1 JSON declarations. No declaration can grant trust. */
  commandHooks?: string;
}
export declare const Config: {
  (input?: unknown): CommandHooksConfig;
  toJSON(): unknown;
};
/** Mount only the command engine and its approval-only UI routes. */
export declare function apply(ctx: unknown, config?: CommandHooksConfig): void;
