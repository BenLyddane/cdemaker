import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-neutral-50">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-bv-blue-400" />
        <p className="text-body-sm text-neutral-500">Loading CDE Maker...</p>
      </div>
    </div>
  );
}
