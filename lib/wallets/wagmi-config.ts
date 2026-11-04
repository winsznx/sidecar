import { createConfig, http, type Config } from "wagmi";
import { injected } from "wagmi/connectors";

import { NETWORK, sidecarChain } from "@/lib/dreamdex/config";

const chain = sidecarChain(NETWORK);

/**
 * Hideki is the only chain Sidecar knows, so a wallet on any other chain shows up as
 * "wrong chain" instead of silently reading or signing elsewhere. EIP-6963 discovery
 * stays on, so every installed browser wallet is listed next to the generic injected one.
 */
export function createSidecarWagmiConfig(): Config {
  return createConfig({
    chains: [chain],
    connectors: [injected()],
    transports: { [chain.id]: http(NETWORK.rpcUrl) },
    multiInjectedProviderDiscovery: true,
    ssr: true,
  });
}

export const sidecarWagmiChain = chain;
