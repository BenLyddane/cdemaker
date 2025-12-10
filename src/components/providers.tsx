"use client";

import { StackProvider } from "@stackframe/stack";
import { stackClientApp, isStackConfigured } from "@/lib/stack-client";

export function Providers({ children }: { children: React.ReactNode }) {
  // If Stack Auth is not configured, just render children without the provider
  if (!isStackConfigured || !stackClientApp) {
    return <>{children}</>;
  }

  return (
    <StackProvider app={stackClientApp}>
      {children}
    </StackProvider>
  );
}

export { isStackConfigured };
