import { HOURS, ARRIVE, DEPART } from "@/lib/sim";

const W = 720, H = 260, P = 36;

export function LoadChart({ series, limit, title }: { series: { label: string; data: number[]; cls: string; dash?: string }[]; limit: number; title: string }) {
  const max = Math.max(limit * 1.15, ...series.flatMap((s) => s.data));
  const x = (i: number) => P + (i * (W - P * 2)) / 23;
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const ly = y(limit);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="w-full">
        <rect x={x(ARRIVE)} y={P} width={x(DEPART) - x(ARRIVE)} height={H - P * 2} className="fill-muted/40" />
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={P} x2={W - P} y1={y(max * t)} y2={y(max * t)} className="stroke-border" strokeWidth={0.5} />
            <text x={4} y={y(max * t) + 4} className="fill-muted-foreground font-mono text-[10px]">{Math.round(max * t)}</text>
          </g>
        ))}
        {HOURS.map((h, i) => i % 3 === 0 && (
          <text key={i} x={x(i)} y={H - 10} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">{String(h).padStart(2, "0")}:00</text>
        ))}
        {series.map((s) => (
          <polyline key={s.label} fill="none" strokeWidth={2.5} strokeDasharray={s.dash} className={s.cls} points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
        ))}
        <line x1={P} x2={W - P} y1={ly} y2={ly} className="stroke-destructive" strokeWidth={1.5} strokeDasharray="6 4" />
        <text x={W - P} y={ly - 6} textAnchor="end" className="fill-destructive font-mono text-[11px]">grid limit {limit} kW</text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-2">
            <svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" strokeWidth="3" strokeDasharray={s.dash} className={s.cls} /></svg>
            {s.label}
          </span>
        ))}
        <span>Shaded: vans on site (18:00–07:00)</span>
      </figcaption>
    </figure>
  );
}

export function Heatmap({ schedule, needs, chargerKw }: { schedule: number[][]; needs: number[]; chargerKw: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] font-mono text-[10px]" aria-label="Optimized per-van charging schedule, kW per hour (synthetic)">
        <thead>
          <tr>
            <th className="text-left font-normal text-muted-foreground">Van</th>
            {HOURS.map((h, i) => (
              <th key={i} className="font-normal text-muted-foreground">{i % 2 === 0 ? String(h).padStart(2, "0") : ""}</th>
            ))}
            <th className="pl-2 text-right font-normal text-muted-foreground">Delivered</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((row, v) => {
            const got = row.reduce((a, b) => a + b, 0);
            return (
              <tr key={v}>
                <td className="pr-2 text-muted-foreground">V{String(v + 1).padStart(2, "0")}</td>
                {row.map((kw, i) => (
                  <td key={i} title={`${kw.toFixed(1)} kW`} className="h-4 min-w-3 rounded-sm bg-primary" style={{ opacity: kw ? 0.15 + 0.85 * (kw / chargerKw) : 0.06 }} />
                ))}
                <td className={`pl-2 text-right ${got + 0.01 >= (needs[v] ?? 0) ? "text-success" : "text-destructive"}`}>{Math.round(got)}/{needs[v]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
