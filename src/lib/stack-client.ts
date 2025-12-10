/**
 * Stack Auth client configuration (for client components)
 */
import { StackClientApp } from "@stackframe/stack";

// Check if Stack Auth is configured with real keys
const isStackConfigured = Boolean(process.env.NEXT_PUBLIC_STACK_PROJECT_ID);

export const stackClientApp = isStackConfigured
  ? new StackClientApp({
      tokenStore: "nextjs-cookie",
      urls: {
        signIn: "/sign-in",
        signUp: "/sign-up",
        accountSettings: "/account-settings",
      },
    })
  : null;

export { isStackConfigured };
