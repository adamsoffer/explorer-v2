"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";
import { useAccount } from "wagmi";

import { safeAppUrl, safeQueueUrl } from "@/lib/hooks/safe";

/**
 * Shown once a Safe has queued a transaction: it still needs its owners'
 * signatures before anything happens on-chain.
 */
export function SafeProposed({
  safe,
  children,
}: {
  safe: string;
  children?: React.ReactNode;
}) {
  const { connector } = useAccount();
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-hover text-foreground">
        <ShieldCheck className="size-6" />
      </span>
      <p className="max-w-[40ch] text-ui-body text-balance text-muted-foreground">
        {children ??
          "Your Safe's owners need to sign and execute it. The explorer updates once it's on-chain."}
      </p>
      <a
        href={safeQueueUrl(safe)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-ui-caption text-foreground underline-offset-4 hover:underline"
      >
        Open your Safe&apos;s queue <ExternalLink className="size-3" />
      </a>
      {connector?.id !== "safe" && (
        <p className="text-[11px] text-subtle-foreground">
          Next time, use the explorer inside your Safe.{" "}
          <a
            href={safeAppUrl(safe)}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Open as Safe App
          </a>
        </p>
      )}
    </div>
  );
}
