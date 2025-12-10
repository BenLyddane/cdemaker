"use client";

import { SignIn } from "@stackframe/stack";
import Image from "next/image";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-neutral-50 to-bv-blue-100/30">
      {/* Header with logo */}
      <header className="p-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <Image
            src="/logo/logo-mark-color.svg"
            alt="BuildVision"
            width={32}
            height={32}
            className="h-8 w-8"
          />
          <span className="text-body-md font-semibold text-neutral-800">
            CDEMaker
          </span>
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Welcome text */}
          <div className="text-center mb-8">
            <h1 className="text-h4 font-bold text-neutral-900 mb-2">
              Welcome back
            </h1>
            <p className="text-body-sm text-neutral-600">
              Sign in to continue extracting equipment specifications
            </p>
          </div>

          {/* Sign in card */}
          <div className="bg-white rounded-xl shadow-lg shadow-neutral-200/50 border border-neutral-200/50 p-8">
            <SignIn />
          </div>

          {/* Footer link */}
          <p className="text-center mt-6 text-detail text-neutral-500">
            Don&apos;t have an account?{" "}
            <Link 
              href="/sign-up" 
              className="text-bv-blue-400 hover:text-bv-blue-500 font-medium underline underline-offset-2"
            >
              Sign up
            </Link>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center">
        <p className="text-micro text-neutral-400">
          © {new Date().getFullYear()} BuildVision. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
