"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TitleActionHeader } from "@/components/title-action-header";
import { Button } from "@/components/button";
import { Avatar } from "@/components/avatar";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import {
  Upload,
  CheckCircle2,
  FileArchive,
  Smartphone,
  UserCircle,
  Share,
  Loader2,
} from "lucide-react";

import appleIcon from "@/assets/marketing/brand-logos/apple-icon.png";

type ImportPhase = "instructions" | "uploading" | "processing" | "complete";

const STEPS = [
  {
    icon: Smartphone,
    title: "Open the Health app",
    description: "On your iPhone, open the Apple Health app.",
  },
  {
    icon: UserCircle,
    title: "Tap your profile",
    description:
      "Tap your profile picture or initials in the top-right corner.",
  },
  {
    icon: Share,
    title: "Export All Health Data",
    description:
      'Scroll to the bottom and tap "Export All Health Data". Confirm when prompted. This may take a few minutes.',
  },
  {
    icon: Upload,
    title: "Upload the export here",
    description:
      "Once the export is ready, AirDrop or transfer the export.zip file to your computer and upload it below.",
  },
];

export default function AppleHealthImportPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<ImportPhase>("instructions");
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [extractionCount, setExtractionCount] = useState(0);

  const createImport = trpc.importJobs.create.useMutation();
  const statusQuery = trpc.importJobs.getStatus.useQuery(
    { id: importJobId! },
    {
      enabled: !!importJobId && phase === "processing",
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (!status) return 3000;
        if (["completed", "failed", "review_needed"].includes(status))
          return false;
        return 3000;
      },
    },
  );

  // Watch for processing completion
  useEffect(() => {
    if (!statusQuery.data || phase !== "processing") return;
    const { status, extractionCount: count } = statusQuery.data;

    if (status === "completed" || status === "review_needed") {
      setExtractionCount(count ?? 0);
      setPhase("complete");
      toast.success(
        `Imported ${count ?? 0} health observations from Apple Health`,
      );
    } else if (status === "failed") {
      setError(statusQuery.data.errorMessage ?? "Processing failed");
      setPhase("instructions");
      toast.error("Import failed. Please try again.");
    }
  }, [statusQuery.data, phase]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const handleUpload = useCallback(
    async (file: File) => {
      // Validate file type
      if (
        file.type !== "application/zip" &&
        file.type !== "application/x-zip-compressed" &&
        !file.name.endsWith(".zip")
      ) {
        setError(
          "Please upload a ZIP file exported from the Apple Health app.",
        );
        return;
      }

      setError("");
      setPhase("uploading");
      setUploadProgress(0);

      try {
        // Simulate upload progress (fetch doesn't provide upload progress natively)
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => Math.min(prev + 8, 90));
        }, 300);

        // Upload to blob storage
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        clearInterval(progressInterval);

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Upload failed: ${res.status}`);
        }

        setUploadProgress(95);
        const { blobPath, contentHash } = await res.json();

        // Create import job
        const { importJobId: jobId } = await createImport.mutateAsync({
          fileName: file.name,
          mimeType: file.type || "application/zip",
          blobPath,
          contentHash,
          fileSize: file.size,
        });

        setUploadProgress(100);
        setImportJobId(jobId);
        setPhase("processing");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setPhase("instructions");
      }
    },
    [createImport],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  return (
    <div className="stagger-children">
      <TitleActionHeader
        showBackButton
        title="Import Apple Health Data"
        beforeTitle={
          <div className="mt-1">
            <Avatar
              src={appleIcon.src}
              name="Apple Health"
              className="size-10 rounded-xl"
            />
          </div>
        }
        subtitle="Import your health data exported from the Apple Health app on your iPhone"
      />

      {/* Instructions */}
      {phase === "instructions" && (
        <>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {STEPS.map((step, i) => (
              <div key={i} className="card p-4 flex gap-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-600">
                  <step.icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-neutral-400">
                      Step {i + 1}
                    </span>
                  </div>
                  <h3 className="text-[14px] font-semibold text-neutral-900 font-display mt-0.5">
                    {step.title}
                  </h3>
                  <p className="text-[13px] text-neutral-500 mt-1 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-6 rounded-lg bg-[var(--color-health-critical-bg)] border border-[var(--color-health-critical-border)] p-3 text-sm text-[var(--color-health-critical)]">
              {error}
            </div>
          )}

          {/* Upload dropzone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`mt-8 rounded-xl border-2 border-dashed bg-white p-12 text-center transition-colors ${
              dragActive
                ? "border-accent-500 bg-accent-50"
                : "border-neutral-300 hover:border-neutral-400"
            }`}
          >
            <FileArchive className="mx-auto h-10 w-10 text-neutral-300" />
            <p className="mt-3 text-sm font-medium text-neutral-900 font-body">
              Drop your export.zip here
            </p>
            <p className="mt-1 text-sm text-neutral-500">or</p>
            <label className="mt-3 inline-block cursor-pointer rounded-lg bg-accent-600 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-700 transition-colors">
              Choose File
              <input
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
            <p className="mt-3 text-[11px] text-neutral-400 font-mono">
              ZIP file from Apple Health export
            </p>
          </div>
        </>
      )}

      {/* Uploading state */}
      {phase === "uploading" && (
        <div className="mt-12 flex flex-col items-center justify-center py-12">
          <Loader2 className="h-10 w-10 text-accent-600 animate-spin" />
          <h2 className="mt-4 text-lg font-semibold text-neutral-700 font-display">
            Uploading...
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            This may take a moment for large exports
          </p>
          <div className="mt-6 w-64">
            <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent-600 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-neutral-400 text-center font-mono">
              {uploadProgress}%
            </p>
          </div>
        </div>
      )}

      {/* Processing state */}
      {phase === "processing" && (
        <div className="mt-12 flex flex-col items-center justify-center py-12">
          <div className="relative">
            <Loader2 className="h-10 w-10 text-accent-600 animate-spin" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-neutral-700 font-display">
            Processing your health data...
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {statusQuery.data?.status === "classifying"
              ? "Identifying the export format..."
              : statusQuery.data?.status === "parsing"
                ? "Extracting health records..."
                : statusQuery.data?.status === "normalizing"
                  ? "Normalizing metrics and units..."
                  : "Starting up..."}
          </p>
          <p className="mt-4 text-xs text-neutral-400 font-mono">
            This may take a few minutes for large exports
          </p>
        </div>
      )}

      {/* Complete state */}
      {phase === "complete" && (
        <div className="mt-12 flex flex-col items-center justify-center py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-neutral-700 font-display">
            Import Complete
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Successfully imported{" "}
            <span className="font-semibold text-accent-600">
              {extractionCount}
            </span>{" "}
            health observations from Apple Health.
          </p>
          <div className="mt-6 flex gap-3">
            <Button
              text="View Data"
              onClick={() => router.push("/integrations/apple-health")}
            />
            <Button
              text="Import Another"
              variant="outline"
              onClick={() => {
                setPhase("instructions");
                setImportJobId(null);
                setError("");
                setUploadProgress(0);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
