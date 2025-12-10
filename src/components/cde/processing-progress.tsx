"use client";

import { Check, Circle, Loader2, FileText, Cpu, ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

export type StepStatus = "pending" | "active" | "complete" | "error";

export interface ProcessingStep {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
  progress?: number; // 0-100 for active steps
}

export interface DocumentProcessingState {
  uploaded: boolean;
  extractingPages: { status: StepStatus; current: number; total: number };
  analyzingAI: { status: StepStatus; current: number; total: number };
  complete: { status: StepStatus; itemCount: number };
}

export interface OverallProgress {
  spec: DocumentProcessingState;
  submittal: DocumentProcessingState;
  comparison: {
    status: StepStatus;
    progress: number;
    itemsCompared: number;
    totalItems: number;
  };
}

interface ProcessingProgressProps {
  progress: OverallProgress;
  specFileName?: string;
  submittalFileName?: string;
}

function StepIndicator({ status, size = "md" }: { status: StepStatus; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const iconSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  
  switch (status) {
    case "complete":
      return (
        <div className={cn(sizeClass, "rounded-full bg-success-400 flex items-center justify-center")}>
          <Check className={cn(iconSize, "text-white")} strokeWidth={3} />
        </div>
      );
    case "active":
      return (
        <div className={cn(sizeClass, "rounded-full bg-bv-blue-400 flex items-center justify-center")}>
          <Loader2 className={cn(iconSize, "text-white animate-spin")} />
        </div>
      );
    case "error":
      return (
        <div className={cn(sizeClass, "rounded-full bg-error-400 flex items-center justify-center")}>
          <span className="text-white text-micro font-bold">!</span>
        </div>
      );
    default:
      return (
        <div className={cn(sizeClass, "rounded-full border-2 border-neutral-300 bg-white")} />
      );
  }
}

function StepLine({ status, progress }: { status: StepStatus; progress?: number }) {
  const baseClass = "h-0.5 flex-1 rounded-full transition-all duration-300";
  
  if (status === "complete") {
    return <div className={cn(baseClass, "bg-success-400")} />;
  }
  
  if (status === "active" && progress !== undefined) {
    return (
      <div className={cn(baseClass, "bg-neutral-200 relative overflow-hidden")}>
        <div 
          className="absolute inset-y-0 left-0 bg-bv-blue-400 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    );
  }
  
  return <div className={cn(baseClass, "bg-neutral-200")} />;
}

function DocumentProgress({ 
  title, 
  fileName,
  state,
  icon: Icon
}: { 
  title: string;
  fileName?: string;
  state: DocumentProcessingState;
  icon: React.ElementType;
}) {
  const steps = [
    {
      id: "upload",
      label: "File uploaded",
      status: state.uploaded ? "complete" as StepStatus : "pending" as StepStatus,
      detail: fileName,
    },
    {
      id: "extract",
      label: "Extracting pages",
      status: state.extractingPages.status,
      detail: state.extractingPages.status === "active" 
        ? `Page ${state.extractingPages.current} of ${state.extractingPages.total}`
        : state.extractingPages.status === "complete"
          ? `${state.extractingPages.total} pages`
          : undefined,
      progress: state.extractingPages.total > 0 
        ? (state.extractingPages.current / state.extractingPages.total) * 100 
        : 0,
    },
    {
      id: "analyze",
      label: "Analyzing with AI",
      status: state.analyzingAI.status,
      detail: state.analyzingAI.status === "active"
        ? `Page ${state.analyzingAI.current} of ${state.analyzingAI.total}`
        : undefined,
      progress: state.analyzingAI.total > 0
        ? (state.analyzingAI.current / state.analyzingAI.total) * 100
        : 0,
    },
    {
      id: "complete",
      label: "Complete",
      status: state.complete.status,
      detail: state.complete.status === "complete"
        ? `${state.complete.itemCount} items extracted`
        : undefined,
    },
  ];
  
  const isActive = steps.some(s => s.status === "active");
  const isComplete = state.complete.status === "complete";
  
  return (
    <div className={cn(
      "rounded-lg border p-3 transition-all",
      isActive ? "border-bv-blue-400 bg-bv-blue-100/30" : 
      isComplete ? "border-success-400/50 bg-success-100/20" : 
      "border-neutral-200 bg-white"
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn(
          "h-4 w-4",
          isComplete ? "text-success-600" :
          isActive ? "text-bv-blue-600" :
          "text-neutral-400"
        )} />
        <span className="text-detail font-semibold text-neutral-800">{title}</span>
        {isComplete && (
          <CheckCircle2 className="h-4 w-4 text-success-400 ml-auto" />
        )}
      </div>
      
      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-start gap-2">
            <div className="flex flex-col items-center">
              <StepIndicator status={step.status} size="sm" />
              {index < steps.length - 1 && (
                <div className={cn(
                  "w-0.5 h-4 mt-1 rounded-full transition-colors",
                  step.status === "complete" ? "bg-success-400" : "bg-neutral-200"
                )} />
              )}
            </div>
            <div className="flex-1 min-w-0 -mt-0.5">
              <div className={cn(
                "text-micro font-medium",
                step.status === "complete" ? "text-success-700" :
                step.status === "active" ? "text-bv-blue-700" :
                "text-neutral-500"
              )}>
                {step.label}
              </div>
              {step.detail && (
                <div className={cn(
                  "text-micro truncate",
                  step.status === "active" ? "text-bv-blue-600" : "text-neutral-400"
                )}>
                  {step.detail}
                </div>
              )}
              {step.status === "active" && step.progress !== undefined && (
                <Progress value={step.progress} className="h-1 mt-1" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProcessingProgress({ 
  progress, 
  specFileName, 
  submittalFileName 
}: ProcessingProgressProps) {
  const specComplete = progress.spec.complete.status === "complete";
  const submittalComplete = progress.submittal.complete.status === "complete";
  const comparisonActive = progress.comparison.status === "active";
  const comparisonComplete = progress.comparison.status === "complete";
  
  // Overall progress calculation
  const overallSteps = [
    { label: "Upload", complete: progress.spec.uploaded && progress.submittal.uploaded },
    { label: "Extract", complete: specComplete && submittalComplete },
    { label: "Compare", complete: comparisonComplete },
  ];
  
  const completedSteps = overallSteps.filter(s => s.complete).length;
  
  return (
    <div className="space-y-4">
      {/* Overall Progress Bar */}
      <div className="px-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-micro font-medium text-neutral-600">Overall Progress</span>
          <span className="text-micro text-neutral-500">{completedSteps} of {overallSteps.length}</span>
        </div>
        <div className="flex items-center gap-1">
          {overallSteps.map((step, index) => (
            <div key={step.label} className="flex items-center flex-1">
              <StepIndicator 
                status={step.complete ? "complete" : 
                        (index === completedSteps ? "active" : "pending")} 
                size="sm" 
              />
              {index < overallSteps.length - 1 && (
                <StepLine 
                  status={step.complete ? "complete" : "pending"} 
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          {overallSteps.map(step => (
            <span key={step.label} className="text-micro text-neutral-400">{step.label}</span>
          ))}
        </div>
      </div>
      
      {/* Document Progress */}
      <DocumentProgress
        title="Spec / Schedule"
        fileName={specFileName}
        state={progress.spec}
        icon={FileText}
      />
      
      <DocumentProgress
        title="Submittal"
        fileName={submittalFileName}
        state={progress.submittal}
        icon={Cpu}
      />
      
      {/* Comparison Progress */}
      {(specComplete && submittalComplete) && (
        <div className={cn(
          "rounded-lg border p-3 transition-all",
          comparisonActive ? "border-bv-blue-400 bg-bv-blue-100/30" :
          comparisonComplete ? "border-success-400/50 bg-success-100/20" :
          "border-neutral-200 bg-white"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <ArrowRightLeft className={cn(
              "h-4 w-4",
              comparisonComplete ? "text-success-600" :
              comparisonActive ? "text-bv-blue-600" :
              "text-neutral-400"
            )} />
            <span className="text-detail font-semibold text-neutral-800">Comparison</span>
            {comparisonComplete && (
              <CheckCircle2 className="h-4 w-4 text-success-400 ml-auto" />
            )}
          </div>
          
          {comparisonActive && (
            <div className="space-y-1">
              <div className="flex justify-between text-micro">
                <span className="text-bv-blue-600">Comparing items...</span>
                <span className="text-neutral-500">
                  {progress.comparison.itemsCompared} / {progress.comparison.totalItems}
                </span>
              </div>
              <Progress value={progress.comparison.progress} className="h-1.5" />
            </div>
          )}
          
          {comparisonComplete && (
            <div className="text-micro text-success-600">
              {progress.comparison.totalItems} items compared
            </div>
          )}
          
          {!comparisonActive && !comparisonComplete && (
            <div className="text-micro text-neutral-400">
              Waiting for extraction to complete...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper to create initial state
export function createInitialProgress(): OverallProgress {
  return {
    spec: {
      uploaded: false,
      extractingPages: { status: "pending", current: 0, total: 0 },
      analyzingAI: { status: "pending", current: 0, total: 0 },
      complete: { status: "pending", itemCount: 0 },
    },
    submittal: {
      uploaded: false,
      extractingPages: { status: "pending", current: 0, total: 0 },
      analyzingAI: { status: "pending", current: 0, total: 0 },
      complete: { status: "pending", itemCount: 0 },
    },
    comparison: {
      status: "pending",
      progress: 0,
      itemsCompared: 0,
      totalItems: 0,
    },
  };
}
