"use client";

import { StackProvider } from "@stackframe/stack";
import { stackClientApp, isStackConfigured } from "@/lib/stack-client";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  // If Stack Auth is not configured, just render children without the provider
  if (!isStackConfigured || !stackClientApp) {
    return (
      <>
        {children}
        <Toaster 
          position="bottom-right"
          toastOptions={{
            style: {
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontSize: "14px",
              borderRadius: "8px",
            },
            classNames: {
              toast: "shadow-lg border",
              success: "bg-green-100 border-green-400 text-green-700",
              error: "bg-red-100 border-red-400 text-red-700",
              warning: "bg-yellow-100 border-yellow-400 text-yellow-700",
              info: "bg-bv-blue-100 border-bv-blue-400 text-bv-blue-700",
            },
          }}
          richColors
          closeButton
        />
      </>
    );
  }

  return (
    <StackProvider app={stackClientApp}>
      {children}
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontSize: "14px",
            borderRadius: "8px",
          },
          classNames: {
            toast: "shadow-lg border",
            success: "bg-green-100 border-green-400 text-green-700",
            error: "bg-red-100 border-red-400 text-red-700",
            warning: "bg-yellow-100 border-yellow-400 text-yellow-700",
            info: "bg-bv-blue-100 border-bv-blue-400 text-bv-blue-700",
          },
        }}
        richColors
        closeButton
      />
    </StackProvider>
  );
}

export { isStackConfigured };
