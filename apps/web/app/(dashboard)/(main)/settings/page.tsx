"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { TitleActionHeader } from "@/components/title-action-header";
import { toast } from "sonner";

const selectClass =
  "mt-1 block w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-accent-300 focus:outline-none focus:ring-1 focus:ring-accent-300";
const inputClass =
  "mt-1 block w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-accent-300 focus:outline-none focus:ring-1 focus:ring-accent-300";
const labelClass = "block text-sm font-medium text-neutral-700 font-body";

export default function SettingsPage() {
  const { data, isLoading } = trpc.preferences.get.useQuery();
  const updateMutation = trpc.preferences.update.useMutation({
    onSuccess: () => toast.success("Preferences saved"),
    onError: (err) => toast.error(err.message),
  });

  const [timezone, setTimezone] = useState("UTC");
  const [units, setUnits] = useState("metric");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [biologicalSex, setBiologicalSex] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [showOptimalRanges, setShowOptimalRanges] = useState(true);

  const toggleOptimalMutation = trpc.optimalRanges.toggleVisibility.useMutation(
    {
      onSuccess: () => toast.success("Preference saved"),
      onError: (err) => toast.error(err.message),
    },
  );

  useEffect(() => {
    if (data) {
      setTimezone(data.timezone);
      setUnits(data.preferredUnits);
      setDateOfBirth(data.dateOfBirth ?? "");
      setBiologicalSex(data.biologicalSex ?? "");
      setBloodType(data.bloodType ?? "");
      setShowOptimalRanges(data.showOptimalRanges ?? true);
    }
  }, [data]);

  const handleSave = () => {
    updateMutation.mutate({
      timezone,
      preferredUnits: units as "metric" | "imperial",
      ...(dateOfBirth && { dateOfBirth }),
      ...(biologicalSex && {
        biologicalSex: biologicalSex as "male" | "female" | "intersex",
      }),
      ...(bloodType && { bloodType: bloodType as any }),
    });
  };

  if (isLoading) {
    return (
      <div>
        <TitleActionHeader title="Settings" subtitle="Loading..." />
        <div className="card max-w-lg h-64 animate-pulse bg-neutral-50" />
      </div>
    );
  }

  return (
    <div>
      <TitleActionHeader title="Settings" subtitle="Manage your preferences." />

      <div className="mt-7 max-w-lg space-y-6">
        {/* General Preferences */}
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-medium tracking-[-0.015em] text-neutral-900 font-display">
            Preferences
          </h2>
          <div>
            <label htmlFor="timezone" className={labelClass}>
              Timezone
            </label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={selectClass}
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern</option>
              <option value="America/Chicago">Central</option>
              <option value="America/Denver">Mountain</option>
              <option value="America/Los_Angeles">Pacific</option>
            </select>
          </div>
          <div>
            <label htmlFor="units" className={labelClass}>
              Preferred Units
            </label>
            <select
              id="units"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              className={selectClass}
            >
              <option value="metric">Metric</option>
              <option value="imperial">Imperial</option>
            </select>
          </div>
        </div>

        {/* Demographic Profile */}
        <div className="card p-6 space-y-6">
          <div>
            <h2 className="text-lg font-medium tracking-[-0.015em] text-neutral-900 font-display">
              Demographic Profile
            </h2>
            <p className="mt-1 text-[13px] text-neutral-500 font-body">
              Used for sex- and age-specific reference ranges on lab results.
            </p>
          </div>
          <div>
            <label htmlFor="dateOfBirth" className={labelClass}>
              Date of Birth
            </label>
            <input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="biologicalSex" className={labelClass}>
              Biological Sex
            </label>
            <select
              id="biologicalSex"
              value={biologicalSex}
              onChange={(e) => setBiologicalSex(e.target.value)}
              className={selectClass}
            >
              <option value="">Not set</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="intersex">Intersex</option>
            </select>
          </div>
          <div>
            <label htmlFor="bloodType" className={labelClass}>
              Blood Type
            </label>
            <select
              id="bloodType"
              value={bloodType}
              onChange={(e) => setBloodType(e.target.value)}
              className={selectClass}
            >
              <option value="">Not set</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </div>
        </div>

        {/* Optimal Ranges */}
        <div className="card p-6 space-y-4">
          <div>
            <h2 className="text-lg font-medium tracking-[-0.015em] text-neutral-900 font-display">
              Optimal Ranges
            </h2>
            <p className="mt-1 text-[13px] text-neutral-500 font-body">
              Longevity-focused reference ranges from credible sources,
              displayed alongside standard clinical ranges.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <label htmlFor="showOptimalRanges" className={labelClass}>
              Show optimal ranges
            </label>
            <button
              id="showOptimalRanges"
              role="switch"
              aria-checked={showOptimalRanges}
              onClick={() => {
                const next = !showOptimalRanges;
                setShowOptimalRanges(next);
                toggleOptimalMutation.mutate({ show: next });
              }}
              className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              style={{
                backgroundColor: showOptimalRanges
                  ? "var(--color-health-optimal)"
                  : "var(--color-neutral-300)",
              }}
            >
              <span
                className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
                style={{
                  transform: showOptimalRanges
                    ? "translateX(20px)"
                    : "translateX(0)",
                }}
              />
            </button>
          </div>
          <Link
            href="/settings/optimal-ranges"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-600 hover:text-accent-700 transition-colors"
          >
            Customize ranges
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>

        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 transition-colors disabled:opacity-50"
        >
          {updateMutation.isPending ? "Saving..." : "Save preferences"}
        </button>
      </div>
    </div>
  );
}
