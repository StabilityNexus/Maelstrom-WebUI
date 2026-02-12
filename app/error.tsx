"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gradient-pattern flex items-center justify-center px-4">
      <div className="text-center max-w-lg mx-auto">
        {/* Error Icon */}
        <div className="mb-8 flex justify-center">
          <div className="w-24 h-24 rounded-full bg-destructive/20 flex items-center justify-center">
            <AlertTriangle className="w-12 h-12 text-destructive" />
          </div>
        </div>

        {/* Error Message */}
        <div className="mb-8 space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold text-white font-clash-display">
            Something Went Wrong
          </h1>
          <p className="text-muted-foreground text-lg">
            We encountered an unexpected error. Don&apos;t worry, our team has been notified 
            and is working on a fix.
          </p>
          
          {/* Error Details (only in development) */}
          {process.env.NODE_ENV === "development" && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-white">
                Technical Details
              </summary>
              <pre className="mt-2 p-4 bg-black/50 rounded-lg text-xs text-red-400 overflow-auto max-h-40">
                {error.message}
                {error.digest && `\nDigest: ${error.digest}`}
              </pre>
            </details>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            onClick={reset}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          
          <Button
            asChild
            variant="outline"
            className="border-white/20 hover:bg-white/10"
          >
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Link>
          </Button>
        </div>

        {/* Support Link */}
        <p className="mt-8 text-sm text-muted-foreground">
          If the problem persists, please{" "}
          <a
            href="https://github.com/StabilityNexus/Maelstrom-WebUI/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            report an issue
          </a>
          .
        </p>

        {/* Decorative Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-destructive/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        </div>
      </div>
    </div>
  );
}
