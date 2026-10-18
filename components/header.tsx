"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "@/components/wallet-button";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useState } from "react";
import { Menu, X, Home, Repeat2, Droplets, LayoutDashboard, Plus } from "lucide-react";

const navigation = [
  { name: "Swap", href: "/swap", icon: Repeat2 },
  { name: "Pools", href: "/pools", icon: Droplets },
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Create Pool", href: "/create", icon: Plus },
];

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header
        data-tour="header"
        className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60"
      >
        <div className="p-4 w-full flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 group">
            <div className="relative">
              <Image
                src="/logo_maelstrom.svg"
                alt="Maelstrom Logo"
                className="dark:invert object-contain"
                width={50}
                height={50}
              />
            </div>
            <span className="text-xl font-bold gradient-text">Maelstrom</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                data-tour={`${item.name.toLowerCase()}-link`}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-accent relative group",
                  pathname === item.href
                    ? "text-accent"
                    : "text-muted-foreground"
                )}
              >
                {item.name}
                {pathname === item.href && (
                  <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-accent rounded-full" />
                )}
                <div className="absolute -bottom-1 left-0 right-0 h-0.5 bg-accent rounded-full scale-x-0 group-hover:scale-x-100 transition-transform duration-200" />
              </Link>
            ))}
          </nav>

          {/* Right side actions */}
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-accent/10 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>

            <div className="hidden md:block">
              <WalletButton />
            </div>
          </div>
        </div>

         {mobileMenuOpen && (
          <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur">
            <nav className="container mx-auto px-4 py-4 space-y-1">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors",
                  pathname === "/"
                    ? "bg-accent/10 text-accent"
                    : "text-foreground hover:bg-accent/5"
                )}
              >
                <Home className="h-5 w-5" />
                <span className="text-base font-medium">Home</span>
              </Link>
              
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors",
                    pathname === item.href
                      ? "bg-accent/10 text-accent"
                      : "text-foreground hover:bg-accent/5"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="text-base font-medium">{item.name}</span>
                </Link>
              ))}

              <div className="pt-4 border-t border-border/40">
                <WalletButton />
              </div>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}
