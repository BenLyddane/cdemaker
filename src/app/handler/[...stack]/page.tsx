/**
 * Stack Auth handler page - handles all auth routes
 */
import { StackHandler } from "@stackframe/stack";
import { stackServerApp, isStackConfigured } from "@/lib/stack";
import { notFound } from "next/navigation";

export default function Handler(props: { params: { stack: string[] }; searchParams: Record<string, string> }) {
  // If Stack Auth is not configured, return 404
  if (!isStackConfigured || !stackServerApp) {
    return notFound();
  }

  return (
    <StackHandler
      fullPage
      app={stackServerApp}
      routeProps={props}
    />
  );
}
