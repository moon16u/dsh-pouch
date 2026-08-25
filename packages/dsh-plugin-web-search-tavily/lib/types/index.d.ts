import type { Context } from "@deepseek-ai/cordis";
import type { Schema } from "@deepseek-ai/schemastery";

export declare const name = "web-search-tavily";
export declare const inject: ["web"];
export declare const PROVIDER_ID = "tavily";
export declare const WEB_SEARCH_TAVILY_SETTINGS_NAMESPACE: string;
export declare const Config: Schema<{
  apiKey?: string;
  apiKeyEnv?: string;
  baseURL?: string;
  searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
  maxResults?: number;
}>;
export declare class TavilySearchProvider {
  constructor(resolveOptions: () => unknown);
  readonly id: string;
  available(): boolean;
  search(request: { query: string; maxResults?: number }, signal?: AbortSignal): Promise<{
    content?: string;
    sources: Array<{ url: string; title?: string; snippet?: string; publishedAt?: string }>;
    truncated: boolean;
  }>;
}
export declare function apply(ctx: Context, config?: Record<string, unknown>): void;
