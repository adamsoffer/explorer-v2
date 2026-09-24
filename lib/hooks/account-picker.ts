"use client";

import type { Connector } from "wagmi";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export class PickerUnsupportedError extends Error {}
export class PickerDismissedError extends Error {}

/**
 * Ask the wallet to show its own account picker (MetaMask, Rabby and most
 * injected wallets support `wallet_requestPermissions`). Sites can't choose
 * the active account themselves; this is the closest thing. Resolves with
 * every account the wallet exposes afterwards.
 */
export async function openAccountPicker(
  connector: Connector | undefined
): Promise<string[]> {
  const provider = (await connector?.getProvider()) as Eip1193 | undefined;
  if (!provider?.request) throw new PickerUnsupportedError();
  try {
    await provider.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch (e) {
    if ((e as { code?: number })?.code === 4001) {
      throw new PickerDismissedError();
    }
    throw new PickerUnsupportedError();
  }
  const exposed = (await provider.request({ method: "eth_accounts" })) as
    | string[]
    | undefined;
  return (exposed ?? []).map((a) => a.toLowerCase());
}
