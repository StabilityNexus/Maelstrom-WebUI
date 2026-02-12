import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-pattern flex items-center justify-center">
      <div className="text-center space-y-6">
        {/* Animated Logo/Spinner */}
        <div className="relative">
          <div className="w-16 h-16 border-4 border-accent/20 rounded-full animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        </div>

        {/* Loading Text */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white font-clash-display">
            Loading
          </h2>
          <p className="text-muted-foreground text-sm">
            Please wait while we prepare your experience...
          </p>
        </div>

        {/* Animated Dots */}
        <div className="flex justify-center gap-1">
          <span className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 bg-accent rounded-full animate-bounce" />
        </div>
      </div>
    </div>
  );
}
