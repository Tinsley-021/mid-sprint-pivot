const ENTRIES = [
  { type: 'RESERVATION', branch: 'LOS-01', sku: 'IPH15-128', delta: '-1 avail', tone: 'amber' },
  { type: 'SALE', branch: 'LOS-01', sku: 'SONY-XM5', delta: '-1 onHand', tone: 'green' },
  { type: 'RESERVATION_RELEASE', branch: 'KAD-01', sku: 'IPH15-128', delta: '+1 avail', tone: 'slate' },
  { type: 'TRANSFER_IN', branch: 'KAD-01', sku: 'IPH15-128', delta: '+5 onHand', tone: 'green' },
  { type: 'PURCHASE', branch: 'LOS-01', sku: 'SONY-XM5', delta: '+15 onHand', tone: 'green' },
  { type: 'OUT_OF_STOCK', branch: 'LOS-01', sku: 'IPH15-128', delta: '0 avail', tone: 'red' },
] as const;

const toneClass: Record<string, string> = {
  amber: 'text-amber',
  green: 'text-green',
  red: 'text-red',
  slate: 'text-slate-soft',
};

export function LedgerTicker() {
  const loop = [...ENTRIES, ...ENTRIES];
  return (
    <div className="overflow-hidden rounded-xl border border-paper-dim/15 bg-ink-soft">
      <div className="flex items-center justify-between border-b border-paper-dim/15 px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-slate-soft">
          inventory_transactions — live
        </span>
        <span className="flex h-2 w-2 rounded-full bg-green" aria-hidden />
      </div>
      <div className="relative h-72 overflow-hidden">
        <ul className="animate-ledger-scroll absolute inset-x-0 top-0 font-mono text-xs">
          {loop.map((entry, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 border-b border-paper-dim/10 px-4 py-3 text-paper/90"
            >
              <span className={`w-40 shrink-0 font-medium ${toneClass[entry.tone]}`}>{entry.type}</span>
              <span className="shrink-0 text-slate-soft">{entry.branch}</span>
              <span className="flex-1 truncate text-paper/70">{entry.sku}</span>
              <span className="shrink-0 text-paper">{entry.delta}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
