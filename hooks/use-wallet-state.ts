"use client";

import { useCallback } from "react";
import type { Address, WalletClient } from "viem";
import {
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
  type Connector,
} from "wagmi";

import { classifyError } from "@/lib/dreamdex/errors";
import { HIDEKI_CHAIN_ID } from "@/lib/dreamdex/types";
import type { ConnectedWallet } from "@/lib/wallets/identity";

export type WalletStatus = "disconnected" | "connecting" | "reconnecting" | "connected";

export interface WalletOption {
  uid: string;
  name: string;
  icon: string | null;
  /** The generic injected connector, listed only when no EIP-6963 wallet announced itself. */
  generic: boolean;
}

export interface WalletState {
  status: WalletStatus;
  address: Address | null;
  /** The chain the wallet reports, which may be any chain. `null` when not connected. */
  chainId: number | null;
  onHideki: boolean;
  /** The shape lib/wallets/identity expects. `null` when no wallet is connected. */
  connected: ConnectedWallet | null;
  connectorName: string | null;
  options: WalletOption[];
  connect: (uid: string) => void;
  connecting: boolean;
  connectError: string | null;
  disconnect: () => void;
  switchToHideki: () => void;
  switching: boolean;
  switchError: string | null;
  /** A viem wallet client for the connected account, only while it is on Hideki. */
  walletClient: WalletClient | null;
}

const GENERIC_INJECTED_ID = "injected";

function walletOptions(connectors: readonly Connector[]): WalletOption[] {
  const announced = connectors.filter((connector) => connector.id !== GENERIC_INJECTED_ID);
  const listed = announced.length > 0 ? announced : connectors;
  return listed.map((connector) => ({
    uid: connector.uid,
    name: connector.id === GENERIC_INJECTED_ID ? "Browser wallet" : connector.name,
    icon: connector.icon ?? null,
    generic: connector.id === GENERIC_INJECTED_ID,
  }));
}

function errorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  const classified = classifyError(error);
  return `${classified.message} ${classified.nextStep}`;
}

/**
 * The connected browser wallet as Sidecar sees it. Connection and chain come straight from
 * the wallet, so a wallet on another chain shows up as such instead of being hidden.
 */
export function useWalletState(): WalletState {
  const connection = useConnection();
  const connectors = useConnectors();
  const connectMutation = useConnect();
  const disconnectMutation = useDisconnect();
  const switchMutation = useSwitchChain();

  const address = connection.status === "disconnected" ? null : (connection.address ?? null);
  const chainId = connection.status === "disconnected" ? null : (connection.chainId ?? null);
  const onHideki = chainId === HIDEKI_CHAIN_ID;
  const walletClientQuery = useWalletClient({ query: { enabled: address !== null && onHideki } });

  const { mutate: connectMutate } = connectMutation;
  const connect = useCallback(
    (uid: string): void => {
      const connector = connectors.find((candidate) => candidate.uid === uid);
      if (connector) connectMutate({ connector });
    },
    [connectors, connectMutate],
  );
  const { mutate: disconnectMutate } = disconnectMutation;
  const disconnect = useCallback((): void => disconnectMutate(), [disconnectMutate]);
  const { mutate: switchMutate } = switchMutation;
  const switchToHideki = useCallback((): void => switchMutate({ chainId: HIDEKI_CHAIN_ID }), [switchMutate]);

  const walletClient = walletClientQuery.data ?? null;
  const clientMatches =
    walletClient !== null &&
    address !== null &&
    walletClient.account.address.toLowerCase() === address.toLowerCase() &&
    walletClient.chain.id === HIDEKI_CHAIN_ID;

  return {
    status: connection.status,
    address,
    chainId,
    onHideki,
    connected: address === null ? null : { address, chainId },
    connectorName: connection.connector?.name ?? null,
    options: walletOptions(connectors),
    connect,
    connecting: connectMutation.isPending,
    connectError: errorMessage(connectMutation.error),
    disconnect,
    switchToHideki,
    switching: switchMutation.isPending,
    switchError: errorMessage(switchMutation.error),
    walletClient: clientMatches ? walletClient : null,
  };
}
