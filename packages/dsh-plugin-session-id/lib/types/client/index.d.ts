import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type { Context as ClientContext } from "@deepseek-ai/cordis";

export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;

export interface SessionIdActionProps extends PropsRuntime<"conversation.session.header.utilities">, PropsLocale<typeof import("./locales").NS> {}

export declare function SessionIdAction(props: SessionIdActionProps): import("react").JSX.Element;
