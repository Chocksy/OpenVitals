"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth/client";
import { LogoWordmark } from "@/assets/app/images/logo";
import { toast } from "sonner";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const { error } = await signUp.email({ name, email, password });
      if (error) {
        toast.error(error.message ?? "Failed to create account");
        return;
      }
      toast.success("Account created");
      router.push("/onboarding");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[380px] animate-fade-in">
      {/* Mobile logo */}
      <LogoWordmark className="mb-8 lg:hidden" />

      <h1 className="text-[26px] font-medium tracking-[-0.025em] text-neutral-900 font-display">
        Create your account
      </h1>
      <p className="mt-2 text-[14px] text-neutral-500 font-body">
        Free and open source. Your data stays yours.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-[13px] font-medium text-neutral-700 font-body"
          >
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 transition-all focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
            placeholder="Your name"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-[13px] font-medium text-neutral-700 font-body"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 transition-all focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-[13px] font-medium text-neutral-700 font-body"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-[14px] text-neutral-900 placeholder:text-neutral-400 transition-all focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
            placeholder="8+ characters"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg py-2.5 text-[14px] font-medium text-white transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm"
          style={{ background: "linear-gradient(135deg, #3162FF, #2750D9)" }}
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-neutral-400 font-body">
        By creating an account, you agree to OpenVitals&apos; open-source
        license. Your health data is encrypted and never shared without your
        explicit consent.
      </p>

      <p className="mt-6 text-center text-[13px] text-neutral-500 font-body">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-accent-600 hover:text-accent-700 transition-colors"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
