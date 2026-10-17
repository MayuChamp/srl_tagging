"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, LogIn, Loader2, Tags, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // If the user typed an email, use it directly. Otherwise, map the username to a pseudo-email.
      const rawInput = username.trim().toLowerCase();
      const email = rawInput.includes("@") ? rawInput : `${rawInput}@scope.local`;

      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
      } else {
        // Force hard reload so middleware allows us through and layout re-mounts
        window.location.href = "/";
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card w-full max-w-md p-6 sm:p-8 space-y-8 shadow-lg">
      <div className="text-center">
        <div className="mx-auto mb-4 size-12 rounded-2xl bg-primary-solid text-primary-foreground grid place-items-center">
          <Tags size={22} />
        </div>
        <h1 className="text-3xl font-bold tracking-wide text-foreground mb-1">SCOPE</h1>
        <p className="page-subtitle">SRL Video Analysis System</p>
      </div>

      <form onSubmit={handleSubmit} aria-busy={loading} className="space-y-6">
        {error && (
          <div role="alert" className="callout tone-danger justify-center text-center">
            <AlertCircle size={16} className="callout-icon" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="relative">
            <label htmlFor="login-username" className="sr-only">Email or Username</label>
            <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-muted-foreground">
              <User className="h-5 w-5" />
            </div>
            <input
              id="login-username"
              name="username"
              type="text"
              placeholder="Email or Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              dir="ltr"
              className="field h-11 ps-10 pe-4 text-base"
              required
            />
          </div>

          <div className="relative">
            <label htmlFor="login-password" className="sr-only">Password</label>
            <div className="absolute inset-y-0 start-0 ps-3 flex items-center pointer-events-none text-muted-foreground">
              <Lock className="h-5 w-5" />
            </div>
            <input
              id="login-password"
              name="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="field h-11 ps-10 pe-4 text-base"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary btn-lg btn-block h-11"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="sr-only">Signing in…</span>
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              Sign In
            </>
          )}
        </button>
      </form>
    </div>
  );
}
