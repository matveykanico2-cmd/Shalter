"use client";

import { FileText, Mic, Play, Receipt } from "lucide-react";
import { formatFils } from "@/lib/statements/money";
import type { InvoiceCard } from "@/lib/types";

const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/** Invoice / receipt card shown inside a DM thread. */
export function InvoiceCardView({ invoice }: { invoice: InvoiceCard }) {
  const isReceipt = invoice.kind === "receipt";
  return (
    <div className="w-[300px] max-w-[80vw] overflow-hidden rounded-2xl border border-border bg-bg text-[13px] shadow-sm">
      <div className="flex items-center gap-2 border-b border-separator bg-secondary/60 px-4 py-3">
        {isReceipt ? <Receipt size={18} /> : <FileText size={18} />}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{isReceipt ? "Receipt" : "Invoice"}</div>
          <div className="truncate text-xs text-muted">{invoice.number}</div>
        </div>
        {invoice.paidAt && (
          <span className="rounded-full bg-[#e7f6ec] px-2 py-0.5 text-[11px] font-semibold text-[#1a7f37] dark:bg-[#12361f] dark:text-[#5fd17f]">
            PAID
          </span>
        )}
      </div>

      <div className="space-y-0.5 px-4 pt-3 text-xs">
        <div className="flex justify-between gap-3">
          <span className="text-muted">From</span>
          <span className="truncate text-right font-semibold">{invoice.issuer.name || invoice.issuer.username}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted">To</span>
          <span className="truncate text-right">{invoice.recipient.name || invoice.recipient.username}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted">Date</span>
          <span>{fmtDate(invoice.issuedAt)}</span>
        </div>
      </div>

      <table className="mx-4 my-3 w-[calc(100%-2rem)] text-xs">
        <tbody>
          {invoice.items.map((it, i) => (
            <tr key={i} className="align-top">
              <td className="py-1 pr-2">
                {it.description}
                {it.quantity > 1 && <span className="text-muted"> × {it.quantity}</span>}
              </td>
              <td className="whitespace-nowrap py-1 text-right tabular-nums">{formatFils(it.unitFils * it.quantity)}</td>
            </tr>
          ))}
          <tr className="border-t border-separator font-semibold">
            <td className="pt-2">Total</td>
            <td className="whitespace-nowrap pt-2 text-right tabular-nums">
              {formatFils(invoice.totalFils)} {invoice.currency}
            </td>
          </tr>
        </tbody>
      </table>

      {(invoice.paymentMethod || invoice.paymentReference) && (
        <div className="space-y-0.5 border-t border-separator px-4 py-2 text-xs">
          {invoice.paymentMethod && (
            <div className="flex justify-between">
              <span className="text-muted">Payment</span>
              <span>{invoice.paymentMethod}</span>
            </div>
          )}
          {invoice.paymentReference && (
            <div className="flex justify-between gap-3">
              <span className="text-muted">Reference</span>
              <span className="truncate font-mono">{invoice.paymentReference}</span>
            </div>
          )}
        </div>
      )}

      
    </div>
  );
}

/** Voice-note placeholder: looks like Instagram's voice bubble, but there is no audio. */
export function VoiceBubble({ seconds, mine, url }: { seconds: number; mine: boolean; url?: string | null }) {
  const bars = Array.from({ length: 28 }, (_, i) => 4 + Math.round(Math.abs(Math.sin(i * 1.7 + seconds)) * 14));
  return (
    <span
      title={url ? "Voice message" : "Voice message (placeholder)"}
      className={`flex items-center gap-2 rounded-[18px] px-3 py-2 ${mine ? "bg-bubble-mine text-white" : "bg-bubble-them"}`}
    >
      {url ? <audio controls preload="metadata" src={url} className="h-8 max-w-[180px]" /> : <Play size={16} className="fill-current" />}
      <span className="flex h-5 items-center gap-[2px]">
        {bars.map((h, i) => (
          <span key={i} className="w-[2px] rounded-full bg-current opacity-80" style={{ height: h }} />
        ))}
      </span>
      <span className="text-xs tabular-nums">
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </span>
      {!url && <Mic size={12} className="opacity-60" />}
    </span>
  );
}
