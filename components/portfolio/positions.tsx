"use client";

import {
  ArrowRightLeft,
  Eye,
  Minus,
  MoreHorizontal,
  Plus,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { Sparkline } from "@/components/charts/time-series";
import { Avatar, Identity, useIdentity } from "@/components/identity";
import { Card, EmptyState } from "@/components/page";
import { useStaking } from "@/components/staking/staking";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { formatETH, formatLPT, formatNumber, shortAddress } from "@/lib/format";
import type { PortfolioAccount } from "@/lib/hooks/watchlist";
import type { Orchestrator } from "@/lib/subgraph/network";

export type Position = {
  account: PortfolioAccount;
  delegate: string | null;
  stake: number;
  fees: number;
  rewards30d: number;
  trend: number[];
  active: boolean;
};

function AccountCell({ account }: { account: PortfolioAccount }) {
  const { name, avatar } = useIdentity(account.address);
  return (
    <Link
      href={`/accounts/${account.address}`}
      className="flex min-w-0 items-center gap-2.5 rounded-sm outline-none hover:opacity-80"
    >
      <Avatar address={account.address} src={avatar} size={26} />
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 truncate text-ui-body">
          {account.label ?? name ?? (
            <span className="font-mono text-[13px]">
              {shortAddress(account.address)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 text-[11px] whitespace-nowrap text-muted-foreground">
          {account.source === "watched" ? (
            <Eye className="size-3 shrink-0" />
          ) : (
            <span className="relative inline-flex shrink-0">
              <Wallet className="size-3" />
              {account.source === "wallet" && (
                <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-green-bright ring-1 ring-background" />
              )}
            </span>
          )}
          {
            {
              wallet: "Active wallet",
              known: "Your wallet",
              watched: "Watching",
            }[account.source]
          }
        </span>
      </span>
    </Link>
  );
}

function RowActions({
  position,
  canManage,
}: {
  position: Position;
  canManage: boolean;
}) {
  const { open } = useStaking();
  if (!canManage) {
    return (
      <Tooltip content="Watching only. Connect this wallet once to manage it here.">
        <span className="inline-flex size-8 items-center justify-center text-subtle-foreground">
          <Eye className="size-4" />
        </span>
      </Tooltip>
    );
  }
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Position actions">
            <MoreHorizontal />
          </Button>
        }
      />
      <MenuContent>
        {position.delegate && (
          <MenuItem
            onClick={() =>
              open({
                kind: "delegate",
                to: position.delegate!,
                account: position.account.address,
              })
            }
          >
            <Plus /> Delegate more
          </MenuItem>
        )}
        <MenuItem render={<Link href="/orchestrators?move=1" />}>
          <ArrowRightLeft /> Switch orchestrator
        </MenuItem>
        {position.delegate && position.stake > 0 && (
          <MenuItem
            onClick={() =>
              open({
                kind: "undelegate",
                account: position.account.address,
                delegate: position.delegate!,
                staked: position.stake,
              })
            }
          >
            <Minus /> Undelegate
          </MenuItem>
        )}
        {position.fees > 0 && (
          <>
            <MenuSeparator />
            <MenuItem
              onClick={() =>
                open({
                  kind: "withdrawFees",
                  amount: position.fees,
                  account: position.account.address,
                })
              }
            >
              <Wallet /> Withdraw {formatETH(position.fees)}
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

export function Positions({
  positions,
  orchestrators,
  total,
  canManage,
  showAccount,
}: {
  positions: Position[];
  orchestrators: Map<string, Orchestrator>;
  total: number;
  canManage: (address: string) => boolean;
  showAccount: boolean;
}) {
  if (!positions.length) {
    return (
      <Card>
        <EmptyState
          title="No stake yet"
          description="Delegate LPT to an orchestrator to start earning rewards and fees."
          action={
            <Link
              href="/orchestrators"
              className="btn-primary inline-flex h-8 items-center rounded-sm px-3 text-sm font-medium"
            >
              Browse orchestrators
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <>
      {/* Phones: one card per position, figures stacked under the names. */}
      <Card className="divide-y divide-(--hairline) md:hidden">
        {positions.map((p) => {
          const o = p.delegate ? orchestrators.get(p.delegate) : undefined;
          return (
            <div key={p.account.address} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                {showAccount ? (
                  <AccountCell account={p.account} />
                ) : p.delegate ? (
                  <Identity
                    address={p.delegate}
                    href={`/orchestrators/${p.delegate}`}
                    size={26}
                  />
                ) : null}
                <RowActions
                  position={p}
                  canManage={canManage(p.account.address)}
                />
              </div>
              {showAccount && p.delegate && (
                <div className="flex items-center gap-2 text-ui-caption text-muted-foreground">
                  <span>Delegated to</span>
                  <Identity
                    address={p.delegate}
                    href={`/orchestrators/${p.delegate}`}
                    size={18}
                  />
                  {!p.active && <Badge tone="warning">Inactive</Badge>}
                </div>
              )}
              <dl className="grid grid-cols-3 gap-3">
                {[
                  ["Stake", formatLPT(p.stake)],
                  [
                    "30d rewards",
                    `${p.rewards30d > 0 ? "+" : ""}${formatLPT(p.rewards30d)}`,
                  ],
                  ["Fees", p.fees > 0 ? formatETH(p.fees) : "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex min-w-0 flex-col gap-0.5">
                    <dt className="text-[11px] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="truncate font-mono text-[12.5px] tabular-nums">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              {o && (
                <p className="text-[11px] text-subtle-foreground">
                  {formatNumber(o.rewardCut, { decimals: 0 })}% cut ·{" "}
                  {formatNumber(o.feeShare, { decimals: 0 })}% fee share
                </p>
              )}
            </div>
          );
        })}
      </Card>

      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-hairline text-ui-caption text-muted-foreground">
              {showAccount && (
                <th className="px-4 py-2.5 font-normal">Account</th>
              )}
              <th className="px-4 py-2.5 font-normal">Orchestrator</th>
              <th className="px-4 py-2.5 text-right font-normal">Stake</th>
              <th className="hidden px-4 py-2.5 text-right font-normal md:table-cell">
                30d rewards
              </th>
              <th className="px-4 py-2.5 text-right font-normal">
                Unclaimed fees
              </th>
              <th className="hidden px-4 py-2.5 font-normal lg:table-cell">
                Trend
              </th>
              <th className="w-12 px-2 py-2.5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const o = p.delegate ? orchestrators.get(p.delegate) : undefined;
              const weight = total > 0 ? (p.stake / total) * 100 : 0;
              return (
                <tr
                  key={p.account.address}
                  className="border-b border-hairline last:border-0 hover:bg-hover/60"
                >
                  {showAccount && (
                    <td className="px-4 py-3">
                      <AccountCell account={p.account} />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    {p.delegate ? (
                      <div className="flex items-center gap-2">
                        <Identity
                          address={p.delegate}
                          href={`/orchestrators/${p.delegate}`}
                          size={22}
                          secondary={
                            o
                              ? `${formatNumber(o.rewardCut, {
                                  decimals: 0,
                                })}% cut · ${formatNumber(o.feeShare, {
                                  decimals: 0,
                                })}% fee share`
                              : undefined
                          }
                        />
                        {!p.active && (
                          <Badge tone="warning" className="ml-1">
                            Inactive
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-ui-body text-muted-foreground">
                        Not delegated
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-mono text-[13px] whitespace-nowrap tabular-nums">
                      {formatLPT(p.stake)}
                    </div>
                    {showAccount && (
                      <div
                        className="mt-1 ml-auto flex h-1 w-20 overflow-hidden rounded-full bg-foreground/8"
                        aria-hidden="true"
                      >
                        <span
                          className="h-full rounded-full bg-series-1"
                          style={{ width: `${Math.max(2, weight)}%` }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-[13px] whitespace-nowrap tabular-nums md:table-cell">
                    <span
                      className={cn(
                        p.rewards30d > 0
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {p.rewards30d > 0 ? "+" : ""}
                      {formatLPT(p.rewards30d)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
                    {p.fees > 0 ? (
                      <span className="text-foreground">
                        {formatETH(p.fees)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <Sparkline values={p.trend} color="var(--series-1)" />
                  </td>
                  <td className="px-2 py-3 text-right">
                    <RowActions
                      position={p}
                      canManage={canManage(p.account.address)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
