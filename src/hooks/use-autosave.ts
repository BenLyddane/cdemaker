"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { ExtractedRow, ComparisonResult } from "@/lib/types";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

interface AutosaveState {
  projectId: string | null;
  projectName: string;
  lastSavedAt: Date | null;
  status: AutosaveStatus;
  error: string | null;
  hasUnsavedChanges: boolean;
}

interface AutosaveOptions {
  userId?: string;
  debounceMs?: number;
  enabled?: boolean;
}

const LOCAL_STORAGE_KEY = "cde_autosave_project";
const DEBOUNCE_MS = 2000; // 2 seconds debounce for batched saves

export function useAutosave(options: AutosaveOptions = {}) {
  const { userId, debounceMs = DEBOUNCE_MS, enabled = true } = options;
  
  const [state, setState] = useState<AutosaveState>({
    projectId: null,
    projectName: "Untitled Project",
    lastSavedAt: null,
    status: "idle",
    error: null,
    hasUnsavedChanges: false,
  });
  
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDataRef = useRef<{
    extractedRows?: ExtractedRow[];
    documentIds?: string[];
    comparisons?: ComparisonResult[];
  }>({});
  
  // Initialize from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.projectId) {
          setState(prev => ({
            ...prev,
            projectId: parsed.projectId,
            projectName: parsed.projectName || "Untitled Project",
          }));
        }
      }
    } catch (e) {
      console.error("Failed to load autosave state:", e);
    }
  }, []);
  
  // Persist project ID to localStorage whenever it changes
  useEffect(() => {
    if (typeof window === "undefined" || !state.projectId) return;
    
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
        projectId: state.projectId,
        projectName: state.projectName,
        savedAt: state.lastSavedAt?.toISOString(),
      }));
    } catch (e) {
      console.error("Failed to persist autosave state:", e);
    }
  }, [state.projectId, state.projectName, state.lastSavedAt]);
  
  // Create a new project if one doesn't exist
  const ensureProject = useCallback(async (name?: string): Promise<string | null> => {
    if (state.projectId) return state.projectId;
    if (!enabled) return null;
    
    setState(prev => ({ ...prev, status: "saving" }));
    
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || state.projectName,
          userId: userId || null,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to create project");
      }
      
      const project = await response.json();
      
      setState(prev => ({
        ...prev,
        projectId: project.id,
        projectName: project.name,
        status: "saved",
        lastSavedAt: new Date(),
        error: null,
      }));
      
      // Clear saved status after a delay
      setTimeout(() => {
        setState(prev => prev.status === "saved" ? { ...prev, status: "idle" } : prev);
      }, 2000);
      
      return project.id;
    } catch (error) {
      setState(prev => ({
        ...prev,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      }));
      return null;
    }
  }, [state.projectId, state.projectName, userId, enabled]);
  
  // Save extracted rows to the database
  const saveExtractedRows = useCallback(async (
    rows: ExtractedRow[],
    documentId?: string
  ): Promise<boolean> => {
    if (!enabled || rows.length === 0) return false;
    
    // Ensure we have a project
    const projectId = await ensureProject();
    if (!projectId) return false;
    
    setState(prev => ({ ...prev, status: "saving", hasUnsavedChanges: true }));
    
    try {
      const response = await fetch("/api/extractions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          documentId,
          rows,
          incremental: true, // Flag for upsert behavior
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to save extraction data");
      }
      
      setState(prev => ({
        ...prev,
        status: "saved",
        lastSavedAt: new Date(),
        hasUnsavedChanges: false,
        error: null,
      }));
      
      // Clear saved status after a delay
      setTimeout(() => {
        setState(prev => prev.status === "saved" ? { ...prev, status: "idle" } : prev);
      }, 2000);
      
      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      }));
      return false;
    }
  }, [enabled, ensureProject]);
  
  // Debounced save for frequent updates (status changes, comments)
  const debouncedSave = useCallback((
    rows: ExtractedRow[],
    documentId?: string
  ) => {
    if (!enabled) return;
    
    // Store pending data
    pendingDataRef.current.extractedRows = rows;
    if (documentId) pendingDataRef.current.documentIds = [documentId];
    
    setState(prev => ({ ...prev, hasUnsavedChanges: true }));
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set new timer
    debounceTimerRef.current = setTimeout(async () => {
      const data = pendingDataRef.current;
      if (data.extractedRows) {
        await saveExtractedRows(data.extractedRows, data.documentIds?.[0]);
      }
      pendingDataRef.current = {};
    }, debounceMs);
  }, [enabled, debounceMs, saveExtractedRows]);
  
  // Immediate save (for critical data like AI results)
  const immediateSave = useCallback(async (
    rows: ExtractedRow[],
    documentId?: string
  ): Promise<boolean> => {
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingDataRef.current = {};
    
    return saveExtractedRows(rows, documentId);
  }, [saveExtractedRows]);
  
  // Save a single row update (status change, comment, etc.)
  const saveRowUpdate = useCallback(async (
    rowId: string,
    updates: Partial<ExtractedRow>
  ): Promise<boolean> => {
    if (!enabled || !state.projectId) return false;
    
    setState(prev => ({ ...prev, hasUnsavedChanges: true }));
    
    // Use debounced approach for row updates
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(async () => {
      try {
        setState(prev => ({ ...prev, status: "saving" }));
        
        const response = await fetch(`/api/extractions/rows/${rowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        
        if (!response.ok) {
          throw new Error("Failed to update row");
        }
        
        setState(prev => ({
          ...prev,
          status: "saved",
          lastSavedAt: new Date(),
          hasUnsavedChanges: false,
          error: null,
        }));
        
        setTimeout(() => {
          setState(prev => prev.status === "saved" ? { ...prev, status: "idle" } : prev);
        }, 2000);
      } catch (error) {
        setState(prev => ({
          ...prev,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        }));
      }
    }, debounceMs);
    
    return true;
  }, [enabled, state.projectId, debounceMs]);
  
  // Rename project
  const renameProject = useCallback(async (newName: string): Promise<boolean> => {
    if (!state.projectId) return false;
    
    try {
      const response = await fetch("/api/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: state.projectId,
          name: newName,
          userId,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to rename project");
      }
      
      setState(prev => ({
        ...prev,
        projectName: newName,
      }));
      
      return true;
    } catch (error) {
      console.error("Failed to rename project:", error);
      return false;
    }
  }, [state.projectId, userId]);
  
  // Check for recoverable project
  const getRecoverableProject = useCallback((): { projectId: string; projectName: string } | null => {
    if (typeof window === "undefined") return null;
    
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.projectId) {
          return {
            projectId: parsed.projectId,
            projectName: parsed.projectName || "Untitled Project",
          };
        }
      }
    } catch (e) {
      console.error("Failed to check recoverable project:", e);
    }
    return null;
  }, []);
  
  // Restore a project
  const restoreProject = useCallback(async (projectId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/projects/${projectId}/state`);
      
      if (!response.ok) {
        // Project may have been deleted
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        return false;
      }
      
      const projectData = await response.json();
      
      setState(prev => ({
        ...prev,
        projectId: projectData.id,
        projectName: projectData.name,
        status: "idle",
        error: null,
      }));
      
      return true;
    } catch (error) {
      console.error("Failed to restore project:", error);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      return false;
    }
  }, []);
  
  // Clear saved project (start fresh)
  const clearProject = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    
    // Clear any pending saves
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingDataRef.current = {};
    
    setState({
      projectId: null,
      projectName: "Untitled Project",
      lastSavedAt: null,
      status: "idle",
      error: null,
      hasUnsavedChanges: false,
    });
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);
  
  return {
    // State
    projectId: state.projectId,
    projectName: state.projectName,
    status: state.status,
    lastSavedAt: state.lastSavedAt,
    error: state.error,
    hasUnsavedChanges: state.hasUnsavedChanges,
    
    // Actions
    ensureProject,
    saveExtractedRows,
    debouncedSave,
    immediateSave,
    saveRowUpdate,
    renameProject,
    getRecoverableProject,
    restoreProject,
    clearProject,
  };
}
