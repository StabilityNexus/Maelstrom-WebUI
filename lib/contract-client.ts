import { ABI, CONTRACT_ADDRESSES, IContractClient } from "@/types/contract";
import { InitPool, InitPoolResult, Pool, PoolFeesEvent, Reserve, RowPool } from "@/types/pool";
import { LiquidityPoolToken, Token } from "@/types/token";
import { BuyRequest, BuyResult, BuyTrade, Deposit, DepositRequest, DepositResult, SellRequest, SellResult, SellTrade, SwapRequest, SwapResult, SwapTrade, Withdraw, WithdrawRequest, WithdrawResult } from "@/types/trades";
import { Address, erc20Abi, formatEther, parseAbiItem, parseEther, zeroAddress } from "viem";
import { Config, UsePublicClientReturnType } from "wagmi";
import { WriteContractMutateAsync } from "wagmi/query";

/** Thrown when chainId is not in CONTRACT_ADDRESSES — UI should show "Wrong network" */
export const UNSUPPORTED_CHAIN = "UNSUPPORTED_CHAIN";

/** Fatal: publicClient not available (e.g. no provider). */
const PUBLIC_CLIENT_UNAVAILABLE = "PUBLIC_CLIENT_UNAVAILABLE";

function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}

/**
 * Expected/recoverable read failures: no data, contract not deployed, no logs, pool not instantiated.
 * These get safe fallbacks. Fatal errors (wrong chain, missing config, ABI, no publicClient) still throw.
 */
function isExpectedReadFailure(error: unknown): boolean {
    const msg = getErrorMessage(error).toLowerCase();
    return (
        msg.includes("returned no data") ||
        msg.includes("no data (0x)") ||
        (msg.includes("contract") && (msg.includes("not deployed") || msg.includes("could not be found"))) ||
        msg.includes("no logs") ||
        msg.includes("no events") ||
        (msg.includes("pool") && msg.includes("not instantiated")) ||
        msg.includes("execution reverted") && (msg.includes("0x") || msg.includes("no data"))
    );
}

const tokenCache: Record<string, Token> = {};

export class ContractClient implements IContractClient {
    contractAddress: Address;
    writeContract: WriteContractMutateAsync<Config, unknown>;
    publicClient: UsePublicClientReturnType;
    private chainId: number;

    constructor(writeContract: WriteContractMutateAsync<Config, unknown>, publicClient: UsePublicClientReturnType, chainId?: number) {
        this.chainId = chainId ?? 63;
        const addr = CONTRACT_ADDRESSES[this.chainId];
        if (addr === undefined) {
            console.error("[ContractClient] Unsupported chain.", { chainId: this.chainId });
            throw new Error(UNSUPPORTED_CHAIN);
        }
        this.contractAddress = addr;
        this.writeContract = writeContract;
        this.publicClient = publicClient;
    }

    /** Call before any read. Throws on wrong network or missing publicClient (fatal). */
    private ensureCanRead(): void {
        if (CONTRACT_ADDRESSES[this.chainId] === undefined) {
            console.error("[ContractClient] Unsupported chain.", { chainId: this.chainId });
            throw new Error(UNSUPPORTED_CHAIN);
        }
        if (!this.publicClient) {
            console.error("[ContractClient] publicClient is undefined.");
            throw new Error(PUBLIC_CLIENT_UNAVAILABLE);
        }
    }

    /**
     * Run a read-only call; on expected failures return fallback; on fatal errors rethrow and log error.
     */
    private async safeRead<T>(methodName: string, fallback: T, fn: () => Promise<T>): Promise<T> {
        this.ensureCanRead();
        try {
            return await fn();
        } catch (error) {
            if (isExpectedReadFailure(error)) {
                console.warn(`[ContractClient] Expected read failure (${methodName}), returning fallback. chainId=${this.chainId}`, getErrorMessage(error));
                return fallback;
            }
            console.error(`[ContractClient] Fatal read error (${methodName}). chainId=${this.chainId}`, error);
            throw error;
        }
    }

    private async approveToken(token: string, amount: bigint): Promise<void> {
        try {
            const hash = await this.writeContract({
                address: token as Address,
                abi: erc20Abi,
                functionName: "approve",
                args: [this.contractAddress, amount],
            });
    
            if (!this.publicClient) {
                throw new Error("Public client is not available");
            }
    
            await this.publicClient.waitForTransactionReceipt({ hash });
        } catch (error) {
            throw new Error(`Token approval failed: ${(error as Error).message}`);
        }
    }


