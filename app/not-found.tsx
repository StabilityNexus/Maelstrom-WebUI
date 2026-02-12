"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-pattern flex items-center justify-center px-4">
      <div className="text-center max-w-md mx-auto">
        {/* 404 Number with gradient */}
        <div className="mb-8">
          <h1 className="text-[150px] font-bold leading-none gradient-text-animated font-clash-display">
            404
          </h1>
        </div>

        {/* Error Message */}
        <div className="mb-8 space-y-4">
          <h2 className="text-2xl md:text-3xl font-semibold text-white">
            Page Not Found
          </h2>
          <p className="text-muted-foreground text-lg">
            Oops! The page you&apos;re looking for seems to have drifted into the void. 
            Let&apos;s get you back on track.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            asChild
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Link>
          </Button>
          
          <Button
            asChild
            variant="outline"
            className="border-white/20 hover:bg-white/10"
          >
            <Link href="/swap">
              <Search className="mr-2 h-4 w-4" />
              Start Trading
            </Link>
          </Button>
        </div>

        {/* Back Button */}
        <div className="mt-8">
          <button
            onClick={() => window.history.back()}
            className="text-muted-foreground hover:text-white transition-colors inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Go back to previous page
          </button>
        </div>

        {/* Decorative Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-accent/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        </div>
      </div>
    </div>
  );
}
