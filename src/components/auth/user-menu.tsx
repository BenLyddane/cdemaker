"use client";

import { useUser, UserButton, useStackApp } from "@stackframe/stack";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { isStackConfigured } from "@/lib/stack-client";

export function UserMenu() {
  // If Stack Auth is not configured, don't render auth UI
  if (!isStackConfigured) {
    return null;
  }

  return <AuthenticatedUserMenu />;
}

function AuthenticatedUserMenu() {
  const user = useUser();
  const app = useStackApp();

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300"
          onClick={() => app.redirectToSignIn()}
        >
          <LogIn className="h-4 w-4" />
          Sign In
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-detail text-neutral-600 hidden sm:inline truncate max-w-[200px]">
        {user.displayName || user.primaryEmail}
      </span>
      <UserButton />
    </div>
  );
}

export function useCurrentUser() {
  // Return null if Stack is not configured
  if (!isStackConfigured) {
    return null;
  }
  
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const user = useUser();
  return user;
}

export function useRequiredUser() {
  if (!isStackConfigured) {
    throw new Error("Stack Auth is not configured");
  }
  
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const user = useUser();
  if (!user) {
    throw new Error("User is required but not logged in");
  }
  return user;
}
