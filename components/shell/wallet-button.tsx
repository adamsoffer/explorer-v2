"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Copy,
  Eye,
  Layers,
  LogOut,
  Plus,
  Wallet,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useDisconnect } from "wagmi";

import { Avatar, useIdentity } from "@/components/identity";
import { useAddWallet } from "@/components/portfolio/add-wallet";
import { TrackAddressDialog } from "@/components/portfolio/scope-bar";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { formatLPT, fromWei } from "@/lib/format";
import { usePortfolio } from "@/lib/hooks/queries";
import { useViewScope } from "@/lib/hooks/view-scope";
import {
  type PortfolioAccount,
  usePortfolioAccounts,
} from "@/lib/hooks/watchlist";

const SOURCE_LABEL = {
  wallet: "Active wallet",
  known: "Wallet",
  watched: "Watching",
} as const;

function AccountAvatar({
  address,
  active,
  size,
}: {
  address: string;
  active?: boolean;
  size: number;
}) {
  const { avatar } = useIdentity(address);
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar address={address} src={avatar} size={size} />
      {active && (
        <span
          aria-label="Active wallet"
          className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-popover bg-green-bright"
        />
      )}
    </span>
  );
}

function AccountName({ account }: { account: PortfolioAccount }) {
  const { display } = useIdentity(account.address);
  return <>{account.label ?? display}</>;
}

function AllWalletsIcon({ size }: { size: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-hover"
      style={{ width: size, height: size }}
    >
      <Layers className="size-3.5! text-foreground!" />
    </span>
  );
}

const lpt = (v: number | null) =>
  v == null ? "…" : formatLPT(v, { compact: true });

/**
 * The portfolio switcher: picks what the portfolio shows, every wallet or
 * one account, like a wallet app's account picker. It doesn't change the
 * wallet's signing account; actions ask for a switch when it matters.
 */
function PortfolioSwitcher({
  accounts,
  compact,
  connected,
  openConnectModal,
}: {
  accounts: PortfolioAccount[];
  compact?: boolean;
  connected: boolean;
  openConnectModal?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { disconnect } = useDisconnect();
  const addresses = useMemo(() => accounts.map((a) => a.address), [accounts]);
  const [scope, setScope] = useViewScope(addresses);
  const { data } = usePortfolio(addresses);
  const addWallet = useAddWallet();
  const [tracking, setTracking] = useState(false);

  const stakeOf = (address: string) => {
    if (!data) return null;
    const a = data.accounts.find((x) => x.id === address);
    return a ? fromWei(a.pendingStake) : 0;
  };
  const total = data ? fromWei(data.pendingStake) : null;
  const multi = accounts.length > 1;
  // One account is its own "all".
  const viewing = multi
    ? accounts.find((a) => a.address === scope)
    : accounts[0];
  const activeWallet = accounts.find((a) => a.source === "wallet");

  const view = (next: string) => {
    setScope(next);
    if (pathname !== "/") router.push("/");
  };

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label="Switch portfolio"
              className={cn(
                "flex min-w-0 cursor-pointer items-center gap-2.5 rounded-sm text-left transition-colors outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-green-bright/40 aria-expanded:bg-hover",
                compact ? "p-1" : "w-full px-2 py-2"
              )}
            />
          }
        >
          {viewing ? (
            <AccountAvatar
              address={viewing.address}
              active={viewing.source === "wallet"}
              size={compact ? 26 : 28}
            />
          ) : (
            <AllWalletsIcon size={compact ? 26 : 28} />
          )}
          {!compact && (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-ui-caption text-foreground">
                  {viewing ? <AccountName account={viewing} /> : "All wallets"}
                </span>
                <span className="truncate font-mono text-[11px] text-muted-foreground tabular-nums">
                  {lpt(viewing ? stakeOf(viewing.address) : total)}
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-subtle-foreground" />
            </>
          )}
        </MenuTrigger>
        <MenuContent align={compact ? "end" : "start"} className="w-72">
          {multi && (
            <MenuItem className="h-auto py-2" onClick={() => view("all")}>
              <AllWalletsIcon size={28} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">Portfolio</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  <span className="font-mono tabular-nums">{lpt(total)}</span> ·
                  All wallets
                </span>
              </span>
              {!viewing && <Check className="text-green-bright!" />}
            </MenuItem>
          )}
          {accounts.map((a) => (
            <MenuItem
              key={a.address}
              className="h-auto py-2"
              onClick={() => view(a.address)}
            >
              <AccountAvatar
                address={a.address}
                active={a.source === "wallet"}
                size={28}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">
                  <AccountName account={a} />
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    {lpt(stakeOf(a.address))}
                  </span>{" "}
                  · {SOURCE_LABEL[a.source]}
                </span>
              </span>
              {viewing?.address === a.address && (
                <Check className="text-green-bright!" />
              )}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onClick={addWallet.start}>
            <Wallet /> Add wallet
          </MenuItem>
          <MenuItem onClick={() => setTracking(true)}>
            <Eye /> Track address
          </MenuItem>
          <MenuSeparator />
          {connected && activeWallet ? (
            <>
              <MenuItem
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(activeWallet.address);
                    toast.success("Address copied");
                  } catch {
                    // clipboard blocked
                  }
                }}
              >
                <Copy /> Copy active address
              </MenuItem>
              <MenuItem onClick={() => disconnect()}>
                <LogOut /> Disconnect
              </MenuItem>
            </>
          ) : (
            <MenuItem onClick={() => openConnectModal?.()}>
              <Plus /> Connect wallet
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
      {addWallet.dialog}
      <TrackAddressDialog
        open={tracking}
        onOpenChange={setTracking}
        onAdded={(address) => view(address)}
      />
    </>
  );
}

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { accounts } = usePortfolioAccounts();
  return (
    <ConnectButton.Custom>
      {({ account, chain, openChainModal, openConnectModal, mounted }) => {
        if (!mounted) {
          return (
            <div className={compact ? "size-8" : "h-11"} aria-hidden="true" />
          );
        }
        if (account && chain?.unsupported) {
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
        if (accounts.length === 0) {
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
        return (
          <PortfolioSwitcher
            accounts={accounts}
            compact={compact}
            connected={Boolean(account)}
            openConnectModal={openConnectModal}
          />
        );
      }}
    </ConnectButton.Custom>
  );
}
