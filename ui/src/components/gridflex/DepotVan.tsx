export function DepotVan({ busy, hasResults }: { busy: boolean; hasResults: boolean }) {
  const state = busy ? "driving" : hasResults ? "parked" : "waiting";

  return (
    <aside className="depot-strip" data-state={state} aria-label="Depot activity">
      <div className="depot-road" aria-hidden="true">
        <svg className="depot-truck" viewBox="0 0 64 34" width="60" height="32">
          <path d="M4 6h33v5h12l10 10v6H4z" fill="currentColor" />
          <path d="M41 14h7l6 7H41z" fill="var(--primary-foreground)" />
          <path d="m24 9-8 10h6l-2 6 9-10h-6z" fill="var(--primary-foreground)" />
          <circle cx="15" cy="27" r="5" fill="var(--background)" stroke="currentColor" strokeWidth="2" />
          <circle cx="49" cy="27" r="5" fill="var(--background)" stroke="currentColor" strokeWidth="2" />
        </svg>
        <svg className="depot-charger" viewBox="0 0 26 32" width="24" height="30">
          <path d="M5 29V4h13v25M2 29h19M18 19h3v6h3V12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <rect x="8" y="8" width="7" height="5" rx="1" fill="currentColor" />
        </svg>
      </div>
      <div className="depot-message">
        <span role="status">{busy ? "Van on the move" : hasResults ? "Van parked · Results available" : "Van ready for its first run"}</span>
        {!busy && hasResults && <a className="text-primary underline underline-offset-4" href="#compare">View results ↑</a>}
      </div>
    </aside>
  );
}
