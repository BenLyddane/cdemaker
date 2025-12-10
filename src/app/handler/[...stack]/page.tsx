/**
 * Stack Auth handler page - handles all auth routes
 */
import { StackHandler } from "@stackframe/stack";
import { stackServerApp, isStackConfigured } from "@/lib/stack";
import { notFound } from "next/navigation";

export default async function Handler(props: { 
  params: Promise<{ stack: string[] }>; 
  searchParams: Promise<Record<string, string>>;
}) {
  // If Stack Auth is not configured, return 404
  if (!isStackConfigured || !stackServerApp) {
    return notFound();
  }

  // Await the params and searchParams
  const params = await props.params;
  const searchParams = await props.searchParams;

  return (
    <StackHandler
      fullPage
      app={stackServerApp}
      routeProps={{ params, searchParams }}
    />
  );
}
