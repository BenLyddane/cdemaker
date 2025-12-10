"use client";

import { useState, useRef, useEffect } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CDEStatus } from "@/lib/types";

interface StatusSelectorProps {
  value: CDEStatus;
  onChange: (status: CDEStatus) => void;
  disabled?: boolean;
}

const statusConfig = {
  comply: {
    icon: CheckCircle2,
    label: "Comply",
    shortLabel: "C",
    description: "Meets specification requirements",
    className: "bg-success-100 text-success-700 border-success-400 hover:bg-success-100/80",
    activeClassName: "ring-2 ring-success-400",
  },
  deviate: {
    icon: AlertTriangle,
    label: "Deviate",
    shortLabel: "D",
    description: "Differs but may be acceptable",
    className: "bg-warning-100 text-warning-700 border-warning-400 hover:bg-warning-100/80",
    activeClassName: "ring-2 ring-warning-400",
  },
  exception: {
    icon: XCircle,
    label: "Exception",
    shortLabel: "E",
    description: "Does not meet requirements",
    className: "bg-error-100 text-error-700 border-error-400 hover:bg-error-100/80",
    activeClassName: "ring-2 ring-error-400",
  },
  pending: {
    icon: Clock,
    label: "Pending",
    shortLabel: "P",
    description: "Needs review",
    className: "bg-neutral-100 text-neutral-600 border-neutral-300 hover:bg-neutral-100/80",
    activeClassName: "ring-2 ring-neutral-400",
  },
};

export function StatusSelector({ value, onChange, disabled = false }: StatusSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const currentConfig = statusConfig[value];
  const Icon = currentConfig.icon;
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen(!isOpen);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (isOpen) {
      const statuses: CDEStatus[] = ["comply", "deviate", "exception", "pending"];
      const currentIndex = statuses.indexOf(value);
      
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % statuses.length;
        onChange(statuses[nextIndex]);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + statuses.length) % statuses.length;
        onChange(statuses[prevIndex]);
      }
    }
  };
  
  return (
    <div ref={containerRef} className="relative">
      {/* Selected Status Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-detail font-medium transition-all",
          currentConfig.className,
          isOpen && currentConfig.activeClassName,
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{currentConfig.shortLabel}</span>
        <ChevronDown className={cn(
          "h-3 w-3 transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>
      
      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg border border-neutral-200 shadow-lg z-50 overflow-hidden">
          {(Object.entries(statusConfig) as [CDEStatus, typeof statusConfig.comply][]).map(([status, config]) => {
            const StatusIcon = config.icon;
            const isSelected = status === value;
            
            return (
              <button
                key={status}
                type="button"
                onClick={() => {
                  onChange(status);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors",
                  isSelected ? config.className : "hover:bg-neutral-50"
                )}
              >
                <StatusIcon className={cn(
                  "h-4 w-4 mt-0.5 flex-shrink-0",
                  isSelected ? "" : "text-neutral-500"
                )} />
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "text-detail font-medium",
                    isSelected ? "" : "text-neutral-800"
                  )}>
                    {config.label}
                  </div>
                  <div className={cn(
                    "text-micro",
                    isSelected ? "opacity-80" : "text-neutral-500"
                  )}>
                    {config.description}
                  </div>
                </div>
                {isSelected && (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Compact version for tight spaces
export function StatusBadge({ status }: { status: CDEStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-micro font-semibold border",
      config.className
    )}>
      <Icon className="h-3 w-3" />
      {config.shortLabel}
    </span>
  );
}

// Quick toggle buttons for inline editing
export function StatusQuickSelect({ 
  value, 
  onChange,
  size = "default" 
}: StatusSelectorProps & { size?: "default" | "sm" }) {
  const statuses: CDEStatus[] = ["comply", "deviate", "exception"];
  
  return (
    <div className="flex items-center gap-1">
      {statuses.map((status) => {
        const config = statusConfig[status];
        const Icon = config.icon;
        const isSelected = status === value;
        
        return (
          <button
            key={status}
            type="button"
            onClick={() => onChange(status)}
            className={cn(
              "flex items-center justify-center rounded transition-all",
              size === "sm" ? "h-6 w-6" : "h-8 w-8",
              isSelected 
                ? cn(config.className, "border", config.activeClassName)
                : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
            )}
            title={config.label}
          >
            <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </button>
        );
      })}
    </div>
  );
}
