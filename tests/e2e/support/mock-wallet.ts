import type { Page } from "@playwright/test";

/**
 * A scripted EIP-1193 wallet for end-to-end tests. It never holds a key and never signs.
 * Reads are forwarded to the real Hideki RPC, so the app under test sees live chain state.
 * Writes either fail the way a user rejection does, or return a hash that does not exist on
 * chain so the app's outcome-unknown path can be exercised honestly.
 */
export type MockSendBehaviour = "reject" | "unknown-hash";

export interface MockWalletOptions {
  accounts: readonly `0x${string}`[];
  chainId: number;
  send: MockSendBehaviour;
  rpcUrl?: string;
}

export interface MockWalletRequestLog {
  method: string;
  params: unknown;
}

const DEFAULT_RPC = "https://api.hideki2.infra.testnet.somnia.network";

export async function installMockWallet(page: Page, options: MockWalletOptions): Promise<void> {
  await page.addInitScript(
    ({ accounts, chainId, send, rpcUrl }) => {
      type Listener = (payload: unknown) => void;
      const listeners = new Map<string, Set<Listener>>();
      const state = {
        accounts: [...accounts],
        chainId,
        connected: false,
        log: [] as { method: string; params: unknown }[],
      };

      const emit = (event: string, payload: unknown): void => {
        for (const listener of listeners.get(event) ?? []) listener(payload);
      };
      const hexChain = (): string => `0x${state.chainId.toString(16)}`;
      const providerError = (code: number, message: string): Error & { code: number } =>
        Object.assign(new Error(message), { code });

      const forward = async (method: string, params: unknown): Promise<unknown> => {
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params ?? [] }),
        });
        const body = (await response.json()) as { result?: unknown; error?: { code: number; message: string } };
        if (body.error) throw providerError(body.error.code, body.error.message);
        return body.result;
      };

      const request = async ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
        state.log.push({ method, params });
        switch (method) {
          case "eth_chainId":
            return hexChain();
          case "net_version":
            return String(state.chainId);
          case "eth_accounts":
            return state.connected ? state.accounts : [];
          case "eth_requestAccounts":
            state.connected = true;
            emit("connect", { chainId: hexChain() });
            return state.accounts;
          case "wallet_requestPermissions":
          case "wallet_getPermissions":
            state.connected = true;
            return [{ parentCapability: "eth_accounts" }];
          case "wallet_revokePermissions":
            state.connected = false;
            emit("accountsChanged", []);
            return null;
          case "wallet_switchEthereumChain": {
            const [{ chainId: next }] = params as [{ chainId: string }];
            state.chainId = Number.parseInt(next, 16);
            emit("chainChanged", hexChain());
            return null;
          }
          case "wallet_addEthereumChain":
            return null;
          case "eth_sendTransaction":
            if (send === "reject") throw providerError(4001, "User rejected the request.");
            return `0x${"51dec0de".repeat(8)}`;
          case "personal_sign":
          case "eth_signTypedData_v4":
            throw providerError(4001, "User rejected the request.");
          default:
            return forward(method, params);
        }
      };

      const provider = {
        isMetaMask: false,
        isSidecarTestWallet: true,
        request,
        on: (event: string, listener: Listener): void => {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)?.add(listener);
        },
        removeListener: (event: string, listener: Listener): void => {
          listeners.get(event)?.delete(listener);
        },
      };

      const controls = {
        setAccounts: (next: `0x${string}`[]): void => {
          state.accounts = [...next];
          emit("accountsChanged", state.accounts);
        },
        setChainId: (next: number): void => {
          state.chainId = next;
          emit("chainChanged", hexChain());
        },
        requests: (): { method: string; params: unknown }[] => [...state.log],
      };

      Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
      Object.defineProperty(window, "__sidecarMockWallet", { value: controls, configurable: true });

      const info = {
        uuid: "00000000-0000-4000-8000-00000000510e",
        name: "Sidecar Test Wallet",
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Crect width='8' height='8' fill='%23888'/%3E%3C/svg%3E",
        rdns: "dev.sidecar.testwallet",
      };
      const announce = (): void => {
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }),
        );
      };
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { accounts: [...options.accounts], chainId: options.chainId, send: options.send, rpcUrl: options.rpcUrl ?? DEFAULT_RPC },
  );
}

export async function setMockAccounts(page: Page, accounts: readonly `0x${string}`[]): Promise<void> {
  await page.evaluate((next) => {
    const controls = (window as unknown as { __sidecarMockWallet: { setAccounts: (a: string[]) => void } }).__sidecarMockWallet;
    controls.setAccounts([...next]);
  }, [...accounts]);
}

export async function setMockChain(page: Page, chainId: number): Promise<void> {
  await page.evaluate((next) => {
    const controls = (window as unknown as { __sidecarMockWallet: { setChainId: (c: number) => void } }).__sidecarMockWallet;
    controls.setChainId(next);
  }, chainId);
}

export async function mockWalletRequests(page: Page): Promise<MockWalletRequestLog[]> {
  return page.evaluate(() => {
    const controls = (window as unknown as { __sidecarMockWallet: { requests: () => MockWalletRequestLog[] } }).__sidecarMockWallet;
    return controls.requests();
  });
}
