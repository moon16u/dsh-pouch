import type { PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type { Context as ClientContext } from "@deepseek-ai/cordis";

export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;

export interface SessionCopyActionProps extends PropsRuntime<"conversation.session.header.utilities">, PropsLocale<typeof import("./locales").NS> {}
export type SessionIdActionProps = SessionCopyActionProps;

export declare function SessionCopyAction(props: SessionCopyActionProps): import("react").JSX.Element;
export declare const SessionIdAction: typeof SessionCopyAction;
