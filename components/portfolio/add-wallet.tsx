"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { AppWindow, Loader2, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAccount, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { shortAddress } from "@/lib/format";
import {
  openAccountPicker,
  PickerDismissedError,
} from "@/lib/hooks/account-picker";
import { useKnownWallets } from "@/lib/hooks/watchlist";

function Option({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-hairline p-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-hover text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-ui-body font-medium">{title}</p>
          <p className="text-ui-caption text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Adds a wallet you can act from. Wallets expose one active account to a
 * site, so "adding" means getting the wallet to hand over another account —
 * the portfolio remembers every account it has seen (see WalletMemory).
 */
export function AddWalletDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { connector, isConnected } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const { list, add } = useKnownWallets();
  const [picking, setPicking] = useState(false);
  const [manual, setManual] = useState(false);
  const [switchingApp, setSwitchingApp] = useState(false);

  // Wallets known when the dialog opened; a new one means we're done.
  const baseline = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (open) {
      baseline.current = new Set(list.map((w) => w.address));
      setPicking(false);
      setManual(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const added = list.find((w) => !baseline.current.has(w.address));
    if (added) {
      toast.success(`Added ${added.label ?? shortAddress(added.address)}`);
      onOpenChange(false);
    }
  }, [list, open, onOpenChange]);

  // RainbowKit only offers its connect modal once disconnected.
  useEffect(() => {
    if (switchingApp && !isConnected && openConnectModal) {
      setSwitchingApp(false);
      onOpenChange(false);
      openConnectModal();
    }
  }, [switchingApp, isConnected, openConnectModal, onOpenChange]);

  const chooseAccount = async () => {
    setPicking(true);
    try {
      // The picker may leave the active account unchanged when several are
      // chosen, so remember everything the wallet now exposes.
      for (const addr of await openAccountPicker(connector)) add(addr);
    } catch (e) {
      if (!(e instanceof PickerDismissedError)) setManual(true);
    } finally {
      setPicking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a wallet</DialogTitle>
          <DialogDescription>
            Wallets you connect stay in your portfolio and can be managed here.
            Only the active one signs, and you&apos;ll be asked to switch when
            it matters.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="gap-3">
          {!isConnected ? (
            <Button
              variant="primary"
              onClick={() => {
                onOpenChange(false);
                openConnectModal?.();
              }}
            >
              Connect a wallet
            </Button>
          ) : (
            <>
              <Option
                icon={<Users />}
                title={`Another account in ${connector?.name ?? "your wallet"}`}
                description={
                  manual ? (
                    <>
                      Switch to the account in{" "}
                      {connector?.name ?? "your wallet"} and it will be added
                      here automatically.
                    </>
                  ) : (
                    "Pick one or more accounts in your wallet's account picker."
                  )
                }
              >
                {manual ? (
                  <p className="flex items-center gap-2 text-ui-caption text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Waiting for a new account…
                  </p>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    className="self-start"
                    disabled={picking}
                    onClick={chooseAccount}
                  >
                    {picking && <Loader2 className="animate-spin" />}
                    Choose account
                  </Button>
                )}
              </Option>
              <Option
                icon={<AppWindow />}
                title="A different wallet app"
                description="Disconnects the current wallet (it stays in your portfolio) and opens the connect screen."
              >
                <Button
                  size="sm"
                  className="self-start"
                  disabled={switchingApp}
                  onClick={async () => {
                    setSwitchingApp(true);
                    try {
                      await disconnectAsync();
                    } catch {
                      setSwitchingApp(false);
                    }
                  }}
                >
                  Connect another wallet
                </Button>
              </Option>
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
