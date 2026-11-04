"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { hashFn } from "wagmi/query";

import { createSidecarWagmiConfig } from "@/lib/wallets/wagmi-config";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Query keys carry bigint sizes and prices, which the default hasher cannot serialise.
        queryKeyHashFn: hashFn,
        // A stale financial read must never be retried into looking fresh; hooks set their own cadence.
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }): ReactNode {
  const [wagmiConfig] = useState(createSidecarWagmiConfig);
  const [queryClient] = useState(createQueryClient);
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