    async isPoolInstantiated(token: Address): Promise<boolean> {
    return this.safeRead("isPoolInstantiated", false, async () => {
        const data = await this.publicClient!.readContract({
            address: this.contractAddress,
            abi: ABI,
            functionName: 'poolToken',
            args: [token]
        });

        if (!data) return false;

        return data !== zeroAddress;
    });
}

    async initializePool(initPool: InitPool): Promise<InitPoolResult> {
        try {
            const result: InitPoolResult = {
                success: true,
                txHash: '',
                timestamp: Date.now(),
                error: ''
            }
            await this.approveToken(initPool.token, BigInt(initPool.tokenAmount));
            const txHash = await this.writeContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: 'initializePool',
                args: [initPool.token as Address, BigInt(initPool.tokenAmount), BigInt(initPool.initialBuyPrice), BigInt(initPool.initialSellPrice)],
                value: BigInt(initPool.ethAmount)
            });
            result.txHash = txHash;
            return result;
        } catch (error) {
            throw new Error(`Pool initialization failed: ${(error as Error).message}`);
        }
    }

    async deposit(depositReq: DepositRequest): Promise<DepositResult> {
        try {
            const result: DepositResult = {
                success: true,
                depositRequest: depositReq,
                txHash: '',
                timestamp: Date.now(),
                error: ''
            }
            await this.approveToken(depositReq.token.address, BigInt(depositReq.tokenAmount));
            const txHash = await this.writeContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: 'deposit',
                args: [depositReq.token.address as Address],
                value: BigInt(depositReq.ethAmount)
            });
            result.txHash = txHash;
            return result;
        } catch (error) {
            throw new Error(`Deposit failed: ${(error as Error).message}`);
        }
    }

    async withdraw(withdrawReq: WithdrawRequest): Promise<WithdrawResult> {
        try {
            const result: WithdrawResult = {
                success: true,
                txHash: '',
                timestamp: Date.now(),
                error: '',
                withdrawRequest: withdrawReq
            };
            await this.approveToken(withdrawReq.lpToken.address, BigInt(withdrawReq.lpTokenAmount));
            const txHash = await this.writeContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: 'withdraw',
                args: [withdrawReq.token.address, BigInt(withdrawReq.lpTokenAmount)]
            });
            result.txHash = txHash;
            return result;
        } catch (error) {
            throw new Error(`Withdraw failed: ${(error as Error).message}`);
        }
    }

    async swap(swapReq: SwapRequest): Promise<SwapResult> {
        try {
            const result: SwapResult = {
                success: true,
                txHash: '',
                timestamp: Date.now(),
                error: '',
                swapRequest: swapReq
            };
            await this.approveToken(swapReq.tokenIn.address as Address, BigInt(swapReq.amountIn));
            const txHash = await this.writeContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: 'swap',
                args: [swapReq.tokenIn.address, swapReq.tokenOut.address, BigInt(swapReq.amountIn), BigInt(swapReq.minimumTokenOut)]
            });
            result.txHash = txHash;
            return result;
        } catch (error) {
            throw new Error(`Swap failed: ${(error as Error).message}`);
        }
    }

    async buy(buyReq: BuyRequest): Promise<BuyResult> {
        try {
            const result: BuyResult = {
                success: true,
                txHash: '',
                buyRequest: buyReq,
                amountOut: '',
                timestamp: Date.now(),
            }
            const txHash = await this.writeContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: 'buy',
                args: [buyReq.token.address, BigInt(buyReq.minimumAmountToBuy)],
                value: BigInt(buyReq.amountIn)
            });
            result.txHash = txHash;
            return result;
        } catch (error) {
            throw new Error(`Buy failed: ${(error as Error).message}`);
        }
    }

    async sell(sellReq: SellRequest): Promise<SellResult> {
        try {
            const result: SellResult = {
                success: true,
                txHash: '',
                sellRequest: sellReq,
                amountOut: '',
                timestamp: Date.now(),
            }
            await this.approveToken(sellReq.token.address, BigInt(sellReq.amountIn));
            const txHash = await this.writeContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: 'sell',
                args: [sellReq.token.address, BigInt(sellReq.amountIn), BigInt(sellReq.minimumEthAmount)]
            })
            result.txHash = txHash;
            return result;
        } catch (error) {
            throw new Error(`Sell failed: ${(error as Error).message}`);
        }
    }

    async getToken(address: `0x${string}`): Promise<Token> {
        if (tokenCache[address]) {
        return tokenCache[address];
        }

        // FIX: Add a guard to satisfy TypeScript in case publicClient is undefined
        if (!this.publicClient) {
        console.warn("Public client is not initialized yet.");
        // Return a safe fallback so the UI doesn't crash while Wagmi loads
        return { address, name: "Unknown", symbol: "???", decimals: 18 }; 
        }

        const tokenAddress = address as `0x${string}`;
        
        const erc20Abi = [
        { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
        { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
        { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }
        ] as const;

        const contracts = [
        { address: tokenAddress, abi: erc20Abi, functionName: 'name' },
        { address: tokenAddress, abi: erc20Abi, functionName: 'symbol' },
        { address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }
        ];

        // TypeScript now knows this.publicClient is definitely defined here
        const results = await this.publicClient.multicall({ contracts });

        const token: Token = {
        address:tokenAddress,
        name: (results[0].result as string) || "Unknown",
        symbol: (results[1].result as string) || "???",
        decimals: (results[2].result as number) || 18,
        };

        tokenCache[address] = token;

        return token;
    }


    async getLPToken(token: Token, user: Address): Promise<LiquidityPoolToken> {
        try {
            const tokenAddress = await this.publicClient?.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: 'poolToken',
                args: [token.address]
            });
            if (!tokenAddress) throw new Error(`No LP token found for the given token.`);
            const [totalSupply, balance] = await Promise.all([
                this.publicClient?.readContract({
                    address: tokenAddress as Address,
                    abi: erc20Abi,
                    functionName: 'totalSupply',
                    args: []
                }),
                this.publicClient?.readContract({
                    address: tokenAddress as Address,
                    abi: erc20Abi,
                    functionName: 'balanceOf',
                    args: [user]
                })
            ]);
            const tokenMetaData = await this.getToken(tokenAddress as Address);
            return {
                address: tokenAddress,
                symbol: tokenMetaData.symbol,
                name: tokenMetaData.name,
                decimals: tokenMetaData.decimals,
                totalSupply: totalSupply!.toString(),
                balance: balance!.toString()
            }
        } catch (error) {
            throw new Error(`Error fetching LP token data: ${(error as Error).message}`);
        }
    }

    async getReserves(token: Token): Promise<Reserve> {
        return this.safeRead(
            "getReserves",
            { tokenReserve: "0", ethReserve: "0" },
            async () => {
                const data = await this.publicClient!.readContract({
                    address: this.contractAddress,
                    abi: ABI,
                    functionName: "reserves",
                    args: [token.address],
                });
                if (!data) return { tokenReserve: "0", ethReserve: "0" };
                return { tokenReserve: data[1].toString(), ethReserve: data[0].toString() };
            }
        );
    }

    async getBuyPrice(token: Token): Promise<string> {
        return this.safeRead("getBuyPrice", "0", async () => {
            const data = await this.publicClient!.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: "priceBuy",
                args: [token.address],
            });
            return data != null ? data.toString() : "0";
        });
    }

    async getSellPrice(token: Token): Promise<string> {
        return this.safeRead("getSellPrice", "0", async () => {
            const data = await this.publicClient!.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: "priceSell",
                args: [token.address],
            });
            return data != null ? data.toString() : "0";
        });
    }

    async getUserBalance(token: Token, user: Address): Promise<Reserve> {
        try {
            const data = await this.publicClient?.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: 'poolUserBalances',
                args: [token.address, user]
            });
            return {
                tokenReserve: data![0].toString(),
                ethReserve: data![1].toString()
            }
        } catch (error) {
            throw new Error(`Error fetching user reserves: ${(error as Error).message}`);
        }
    }

    async getTokenRatio(token: Token): Promise<string> {
        return this.safeRead("getTokenRatio", "0", async () => {
            const data = await this.publicClient!.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: "tokenPerETHRatio",
                args: [token.address],
            });
            return data != null ? data.toString() : "0";
        });
    }

    private getTotalLiquidity(avgPrice: string, reserve: Reserve): string {
        const tokenInEth = formatEther(BigInt(reserve.tokenReserve));
        const liquidity = (Number(avgPrice) * (Number(tokenInEth))) / Number(1e18) + Number(formatEther(BigInt(reserve.ethReserve)));
        return parseEther(String(liquidity)).toString();
    }

    private getAvgPrice(buyPrice: string, sellPrice: string): string {
        return ((Number(buyPrice) + Number(sellPrice)) / Number(2)).toString();
    }

    private getAPR(poolYield: string): string {
        return (Number(poolYield) * 365 * 100).toString();
    }

    private async getBlockTimestamp(blockNumber: bigint): Promise<number> {
        try {
            const block = await this.publicClient?.getBlock({ blockNumber: blockNumber });
            return Number(block!.timestamp) * 1000; //maybe multiply by 1000?
        } catch (error) {
            throw new Error(`Error fetching block timestamp: ${(error as Error).message}`);
        }
    }

    async getBuyTradeEventLogs(fromBlock: number, toBlock: number, token?: Token, user?: Address): Promise<BuyTrade[]> {
        return this.safeRead("getBuyTradeEventLogs", [], async () => {
            const logs = await this.publicClient!.getLogs({
                address: this.contractAddress,
                fromBlock: BigInt(fromBlock),
                toBlock: BigInt(toBlock),
                event: parseAbiItem("event BuyTrade(address indexed token, address indexed trader, uint256 amountEther, uint256 amountToken, uint256 tradeBuyPrice, uint256 updatedBuyPrice, uint256 sellPrice)"),
                args: { token: token?.address as Address, trader: user as Address | undefined },
                strict: true,
            });
            let result: BuyTrade[] = [];
            const timestamps = await Promise.all((logs || []).map((log) => this.getBlockTimestamp(log.blockNumber)));
            if (!token) {
                const tokens = await Promise.all((logs || []).map((log) => this.getToken(log.args.token as Address)));
                result = (logs || []).map((log, index) => ({
                    token: tokens[index],
                    buyPrice: log.args.tradeBuyPrice.toString(),
                    updatedBuyPrice: log.args.updatedBuyPrice.toString(),
                    ethAmount: log.args.amountEther.toString(),
                    sellPrice: log.args.sellPrice.toString(),
                    timestamp: timestamps[index],
                }));
                return result;
            }
            result = (logs || []).map((log, index) => ({
                token,
                buyPrice: log.args.tradeBuyPrice.toString(),
                updatedBuyPrice: log.args.updatedBuyPrice.toString(),
                ethAmount: log.args.amountEther.toString(),
                sellPrice: log.args.sellPrice.toString(),
                timestamp: timestamps[index],
            }));
            return result;
        });
    }

    async getSellTradeEventLogs(fromBlock: number, toBlock: number, token?: Token, user?: Address): Promise<SellTrade[]> {
        return this.safeRead("getSellTradeEventLogs", [], async () => {
            const logs = await this.publicClient!.getLogs({
                address: this.contractAddress,
                fromBlock: BigInt(fromBlock),
                toBlock: BigInt(toBlock),
                event: parseAbiItem("event SellTrade(address indexed token, address indexed trader, uint256 amountToken, uint256 amountEther, uint256 tradeSellPrice, uint256 updatedSellPrice, uint256 buyPrice)"),
                args: { token: token?.address as Address, trader: user as Address | undefined },
                strict: true,
            });
            let result: SellTrade[] = [];
            const timestamps = await Promise.all((logs || []).map((log) => this.getBlockTimestamp(log.blockNumber)));
            if (!token) {
                const tokens = await Promise.all((logs || []).map((log) => this.getToken(log.args.token as Address)));
                result = (logs || []).map((log, index) => ({
                    token: tokens[index],
                    sellPrice: log.args.tradeSellPrice.toString(),
                    updatedSellPrice: log.args.updatedSellPrice.toString(),
                    ethAmount: log.args.amountEther.toString(),
                    buyPrice: log.args.buyPrice.toString(),
                    timestamp: timestamps[index],
                }));
                return result;
            }
            result = (logs || []).map((log, index) => ({
                token,
                sellPrice: log.args.tradeSellPrice.toString(),
                updatedSellPrice: log.args.updatedSellPrice.toString(),
                ethAmount: log.args.amountEther.toString(),
                timestamp: timestamps[index],
                buyPrice: log.args.buyPrice.toString(),
            }));
            return result;
        });
    }

    private async swapInEventLogs(fromBlock: number, toBlock: number, tokenIn: Token): Promise<SwapTrade[]> {
        return this.safeRead("swapInEventLogs", [], async () => {
            const logs = await this.publicClient!.getLogs({
                address: this.contractAddress,
                fromBlock: BigInt(fromBlock),
                toBlock: BigInt(toBlock),
                event: parseAbiItem("event SwapTrade(address indexed tokenSold, address indexed tokenBought, address indexed trader, uint256 amountTokenSold, uint256 amountTokenBought, uint256 tradeSellPrice, uint256 updatedSellPrice, uint256 tradeBuyPrice, uint256 updatedBuyPrice)"),
                args: { tokenSold: tokenIn.address as Address },
                strict: true,
            });
            const timestamps = await Promise.all((logs || []).map((log) => this.getBlockTimestamp(log.blockNumber)));
            const tokensOut = await Promise.all((logs || []).map((log) => this.getToken(log.args.tokenBought as Address)));
            return (logs || []).map((log, index) => ({
                tokenIn,
                tokenOut: tokensOut[index],
                amountIn: log.args.amountTokenSold.toString(),
                amountOut: log.args.amountTokenBought.toString(),
                sellPrice: log.args.tradeSellPrice.toString(),
                buyPrice: log.args.tradeBuyPrice.toString(),
                updatedBuyPrice: log.args.updatedBuyPrice.toString(),
                updatedSellPrice: log.args.updatedSellPrice.toString(),
                timestamp: timestamps[index],
            }));
        });
    }

    private async swapOutEventLogs(fromBlock: number, toBlock: number, tokenOut: Token): Promise<SwapTrade[]> {
        return this.safeRead("swapOutEventLogs", [], async () => {
            const logs = await this.publicClient!.getLogs({
                address: this.contractAddress,
                fromBlock: BigInt(fromBlock),
                toBlock: BigInt(toBlock),
                event: parseAbiItem("event SwapTrade(address indexed tokenSold, address indexed tokenBought, address indexed trader, uint256 amountTokenSold, uint256 amountTokenBought, uint256 tradeSellPrice, uint256 updatedSellPrice, uint256 tradeBuyPrice, uint256 updatedBuyPrice)"),
                args: { tokenBought: tokenOut.address as Address },
                strict: true,
            });
            const timestamps = await Promise.all((logs || []).map((log) => this.getBlockTimestamp(log.blockNumber)));
            const tokensIn = await Promise.all((logs || []).map((log) => this.getToken(log.args.tokenSold as Address)));
            return (logs || []).map((log, index) => ({
                tokenOut,
                tokenIn: tokensIn[index],
                amountIn: log.args.amountTokenSold.toString(),
                amountOut: log.args.amountTokenBought.toString(),
                sellPrice: log.args.tradeSellPrice.toString(),
                buyPrice: log.args.tradeBuyPrice.toString(),
                updatedBuyPrice: log.args.updatedBuyPrice.toString(),
                updatedSellPrice: log.args.updatedSellPrice.toString(),
                timestamp: timestamps[index],
            }));
        });
    }

    async getSwapTradeEventLogs(fromBlock: number, toBlock: number, token?: Token, user?: Address): Promise<SwapTrade[]> {
        return this.safeRead("getSwapTradeEventLogs", [], async () => {
            if (user) {
                const logs = await this.publicClient!.getLogs({
                    address: this.contractAddress,
                    fromBlock: BigInt(fromBlock),
                    toBlock: BigInt(toBlock),
                    event: parseAbiItem("event SwapTrade(address indexed tokenSold, address indexed tokenBought, address indexed trader, uint256 amountTokenSold, uint256 amountTokenBought, uint256 tradeSellPrice, uint256 updatedSellPrice, uint256 tradeBuyPrice, uint256 updatedBuyPrice)"),
                    args: { trader: user as Address },
                    strict: true,
                });
                const timestamps = await Promise.all((logs || []).map((log) => this.getBlockTimestamp(log.blockNumber)));
                const tokensIn = await Promise.all((logs || []).map((log) => this.getToken(log.args.tokenSold as Address)));
                const tokensOut = await Promise.all((logs || []).map((log) => this.getToken(log.args.tokenBought as Address)));
                return (logs || []).map((log, index) => ({
                    token,
                    tokenIn: tokensIn[index],
                    tokenOut: tokensOut[index],
                    amountIn: log.args.amountTokenSold.toString(),
                    amountOut: log.args.amountTokenBought.toString(),
                    sellPrice: log.args.tradeSellPrice.toString(),
                    buyPrice: log.args.tradeBuyPrice.toString(),
                    updatedBuyPrice: log.args.updatedBuyPrice.toString(),
                    updatedSellPrice: log.args.updatedSellPrice.toString(),
                    timestamp: timestamps[index],
                }));
            }
            const swapInTrades = await this.swapInEventLogs(fromBlock, toBlock, token! as Token);
            const swapOutTrades = await this.swapOutEventLogs(fromBlock, toBlock, token! as Token);
            return swapInTrades.concat(swapOutTrades);
        });
    }

    private async get24hBeforeBlock(): Promise<bigint> {
        let lowBlock = BigInt(0);
        let highBlock = (await this.publicClient!.getBlockNumber()) as bigint;
        while (lowBlock <= highBlock) {
            const midBlock = Math.round(Number(lowBlock + highBlock) / 2);
            const midTimestamp = await this.getBlockTimestamp(BigInt(midBlock));
            if (Date.now() - midTimestamp < 24 * 60 * 60 * 1000) {
                highBlock = BigInt(midBlock) - BigInt(1);
            } else {
                lowBlock = BigInt(midBlock) + BigInt(1);
            }
        }
        return lowBlock;
    }

    private async get24hVolume(token: Token): Promise<string> {
        return this.safeRead("get24hVolume", "0", async () => {
            const toBlock = await this.publicClient!.getBlockNumber();
            const fromBlock = await this.get24hBeforeBlock();
            const BLOCK_BATCH_SIZE = 999;
            let currentBlock = Number(fromBlock);
            const targetBlock = Number(toBlock);

            let buyLogs: BuyTrade[] = [];
            let sellLogs: SellTrade[] = [];
            let swapLogs: SwapTrade[] = [];

            while (currentBlock < targetBlock) {
                const batchEndBlock = Math.min(currentBlock + BLOCK_BATCH_SIZE, targetBlock);
                const [batchBuyLogs, batchSellLogs, batchSwapLogs] = await Promise.all([
                    this.getBuyTradeEventLogs(currentBlock, batchEndBlock, token),
                    this.getSellTradeEventLogs(currentBlock, batchEndBlock, token),
                    this.getSwapTradeEventLogs(currentBlock, batchEndBlock, token),
                ]);
                buyLogs = buyLogs.concat(batchBuyLogs);
                sellLogs = sellLogs.concat(batchSellLogs);
                swapLogs = swapLogs.concat(batchSwapLogs);
                currentBlock = batchEndBlock + 1;
            }
            let volume = 0;
            buyLogs.forEach((log) => { volume += Number(log.ethAmount); });
            sellLogs.forEach((log) => { volume += Number(log.ethAmount); });
            swapLogs.forEach((log) => {
                if (log.tokenIn.address === token.address) {
                    volume += (Number(log.amountIn) * Number(log.sellPrice)) / 1e18;
                } else if (log.tokenOut.address === token.address) {
                    volume += (Number(log.amountOut) * Number(log.buyPrice)) / 1e18;
                }
            });
            return volume.toString();
        });
    }

    async getLastExchangeTimestamp(token: Token): Promise<number> {
        return this.safeRead("getLastExchangeTimestamp", 0, async () => {
            const data = await this.publicClient!.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: "pools",
                args: [token.address],
            });
            return data ? Number(data[2]) * 1000 : 0;
        });
    }

    async getDepositEventLogs(fromBlock: number, toBlock: number, token?: Token, user?: Address): Promise<Deposit[]> {
        return this.safeRead("getDepositEventLogs", [], async () => {
            const logs = await this.publicClient!.getLogs({
                address: this.contractAddress,
                fromBlock: BigInt(fromBlock),
                toBlock: BigInt(toBlock),
                event: parseAbiItem("event Deposit(address indexed token, address indexed user, uint256 amountEther, uint256 amountToken, uint256 lpTokensMinted)"),
                args: { token: token?.address as Address, user: user as Address | undefined },
                strict: true,
            });
            const timestamps = await Promise.all((logs || []).map((log) => this.getBlockTimestamp(log.blockNumber)));
            if (!token) {
                const tokens = await Promise.all((logs || []).map((log) => this.getToken(log.args.token as Address)));
                return (logs || []).map((log, index) => ({
                    token: tokens[index],
                    ethAmount: log.args.amountEther.toString(),
                    tokenAmount: log.args.amountToken.toString(),
                    lpTokensMinted: log.args.lpTokensMinted.toString(),
                    timestamp: timestamps[index],
                }));
            }
            return (logs || []).map((log, index) => ({
                token,
                ethAmount: log.args.amountEther.toString(),
                tokenAmount: log.args.amountToken.toString(),
                lpTokensMinted: log.args.lpTokensMinted.toString(),
                timestamp: timestamps[index],
            }));
        });
    }

    async getWithdrawEventLogs(fromBlock: number, toBlock: number, token?: Token, user?: Address): Promise<Withdraw[]> {
        return this.safeRead("getWithdrawEventLogs", [], async () => {
            const logs = await this.publicClient!.getLogs({
                address: this.contractAddress,
                fromBlock: BigInt(fromBlock),
                toBlock: BigInt(toBlock),
                event: parseAbiItem("event Withdraw(address indexed token, address indexed user, uint256 amountEther, uint256 amountToken, uint256 lpTokensBurned)"),
                args: { token: token?.address as Address, user: user as Address | undefined },
                strict: true,
            });
            const timestamps = await Promise.all((logs || []).map((log) => this.getBlockTimestamp(log.blockNumber)));
            if (!token) {
                const tokens = await Promise.all((logs || []).map((log) => this.getToken(log.args.token as Address)));
                return (logs || []).map((log, index) => ({
                    token: tokens[index],
                    ethAmount: log.args.amountEther.toString(),
                    tokenAmount: log.args.amountToken.toString(),
                    lpTokensBurnt: log.args.lpTokensBurned.toString(),
                    timestamp: timestamps[index],
                }));
            }
            return (logs || []).map((log, index) => ({
                token,
                ethAmount: log.args.amountEther.toString(),
                tokenAmount: log.args.amountToken.toString(),
                lpTokensBurnt: log.args.lpTokensBurned.toString(),
                timestamp: timestamps[index],
            }));
        });
    }

    /** Default pool shape when contract returns no data (pool not instantiated / new user). */
    private buildDefaultPool(token: Token): Pool {
        const reserve: Reserve = { tokenReserve: "0", ethReserve: "0" };
        const lpToken: LiquidityPoolToken = {
            address: token.address,
            symbol: "LP",
            name: "LP Token",
            decimals: 18,
            totalSupply: "0",
            balance: "0",
        };
        return {
            token,
            reserve,
            lpToken,
            buyPrice: "0",
            sellPrice: "0",
            avgPrice: "0",
            tokenRatio: "0",
            volume24h: "0",
            totalLiquidty: "0",
            apr: 0,
            lastExchangeTs: 0,
            lastUpdated: Date.now(),
        };
    }

    async getPool(token: Token, user: Address): Promise<Pool> {
        return this.safeRead("getPool", this.buildDefaultPool(token), async () => {
            const lpToken = await this.getLPToken(token, user);
            const reserve = await this.getReserves(token);
            const buyPrice = await this.getBuyPrice(token);
            const sellPrice = await this.getSellPrice(token);
            const tokenRatio = await this.getTokenRatio(token);
            const volume24h = await this.get24hVolume(token);
            const avgPrice = this.getAvgPrice(buyPrice, sellPrice);
            const totalLiquidity = this.getTotalLiquidity(avgPrice, reserve);
            const feeEventsCount = await this.getPoolFeeEventsCount(token);
            const poolFeesEvents = feeEventsCount > 0 ? await this.getPoolFeeEvents(token, Math.max(feeEventsCount - 10, 0), feeEventsCount - 1) : [];
            const poolYield = feeEventsCount > 0 && poolFeesEvents.length > 0 ? this.getYield(poolFeesEvents, totalLiquidity) : 0;
            const apr = this.getAPR(String(poolYield));
            const lastExchangeTs = await this.getLastExchangeTimestamp(token);

            return {
                token,
                reserve,
                lpToken,
                buyPrice,
                sellPrice,
                avgPrice,
                tokenRatio,
                volume24h,
                totalLiquidty: totalLiquidity,
                apr: Number(apr),
                lastExchangeTs,
                lastUpdated: Date.now(),
            };
        });
    }

    async getPools(startIndex: number, offset: number): Promise<RowPool[]> {
        return this.safeRead("getPools", [], async () => {
            const data = await this.publicClient!.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: "getPoolList",
                args: [BigInt(startIndex), BigInt(offset)],
            });
            const addresses = (data as Address[]) ?? [];
            if (addresses.length === 0) return [];
            const tokens = await Promise.all(addresses.map((addr) => this.getToken(addr as Address)));
            const buyPrices = await Promise.all(tokens.map((t) => this.getBuyPrice(t)));
            const sellPrices = await Promise.all(tokens.map((t) => this.getSellPrice(t)));
            const reserves = await Promise.all(tokens.map((t) => this.getReserves(t)));
            const liquidity = await Promise.all(
                tokens.map((token, index) =>
                    this.getTotalLiquidity(this.getAvgPrice(buyPrices[index], sellPrices[index]), reserves[index])
                )
            );
            return tokens.map((token, index) => ({
                token,
                buyPrice: buyPrices[index],
                sellPrice: sellPrices[index],
                totalLiquidity: liquidity[index],
            }));
        });
    }

    async getUserPools(user: Address, startIndex: number, offset: number): Promise<RowPool[]> {
        return this.safeRead("getUserPools", [], async () => {
            const data = await this.publicClient!.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: "getUserPools",
                args: [user, BigInt(startIndex), BigInt(offset)],
            });
            const addresses = (data as Address[]) ?? [];
            if (addresses.length === 0) return [];
            const tokens = await Promise.all(addresses.map((addr) => this.getToken(addr as Address)));
            const buyPrices = await Promise.all(tokens.map((t) => this.getBuyPrice(t)));
            const sellPrices = await Promise.all(tokens.map((t) => this.getSellPrice(t)));
            const reserves = await Promise.all(tokens.map((t) => this.getReserves(t)));
            const liquidity = await Promise.all(
                tokens.map((token, index) =>
                    this.getTotalLiquidity(this.getAvgPrice(buyPrices[index], sellPrices[index]), reserves[index])
                )
            );
            const lpTokens = await Promise.all(tokens.map((token) => this.getLPToken(token, user)));
            return tokens.map((token, index) => ({
                token,
                buyPrice: buyPrices[index],
                sellPrice: sellPrices[index],
                totalLiquidity: liquidity[index],
                lpToken: lpTokens[index],
            }));
        });
    }

    async getPoolCount(): Promise<number> {
        return this.safeRead("getPoolCount", 0, async () => {
            const data = await this.publicClient!.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: "getTotalPools",
                args: [],
            });
            return data != null ? Number(data) : 0;
        });
    }

    async getUserPoolCount(user: Address): Promise<number> {
        return this.safeRead("getUserPoolCount", 0, async () => {
            const data = await this.publicClient!.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: "getUserTotalPools",
                args: [user],
            });
            return data != null ? Number(data) : 0;
        });
    }

    async getTotalFees(): Promise<string> {
        return this.safeRead("getTotalFees", "0", async () => {
            const data = await this.publicClient!.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: "totalFees",
                args: [],
            });
            return data != null ? String(data) : "0";
        });
    }

    async getTotalPoolFee(token: Token): Promise<string> {
        return this.safeRead("getTotalPoolFee", "0", async () => {
            const data = await this.publicClient!.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: "totalPoolFees",
                args: [token.address],
            });
            return data != null ? String(data) : "0";
        });
    }

    private async getPoolFeeEventsCount(token: Token): Promise<number> {
        return this.safeRead("getPoolFeeEventsCount", 0, async () => {
            const data = await this.publicClient!.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: "getPoolFeeEventsCount",
                args: [token.address],
            });
            return data != null ? Number(data) : 0;
        });
    }

    async getPoolFeeEvents(token: Token, startIndex: number, endIndex: number): Promise<PoolFeesEvent[]> {
        return this.safeRead("getPoolFeeEvents", [], async () => {
            const data = await this.publicClient!.readContract({
                address: this.contractAddress,
                abi: ABI,
                functionName: "getPoolFeeList",
                args: [token.address, BigInt(startIndex), BigInt(endIndex)],
            });
            if (!data || !Array.isArray(data)) return [];
            return data.map((item: { timestamp: bigint; fee: bigint }) => ({
                timestamp: Number(item.timestamp) * 1000,
                fee: item.fee.toString(),
            }));
        });
    }

    public getYield(feeEvents: PoolFeesEvent[], totalLiquidity: string): number {
        let totalFees = 0;
        feeEvents.forEach(event => {
            totalFees += Number(event.fee);
        });
        const totalTime = (feeEvents[feeEvents.length - 1].timestamp - feeEvents[0].timestamp) / (60 * 60 * 24); //days
        return totalFees / (totalTime * Number(totalLiquidity));
    }
}
