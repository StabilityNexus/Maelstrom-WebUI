"use client";

import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { PoolsTable } from "@/components/dashboard/pools-table";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { ContractClient } from "@/lib/contract-client";
import { useEffect, useMemo, useState } from "react";
import { RowPool } from "@/types/pool";
import { toast } from "sonner";
import { formatEther } from "viem";
import { Deposit, Withdraw } from "@/types/trades";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { WalletCards } from "lucide-react";

export default function DashboardPage() {
  const { address, chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const contractClient = useMemo(
      () => new ContractClient(
        writeContractAsync,
        publicClient,
        chainId
      ),
      [chainId]
    );
  const [totalPools, setTotalPools] = useState<number>(0);
  const [portfolioValue, setPortfolioValue] = useState<string>("0");
  const [events, setEvents] = useState<(Deposit | Withdraw)[]>([]);
  const [pools, setPools] = useState<RowPool[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const POOL_FETCH_LIMIT = 5;

  const fetchPoolCount = async () => {
    if (!address) return;
    try {
      return await contractClient.getUserPoolCount(address);
    } catch (error) {
      console.error("Error fetching pool count:", error);
      toast.error("Failed to fetch pool count.");
    }
  };

  const fetchUserPools = async (poolCount: number) => {
    if (!address || poolCount === 0) return [];
    try {
      const allPools: RowPool[] = [];
      for (let i = 0; i < Math.ceil(poolCount / POOL_FETCH_LIMIT); i++) {
        const userPools = await contractClient.getUserPools(
          address,
          i * POOL_FETCH_LIMIT,
          Math.min(i * POOL_FETCH_LIMIT + POOL_FETCH_LIMIT, poolCount - 1)
        );
        allPools.push(...userPools);
      }
      return allPools;
    } catch (error) {
      console.error("Error fetching user pools:", error);
      toast.error("Failed to fetch user pools.");
      return [];
    }
  };

  const fetchRecentDeposits = async () => {
    if (!address) return [];
    try {
      const currentBlock = await publicClient?.getBlock();
      if (!currentBlock) return [];
      const deposits = await contractClient.getDepositEventLogs(
        Number(currentBlock.number) - 999,
        Number(currentBlock.number),
        undefined,
        address
      );
      return deposits;
    } catch (error) {
      console.error("Error fetching recent deposits:", error);
      toast.error("Failed to fetch recent deposits.");
      return [];
    }
  };

  const fetchRecentWithdrawals = async () => {
    if (!address) return [];
    try {
      const currentBlock = await publicClient?.getBlock();
      if (!currentBlock) return [];
      const withdrawals = await contractClient.getWithdrawEventLogs(
        Number(currentBlock.number) - 999,
        Number(currentBlock.number),
        undefined,
        address
      );
      return withdrawals;
    } catch (error) {
      console.error("Error fetching recent withdrawals:", error);
      toast.error("Failed to fetch recent withdrawals.");
      return [];
    }
  };



  const calculatePortfolioValue = (poolsData: RowPool[]) => {
    let total = 0;
    for (const pool of poolsData) {
      const proportion =
        Number(pool.lpToken!.balance) / Number(pool.lpToken!.totalSupply);
      total += Number(proportion) * Number(pool.totalLiquidity);
    }
    return formatEther(BigInt(total));
  };

  useEffect(() => {
    let cancelled = false;

    setTotalPools(0);
    setPortfolioValue("0");
    setEvents([]);
    setPools([]);
    setIsLoading(true);

    if (!address) return;

    const fetchData = async () => {
      try {
        const count = await fetchPoolCount();
        if (count === undefined) throw new Error("Pool count is undefined");
        if (cancelled) return;
        
        const userPools = await fetchUserPools(count);
        if (cancelled) return;
        
        // Fetch deposits and withdrawals in parallel and combine them
        const [deposits, withdrawals] = await Promise.all([
          fetchRecentDeposits(),
          fetchRecentWithdrawals()
        ]);
        
        // Combine and set all events at once to avoid duplicates
        if (!cancelled) {
          setTotalPools(count);
          setPools(userPools);
          setEvents([...deposits, ...withdrawals]);
        }
        
      } catch (error) {
        if (!cancelled) {
          console.error("Error fetching dashboard data:", error);
          toast.error("Failed to fetch dashboard data.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    if (pools.length > 0) {
      const portfolio = calculatePortfolioValue(pools);
      setPortfolioValue(portfolio);
    }
  }, [pools]);

  if (!address) {
    return (
      <div className="min-h-screen relative bg-gradient-pattern overflow-hidden">
        <main className="container relative mx-auto flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-8">
          <section
            aria-labelledby="connect-wallet-heading"
            className="relative w-full max-w-xl overflow-hidden rounded-xl border border-white/[0.05] p-8 text-center backdrop-blur-xl"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.08] to-primary-500/[0.05]" />
            <div className="relative flex flex-col items-center">
              <div className="mb-6 rounded-full border border-accent/20 bg-accent/10 p-4 text-accent">
                <WalletCards aria-hidden="true" className="h-8 w-8" />
              </div>
              <h1
                id="connect-wallet-heading"
                className="font-clash-display text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70"
              >
                Connect your wallet
              </h1>
              <p className="mt-3 mb-6 max-w-md font-plus-jakarta text-muted-foreground/70">
                Connect a wallet to view your liquidity positions, portfolio
                value, and recent activity.
              </p>
              <ConnectButton accountStatus="address" showBalance={false} />
            </div>
          </section>
        </main>

        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--accent-cyan)/10%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,var(--primary-500)/5%,transparent_50%)]" />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen relative bg-gradient-pattern overflow-hidden">
      <main className="container relative mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Page Header with glass effect */}
          <div className="relative rounded-xl p-8 overflow-hidden backdrop-blur-xl border border-white/[0.05]">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.08] to-primary-500/[0.05]" />
            <div className="absolute inset-0 border border-white/[0.05] rounded-xl" />
            <div className="relative">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold font-clash-display text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
                    Dashboard Overview
                  </h1>
                  <p className="text-muted-foreground/70 mt-2 max-w-[600px] font-plus-jakarta">
                    Monitor your positions, track performance, and manage your
                    DeFi portfolio.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Overview Cards */}
          <DashboardOverview
            portfolioValue={portfolioValue}
            // totalLiquidity={totalLiquidity}
            // profit={totalProfit}
            activePools={totalPools.toString()}
            loading={isLoading}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Portfolio & Pools */}
            <div className="lg:col-span-2 space-y-8">
              <div className="relative rounded-xl overflow-hidden backdrop-blur-xl border border-white/[0.05]">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.08] to-primary-500/[0.05]" />
                <div className="absolute inset-0 border border-white/[0.05] rounded-xl" />
                <div className="relative">
                  <PoolsTable pools={pools} loading={isLoading} />
                </div>
              </div>
            </div>

            {/* Right Column - Activity with glass effect */}
            <div className="relative rounded-xl overflow-hidden backdrop-blur-xl border border-white/[0.05]">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.08] to-primary-500/[0.05]" />
              <div className="absolute inset-0 border border-white/[0.05] rounded-xl" />
              <div className="relative">
                <RecentActivity events={events} />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Dynamic glow effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--accent-cyan)/10%,transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,var(--primary-500)/5%,transparent_50%)]" />
      </div>
    </div>
  );
}
