import { useState, type Dispatch, type SetStateAction } from "react";
import { api, type Condition, type LoadSource, type MeterUpload, type Scenario } from "@/types";
import { Help, helpText } from "@/components/gridflex/Help";

const SOURCES: [LoadSource, string][] = [
  ["meter", "My meter data"],
  ["bill", "Sector + monthly bill"],
  ["profile", "Demo profile"],
];

const select = "rounded border border-input bg-background p-2";
const key = (c: Pick<Condition, "category" | "month" | "level">) =>
  `${c.category}/${c.month}/${c.level}`;
const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

function Hint({ label }: { label: string }) {
  return <Help label={label} text={helpText[label] ?? ""} />;
}

/** Where the building's own electricity use comes from: own meter data, sector + bill, or a demo profile. */
export function BuildingLoad({
  cfg,
  setCfg,
  conditions,
  disabled,
}: {
  cfg: Scenario;
  setCfg: Dispatch<SetStateAction<Scenario>>;
  conditions: Condition[];
  disabled: boolean;
}) {
  const [meter, setMeter] = useState<MeterUpload>();
  const [meterFile, setMeterFile] = useState("");
  const [uploading, setUploading] = useState(false);
  const [meterError, setMeterError] = useState("");

  const sectors = [
    ...new Map(conditions.map((c) => [c.category, c.label || c.category])).entries(),
  ];
  const months = [
    ...new Set(conditions.filter((c) => c.category === cfg.category).map((c) => c.month)),
  ];
  const update = (values: Partial<Scenario>) => setCfg((old) => ({ ...old, ...values }));

  async function upload(file: File) {
    setUploading(true);
    setMeterError("");
    try {
      const result = await api<MeterUpload>("/meter-data", { csv: await file.text() });
      setMeter(result);
      setMeterFile(file.name);
      update({ load_source: "meter", meter_id: result.meter_id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Meter upload failed.";
      setMeterError(
        message === "Failed to fetch"
          ? "Could not reach the GridFlex API. Start it, then try again."
          : message,
      );
    } finally {
      setUploading(false);
    }
  }

  function choose(source: LoadSource) {
    if (source === "bill" && cfg.monthly_kwh == null) {
      const current = conditions.find((c) => key(c) === key(cfg));
      update({ load_source: source, monthly_kwh: Math.round(current?.level_value_kwh ?? 8000) });
    } else update({ load_source: source });
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-2">
          Building electricity use <Hint label="Building electricity use" />
        </legend>
        {SOURCES.map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={cfg.load_source === value}
            disabled={disabled}
            onClick={() => choose(value)}
            className={`rounded-lg px-3 py-1.5 text-sm ${cfg.load_source === value ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}
          >
            {label}
          </button>
        ))}
      </fieldset>

      {cfg.load_source === "meter" && (
        <div className="space-y-2">
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-border px-4 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-primary has-disabled:cursor-wait has-disabled:opacity-60">
            {uploading
              ? "Reading meter data…"
              : meter
                ? "Upload other meter data"
                : "Upload meter CSV"}
            <input
              className="sr-only"
              type="file"
              accept=".csv,text/csv,text/plain"
              disabled={disabled || uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
          <Hint label="Meter data" />
          <p className="text-sm text-muted-foreground">
            15-minute readings with a <code>timestamp</code> column and a <code>kw</code> (or{" "}
            <code>kwh</code> per 15 minutes) column. Kept in memory only, never saved to disk.{" "}
            <a className="underline" href="/gridflex-meter-example.csv" download>
              Example file
            </a>{" "}
            (synthetic, 12 weeks).
          </p>
          {meterError && (
            <p role="alert" className="text-sm text-destructive">
              {meterError}
            </p>
          )}
          {meter && cfg.meter_id === meter.meter_id && (
            <div role="status" className="text-sm">
              <p>
                <strong>{meterFile}</strong> · {meter.days} days, {meter.first_date} to{" "}
                {meter.last_date} · ≈ {Math.round(meter.monthly_kwh).toLocaleString("en-GB")}{" "}
                kWh/month · peak {meter.peak_kw.toFixed(1)} kW
              </p>
              <p className="text-muted-foreground">
                Plans on the {meter.planning_days} earliest working days, tests on the{" "}
                {meter.test_days} latest.
              </p>
              {meter.warnings.map((warning) => (
                <p key={warning} className="text-primary">
                  {warning}
                </p>
              ))}
            </div>
          )}
          {!meter && cfg.meter_id && (
            <p className="text-sm text-muted-foreground">Using meter data uploaded earlier.</p>
          )}
        </div>
      )}

      {cfg.load_source === "bill" && (
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            Sector
            <select
              className={select}
              value={cfg.category}
              disabled={disabled}
              onChange={(e) => {
                const category = e.target.value;
                const month =
                  conditions.find((c) => c.category === category && c.month === cfg.month)?.month ??
                  conditions.find((c) => c.category === category)?.month ??
                  cfg.month;
                update({ category, month });
              }}
            >
              {(sectors.length ? sectors : [[cfg.category, cfg.category]]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Month
            <select
              className={select}
              value={cfg.month}
              disabled={disabled}
              onChange={(e) => update({ month: e.target.value })}
            >
              {(months.length ? months : [cfg.month]).map((month) => (
                <option key={month} value={month}>
                  {monthName(month)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Monthly use from the bill
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={100}
                max={200000}
                step={100}
                className={`${select} w-32`}
                disabled={disabled}
                value={cfg.monthly_kwh ?? ""}
                onChange={(e) =>
                  update({ monthly_kwh: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
              kWh
            </span>
          </label>
          <Hint label="Monthly bill" />
          <p className="w-full text-sm text-muted-foreground">
            An estimate from similar businesses: the sector's synthetic day shape, scaled to your
            monthly use. Upload meter data for a site-specific answer.
          </p>
        </div>
      )}

      {cfg.load_source === "profile" && (
        <label>
          Demo profile{" "}
          <select
            className={select}
            value={key(cfg)}
            disabled={disabled}
            onChange={(e) => {
              const c = conditions.find((item) => key(item) === e.target.value);
              if (c) update({ category: c.category, month: c.month, level: c.level });
            }}
          >
            {(conditions.length
              ? conditions
              : [{ ...cfg, level_value_kwh: null, label: cfg.category }]
            ).map((c) => (
              <option key={key(c)} value={key(c)}>
                {c.label || c.category} · {monthName(c.month)} ·{" "}
                {c.level_value_kwh == null
                  ? `Level ${c.level}`
                  : `≈ ${(c.level_value_kwh / 1000).toFixed(1)} MWh/month`}
              </option>
            ))}
          </select>{" "}
          <Hint label="Business profile" />
        </label>
      )}
    </div>
  );
}
