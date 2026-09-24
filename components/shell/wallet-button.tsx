"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertTriangle, Wallet } from "lucide-react";

import { Avatar, useIdentity } from "@/components/identity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

function Connected({
  address,
  onClick,
  compact,
}: {
  address: string;
  onClick: () => void;
  compact?: boolean;
}) {
  const { display, avatar } = useIdentity(address);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-sm text-left transition-colors outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-green-bright/40",
        compact ? "p-1" : "px-2 py-2"
      )}
    >
      <Avatar address={address} src={avatar} size={compact ? 26 : 28} />
      {!compact && (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-ui-caption text-foreground">
            {display}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-green-bright" />
            Arbitrum
          </span>
        </span>
      )}
    </button>
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
            onClick={openAccountModal}
            compact={compact}
          />
        );
      }}
    </ConnectButton.Custom>
  );
}
