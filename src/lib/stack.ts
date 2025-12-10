/**
 * Stack Auth configuration
 * @see https://docs.stack-auth.com/
 */
import "server-only";
import { StackServerApp } from "@stackframe/stack";

// Check if Stack Auth is configured with real keys
const isStackConfigured = Boolean(process.env.NEXT_PUBLIC_STACK_PROJECT_ID);

export const stackServerApp = isStackConfigured
  ? new StackServerApp({
      tokenStore: "nextjs-cookie",
      urls: {
        signIn: "/sign-in",
        signUp: "/sign-up",
        accountSettings: "/account-settings",
      },
    })
  : null;

export { isStackConfigured };
