"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown } from "lucide-react";
import { Token } from "@/types/token";
import { RowPool } from "@/types/pool";

interface TokenSelectorProps {
  selectedToken: Token | undefined;
  Tokens: RowPool[];
  onTokenChange: (token: Token) => Promise<void>;
}

export function TokenSelector({
  selectedToken,
  Tokens,
  onTokenChange,
}: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedTokenData = Tokens.find(
    (token) => token.token === selectedToken
  )?.token;
  const filteredTokens = Tokens.filter(
    (token) =>
      token.token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.token.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTokenSelect = async (token: Token) => {
    await onTokenChange(token);
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setIsOpen(true)}
        className="h-10 px-3 hover:bg-accent/10 font-medium"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
            <span className="text-sm font-bold text-accent">
              {selectedTokenData?.symbol.toUpperCase().charAt(0)}
            </span>
          </div>
          <span>{selectedTokenData?.symbol.toUpperCase() || "Select"}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Token</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tokens..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Token List */}
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {filteredTokens.map((token) => (
                <Button
                  key={token.token.symbol}
                  variant="ghost"
                  onClick={() => handleTokenSelect(token.token)}
                  className="w-full h-auto p-3 justify-start hover:bg-accent/10"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                        <span className="text-sm font-bold text-accent">
                          {token.token.symbol.toUpperCase().charAt(0)}
                        </span>
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{token.token.symbol.toUpperCase()}</p>
                        <p className="text-xs text-muted-foreground">
                          {token.token.name}
                        </p>
                      </div>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
