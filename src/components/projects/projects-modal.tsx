"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  X, 
  FolderOpen, 
  Trash2, 
  Calendar, 
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  // State metadata (if saved)
  state?: {
    specDocumentCount?: number;
    hasSubmittal?: boolean;
    comparisonCount?: number;
    extractedRowCount?: number;
    summary?: {
      totalItems: number;
      comply: number;
      deviate: number;
      exception: number;
      pending: number;
    };
    workflowPhase?: string;
  };
}

interface ProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadProject: (projectId: string) => void;
  userId: string;
}

export function ProjectsModal({ isOpen, onClose, onLoadProject, userId }: ProjectsModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch projects when modal opens
  useEffect(() => {
    if (isOpen && userId) {
      fetchProjects();
    }
  }, [isOpen, userId]);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects?userId=${userId}`);
      if (!response.ok) throw new Error("Failed to fetch projects");
      const result = await response.json();
      setProjects(result.data || []);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this project?")) return;
    
    setDeletingId(projectId);
    try {
      const response = await fetch(`/api/projects?id=${projectId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete project");
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("Failed to delete project");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={onClose} 
      />
      
      {/* Modal */}
      <Card className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-bv-blue-400" />
            <h2 className="text-body-md font-semibold text-neutral-800">My Projects</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-bv-blue-400" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
              <p className="text-body-sm text-neutral-500">No saved projects yet</p>
              <p className="text-detail text-neutral-400 mt-1">
                Start working on a CDE and click "Save Project" to save your work
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => {
                    onLoadProject(project.id);
                    onClose();
                  }}
                  className={cn(
                    "p-4 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer",
                    "hover:border-bv-blue-400 hover:bg-bv-blue-50 transition-colors"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-body-sm font-semibold text-neutral-800 truncate">
                        {project.name}
                      </h3>
                      
                      <div className="flex items-center gap-4 mt-2 text-micro text-neutral-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(project.updated_at)}
                        </span>
                        {project.state?.specDocumentCount !== undefined && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {project.state.specDocumentCount} docs
                          </span>
                        )}
                      </div>
                      
                      {/* Summary stats if available */}
                      {project.state?.summary && project.state.summary.totalItems > 0 && (
                        <div className="flex items-center gap-3 mt-3">
                          <span className="flex items-center gap-1 text-micro text-green-600">
                            <CheckCircle2 className="h-3 w-3" />
                            {project.state.summary.comply} comply
                          </span>
                          <span className="flex items-center gap-1 text-micro text-yellow-600">
                            <AlertTriangle className="h-3 w-3" />
                            {project.state.summary.deviate} deviate
                          </span>
                          <span className="flex items-center gap-1 text-micro text-red-600">
                            <XCircle className="h-3 w-3" />
                            {project.state.summary.exception} exception
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-neutral-400 hover:text-red-600"
                      onClick={(e) => handleDelete(project.id, e)}
                      disabled={deletingId === project.id}
                    >
                      {deletingId === project.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50">
          <p className="text-micro text-neutral-400 text-center">
            Click on a project to continue working on it
          </p>
        </div>
      </Card>
    </div>
  );
}
