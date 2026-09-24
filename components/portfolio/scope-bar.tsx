"use client";

import { Eye, Plus, Wallet, X } from "lucide-react";
import { useState } from "react";
import { isAddress } from "viem";
import { normalize } from "viem/ens";
import { useEnsAddress } from "wagmi";

import { Avatar, useIdentity } from "@/components/identity";
import { AddWalletDialog } from "@/components/portfolio/add-wallet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { L1_CHAIN } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import {
  type PortfolioAccount,
  useKnownWallets,
  useWatchlist,
} from "@/lib/hooks/watchlist";

function Chip({
  active,
  onClick,
  children,
  onRemove,
  removeLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <span
      className={cn(
        "group inline-flex h-8 items-center rounded-full border text-ui-caption transition-colors",
        active
          ? "border-foreground/20 bg-active text-foreground"
          : "border-hairline text-muted-foreground hover:border-border hover:text-foreground"
      )}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "flex h-full cursor-pointer items-center gap-2 rounded-full pl-1.5 outline-none focus-visible:ring-1 focus-visible:ring-green-bright/40",
          onRemove ? "pr-1" : "pr-3"
        )}
      >
        {children}
      </button>
      {onRemove && (
        <Tooltip content={removeLabel ?? "Remove"}>
          <button
            type="button"
            aria-label={removeLabel ?? "Remove"}
            onClick={onRemove}
            className="mr-1 inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-subtle-foreground opacity-60 transition hover:bg-hover hover:text-foreground group-hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </Tooltip>
      )}
    </span>
  );
}

function AccountChip({
  account,
  active,
  onSelect,
  onRemove,
}: {
  account: PortfolioAccount;
  active: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const { name, avatar } = useIdentity(account.address);
  return (
    <Chip
      active={active}
      onClick={onSelect}
      onRemove={onRemove}
      removeLabel={
        account.source === "watched" ? "Stop tracking" : "Forget this wallet"
      }
    >
      <Avatar address={account.address} src={avatar} size={20} />
      <span
        className={cn(!account.label && !name && "font-mono text-[11.5px]")}
      >
        {account.label ?? name ?? shortAddress(account.address)}
      </span>
      {account.source === "watched" ? (
        <Eye className="size-3 text-subtle-foreground" aria-label="Watching" />
      ) : (
        <span className="relative inline-flex">
          <Wallet
            className="size-3 text-subtle-foreground"
            aria-label={
              account.source === "wallet"
                ? "Your wallet, active now"
                : "Your wallet"
            }
          />
          {account.source === "wallet" && (
            <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-green-bright ring-1 ring-background" />
          )}
        </span>
      )}
    </Chip>
  );
}

export function TrackAddressDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdded?: (address: string) => void;
}) {
  const { add } = useWatchlist();
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const trimmed = value.trim();
  let ens: string | undefined;
  try {
    ens = /\.[a-z]{2,}$/i.test(trimmed) ? normalize(trimmed) : undefined;
  } catch {
    ens = undefined;
  }
  const { data: resolved, isFetching } = useEnsAddress({
    name: ens,
    chainId: L1_CHAIN.id,
    query: { enabled: Boolean(ens), retry: false },
  });
  const address = isAddress(trimmed)
    ? trimmed.toLowerCase()
    : resolved?.toLowerCase();
  const invalid =
    trimmed.length > 0 && !address && !isFetching && !(ens && isFetching);

  const submit = () => {
    if (!address) return;
    add(address, label || ens);
    onAdded?.(address);
    setValue("");
    setLabel("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>Track an address</DialogTitle>
            <DialogDescription>
              Add a cold wallet, multisig or any delegator to your portfolio.
              Tracking is read-only and stays in this browser.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label className="flex flex-col gap-1.5">
              <span className="text-ui-caption text-muted-foreground">
                Address or ENS name
              </span>
              <Input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0x… or name.eth"
                aria-invalid={invalid}
                className="font-mono"
              />
              {ens && resolved && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {shortAddress(resolved, 10, 8)}
                </span>
              )}
              {invalid && (
                <span className="text-ui-caption text-destructive">
                  Not a valid address or name
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-ui-caption text-muted-foreground">
                Label (optional)
              </span>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Cold storage"
                maxLength={32}
              />
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" variant="primary" disabled={!address}>
              Track address
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ScopeBar({
  accounts,
  scope,
  onScope,
}: {
  accounts: PortfolioAccount[];
  scope: string;
  onScope: (s: string) => void;
}) {
  const { remove } = useWatchlist();
  const { remove: forget } = useKnownWallets();
  const [adding, setAdding] = useState(false);
  const [addingWallet, setAddingWallet] = useState(false);

  return (
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0">
      {accounts.length > 1 && (
        <Chip active={scope === "all"} onClick={() => onScope("all")}>
          <span className="pl-1.5">All accounts</span>
          <span className="rounded-full bg-hover px-1.5 font-mono text-[10.5px] tabular-nums">
            {accounts.length}
          </span>
        </Chip>
      )}
      {accounts.map((a) => (
        <AccountChip
          key={a.address}
          account={a}
          active={scope === a.address || accounts.length === 1}
          onSelect={() => onScope(scope === a.address ? "all" : a.address)}
          onRemove={
            a.source === "wallet"
              ? undefined
              : () => {
                  if (a.source === "watched") remove(a.address);
                  else forget(a.address);
                  if (scope === a.address) onScope("all");
                }
          }
        />
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAddingWallet(true)}
        className="rounded-full"
      >
        <Wallet /> Add wallet
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAdding(true)}
        className="rounded-full"
      >
        <Plus /> Track address
      </Button>
      <AddWalletDialog open={addingWallet} onOpenChange={setAddingWallet} />
      <TrackAddressDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={() => onScope("all")}
      />
    </div>
  );
}
