"use client";

import { useEffect, useState } from "react";

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
import { shortAddress } from "@/lib/format";
import {
  type PortfolioAccount,
  useKnownWallets,
  useWatchlist,
} from "@/lib/hooks/watchlist";

/** Give a wallet in the portfolio a name; empty clears it. */
export function RenameWalletDialog({
  account,
  onOpenChange,
}: {
  account: PortfolioAccount | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { rename: renameWatched } = useWatchlist();
  const { rename: renameWallet } = useKnownWallets();
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (account) setLabel(account.label ?? "");
  }, [account]);

  const save = () => {
    if (!account) return;
    if (account.source === "watched") renameWatched(account.address, label);
    else renameWallet(account.address, label);
    onOpenChange(false);
  };

  return (
    <Dialog open={Boolean(account)} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename wallet</DialogTitle>
            <DialogDescription>
              {account ? shortAddress(account.address, 10, 8) : null}. The name
              stays in this browser.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label className="flex flex-col gap-1.5">
              <span className="text-ui-caption text-muted-foreground">
                Name
              </span>
              <Input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Cold storage"
                maxLength={32}
              />
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" variant="primary">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
