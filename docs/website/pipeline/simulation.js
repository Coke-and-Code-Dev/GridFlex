const form = document.querySelector("#sim-controls");
const chart = document.querySelector("#sim-chart");
const summary = document.querySelector("#sim-summary");
const inspection = document.querySelector("#sim-inspection");
const slots = 56;
const chargerKw = 11;
const requiredSlots = 16;
const slotEnergy = chargerKw / 4;
const baseLoad = Array.from({ length: slots }, (_, i) => i < 16 ? 45 : i < 24 ? 32 : i < 44 ? 22 : 34);
const quietFirst = [...baseLoad.keys()].sort((a, b) => baseLoad[a] - baseLoad[b]);
const energy = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

function makePlan(vanCount, limit) {
  const remaining = Array(vanCount).fill(requiredSlots);
  const active = Array(slots).fill(0);
  for (const slot of quietFirst) {
    const capacity = Math.max(0, Math.floor((limit - baseLoad[slot]) / chargerKw));
    const vans = remaining.map((_, index) => index)
      .filter(index => remaining[index] > 0)
      .sort((a, b) => remaining[b] - remaining[a])
      .slice(0, capacity);
    for (const van of vans) remaining[van]--;
    active[slot] = vans.length;
  }
  return { active, short: remaining.reduce((sum, count) => sum + count, 0) * slotEnergy };
}

function clock(slot) {
  const minutes = (18 * 60 + slot * 15) % (24 * 60);
  return [Math.floor(minutes / 60), minutes % 60].map(value => String(value).padStart(2, "0")).join(":");
}

function metrics(load, limit) {
  return {
    peak: Math.max(...load),
    breaches: load.filter(value => value > limit).length,
  };
}

function drawChart(immediate, planned, limit, selectedSlot) {
  const top = Math.ceil(Math.max(limit, ...immediate, ...planned) / 50) * 50;
  const x = slot => 62 + slot / slots * 550;
  const y = kw => 224 - kw / top * 184;
  const stepLine = values => values.map((kw, i) => (i ? "V" : `M${x(0)},`) + y(kw) + "H" + x(i + 1)).join(" ");
  const grid = Array.from({ length: top / 50 + 1 }, (_, i) => i * 50)
    .map(kw => `<path d="M62 ${y(kw)}H612" class="sim-guide"/><text x="51" y="${y(kw) + 5}" text-anchor="end">${kw}</text>`).join("");
  chart.innerHTML = `
    <title>Site demand by time for charging on arrival and scheduled charging</title>
    <desc>The red dashed line is the site limit. The results table below gives peak demand and breach counts.</desc>
    <g class="sim-axis"><text x="25" y="24">kW</text>${grid}
      ${[0, 16, 32, 48, 56].map(slot => `<text x="${x(slot)}" y="251" text-anchor="middle">${clock(slot)}</text>`).join("")}
    </g>
    <path class="sim-limit" d="M62 ${y(limit)}H612"/>
    <path class="sim-immediate" d="${stepLine(immediate)}"/>
    <path class="sim-plan" d="${stepLine(planned)}"/>
    <path class="sim-cursor" d="M${x(selectedSlot + .5)} 40V224"/>
  `;
}

function render() {
  const vanCount = Number(form.elements.vans.value);
  const limit = Number(form.elements.limit.value);
  const extra = Number(form.elements.extra.value);
  const selectedSlot = Number(form.elements.slot.value);
  const plan = makePlan(vanCount, limit);
  const replayLoad = baseLoad.map((kw, i) => kw + (i < 16 ? extra : 0));
  const immediate = replayLoad.map((kw, i) => kw + (i < requiredSlots ? vanCount * chargerKw : 0));
  const planned = replayLoad.map((kw, i) => kw + plan.active[i] * chargerKw);
  const now = clock(selectedSlot);
  form.querySelector("#sim-vans-value").value = vanCount;
  form.querySelector("#sim-limit-value").value = limit + " kW";
  form.querySelector("#sim-extra-value").value = "+" + extra + " kW";
  form.querySelector("#sim-slot-value").value = now;
  drawChart(immediate, planned, limit, selectedSlot);
  const first = metrics(immediate, limit);
  const second = metrics(planned, limit);
  summary.innerHTML = `
    <tr><th scope="row">Peak demand</th><td>${first.peak} kW</td><td>${second.peak} kW</td></tr>
    <tr><th scope="row">15-minute slots over limit</th><td>${first.breaches} of ${slots}</td><td>${second.breaches} of ${slots}</td></tr>
    <tr><th scope="row">Energy short at departure</th><td>0 kWh</td><td>${energy.format(plan.short)} kWh</td></tr>
  `;
  inspection.textContent = `${now} · Building ${replayLoad[selectedSlot]} kW · ${plan.active[selectedSlot]} vans charging in the plan · ${planned[selectedSlot]} kW total against a ${limit} kW limit.`;
}

form.addEventListener("input", render);
form.addEventListener("reset", () => requestAnimationFrame(render));
render();
form.hidden = false;
document.querySelector("#sim-results").hidden = false;
