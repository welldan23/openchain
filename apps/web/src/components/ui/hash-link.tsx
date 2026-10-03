import { shortenHash } from "@/lib/format";
import { CopyButton } from "./copy-button";

interface HashLinkProps {
  /** Address atau hash transaksi lengkap. */
  value: string;
  /** Tautan explorer untuk nilai ini. */
  href: string;
  head?: number;
  tail?: number;
  copyLabel?: string;
}

/** Address/hash yang dipendekkan, bisa diklik ke explorer dan disalin. */
export function HashLink({ value, href, head, tail, copyLabel = "Salin" }: HashLinkProps) {
  return (
    <span className="inline-flex min-w-0 items-center gap-0.5 font-mono text-xs">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={value}
        className="truncate text-foreground/90 underline-offset-2 hover:text-accent hover:underline"
      >
        {shortenHash(value, head, tail)}
      </a>
      <CopyButton value={value} label={copyLabel} />
    </span>
  );
}
