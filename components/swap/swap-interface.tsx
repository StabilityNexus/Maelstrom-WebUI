"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TokenSelector } from "@/components/swap/token-selector";
import { SwapPreviewModal } from "@/components/swap/swap-preview-modal";
import { BuyForm } from "@/components/swap/buy-form";
import { SellForm } from "@/components/swap/sell-form";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { ArrowDownUp, Settings, Shield, HelpCircle } from "lucide-react";
import { ContractClient } from "@/lib/contract-client";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { Token } from "@/types/token";
import { BuyRequest, SellRequest, SwapRequest } from "@/types/trades";
import { ETH_ROW_POOL, RowPool } from "@/types/pool";
import { formatEther, parseEther } from "viem";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SwapState {
  tokenIn: Token | undefined;
  tokenOut: Token | undefined;
  amountIn: string;
  amountOut: string;
  exchangeRate: string;
}
const ITEMS_PER_PAGE = 10;

export function SwapInterface() {
  const { chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const contractClient = useMemo(
    () => new ContractClient(writeContractAsync, publicClient, chainId),
    [chainId]
  );
  const { chain } = useAccount();
  const baseUrl = chain?.blockExplorers?.default.url;
  const [swapState, setSwapState] = useState<SwapState>({
    tokenIn: undefined,
    tokenOut: undefined,
    amountIn: "",
    amountOut: "",
    exchangeRate: "",
  });
  const [tokens, setTokens] = useState<RowPool[]>([ETH_ROW_POOL]);
  const [loadedTokens, setLoadedTokens] = useState<number>(0);
  const [tokensInitialized, setTokensInitialized] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokenInSellPrice, setTokenInSellPrice] = useState<number>(0);
  const [tokenOutBuyPrice, setTokenOutBuyPrice] = useState<number>(0);
  const [ethInReserve, setEthInReserve] = useState<string | undefined>(
    undefined
  );
  const [tokenOutReserve, setTokenOutReserve] = useState<string | undefined>(
    undefined
  );
  const [fetchingRates, setFetchingRates] = useState(false);
  const [slippageTolerance, setSlippageTolerance] = useState<number>(0); // Start at 0 for zero slippage mode
  const [validationError, setValidationError] = useState<string>("");
  const [zeroSlippageMode, setZeroSlippageMode] = useState<boolean>(true); // Default to zero slippage mode
  const swapJustHappenedRef = useRef(false);
  const tokenInSellPriceForRef = useRef<Token | null>(null);
  const tokenOutBuyPriceForRef = useRef<Token | null>(null);

  const calculateOutput = (amount: string, isInput: boolean) => {
    setValidationError("");
    if (!amount || !tokenInSellPrice || !tokenOutBuyPrice) return "";

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) return "";

    if (isInput) {
      // Converting tokenIn to tokenOut: amount * sellPrice / buyPrice
      const ethAmount = amountNum * tokenInSellPrice;

      if (ethInReserve) {
        // Ensure we don't exceed the ethIn reserve by more than 10%
        const maxEthAllowed = Number(ethInReserve) * 0.1;
        if (ethAmount > maxEthAllowed) {
          const maxTokenIn = maxEthAllowed / tokenInSellPrice;
          console.log(maxTokenIn);
          setValidationError(
            `Amount exceeds 10% of reserve. Maximum: ${maxTokenIn.toFixed(6)} ${
              swapState.tokenIn?.symbol || ""
            }`
          );
          return "";
        }
      }

      const output = ethAmount / tokenOutBuyPrice;

      if (tokenOutReserve) {
        // Ensure we don't exceed the tokenOut reserve by more than 10%
        const maxTokenOutAllowed = Number(tokenOutReserve) * 0.1;
        if (output * 1e18 > maxTokenOutAllowed) {
          const maxInput = Math.round(
            (maxTokenOutAllowed * tokenOutBuyPrice) / tokenInSellPrice
          );
          setValidationError(
            `Output exceeds 10% of reserve. Maximum input: ${formatEther(
              BigInt(maxInput)
            )} ${swapState.tokenOut?.symbol || ""}`
          );
          return "";
        }
      }

      setValidationError("");
      return output.toString();
    } else {
      // Converting tokenOut to tokenIn: amount * buyPrice / sellPrice

      if (tokenOutReserve) {
        // Ensure we don't exceed the tokenOut reserve by more than 10%
        const maxTokenOutAllowed = Number(tokenOutReserve) * 0.1;
        if (amountNum * 1e18 > maxTokenOutAllowed) {
          setValidationError(
            `Amount exceeds 10% of reserve. Maximum: ${formatEther(
              BigInt(maxTokenOutAllowed)
            )} ${swapState.tokenOut?.symbol || ""}`
          );
          return "";
        }
      }

      const ethAmount = amountNum * tokenOutBuyPrice;

      if (ethInReserve) {
        // Ensure we don't exceed the ethIn reserve by more than 10%
        const maxEthAllowed = Number(ethInReserve) * 0.1;
        if (ethAmount > maxEthAllowed) {
          const maxTokenOut = maxEthAllowed / tokenOutBuyPrice;
          setValidationError(
            `Output exceeds 10% of reserve. Maximum output: ${maxTokenOut.toFixed(
              6
            )} ${swapState.tokenOut?.symbol || ""}`
          );
          return "";
        }
      }

      const output = ethAmount / tokenInSellPrice;
      setValidationError("");
      return output.toString();
    }
  };

  const handleAmountInChange = async (value: string) => {
    setSwapState((prev) => ({
      ...prev,
      amountIn: value,
      amountOut: calculateOutput(value, true),
    }));
  };

  const handleAmountOutChange = (value: string) => {
    setSwapState((prev) => ({
      ...prev,
      amountOut: value,
      amountIn: calculateOutput(value, false),
    }));
  };

  const handletokenInChange = async (token: Token) => {
    try {
      setFetchingRates(true);
      setValidationError(""); // Clear validation error when changing tokens
      let sellPrice = parseEther("1").toString();
      let reserve = undefined;
      if (!(token.name === "Ether" && token.symbol === "ETH")) {
        sellPrice = await contractClient.getSellPrice(token);
        reserve = await contractClient.getReserves(token);
      }

      const newSellPrice = Number(sellPrice);
      const newExchangeRate = tokenOutBuyPrice / newSellPrice;

      setTokenInSellPrice(newSellPrice);
      tokenInSellPriceForRef.current = token;
      setEthInReserve(reserve?.ethReserve);

      setSwapState((prev) => {
        const formattedExchangeRate =
          isFinite(newExchangeRate) && newExchangeRate > 0
            ? newExchangeRate.toString()
            : "0";
        const newState = {
          ...prev,
          tokenIn: token,
          exchangeRate: formattedExchangeRate,
        };
        if (prev.amountIn) {
          newState.amountOut = calculateOutput(prev.amountIn, true);
        }
        return newState;
      });
      setFetchingRates(false);
    } catch (error) {
      console.error(`Error getting exchange rates:,${error}`);
      setFetchingRates(false);
    }
  };

  const handletokenOutChange = async (token: Token) => {
    try {
      setFetchingRates(true);
      setValidationError(""); // Clear validation error when changing tokens
      let buyPrice = parseEther("1").toString();
      let reserve = undefined;
      if (!(token.name === "Ether" && token.symbol === "ETH")) {
        buyPrice = await contractClient.getBuyPrice(token);
        reserve = await contractClient.getReserves(token);
      }

      const newBuyPrice = Number(buyPrice);
      const newExchangeRate = newBuyPrice / tokenInSellPrice;
      setTokenOutReserve(reserve?.tokenReserve);
      setTokenOutBuyPrice(newBuyPrice);
      tokenOutBuyPriceForRef.current = token;

      setSwapState((prev) => {
        const formattedExchangeRate =
          isFinite(newExchangeRate) && newExchangeRate > 0
            ? newExchangeRate.toString()
            : "0";
        const newState = {
          ...prev,
          tokenOut: token,
          exchangeRate: formattedExchangeRate,
        };
        if (prev.amountIn) {
          newState.amountOut = calculateOutput(prev.amountIn, true);
        }
        return newState;
      });
      setFetchingRates(false);
    } catch (error) {
      console.error(`Error getting exchange rates:,${error}`);
      setFetchingRates(false);
    }
  };

  const handleSwapTokens = async () => {
    if (!swapState.tokenOut || !swapState.tokenIn) return;
    setIsSwapping(true);
    setValidationError(""); // Clear validation error when swapping
    try {
      const currentTokenIn = swapState.tokenIn;
      const currentTokenOut = swapState.tokenOut;

      // Swap tokens but preserve amounts; recalc will run after rates update (useEffect)
      setSwapState((prev) => ({
        ...prev,
        tokenIn: prev.tokenOut,
        tokenOut: prev.tokenIn,
        // Keep amountIn/amountOut so we can recalc for new direction after prices load
      }));
      swapJustHappenedRef.current = true;

      // Update exchange rates for the swapped tokens (async)
      await handletokenInChange(currentTokenOut);
      await handletokenOutChange(currentTokenIn);
    } catch (error) {
      console.error("Error swapping tokens:", error);
    } finally {
      setIsSwapping(false);
    }
  };

  // After swap, recalc the other amount only when both prices match the current token pair
  useEffect(() => {
    if (!swapJustHappenedRef.current) return;
    if (!swapState.tokenIn || !swapState.tokenOut || !tokenInSellPrice || !tokenOutBuyPrice) return;
    const sellPriceForCurrentIn = tokenInSellPriceForRef.current?.address === swapState.tokenIn?.address;
    const buyPriceForCurrentOut = tokenOutBuyPriceForRef.current?.address === swapState.tokenOut?.address;
    if (!sellPriceForCurrentIn || !buyPriceForCurrentOut) return;
    swapJustHappenedRef.current = false;
    if (swapState.amountIn) {
      setSwapState((prev) => ({ ...prev, amountOut: calculateOutput(prev.amountIn, true) }));
    } else if (swapState.amountOut) {
      setSwapState((prev) => ({ ...prev, amountIn: calculateOutput(prev.amountOut, false) }));
    }
  }, [swapState.tokenIn, swapState.tokenOut, tokenInSellPrice, tokenOutBuyPrice, swapState.amountIn, swapState.amountOut]);

  const handlePreviewSwap = () => {
    if (
      !swapState.amountIn ||
      !swapState.amountOut ||
      !swapState.tokenIn ||
      !swapState.tokenOut
    ) {
      toast.error(`Invalid Amount: Please enter an amount to swap`);
      return;
    }
    setShowPreview(true);
  };

  const handleConfirmSwap = async () => {
    if (!swapState.tokenIn || !swapState.tokenOut) {
      toast.error(`Select Tokens: Please select both input and output tokens.`);
      return;
    }
    setLoading(true);

    // Calculate minimum tokens out with slippage tolerance
    const amountOutNum = parseFloat(swapState.amountOut);
    const effectiveSlippage = zeroSlippageMode ? 0 : slippageTolerance;
    const slippageMultiplier = (100 - effectiveSlippage) / 100;
    const minimumTokenOut = (amountOutNum * slippageMultiplier).toString();

    if (
      swapState.tokenIn.symbol == "ETH" ||
      swapState.tokenOut.symbol == "ETH"
    ) {
      if (swapState.tokenIn.symbol == "ETH") {
        const buyRequest: BuyRequest = {
          token: swapState.tokenOut,
          amountIn: (Math.round(Number(swapState.amountIn) * 1e18 )).toString(),
          minimumAmountToBuy: (Math.round(Number(minimumTokenOut) * 1e18)).toString(),
        };
        const result = await contractClient.buy(buyRequest);
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
        return;
      }

      if (swapState.tokenOut.symbol == "ETH") {
        const sellRequest: SellRequest = {
          token: swapState.tokenIn,
          amountIn: (Math.round(Number(swapState.amountIn) * 1e18 )).toString(),
          minimumEthAmount: (Math.round(Number(minimumTokenOut) * 1e18)).toString(),
        };
        const result = await contractClient.sell(sellRequest);
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
        return;
      }
    }

    const swapRequest: SwapRequest = {
      tokenIn: swapState.tokenIn,
      tokenOut: swapState.tokenOut,
      amountIn: (Math.round(Number(swapState.amountIn) * 1e18 )).toString(),
      minimumTokenOut: (Math.round(Number(minimumTokenOut) * 1e18)).toString(),
    };
    const result = await contractClient.swap(swapRequest);
    if (result.success) {
      toast.success(
        <div>
          Swap Successful!{" "}
          <a
            href={`${baseUrl}/tx/${result.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-blue-400"
          >
            View on block explorer
          </a>
        </div>
      );
    } else {
      toast.error(
        `Swap Failed!: ${
          result.error || "An error occurred during the swap process."
        }`
      );
    }
    setLoading(false);
    setShowPreview(false);
  };

  const getPoolLength = async () => {
    try {
      const poolCount = await contractClient.getPoolCount();
      console.log(`Total pools: ${poolCount}`);
      return poolCount;
    } catch (error) {
      console.error("Error fetching total pools:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error(`Failed to fetch total pools count: ${errorMessage}`);
      return 0;
    }
  };

  const loadAllPools = async (totalPoolsCount: number) => {
    // Skip if we've already loaded the correct number of tokens
    if (tokensInitialized && loadedTokens === totalPoolsCount) return;

    try {
      // Reset tokens to initial state (only ETH_ROW_POOL) before loading
      setTokens([ETH_ROW_POOL]);
      setTokensInitialized(false);

      let currentLoaded = 0;
      let allPools: RowPool[] = [ETH_ROW_POOL];

      while (currentLoaded < totalPoolsCount) {
        const startIndex = currentLoaded;
        const endIndex = Math.min(
          startIndex + ITEMS_PER_PAGE - 1,
          totalPoolsCount - 1
        );
        const newPools = await contractClient.getPools(startIndex, endIndex);
        if (newPools.length === 0) break; // No more pools to load

        allPools = [...allPools, ...newPools];
        setTokens(allPools);
        currentLoaded += newPools.length;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      setTokensInitialized(true);
    } catch (error) {
      console.error("Error loading pools:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error(`Failed to load pools: ${errorMessage}`);
    }
  };

  useEffect(() => {
    const init = async () => {
      // Skip initialization if tokens are already loaded
      if (tokensInitialized) return;

      setLoading(true);
      try {
        const poolCount = await getPoolLength();
        await loadAllPools(poolCount);
        setLoadedTokens(poolCount);
      } catch (err) {
        console.error("Initialization failed:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to initialize token list: ${errorMessage}`);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [tokensInitialized]);

  return (
    <div className="w-full max-w-md mx-auto p-4">
      <div className="relative overflow-hidden rounded-3xl shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-b from-bg-800/95 to-bg-900/95 backdrop-blur-xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--accent-cyan)/10%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--primary-500)/10%,transparent_50%)]" />
        <div className="absolute inset-0 border border-white/[0.05] rounded-3xl bg-gradient-to-b from-white/[0.05] to-transparent" />

        <div className="relative p-6 backdrop-blur-sm">
          {/* Top Navigation */}
          <div className="mb-6">
            <Tabs defaultValue="swap" className="w-full">
              <div className="flex items-center justify-between mb-4">
                <TabsList className="grid grid-cols-3 bg-black/20 p-1 rounded-2xl backdrop-blur-md border border-white/[0.05]">
                  <TabsTrigger
                    value="swap"
                    className="data-[state=active]:bg-gradient-to-b data-[state=active]:from-accent-cyan/20 data-[state=active]:to-primary-600/20 data-[state=active]:border-accent-cyan/20 data-[state=active]:shadow-lg data-[state=active]:text-accent-cyan rounded-xl transition-all duration-200"
                  >
                    Swap
                  </TabsTrigger>
                  <TabsTrigger
                    value="buy"
                    className="data-[state=active]:bg-gradient-to-b data-[state=active]:from-accent-cyan/20 data-[state=active]:to-primary-600/20 data-[state=active]:border-accent-cyan/20 data-[state=active]:shadow-lg data-[state=active]:text-accent-cyan rounded-xl transition-all duration-200"
                  >
                    Buy
                  </TabsTrigger>
                  <TabsTrigger
                    value="sell"
                    className="data-[state=active]:bg-gradient-to-b data-[state=active]:from-accent-cyan/20 data-[state=active]:to-primary-600/20 data-[state=active]:border-accent-cyan/20 data-[state=active]:shadow-lg data-[state=active]:text-accent-cyan rounded-xl transition-all duration-200"
                  >
                    Sell
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center justify-end">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={zeroSlippageMode}
                      onChange={(e) => {
                        setZeroSlippageMode(e.target.checked);
                        if (e.target.checked) {
                          setSlippageTolerance(0);
                        } else {
                          setSlippageTolerance(0.5); // Default to 0.5% when unchecked
                        }
                      }}
                      className="sr-only"
                    />
                    <div
                      className={`relative w-5 h-5 rounded border-2 transition-all duration-300 flex items-center justify-center ${
                        zeroSlippageMode
                          ? "bg-gradient-to-br from-accent-cyan/20 to-primary-500/20 border-accent-cyan shadow-lg shadow-accent-cyan/25"
                          : "bg-white/5 border-white/20 hover:border-white/30"
                      }`}
                    >
                      {zeroSlippageMode && (
                        <svg
                          className="w-3.5 h-3.5 text-accent-cyan"
                          fill="none"
                          strokeWidth="3"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Shield
                        className={`h-4 w-4 transition-colors duration-300 ${
                          zeroSlippageMode
                            ? "text-accent-cyan"
                            : "text-white/40"
                        }`}
                      />
                      <span
                        className={`text-sm font-medium transition-colors duration-300 ${
                          zeroSlippageMode ? "text-white/90" : "text-white/50"
                        }`}
                      >
                        Zero Slippage Mode
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <TabsContent value="swap" className="mt-2">
                <div className="space-y-1">
                  <div className="relative bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300 rounded-2xl p-5 border border-white/[0.05] shadow-lg backdrop-blur-md group">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-lg font-medium text-white/90 font-plus-jakarta">
                        Sell
                      </div>
                      <TokenSelector
                        Tokens={tokens}
                        selectedToken={swapState.tokenIn}
                        onTokenChange={handletokenInChange}
                      />
                    </div>
                    <div className="relative">
                      <input
                        placeholder="0.00"
                        value={swapState.amountIn}
                        disabled={
                          !swapState.tokenIn ||
                          fetchingRates ||
                          !swapState.tokenOut ||
                          isSwapping
                        }
                        onChange={(e) => handleAmountInChange(e.target.value)}
                        className={`w-full h-16 text-3xl font-medium bg-black/10 group-hover:bg-black/20 rounded-xl px-4 
                          border ${
                            validationError
                              ? "border-red-500/50 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/20"
                              : "border-white/[0.05] focus:border-accent-cyan/30 focus:ring-2 focus:ring-accent-cyan/20"
                          }
                          placeholder:text-white/20 transition-all duration-300 font-plus-jakarta`}
                      />
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

                  {/* Swap Button */}
                  <div className="flex justify-center -my-3 relative z-10">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSwapTokens}
                      disabled={isSwapping || fetchingRates}
                      className="h-12 w-12 rounded-2xl bg-gradient-to-b from-accent-cyan/20 to-primary-600/20 hover:from-accent-cyan/30 hover:to-primary-600/30
                        border border-white/10 p-0 shadow-lg hover:shadow-accent-cyan/20 transition-all duration-300 backdrop-blur-sm"
                    >
                      <ArrowDownUp className="h-5 w-5 text-accent-cyan" />
                    </Button>
                  </div>

                  <div className="relative bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300 rounded-2xl p-5 border border-white/[0.05] shadow-lg backdrop-blur-md group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-lg font-medium text-white">Buy</div>
                      <TokenSelector
                        Tokens={tokens}
                        selectedToken={swapState.tokenOut}
                        onTokenChange={handletokenOutChange}
                      />
                    </div>
                    <div className="relative">
                      <input
                        placeholder="0.00"
                        value={swapState.amountOut}
                        onChange={(e) => handleAmountOutChange(e.target.value)}
                        disabled={
                          !swapState.tokenIn ||
                          fetchingRates ||
                          !swapState.tokenOut ||
                          isSwapping
                        }
                        className="w-full h-16 text-3xl font-medium bg-black/20 rounded-lg px-4 
                          border-transparent focus:border-accent/50 focus:ring-1 focus:ring-accent/50
                          placeholder:text-white/30 transition-all duration-200"
                      />
                    </div>
                  </div>
                </div>

                {/* Swap Details */}
                {swapState.amountIn &&
                  swapState.amountOut &&
                  swapState.tokenIn &&
                  swapState.tokenOut &&
                  !fetchingRates &&
                  !isSwapping && (
                    <div className="mt-5 space-y-3 p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl backdrop-blur-sm">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/50 font-medium">Rate</span>
                        <span className="text-white/80 font-medium">
                          1 {swapState.tokenIn!.symbol.toUpperCase()} ={" "}
                          {Number(swapState.amountOut) /
                            Number(swapState.amountIn)}{" "}
                          {swapState.tokenOut!.symbol.toUpperCase()}
                        </span>
                      </div>
                      {/* Slippage Tolerance - Only show in Advanced Mode */}
                      {!zeroSlippageMode && (
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
                                      If transactions occur before yours, the
                                      price may change. You might receive more
                                      or less tokens than expected. Increasing
                                      slippage tolerance raises the chance your
                                      transaction succeeds, as it will execute
                                      if the final amount is above your minimum
                                      acceptable threshold.
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
                              onValueChange={(value) =>
                                setSlippageTolerance(value[0])
                              }
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

                          {swapState.tokenOut && swapState.amountIn && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-white/40">
                                Minimum received:
                              </span>
                              <span className="text-white/60">
                                {(
                                  (parseFloat(swapState.amountOut) *
                                    (100 - slippageTolerance)) /
                                  100
                                ).toFixed(6)}{" "}
                                {swapState.tokenOut.symbol.toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                {/* Swap Action Button */}
                <Button
                  onClick={handlePreviewSwap}
                  disabled={
                    !swapState.amountIn ||
                    !swapState.amountOut ||
                    isSwapping ||
                    loading ||
                    !!validationError
                  }
                  className="w-full h-14 mt-6 bg-gradient-to-r from-accent-cyan to-primary-500 hover:from-accent-cyan/90 hover:to-primary-500/90 
                    text-white font-semibold rounded-xl shadow-lg hover:shadow-accent-cyan/25 transition-all duration-300 
                    disabled:from-gray-600/50 disabled:to-gray-700/50 disabled:cursor-not-allowed disabled:text-white/50
                    border border-white/[0.05] backdrop-blur-sm font-plus-jakarta text-base"
                >
                  {isSwapping ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/20 border-t-white" />
                  ) : validationError ? (
                    "Invalid Amount"
                  ) : (
                    "Preview Swap"
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="buy" className="mt-2">
                <BuyForm
                  tokens={tokens}
                  handleTokenOutChange={handletokenOutChange}
                  buyPrice={tokenOutBuyPrice.toString()}
                  isFetchingRates={fetchingRates}
                  tokenOutReserve={tokenOutReserve}
                  zeroSlippageMode={zeroSlippageMode}
                  slippageTolerance={slippageTolerance}
                  setSlippageTolerance={setSlippageTolerance}
                />
              </TabsContent>

              <TabsContent value="sell" className="mt-2">
                <SellForm
                  tokens={tokens}
                  handleTokenInChange={handletokenInChange}
                  sellPrice={tokenInSellPrice.toString()}
                  isFetchingRates={fetchingRates}
                  ethInReserve={ethInReserve}
                  zeroSlippageMode={zeroSlippageMode}
                  slippageTolerance={slippageTolerance}
                  setSlippageTolerance={setSlippageTolerance}
                />
              </TabsContent>
            </Tabs>
          </div>

          <SwapPreviewModal
            isOpen={showPreview}
            onClose={() => setShowPreview(false)}
            onConfirm={handleConfirmSwap}
            tokenIn={swapState.tokenIn!}
            tokenOut={swapState.tokenOut!}
            amountIn={swapState.amountIn}
            amountOut={swapState.amountOut}
            loading={loading}
            slippageTolerance={
              !zeroSlippageMode ? slippageTolerance : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
