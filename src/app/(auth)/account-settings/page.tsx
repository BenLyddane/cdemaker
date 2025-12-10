"use client";

import { AccountSettings } from "@stackframe/stack";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AccountSettingsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      {/* Header with logo */}
      <header className="bg-white border-b border-neutral-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
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
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-detail text-neutral-600 hover:text-bv-blue-400 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to app
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 py-8 px-6">
        <div className="max-w-2xl mx-auto">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-h5 font-bold text-neutral-900 mb-2">
              Account Settings
            </h1>
            <p className="text-body-sm text-neutral-600">
              Manage your profile and account preferences
            </p>
          </div>

          {/* Settings card */}
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <AccountSettings />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center border-t border-neutral-200 bg-white">
        <p className="text-micro text-neutral-400">
          © {new Date().getFullYear()} BuildVision. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
