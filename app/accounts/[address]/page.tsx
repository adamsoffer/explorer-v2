"use client";

import { Check, Eye, Server } from "lucide-react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useMemo } from "react";
import { isAddress } from "viem";

import { Avatar, CopyButton, useIdentity } from "@/components/identity";
import { Page } from "@/components/page";
import { PortfolioView } from "@/components/portfolio/portfolio-view";
import { Button } from "@/components/ui/button";
import { addressUrl } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { useOrchestrators } from "@/lib/hooks/queries";
import { usePortfolioAccounts, useWatchlist } from "@/lib/hooks/watchlist";

export default function AccountPage() {
  const params = useParams<{ address: string }>();
  const raw = decodeURIComponent(params.address ?? "");
  const address = raw.toLowerCase();
  const valid = isAddress(address);
  const { name, avatar } = useIdentity(valid ? address : null);
  const { walletAddress, isOwned } = usePortfolioAccounts();
  const { list, add, remove } = useWatchlist();
  const { data: orchestrators } = useOrchestrators();

  const accounts = useMemo(
    () => [
      {
        address,
        source:
          address === walletAddress
            ? ("wallet" as const)
            : isOwned(address)
            ? ("known" as const)
            : ("watched" as const),
      },
    ],
    [address, walletAddress, isOwned]
  );

  if (!valid) notFound();

  const isYou = address === walletAddress;
  const isYours = isOwned(address);
  const watched = list.some((w) => w.address === address);
  const isOrchestrator = orchestrators?.some((o) => o.id === address);

  return (
    <Page>
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar address={address} src={avatar} size={52} />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="text-ui-caption text-muted-foreground">
              {isYou ? "Active wallet" : isYours ? "Your wallet" : "Account"}
            </div>
            <h1 className="truncate text-[26px] leading-8 font-light tracking-[-0.01em]">
              {name ?? (
                <span className="font-mono text-[22px]">
                  {shortAddress(address, 8, 6)}
                </span>
              )}
            </h1>
            <div className="flex items-center gap-1 text-ui-caption text-muted-foreground">
              <a
                href={addressUrl(address)}
                target="_blank"
                rel="noreferrer"
                className="font-mono hover:text-foreground"
              >
                {shortAddress(address, 10, 8)}
              </a>
              <CopyButton value={address} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOrchestrator && (
            <Button
              size="sm"
              render={<Link href={`/orchestrators/${address}`} />}
            >
              <Server /> Orchestrator profile
            </Button>
          )}
          {!isYours &&
            (watched ? (
              <Button size="sm" variant="ghost" onClick={() => remove(address)}>
                <Check /> In your portfolio
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                onClick={() => add(address, name ?? undefined)}
              >
                <Eye /> Track in portfolio
              </Button>
            ))}
        </div>
      </header>
      <PortfolioView
        accounts={accounts}
        canManage={isOwned}
        showScope={false}
      />
    </Page>
  );
}
