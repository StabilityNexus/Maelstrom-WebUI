import { createWalletLinkConfig } from '@stability-nexus/walletlink';
import {
  mainnet,
  polygon,
  base,
} from 'wagmi/chains';
import { type Chain } from 'viem';

const mordor = {
  id: 63,
  name: 'Mordor',
  nativeCurrency: { name: 'Mordor Eth', symbol: 'METC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mordor.etccooperative.org'] }
  },
  blockExplorers: {
    default: { name: 'Mordor Explorer', url: 'https://etc-mordor.blockscout.com/' }
  }
} as const satisfies Chain;

const citrea_testnet = {
  id: 5115,
  name: 'Citrea Testnet',
  nativeCurrency: { name: 'Citrea Eth', symbol: 'CBTC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.citrea.xyz'] }
  },
  blockExplorers: {
    default: { name: 'Citrea Explorer', url: 'https://explorer.testnet.citrea.xyz/' }
  }
} as const satisfies Chain;

export const wagmi_config = createWalletLinkConfig({
  chains: [mordor, citrea_testnet, mainnet, polygon, base],
});