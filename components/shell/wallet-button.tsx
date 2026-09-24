"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Copy,
  LogOut,
  Plus,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAccount, useDisconnect } from "wagmi";

import { Avatar, useIdentity } from "@/components/identity";
import { AddWalletDialog } from "@/components/portfolio/add-wallet";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { shortAddress } from "@/lib/format";
import {
  openAccountPicker,
  PickerDismissedError,
} from "@/lib/hooks/account-picker";
import { useKnownWallets } from "@/lib/hooks/watchlist";

function WalletRow({
  address,
  label,
  active,
}: {
  address: string;
  label?: string;
  active?: boolean;
}) {
  const { display, avatar } = useIdentity(address);
  return (
    <>
      <Avatar address={address} src={avatar} size={20} />
      <span className="min-w-0 flex-1 truncate">{label ?? display}</span>
      {active && <Check className="size-3.5 text-green-bright" />}
    </>
  );
}

/**
 * The connected wallet, plus every other wallet you've connected. Sites
 * can't pick the active account, so choosing another wallet opens the
 * wallet's own account picker and confirms once the switch lands.
 */
function Connected({
  address,
  compact,
  openAccountModal,
}: {
  address: string;
  compact?: boolean;
  openAccountModal: () => void;
}) {
  // Lowercase so it matches the rest of the app (RainbowKit passes the
  // checksummed form).
  const { display, avatar } = useIdentity(address.toLowerCase());
  const { connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { list } = useKnownWallets();
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const active = address.toLowerCase();
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const others = list.filter((w) => w.address !== active);
  const labelOf = (a: string) =>
    list.find((w) => w.address === a)?.label ?? shortAddress(a);

  useEffect(() => {
    if (pending && pending === active) {
      toast.success(`Switched to ${labelOf(active)}`);
      setPending(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pending]);

  const switchTo = async (target: string) => {
    setPending(target);
    const walletName = connector?.name ?? "your wallet";
    let pickerShown = true;
    try {
      await openAccountPicker(connector);
    } catch (e) {
      if (e instanceof PickerDismissedError) {
        setPending(null);
        return;
      }
      pickerShown = false;
    }
    // Give the wallet a moment to report the switch; if it hasn't, say
    // plainly where to finish it.
    await new Promise((r) => setTimeout(r, 1000));
    if (activeRef.current === target) return;
    const who = labelOf(target);
    toast(`Switch to ${who} in ${walletName}`, {
      description: pickerShown
        ? `Select it as the active account in ${walletName}. Some wallets don't show a picker to websites; if nothing appeared, open ${walletName} and switch there. The explorer follows along automatically.`
        : `${walletName} doesn't let websites change its account. Open it and select ${who}; the explorer follows along automatically.`,
      duration: 8000,
    });
  };

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label="Wallet menu"
              className={cn(
                "flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-sm text-left transition-colors outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-green-bright/40 aria-expanded:bg-hover",
                compact ? "p-1" : "px-2 py-2"
              )}
            />
          }
        >
          <Avatar address={address} src={avatar} size={compact ? 26 : 28} />
          {!compact && (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-ui-caption text-foreground">
                  {labelOf(active) === shortAddress(active)
                    ? display
                    : labelOf(active)}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-green-bright" />
                  Arbitrum
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-subtle-foreground" />
            </>
          )}
        </MenuTrigger>
        <MenuContent align={compact ? "end" : "start"} className="w-60">
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] text-subtle-foreground">
            Your wallets
          </div>
          <MenuItem onClick={openAccountModal}>
            <WalletRow
              address={active}
              label={list.find((w) => w.address === active)?.label}
              active
            />
          </MenuItem>
          {others.map((w) => (
            <MenuItem key={w.address} onClick={() => switchTo(w.address)}>
              <WalletRow address={w.address} label={w.label} />
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onClick={() => setAdding(true)}>
            <Plus /> Add wallet
          </MenuItem>
          <MenuItem
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address);
                toast.success("Address copied");
              } catch {
                // clipboard blocked
              }
            }}
          >
            <Copy /> Copy address
          </MenuItem>
          <MenuItem onClick={() => disconnect()}>
            <LogOut /> Disconnect
          </MenuItem>
        </MenuContent>
      </Menu>
      <AddWalletDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

export function WalletButton({ compact = false }: { compact?: boolean }) {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        if (!mounted) {
          return (
            <div className={compact ? "size-8" : "h-11"} aria-hidden="true" />
          );
        }
        if (!account) {
          return (
            <Button
              variant="primary"
              size={compact ? "sm" : "default"}
              onClick={openConnectModal}
              className={compact ? "" : "w-full"}
            >
              <Wallet />
              {compact ? "Connect" : "Connect wallet"}
            </Button>
          );
        }
        if (chain?.unsupported) {
          return (
            <Button
              variant="outline"
              size={compact ? "sm" : "default"}
              onClick={openChainModal}
              className={cn("text-warm", !compact && "w-full")}
            >
              <AlertTriangle />
              Switch to Arbitrum
            </Button>
          );
        }
        return (
          <Connected
            address={account.address}
            openAccountModal={openAccountModal}
            compact={compact}
          />
        );
      }}
    </ConnectButton.Custom>
  );
}
