import { useId } from "react";

export function Help({ label, text }: { label: string; text: string }) {
  const id = useId();
  return <>
    <button type="button" popoverTarget={id} aria-label={`Help: ${label}`}
      className="ml-1 inline-grid size-6 shrink-0 place-items-center rounded-full border border-primary/50 text-xs font-semibold text-primary hover:bg-primary/15">?</button>
    <span id={id} popover="auto" role="group" aria-label={label}
      className="fixed inset-x-0 bottom-6 top-auto mx-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-primary/50 bg-card p-4 text-left font-sans text-sm font-normal normal-case tracking-normal text-foreground shadow-2xl">
      <span className="flex items-center justify-between gap-4">
        <strong>{label}</strong>
        <button type="button" popoverTarget={id} popoverTargetAction="hide" className="rounded px-2 py-1 text-primary hover:bg-primary/15">Close</button>
      </span>
      <span className="mt-2 block leading-relaxed text-muted-foreground">{text}</span>
    </span>
  </>;
}

export const helpText: Record<string, string> = {
  "Postcode": "Looks up local grid congestion. The area card is for context. The connection limit you enter controls the scheduling calculation.",
  "Business profile": "Chooses a synthetic building electricity profile by business sector, month, and approximate monthly use. It represents the building before any van charging is added.",
  "Fleet size": "How many vans need to charge. More vans generally require more energy and may leave some vans short.",
  "Connection limit": "The site's contracted power cap in kW. Building demand, van charging, and battery charging share this cap.",
  "Off-peak uplift": "Extra contracted power, in kW, available only during the off-peak window. Use zero if the contract has a single limit.",
  "Charger power": "The maximum charging rate for one van in kW. Higher power can fill a van faster when the site has spare capacity.",
  "Battery capacity": "How much energy the site battery can store, in kWh. Set both battery fields to zero to test without a battery.",
  "Battery power": "How fast the battery can charge or discharge, in kW. Set both battery fields to zero to test without a battery.",
  "Caution quantile": "How busy a building profile the scheduler plans against. At 0.90, the planning load for each time slot is the 90th percentile of the planning samples. A higher value usually leaves less room for vans.",
  "Risk tolerance": "The maximum percentage of test windows with a breach you consider acceptable. It changes how the verdict describes risk. It does not raise the connection limit.",
  "Arrival window": "The earliest and latest times vans can arrive. Each generated van can charge only after its own arrival.",
  "Departure window": "The earliest and latest times vans may leave. The schedule must deliver each van's requested energy before its own departure.",
  "Off-peak window": "The start and end times for the extra contracted capacity. The window can run across midnight.",
  "Energy per van": "The maximum energy a generated van needs, in kWh. The demo varies each request between this value and up to 10 kWh below it.",
  "Individual vans": "Run Optimize to generate the fleet, then override a van's arrival, departure, energy or charger power and rerun. Slot 0 is noon, slot 24 is 18:00, and slot 96 is noon the next day.",
  "Scenario presets": "Load example inputs for the baseline demo, a tighter connection, or a tighter connection with battery support. Press Optimize to run the selected inputs.",
  "Optimize": "Plans charging for the current inputs, then checks that schedule on separate synthetic building profiles. Edit the inputs and run again to compare.",
  "Your area": "Shows the grid operator's dated congestion map and any area-wide waiting list. A postcode's status and the area's queue are separate pieces of information.",
  "Windows over limit": "Percentage of held-out noon-to-noon test windows in which site demand exceeded the connection limit at least once.",
  "Worst overshoot": "The largest amount, in kW, by which demand exceeded the limit in any test slot. A value of zero means no breach was observed.",
  "Held-out windows": "Synthetic noon-to-noon load windows that were reserved for testing and excluded from planning.",
  "Vans fully charged": "How many vans receive all the energy they asked for in the planned schedule.",
  "kWh short": "Total requested energy the schedule could not deliver before vans depart. Zero means all planned charging needs are met.",
  "Verdict and solver": "The verdict considers both replay risk and charging shortfalls. OPTIMAL means the solver proved its objectives. FEASIBLE means it found a usable schedule without proving optimality.",
  "Demand chart": "Read left to right from noon to noon. The grey band shows typical building demand, the baseline is the cautious planning load, and the dashed red line is the connection limit. Compare immediate plug-in charging with optimized net demand, which includes battery flow when enabled.",
  "Van schedule": "Each row is a van and each square is a 15-minute slot. Brighter yellow means more charging power. The right columns show delivered energy, requested energy, and any shortfall.",
  "Approve / Reject": "Records whether you would use this simulated plan in this session. A new Optimize run or a page refresh clears the choice. The buttons do not operate equipment.",
  "Download schedule (CSV)": "Downloads one row per van and 15-minute slot, with the slot time, charging power in kW, and energy in kWh.",
  "Explanation and follow-up": "Summarizes the computed results and compares them with the previous run. Ask about risk, individual vans, or battery use. Answers come from local templates.",
  "Worst overshoot time": "The clock time when the largest breach occurred across the test windows. This can differ from the time with the most frequent breaches.",
  "Baseline alone over limit": "Percentage of test windows where the building exceeded the limit even without van charging or battery operation.",
  "Blocked planning slots": "Time slots where the returned plan is above the solver's rounded planning cap.",
  "Vans with shortfalls": "Each van that leaves with less energy than requested, with the missing energy in kWh.",
  "Breach timing chart": "At each time of day, the height shows how many held-out windows exceeded the limit at that time. Use it to see when breaches cluster.",
  "Battery chart": "Shows energy stored in the site battery throughout the planned window. It rises as the battery charges and falls as it supplies energy.",
  "Exploratory sweeps": "Reruns the scenario at different fleet counts or battery sizes. The smallest tested fit meets both the risk tolerance and the vans' energy needs.",
  "Reality check": "Compares the shape of a typical synthetic GLASS working day with a Liander reference. The curves are scaled to compare shape and run midnight to midnight.",
};
