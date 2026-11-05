const W = 720, H = 260, P = 36;

export function LoadChart({ series, limit, title, band, stacked, startHour = 12 }: {
  series: { label: string; data: number[]; cls: string; dash?: string }[];
  limit?: number[]; title: string; band?: [number[], number[]]; stacked?: [number[], number[]]; startHour?: number;
}) {
  const slots = Math.max(...series.map(({ data }) => data.length), 2);
  const validSeries = series.filter(({ data }) => data.length > 0 && data.every(Number.isFinite));
  const max = Math.max(1, ...validSeries.flatMap(({ data }) => data), ...(limit ?? []), ...(band?.flat() ?? []), ...(stacked?.flat() ?? []));
  const x = (i: number) => P + (i * (W - P * 2)) / (slots - 1);
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const points = (values: number[]) => values.map((v, i) => `${x(i)},${y(v)}`);
  const area = (values: [number[], number[]]) => [...points(values[1]), ...points(values[0]).reverse()].join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="w-full">
        {band && <polygon points={area(band)} className="fill-muted-foreground/20" />}
        {stacked && <polygon points={area(stacked)} className="fill-primary/20" />}
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={P} x2={W - P} y1={y(max * t)} y2={y(max * t)} className="stroke-border" strokeWidth={0.5} />
            <text x={4} y={y(max * t) + 4} className="fill-muted-foreground font-mono text-[10px]">{Math.round(max * t)}</text>
          </g>
        ))}
        {Array.from({ length: 8 }, (_, i) => (startHour + i * 3) % 24).map((h, i) => (
          <text key={i} x={x(i * 12)} y={H - 10} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">{String(h).padStart(2, "0")}:00</text>
        ))}
        {validSeries.map((s) => (
          <polyline key={s.label} fill="none" strokeWidth={2.5} strokeDasharray={s.dash} className={s.cls} points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
        ))}
        {limit && <polyline fill="none" points={points(limit).join(" ")} className="stroke-destructive" strokeWidth={1.5} strokeDasharray="6 4" />}
      </svg>
      {validSeries.length !== series.length && <p role="status" className="text-sm text-muted-foreground">Some chart data is unavailable. Rerun after restarting the GridFlex API.</p>}
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {validSeries.map((s) => (
          <span key={s.label} className="flex items-center gap-2">
            <svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" strokeWidth="3" strokeDasharray={s.dash} className={s.cls} /></svg>
            {s.label}
          </span>
        ))}
        {limit && <span>Dashed red: connection limit</span>}
        {band && <span>Grey band: p10–p90 profile</span>}
        {stacked && <span>Yellow area: planned van charging</span>}
      </figcaption>
    </figure>
  );
}

export function Heatmap({ schedule, needs, chargerKw }: { schedule: number[][]; needs: number[]; chargerKw: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] font-mono text-[10px]" aria-label="Optimized per-van charging schedule, kW per 15-minute slot (synthetic)">
        <thead>
          <tr>
            <th className="text-left font-normal text-muted-foreground">Van</th>
            {Array.from({ length: schedule[0]?.length ?? 0 }, (_, i) => (12 + Math.floor(i / 4)) % 24).map((h, i) => (
              <th key={i} className="font-normal text-muted-foreground">{i % 12 === 0 ? String(h).padStart(2, "0") : ""}</th>
            ))}
            <th className="pl-2 text-right font-normal text-muted-foreground">Delivered / needed (kWh)</th><th>Short (kWh)</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((row, v) => {
            const got = row.reduce((a, b) => a + b, 0) / 4;
            return (
              <tr key={v}>
                <td className="pr-2 text-muted-foreground">V{String(v + 1).padStart(2, "0")}</td>
                {row.map((kw, i) => (
                  <td key={i} title={`${kw.toFixed(1)} kW`} className="h-4 min-w-3 rounded-sm bg-primary" style={{ opacity: kw ? 0.15 + 0.85 * (kw / chargerKw) : 0.06 }} />
                ))}
                <td className={`pl-2 text-right ${got + 0.01 >= (needs[v] ?? 0) ? "text-success" : "text-destructive"}`}>{got.toFixed(2)}/{needs[v]}</td>
                <td className="text-right">{Math.max(0, (needs[v] ?? 0) - got).toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
