"use client";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useSwitchChain } from "wagmi";
import { useWalletLink, WalletLinkButton } from "@stability-nexus/walletlink";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

// WalletLinkButton handles connect plus the account menu (copy, disconnect).
// WalletLink has no chain UI, so the chain selector and wrong-network switch are
// added here with wagmi's own hooks. Maelstrom is multi-chain, so this keeps the
// chain switching the old RainbowKit ConnectButton provided.
export function WalletButton() {
  const { isConnected, chain } = useWalletLink();
  const { chains, switchChain } = useSwitchChain();
  // `chain` is undefined when connected to a chain the dapp did not configure.
  const wrongNetwork = isConnected && !chain;

  // Some injected wallets (e.g. Phantom) only support a fixed set of EVM chains
  // and reject unknown ones. switchChain fails silently otherwise, so surface it.
  const changeChain = (chainId: number) =>
    switchChain(
      { chainId },
      {
        onError: (err) =>
          toast.error(
            err.message?.includes("Unrecognized") || err.message?.includes("not support")
              ? "Your wallet does not support this network. Try MetaMask for custom chains."
              : err.message || "Could not switch network."
          ),
      }
    );

  return (
    <div className="flex items-center gap-2">
      {wrongNetwork && (
        <button
          type="button"
          onClick={() => chains[0] && changeChain(chains[0].id)}
          className="flex items-center gap-1.5 rounded-lg border border-red-500 px-3 py-2 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/10"
        >
          <AlertTriangle size={16} strokeWidth={2} />
          Wrong network
        </button>
      )}

      {isConnected && chain && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent/10"
            >
              <span className="max-w-[120px] truncate">{chain.name}</span>
              <ChevronDown size={14} strokeWidth={2} className="opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {chains.map((c) => (
              <DropdownMenuItem key={c.id} onSelect={() => changeChain(c.id)}>
                {c.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <WalletLinkButton />
    </div>
  );
}
