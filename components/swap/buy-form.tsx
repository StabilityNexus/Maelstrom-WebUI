"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SwapPreviewModal } from "@/components/swap/swap-preview-modal";
import { toast } from "sonner";
import { ArrowDownUp, HelpCircle, Settings } from "lucide-react";
import { TokenSelector } from "./token-selector";
import { Token, getNativeCurrencyToken } from "@/types/token";
import { BuyRequest, BuyResult } from "@/types/trades";
import { useAccount, useBalance, usePublicClient, useWriteContract } from "wagmi";
import { ContractClient } from "@/lib/contract-client";
import { RowPool } from "@/types/pool";
import { formatEther } from "viem";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { Slider } from "../ui/slider";

interface BuyFormProps {
  tokens: RowPool[];
  handleTokenOutChange: (token: Token) => Promise<void>;
  buyPrice: string;
  tokenOutReserve: string | undefined;
  isFetchingRates: boolean;
  zeroSlippageMode: boolean;
  slippageTolerance: number;
  setSlippageTolerance: (value: number) => void;
}

export function BuyForm({
  tokens,
  handleTokenOutChange,
  buyPrice,
  tokenOutReserve,
  isFetchingRates,
  zeroSlippageMode,
  slippageTolerance,
  setSlippageTolerance,
}: BuyFormProps) {
  const { chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const contractClient = useMemo(
    () => new ContractClient(writeContractAsync, publicClient, chainId),
    [chainId]
  );
  const { chain, address } = useAccount();
  const { data: ethBalance } = useBalance({ address });
  const baseUrl = chain?.blockExplorers?.default.url;
  const nativeCurrencySymbol = chain?.nativeCurrency?.symbol || "ETH";
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const displaySymbol = mounted ? nativeCurrencySymbol : "ETH";
  const [ethAmount, setEthAmount] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [isEthInput, setIsEthInput] = useState(true);
  const [isSwapping, setIsSwapping] = useState(false);
  const [token, setToken] = useState<Token | undefined>(undefined);
  const [validationError, setValidationError] = useState<string>("");

  const handleTokenChange = async (selctedToken: Token) => {
    setToken(selctedToken);
    await handleTokenOutChange(selctedToken);
  };

  const handleInputChange = async (value: string) => {
    setValidationError("");
    if (!token) return;
    if (!isEthInput) {
      setTokenAmount(value);
      if (Number(value) * 1e18 > Number(tokenOutReserve) * 0.1) {
        const maxTokenOutAllowed = Number(tokenOutReserve) * 0.1;
        setValidationError(
          `Amount exceeds 10% of reserve. Maximum: ${formatEther(
            BigInt(maxTokenOutAllowed)
          )} ${token.symbol}`
        );
        return "";
      }
      const ethValue = String(
        Number(value) * Number(formatEther(BigInt(buyPrice)))
      );
      setEthAmount(ethValue);
    } else {
      setEthAmount(value);
      if (Number(buyPrice) === Number(0)) {
        await handleTokenChange(token);
      }
      const tokenValue = String(
        Number(value) / Number(formatEther(BigInt(buyPrice)))
      );
      if (Number(tokenValue) * 1e18 > Number(tokenOutReserve) * 0.1) {
        const maxTokenOutAllowed = Number(tokenOutReserve) * 0.1;
        setValidationError(
          `Amount exceeds 10% of reserve. Maximum: ${formatEther(
            BigInt(maxTokenOutAllowed)
          )} ${token.symbol}`
        );
        return "";
      }
      setTokenAmount(tokenValue);
    }
    setValidationError("");
  };

  const handleSwapInputType = () => {
    setIsEthInput(!isEthInput);
  };

  const handlePreview = () => {
    if (!ethAmount || !tokenAmount || !token) {
      toast.error("Invalid Amount: Please enter an amount to buy");
      return;
    }
    setShowPreview(true);
  };

  const handleConfirmBuy = async () => {
    if (!token || validationError) return;
    setIsSwapping(true);

    const amountOutNum = parseFloat(tokenAmount);
    const effectiveSlippage = zeroSlippageMode ? 0 : slippageTolerance;
    const slippageMultiplier = (100 - effectiveSlippage) / 100;
    const minimumTokenOut = (amountOutNum * slippageMultiplier).toString();

    const request: BuyRequest = {
      token,
      amountIn: (Math.round(Number(ethAmount) * 1e18)).toString(),
      minimumAmountToBuy: (Math.round(Number(minimumTokenOut) * 1e18)).toString(),
    };
    const result: BuyResult = await contractClient.buy(request);
    if (result.success) {
      toast.success(
        <div>
          <div>Swap Successful! </div>
          <div>
            <a
              href={`${baseUrl}/tx/${result.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-400"
            >
              View on block explorer
            </a>
          </div>
        </div>
      );
    } else {
      toast.error(
        `Swap Failed!: ${
          result.error || "An error occurred during the swap process."
        }`
      );
    }
    setIsSwapping(false);
    if (result) {
      setEthAmount("");
      setTokenAmount("");
      setShowPreview(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300 rounded-2xl p-5 border border-white/[0.05] shadow-lg backdrop-blur-md group">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-white/70 font-medium font-plus-jakarta">
            You&apos;re {isEthInput ? "paying" : "receiving"}
          </span>
          <button
            onClick={handleSwapInputType}
            className="p-2 hover:bg-white/10 rounded-xl transition-all duration-200 border border-white/[0.05] bg-white/[0.02]"
          >
            <ArrowDownUp className="h-4 w-4 text-accent-cyan" />
          </button>
        </div>
        <div className="relative flex items-center bg-black/10 group-hover:bg-black/20 rounded-xl p-4 transition-all duration-300">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            disabled={!token && isSwapping && isFetchingRates}
            value={isEthInput ? ethAmount : tokenAmount}
            onChange={(e) => handleInputChange(e.target.value)}
            className="w-full bg-transparent text-4xl font-medium outline-none placeholder:text-white/20 
              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
              font-plus-jakarta text-white/90 transition-all duration-300"
          />
          {!isEthInput && (
            <div className="ml-2">
              <TokenSelector
                Tokens={tokens}
                selectedToken={token}
                onTokenChange={handleTokenChange}
              />
            </div>
          )}
          {isEthInput && (
            <>
              <button
                onClick={() => ethBalance && handleInputChange(ethBalance.formatted)}
                className="text-xs text-accent-cyan font-medium px-2 hover:text-accent-cyan/80 transition-colors flex-shrink-0"
              >
                MAX
              </button>
              <Button
                variant="ghost"
                className="h-10 px-3 hover:bg-accent/10 font-medium ml-2"
              >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                  <span className="text-sm font-bold text-accent">E</span>
                </div>
                <span className="text-base">{displaySymbol}</span>
              </div>
            </Button>
            </>
          )}
        </div>
      </div>

      {/* Validation Error Message */}
      {validationError && (
        <div className="px-1 py-2 -my-1">
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl backdrop-blur-sm">
            <svg
              className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
              fill="none"
              strokeWidth="2"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <p className="text-sm text-red-300 font-medium">
              {validationError}
            </p>
          </div>
        </div>
      )}

      <div className="relative bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300 rounded-2xl p-5 border border-white/[0.05] shadow-lg backdrop-blur-md group">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-white/70 font-medium font-plus-jakarta">
            You&apos;ll {isEthInput ? "receive" : "pay"}
          </span>
        </div>
        <div className="relative flex items-center bg-black/10 group-hover:bg-black/20 rounded-xl p-4 transition-all duration-300">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={isEthInput ? tokenAmount : ethAmount}
            disabled={!token && isSwapping && isFetchingRates}
            readOnly
            className="w-full bg-transparent text-4xl font-medium outline-none placeholder:text-white/20 
                [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                font-plus-jakarta text-white/90 transition-all duration-300"
          />
          {isEthInput && (
            <div className="ml-2">
              <TokenSelector
                Tokens={tokens}
                selectedToken={token}
                onTokenChange={handleTokenChange}
              />
            </div>
          )}
          {!isEthInput && (
            <Button
              variant="ghost"
              className="h-10 px-3 hover:bg-accent/10 font-medium ml-2 flex-shrink-0"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                  <span className="text-sm font-bold text-accent">E</span>
                </div>
                <span className="text-base">{displaySymbol}</span>
              </div>
            </Button>
          )}
        </div>
      </div>

      {token && Number(tokenAmount) > 0 && !isFetchingRates && !isSwapping && (
        <div className="mt-5 space-y-3 p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl backdrop-blur-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50 font-medium">Rate</span>
            <span className="text-white/80 font-medium">
              1 {token.symbol.toUpperCase()} ={" "}
              {Number(ethAmount) / Number(tokenAmount)} {displaySymbol}
            </span>
          </div>
          {/* Slippage Tolerance - Only show in Advanced Mode */}
          {!zeroSlippageMode ? (
            <div className="space-y-3 pt-2 border-t border-white/[0.05]">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50 font-medium flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Slippage Tolerance
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-white/30 hover:text-white/50 transition-colors cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs bg-gradient-to-b from-bg-800/95 to-bg-900/95 border border-white/10 p-3 backdrop-blur-xl">
                        <p className="text-sm text-white/90 leading-relaxed">
                          <span className="font-semibold text-accent-cyan">
                            Auction-Based Slippage:
                          </span>{" "}
                          If transactions occur before yours, the price may
                          change. You might receive more or less tokens than
                          expected. Increasing slippage tolerance raises the
                          chance your transaction succeeds, as it will execute
                          if the final amount is above your minimum acceptable
                          threshold.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
                <span className="text-white/80 font-medium">
                  {slippageTolerance}%
                </span>
              </div>

              <div className="px-1">
                <Slider
                  value={[slippageTolerance]}
                  onValueChange={(value) => setSlippageTolerance(value[0])}
                  min={0.1}
                  max={5.0}
                  step={0.1}
                  className="w-full [&_[data-slot=slider-track]]:bg-white/10 [&_[data-slot=slider-range]]:bg-gradient-to-r [&_[data-slot=slider-range]]:from-accent-cyan [&_[data-slot=slider-range]]:to-primary-500 [&_[data-slot=slider-thumb]]:border-accent-cyan/50 [&_[data-slot=slider-thumb]]:bg-gradient-to-b [&_[data-slot=slider-thumb]]:from-accent-cyan/20 [&_[data-slot=slider-thumb]]:to-primary-600/20 [&_[data-slot=slider-thumb]]:shadow-lg [&_[data-slot=slider-thumb]]:shadow-accent-cyan/25"
                />
                <div className="flex justify-between text-xs text-white/30 mt-1">
                  <span>0.1%</span>
                  <span>5.0%</span>
                </div>
              </div>

              {token && tokenAmount && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/40">Minimum received:</span>
                  <span className="text-white/60">
                    {(
                      (parseFloat(tokenAmount) * (100 - slippageTolerance)) /
                      100
                    ).toFixed(6)}{" "}
                    {token.symbol.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      <Button
        onClick={handlePreview}
        disabled={!ethAmount || !tokenAmount || isSwapping || isFetchingRates}
        className="w-full h-14 mt-6 bg-gradient-to-r from-accent-cyan to-primary-500 hover:from-accent-cyan/90 hover:to-primary-500/90 
          text-white font-semibold rounded-xl shadow-lg hover:shadow-accent-cyan/25 transition-all duration-300 
          disabled:from-gray-600/50 disabled:to-gray-700/50 disabled:cursor-not-allowed disabled:text-white/50
          border border-white/[0.05] backdrop-blur-sm font-plus-jakarta text-base"
      >
        {isSwapping || isFetchingRates ? (
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white" />
        ) : (
          `Preview Buy`
        )}
      </Button>

      <SwapPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        onConfirm={handleConfirmBuy}
        tokenIn={getNativeCurrencyToken(chain)}
        tokenOut={token}
        amountIn={ethAmount}
        amountOut={tokenAmount}
        loading={isSwapping}
        slippageTolerance={!zeroSlippageMode ? slippageTolerance : undefined}
      />
    </div>
  );
}
