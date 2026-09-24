"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, Check, ExternalLink, Info, Loader2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { maxUint256 } from "viem";
import {
  useAccount,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { Identity } from "@/components/identity";
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
import { bondingManager } from "@/lib/abis/BondingManager";
import { livepeerToken } from "@/lib/abis/LivepeerToken";
import { cn } from "@/lib/cn";
import { L2_CHAIN, txUrl } from "@/lib/config";
import {
  formatDuration,
  formatETH,
  formatLPT,
  fromWei,
  shortAddress,
  toWei,
} from "@/lib/format";
import { openAccountPicker } from "@/lib/hooks/account-picker";
import { useOrchestrators, useProtocol } from "@/lib/hooks/queries";
import { useKnownWallets } from "@/lib/hooks/watchlist";
import { useProtocolContract } from "@/lib/staking/contracts";
import { bondHints, EMPTY_HINT, simulateHint } from "@/lib/staking/hints";
import { refreshWhenIndexed } from "@/lib/subgraph/sync";

/* ── Action model ────────────────────────────────────────────────────────── */

export type StakingAction = (
  | { kind: "delegate"; to: string }
  | { kind: "unstake"; delegate: string; staked: number }
  | { kind: "withdrawStake"; lockId: number; amount: number }
  | { kind: "rebond"; lockId: number; amount: number; delegate: string }
  | { kind: "withdrawFees"; amount: number }
) & {
  /**
   * The account this action is for. When it isn't the account active in
   * the wallet, the dialog asks you to switch before anything can be signed.
   * Omitted means "whichever account is active".
   */
  account?: string;
};

const StakingContext = createContext<{ open: (a: StakingAction) => void }>({
  open: () => {},
});

export const useStaking = () => useContext(StakingContext);

export function StakingProvider({ children }: { children: React.ReactNode }) {
  const [action, setAction] = useState<StakingAction | null>(null);
  const [open, setOpen] = useState(false);
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const start = useCallback(
    (a: StakingAction) => {
      if (!isConnected) {
        openConnectModal?.();
        return;
      }
      setAction(a);
      setOpen(true);
    },
    [isConnected, openConnectModal]
  );

  return (
    <StakingContext.Provider value={{ open: start }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {action && (
            <AccountGate action={action} onDone={() => setOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </StakingContext.Provider>
  );
}

/* ── Transaction plumbing ────────────────────────────────────────────────── */

type Step = { key: string; label: string };

function useTx(onConfirmed: () => void, signer: string | undefined) {
  const { address } = useAccount();
  const { writeContractAsync, isPending: signing, reset } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash, chainId: L2_CHAIN.id });

  useEffect(() => {
    if (receipt.isSuccess) onConfirmed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  return {
    send: async (args: Parameters<typeof writeContractAsync>[0]) => {
      reset();
      // Never sign from an account other than the one this action is for.
      if (!signer || address?.toLowerCase() !== signer.toLowerCase()) {
        throw new Error("Switch to the right account in your wallet first");
      }
      const h = await writeContractAsync({
        ...args,
        account: signer as `0x${string}`,
        chainId: L2_CHAIN.id,
      });
      setHash(h);
      return h;
    },
    clear: () => setHash(undefined),
    hash,
    busy: signing || (Boolean(hash) && receipt.isLoading),
    stage: signing ? "sign" : hash && receipt.isLoading ? "confirm" : null,
    confirmed: receipt.isSuccess,
    block: receipt.data?.blockNumber,
  };
}

function errorMessage(e: unknown) {
  const msg =
    e instanceof Error
      ? (e as { shortMessage?: string }).shortMessage ?? e.message
      : String(e);
  if (/user rejected|denied/i.test(msg)) return "Request rejected in wallet";
  return msg.split("\n")[0];
}

/* ── UI pieces ───────────────────────────────────────────────────────────── */

function AmountField({
  value,
  onChange,
  max,
  maxLabel,
  unit = "LPT",
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  max?: number;
  maxLabel: string;
  unit?: string;
  autoFocus?: boolean;
}) {
  const invalid = max != null && Number(value) > max;
  return (
    <div
      className={cn(
        "rounded-lg border bg-background/40 px-4 pt-3 pb-3 transition-colors focus-within:border-ring light:bg-muted",
        invalid ? "border-destructive/60" : "border-hairline"
      )}
    >
      <div className="flex items-center justify-between text-ui-caption text-muted-foreground">
        <span>Amount</span>
        {max != null && (
          <button
            type="button"
            onClick={() => onChange(String(Math.floor(max * 1e6) / 1e6))}
            className="cursor-pointer rounded-sm px-1 hover:text-foreground"
          >
            {maxLabel}:{" "}
            <span className="font-mono tabular-nums">
              {formatLPT(max).replace(" LPT", "")}
            </span>{" "}
            <span className="font-medium text-foreground">Max</span>
          </button>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <input
          autoFocus={autoFocus}
          inputMode="decimal"
          placeholder="0"
          value={value}
          aria-label={`Amount in ${unit}`}
          aria-invalid={invalid}
          onChange={(e) => {
            const v = e.target.value.replace(/,/g, ".");
            if (/^\d*\.?\d{0,18}$/.test(v)) onChange(v);
          }}
          className="min-w-0 flex-1 bg-transparent font-mono text-[28px] leading-10 tracking-tight outline-none placeholder:text-subtle-foreground"
        />
        <span className="text-ui-body text-muted-foreground">{unit}</span>
      </div>
      {invalid && (
        <p className="mt-1 text-ui-caption text-destructive">
          More than available
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-ui-body">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-[13px] tabular-nums">
        {children}
      </span>
    </div>
  );
}

function Steps({
  steps,
  current,
  done,
}: {
  steps: Step[];
  current: number;
  done: boolean;
}) {
  if (steps.length < 2) return null;
  return (
    <ol className="flex items-center gap-2 text-ui-caption">
      {steps.map((s, i) => {
        const complete = done || i < current;
        const active = !done && i === current;
        return (
          <li key={s.key} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-5 bg-border" />}
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full border text-[10px]",
                complete &&
                  "border-transparent bg-green-subtle text-green-bright",
                active && "border-foreground text-foreground",
                !complete && !active && "border-border text-subtle-foreground"
              )}
            >
              {complete ? <Check className="size-3" /> : i + 1}
            </span>
            <span
              className={
                active || complete ? "text-foreground" : "text-muted-foreground"
              }
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Notice({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-md px-3 py-2.5 text-ui-caption",
        tone === "warning"
          ? "bg-warm-subtle text-warm"
          : "bg-hover text-muted-foreground"
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/* ── Account gate ────────────────────────────────────────────────────────── */

/**
 * Wallets sign from one active account and a site can't change it, so when
 * the action belongs to another of your wallets we ask you to switch and
 * carry on the moment the wallet reports that account.
 */
function AccountGate({
  action,
  onDone,
}: {
  action: StakingAction;
  onDone: () => void;
}) {
  const { address, connector } = useAccount();
  const active = address?.toLowerCase();
  const target = action.account?.toLowerCase() ?? active;
  const { list } = useKnownWallets();
  const label = list.find((w) => w.address === target)?.label;

  if (target && active && target === active) {
    // Keyed so a later account switch restarts the flow with fresh reads.
    return (
      <StakingFlow
        key={active}
        action={action}
        onDone={onDone}
        signer={active}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Switch account</DialogTitle>
        <DialogDescription>
          This position belongs to another of your wallets. Switch to it in your
          wallet extension or app to continue. The dialog picks it up
          automatically.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {target && (
          <div className="rounded-lg border border-hairline p-3">
            <Identity
              address={target}
              href={null}
              size={26}
              label={label}
              secondary="Switch to this account"
            />
          </div>
        )}
        {active && (
          <p className="text-ui-caption text-muted-foreground">
            Active now:{" "}
            <span className="font-mono">{shortAddress(active)}</span>
          </p>
        )}
      </DialogBody>
      <DialogFooter className="items-center sm:justify-between">
        <div className="flex items-center justify-center gap-2 text-ui-caption text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Waiting for your wallet…
        </div>
        <Button
          variant="primary"
          onClick={() => openAccountPicker(connector).catch(() => {})}
        >
          Open wallet
        </Button>
      </DialogFooter>
    </>
  );
}

/* ── The flow ────────────────────────────────────────────────────────────── */

function StakingFlow({
  action,
  onDone,
  signer,
}: {
  action: StakingAction;
  onDone: () => void;
  signer: string;
}) {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();
  const bm = useProtocolContract("BondingManager");
  const token = useProtocolContract("LivepeerToken");
  const { data: protocol } = useProtocol();
  const { data: orchestrators } = useOrchestrators();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const account = address?.toLowerCase();
  const activeSet = useMemo(
    () => (orchestrators ?? []).map((o) => ({ id: o.id, stake: o.totalStake })),
    [orchestrators]
  );

  const { data: balanceWei, refetch: refetchBalance } = useReadContract({
    address: token,
    abi: livepeerToken,
    functionName: "balanceOf",
    args: [address!],
    chainId: L2_CHAIN.id,
    query: { enabled: Boolean(token && address) },
  });
  const { data: allowanceWei, refetch: refetchAllowance } = useReadContract({
    address: token,
    abi: livepeerToken,
    functionName: "allowance",
    args: [address!, bm!],
    chainId: L2_CHAIN.id,
    query: { enabled: Boolean(token && address && bm) },
  });
  const { data: delegatorInfo } = useReadContract({
    address: bm,
    abi: bondingManager,
    functionName: "getDelegator",
    args: [address!],
    chainId: L2_CHAIN.id,
    query: { enabled: Boolean(bm && address) },
  });
  const { data: pendingStakeWei } = useReadContract({
    address: bm,
    abi: bondingManager,
    functionName: "pendingStake",
    args: [address!, BigInt(protocol?.currentRound ?? 0)],
    chainId: L2_CHAIN.id,
    query: { enabled: Boolean(bm && address && protocol) },
  });

  const currentDelegate = (
    delegatorInfo as readonly unknown[] | undefined
  )?.[2] as string | undefined;
  const bonded =
    pendingStakeWei != null ? fromWei(pendingStakeWei as bigint) : 0;
  const balance = balanceWei != null ? fromWei(balanceWei as bigint) : 0;

  // On-chain reads refresh straight away; subgraph data waits for indexing
  // (see the confirmation effect below).
  const refresh = () => {
    refetchBalance();
    refetchAllowance();
  };

  const approveTx = useTx(() => {
    refetchAllowance();
  }, signer);
  const tx = useTx(refresh, signer);

  const amountWei = (() => {
    try {
      return amount ? toWei(amount) : 0n;
    } catch {
      return 0n;
    }
  })();

  const unbondingTime = protocol
    ? formatDuration(protocol.unbondingPeriod * protocol.roundSeconds)
    : "about 7 days";

  // Per-action configuration
  let title = "";
  let description: React.ReactNode = null;
  let steps: Step[] = [{ key: "main", label: "Confirm" }];
  let body: React.ReactNode = null;
  let cta = "Confirm";
  let run: () => Promise<void> = async () => {};
  let canRun = Boolean(bm && account);
  let successTitle = "Transaction confirmed";

  const needsApproval =
    action.kind === "delegate" &&
    amountWei > 0n &&
    ((allowanceWei as bigint | undefined) ?? 0n) < amountWei;
  const approvalFlow = needsApproval || approveTx.confirmed;

  switch (action.kind) {
    case "delegate": {
      const to = action.to.toLowerCase();
      const moving =
        currentDelegate &&
        currentDelegate !== "0x0000000000000000000000000000000000000000" &&
        currentDelegate.toLowerCase() !== to;
      const adding = currentDelegate?.toLowerCase() === to;
      title = moving ? "Move stake" : adding ? "Stake more" : "Delegate";
      description = moving
        ? "Bonding to a new orchestrator moves your entire existing stake with it. Add LPT to top up in the same transaction."
        : "Delegated LPT earns inflationary rewards and a share of fees each round. You can unstake any time; it takes " +
          unbondingTime +
          " to unlock.";
      steps = approvalFlow
        ? [
            { key: "approve", label: "Approve LPT" },
            { key: "bond", label: moving ? "Move" : "Delegate" },
          ]
        : [{ key: "bond", label: moving ? "Move" : "Delegate" }];
      cta = needsApproval
        ? "Approve LPT"
        : moving
        ? amountWei > 0n
          ? "Move and stake"
          : "Move stake"
        : "Delegate";
      canRun =
        canRun &&
        Boolean(token) &&
        (amountWei > 0n || Boolean(moving)) &&
        Number(amount || 0) <= balance;
      successTitle = moving ? "Stake moved" : "Delegation confirmed";
      const orch = orchestrators?.find((o) => o.id === to);
      body = (
        <>
          {moving && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-hairline p-3">
              <Identity
                address={currentDelegate!.toLowerCase()}
                href={null}
                size={22}
                secondary={`${formatLPT(bonded)} moving`}
              />
              <ArrowDown className="ml-1.5 size-3.5 text-subtle-foreground" />
              <Identity
                address={to}
                href={null}
                size={22}
                secondary="New orchestrator"
              />
            </div>
          )}
          {!moving && (
            <div className="rounded-lg border border-hairline p-3">
              <Identity
                address={to}
                href={null}
                size={26}
                secondary={
                  orch
                    ? `${orch.rewardCut.toFixed(
                        0
                      )}% reward cut · ${orch.feeShare.toFixed(0)}% fee share`
                    : undefined
                }
              />
            </div>
          )}
          <AmountField
            value={amount}
            onChange={setAmount}
            max={balance}
            maxLabel="Wallet"
          />
          <div className="flex flex-col gap-2">
            {orch?.realizedApr != null && (
              <Row label="Realised yield, 30 rounds">
                {orch.realizedApr.toFixed(1)}% APR
              </Row>
            )}
            {orch?.realizedApr != null &&
              Number(amount || 0) + (moving ? bonded : 0) > 0 && (
                <Row label="Est. rewards per year">
                  {formatLPT(
                    (Number(amount || 0) + (moving ? bonded : 0)) *
                      (orch.realizedApr / 100)
                  )}
                </Row>
              )}
            <Row label="Unbonding period">{unbondingTime}</Row>
          </div>
          {orch && orch.rewardCalls < orch.rewardWindow - 2 && (
            <Notice tone="warning">
              This orchestrator called reward in {orch.rewardCalls} of the last{" "}
              {orch.rewardWindow} rounds. Missed calls mean missed rewards for
              its delegators.
            </Notice>
          )}
        </>
      );
      run = async () => {
        if (needsApproval) {
          await approveTx.send({
            address: token!,
            abi: livepeerToken,
            functionName: "approve",
            args: [bm!, maxUint256],
          });
          return;
        }
        const hints = bondHints(activeSet, {
          to,
          from: currentDelegate,
          amount: Number(amount || 0),
          moved: bonded,
        });
        await tx.send({
          address: bm!,
          abi: bondingManager,
          functionName: "bondWithHint",
          args: [
            amountWei,
            to as `0x${string}`,
            hints.oldDelegate.prev,
            hints.oldDelegate.next,
            hints.newDelegate.prev,
            hints.newDelegate.next,
          ],
        });
      };
      break;
    }
    case "unstake": {
      title = "Unstake";
      description = `Unstaked LPT stops earning immediately and unlocks after ${unbondingTime}. You can restake it any time before withdrawing.`;
      cta = "Unstake";
      const max = bonded || action.staked;
      canRun = canRun && amountWei > 0n && Number(amount) <= max + 1e-9;
      successTitle = "Unstaking started";
      body = (
        <>
          <div className="rounded-lg border border-hairline p-3">
            <Identity
              address={action.delegate}
              href={null}
              size={26}
              secondary="Current orchestrator"
            />
          </div>
          <AmountField
            value={amount}
            onChange={setAmount}
            max={max}
            maxLabel="Staked"
          />
          <Row label="Available to withdraw">
            {protocol
              ? `Round ${(
                  protocol.currentRound + protocol.unbondingPeriod
                ).toLocaleString()}`
              : "—"}
          </Row>
        </>
      );
      run = async () => {
        const remaining = Math.max(0, max - Number(amount));
        const hint =
          remaining > 0
            ? simulateHint(activeSet, action.delegate, {
                [action.delegate]: -Number(amount),
              })
            : EMPTY_HINT;
        await tx.send({
          address: bm!,
          abi: bondingManager,
          functionName: "unbondWithHint",
          args: [amountWei, hint.prev, hint.next],
        });
      };
      break;
    }
    case "withdrawStake": {
      title = "Withdraw stake";
      description = "Send unlocked LPT back to your wallet.";
      cta = `Withdraw ${formatLPT(action.amount)}`;
      successTitle = "Stake withdrawn";
      body = <Row label="Amount">{formatLPT(action.amount)}</Row>;
      run = async () => {
        await tx.send({
          address: bm!,
          abi: bondingManager,
          functionName: "withdrawStake",
          args: [BigInt(action.lockId)],
        });
      };
      break;
    }
    case "rebond": {
      const unbondedNow = !currentDelegate || /^0x0+$/.test(currentDelegate);
      title = "Restake";
      description =
        "Put unbonding LPT back to work with the orchestrator it came from. It starts earning again next round.";
      cta = `Restake ${formatLPT(action.amount)}`;
      successTitle = "Restaked";
      body = (
        <>
          <div className="rounded-lg border border-hairline p-3">
            <Identity
              address={action.delegate}
              href={null}
              size={26}
              secondary={formatLPT(action.amount)}
            />
          </div>
        </>
      );
      run = async () => {
        const target = unbondedNow
          ? action.delegate
          : currentDelegate!.toLowerCase();
        const hint = simulateHint(activeSet, target, {
          [target]: action.amount,
        });
        if (unbondedNow) {
          await tx.send({
            address: bm!,
            abi: bondingManager,
            functionName: "rebondFromUnbondedWithHint",
            args: [
              action.delegate as `0x${string}`,
              BigInt(action.lockId),
              hint.prev,
              hint.next,
            ],
          });
        } else {
          await tx.send({
            address: bm!,
            abi: bondingManager,
            functionName: "rebondWithHint",
            args: [BigInt(action.lockId), hint.prev, hint.next],
          });
        }
      };
      break;
    }
    case "withdrawFees": {
      title = "Withdraw fees";
      description =
        "Fees are paid in ETH on Arbitrum and can be withdrawn at any time.";
      cta = `Withdraw ${formatETH(action.amount)}`;
      successTitle = "Fees withdrawn";
      body = <Row label="Amount">{formatETH(action.amount)}</Row>;
      run = async () => {
        await tx.send({
          address: bm!,
          abi: bondingManager,
          functionName: "withdrawFees",
          args: [address!, toWei(action.amount.toFixed(18))],
        });
      };
      break;
    }
  }

  const onChainWrong = chainId !== L2_CHAIN.id;
  const currentStep = approvalFlow && !needsApproval ? 1 : 0;
  const finished = tx.confirmed;
  const busy = approveTx.busy || tx.busy;
  const stage = approveTx.stage ?? tx.stage;
  const pendingHash = tx.hash ?? (approveTx.busy ? approveTx.hash : undefined);

  useEffect(() => {
    if (!tx.confirmed || !tx.hash) return;
    const h = tx.hash;
    const view = {
      label: "View",
      onClick: () => window.open(txUrl(h), "_blank"),
    };
    // One toast for the whole lifecycle: confirmed on-chain, then updated
    // once the subgraph has indexed the block and the views have refetched.
    const id = toast.loading(`${successTitle} · updating your portfolio…`, {
      action: view,
    });
    refreshWhenIndexed(queryClient, tx.block, [
      ["portfolio"],
      ["account-events"],
      ["orchestrators"],
      ["orchestrator"],
      ["events"],
    ]).then((indexed) =>
      toast.success(successTitle, {
        id,
        action: view,
        description: indexed
          ? undefined
          : "Still indexing. Figures will catch up shortly.",
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.confirmed]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{finished ? successTitle : title}</DialogTitle>
        {!finished && description && (
          <DialogDescription>{description}</DialogDescription>
        )}
      </DialogHeader>
      <DialogBody>
        {finished ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-green-subtle text-green-bright">
              <Check className="size-6" />
            </span>
            <p className="text-ui-body text-muted-foreground">
              Your portfolio updates automatically as soon as the network data
              catches up, usually within a few seconds.
            </p>
            {tx.hash && (
              <a
                href={txUrl(tx.hash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-ui-caption text-foreground underline-offset-4 hover:underline"
              >
                View on Arbiscan <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        ) : (
          <>
            <Steps steps={steps} current={currentStep} done={false} />
            {body}
            {error && (
              <p className="text-ui-caption text-destructive">{error}</p>
            )}
          </>
        )}
      </DialogBody>
      <DialogFooter>
        {finished ? (
          <Button
            variant="primary"
            onClick={onDone}
            className="w-full sm:w-auto"
          >
            Done
          </Button>
        ) : onChainWrong ? (
          <Button
            variant="primary"
            className="w-full sm:w-auto"
            onClick={() =>
              switchChainAsync({ chainId: L2_CHAIN.id }).catch((e) =>
                setError(errorMessage(e))
              )
            }
          >
            Switch to Arbitrum
          </Button>
        ) : (
          <Button
            variant="primary"
            className="w-full sm:w-auto"
            disabled={!canRun || busy}
            onClick={async () => {
              setError(null);
              try {
                await run();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />}
            {stage === "sign"
              ? "Confirm in wallet…"
              : stage === "confirm"
              ? "Confirming…"
              : cta}
          </Button>
        )}
      </DialogFooter>
      {!finished && pendingHash && (
        <div className="-mt-2 px-5 pb-4 text-right">
          <a
            href={txUrl(pendingHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Pending transaction <ExternalLink className="size-3" />
          </a>
        </div>
      )}
    </>
  );
}
