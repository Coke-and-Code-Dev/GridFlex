"""PDF rendering for multi-site simulations."""
from dataclasses import dataclass
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas

from api.schemas import Scenario
from gridflex.grid_area import AreaInfo

INK = colors.HexColor("#23232C")
MUTED = colors.HexColor("#555565")
GRID = colors.HexColor("#DADAE2")
YELLOW = colors.HexColor("#FFE600")
GOLD = colors.HexColor("#8B6800")
RED = colors.HexColor("#B52840")
WIDTH, HEIGHT = A4
MARGIN = 42


@dataclass
class SiteResult:
    name: str
    scenario: Scenario
    area: AreaInfo | None
    payload: dict[str, Any] | None = None
    error: str = ""


def _text(pdf, x, y, value, size=10, bold=False, color=INK):
    pdf.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    pdf.setFillColor(color)
    pdf.drawString(x, y, str(value))


def _paragraph(pdf, x, y, value, size=10):
    line = ""
    pdf.setFont("Helvetica", size)
    for word in value.split():
        candidate = f"{line} {word}".strip()
        if pdf.stringWidth(candidate, "Helvetica", size) > WIDTH - MARGIN - x and line:
            _text(pdf, x, y, line, size)
            y -= size + 4
            line = word
        else:
            line = candidate
    if line:
        _text(pdf, x, y, line, size)
    return y - size - 4


def _header(pdf, label):
    pdf.setFillColor(INK)
    pdf.rect(0, HEIGHT - 110, WIDTH, 110, fill=1, stroke=0)
    _text(pdf, MARGIN, HEIGHT - 46, "GridFlex.ai", 26, True, YELLOW)
    _text(pdf, MARGIN, HEIGHT - 76, label, 14, color=colors.white)
    _text(pdf, MARGIN, 34, "Synthetic building demand and simulation. Check capacity with the grid operator.", 8, color=MUTED)
    _text(pdf, WIDTH - MARGIN - 16, 34, pdf.getPageNumber(), 8, color=MUTED)


def _chart(pdf, top, title, series, unit):
    _text(pdf, MARGIN, top, title, 13, True)
    x, y, width, height = MARGIN + 38, top - 143, WIDTH - 2 * MARGIN - 48, 118
    maximum = max(1, *(max(values) for _, values, _ in series))
    for fraction in (0, .5, 1):
        level = y + fraction * height
        pdf.setStrokeColor(GRID)
        pdf.setLineWidth(.5)
        pdf.line(x, level, x + width, level)
        _text(pdf, MARGIN, level - 2, f"{maximum * fraction:.0f}", 8, color=MUTED)
    _text(pdf, MARGIN, y + height + 6, unit, 8, color=MUTED)
    for index, tick in enumerate(("12:00", "18:00", "00:00", "06:00", "12:00")):
        _text(pdf, x + index * width / 4 - 10, y - 14, tick, 8, color=MUTED)
    for index, (name, values, color) in enumerate(series):
        points = [(x + i * width / 96, y + value * height / maximum) for i, value in enumerate(values)]
        path = pdf.beginPath()
        path.moveTo(*points[0])
        for point in points[1:]:
            path.lineTo(*point)
        path.lineTo(x + width, points[-1][1])
        pdf.setStrokeColor(color)
        pdf.setLineWidth(1.4)
        pdf.setDash(4, 2) if color == RED else pdf.setDash()
        pdf.drawPath(path)
        pdf.setDash()
        _text(pdf, MARGIN + index * 160, y - 31, name, 9, color=color)


def _site_page(pdf, site):
    _header(pdf, "Site analysis")
    scenario, area = site.scenario, site.area
    y = _paragraph(pdf, MARGIN, HEIGHT - 142, f"{site.name}  |  {scenario.postcode}", 16)
    location = f"{area.municipality or area.area_name or 'Area unknown'}, {area.province or 'province unknown'}" if area else "No matching capacity-map entry"
    y = _paragraph(pdf, MARGIN, y - 6, location)
    if area:
        y = _paragraph(pdf, MARGIN, y, f"Map: {area.status.replace('_', ' ')} | Operator: {area.operator or 'unknown'} | Date: {area.data_date}")
    y = _paragraph(pdf, MARGIN, y - 6, f"{scenario.vans} vans | Firm limit {scenario.limit_kw:g} kW | Off-peak uplift {scenario.extra_kw:g} kW ({scenario.off_peak[0]} to {scenario.off_peak[1]}) | Battery {scenario.battery_kwh:g} kWh / {scenario.battery_kw} kW")
    y = _paragraph(pdf, MARGIN, y, f"Profile {scenario.category}, {scenario.month}, level {scenario.level} | Caution {scenario.q:.2f} | Risk tolerance {scenario.tolerance:.0%}")
    if site.payload is None:
        _paragraph(pdf, MARGIN, y - 20, f"No simulation result: {site.error}", 12)
        pdf.showPage()
        return
    data = site.payload
    plan, replay = data["schedule"], data["report"]
    full = sum(short == 0 for short in plan["unmet_kwh"])
    shortfall = sum(plan["unmet_kwh"])
    immediate = replay["immediate"]
    y = _paragraph(pdf, MARGIN, y - 10, f"{replay['verdict'].replace('_', ' ').upper()} | {full}/{scenario.vans} vans fully charged | {shortfall:.2f} kWh unmet | {plan['status']}", 11)
    y = _paragraph(pdf, MARGIN, y, f"{replay['days_over_pct']:.2f}% of {replay['n_windows']} synthetic windows exceed the limit, versus {immediate['days_over_pct']:.2f}% with immediate charging. Worst overshoot: {replay['worst_overshoot_kw']:.2f} kW" + (f" at {replay['worst_overshoot_time']}." if replay['worst_overshoot_time'] else "."))
    baseline = data["baseline_kw"]
    scheduled = [base + sum(row[i] for row in plan["power"]) + plan["battery_charge"][i] - plan["battery_discharge"][i] for i, base in enumerate(baseline)]
    naive = [base + power for base, power in zip(baseline, data["immediate_power_kw"])]
    _chart(pdf, y - 19, "Planned demand versus immediate charging", [
        ("Optimized demand", scheduled, GOLD), ("Immediate charging", naive, MUTED), ("Connection limit", data["limit_kw"], RED),
    ], "kW")
    _chart(pdf, y - 221, "When limit breaches occur in the replay", [
        ("Affected test windows", replay["over_by_slot"], RED),
    ], "count")
    if scenario.battery_kwh:
        _paragraph(pdf, MARGIN, y - 410, "Battery replay clips negative net demand and does not recalculate battery state for each test window.", 8)
    pdf.showPage()


def render_portfolio(sites: list[SiteResult]) -> bytes:
    target = BytesIO()
    pdf = Canvas(target, pagesize=A4)
    pdf.setTitle("GridFlex.ai multi-site simulation")
    completed = [site for site in sites if site.payload is not None]
    total = sum(site.scenario.vans for site in completed)
    fully_charged = sum(sum(short == 0 for short in site.payload["schedule"]["unmet_kwh"]) for site in completed)
    unmet = sum(sum(site.payload["schedule"]["unmet_kwh"]) for site in completed)
    fits = sum(site.payload["report"]["verdict"] == "fits" for site in completed)
    for start in range(0, len(sites), 17):
        _header(pdf, "Multi-site charging simulation")
        _text(pdf, MARGIN, HEIGHT - 145, "Portfolio overview", 20, True)
        _paragraph(pdf, MARGIN, HEIGHT - 173, f"{len(completed)}/{len(sites)} sites simulated. {fits} fit their chosen risk tolerance and meet all fleet needs. {fully_charged}/{total} vans at completed sites receive all requested energy, with {unmet:.2f} kWh unmet.")
        _paragraph(pdf, MARGIN, HEIGHT - 217, "Each site's breach rate comes from its own held-out synthetic windows. Site results describe independent depot scenarios.")
        y = HEIGHT - 266
        for x, label in ((MARGIN, "Depot / postcode"), (268, "Vans full"), (350, "Unmet kWh"), (440, "Breach rate")):
            _text(pdf, x, y, label, 9, True)
        y -= 22
        for site in sites[start:start + 17]:
            pdf.setStrokeColor(GRID)
            pdf.line(MARGIN, y - 7, WIDTH - MARGIN, y - 7)
            label = f"{site.name[:24]} / {site.scenario.postcode}"
            _text(pdf, MARGIN, y, label, 9)
            if site.payload:
                shorts = site.payload["schedule"]["unmet_kwh"]
                rate = site.payload["report"]["days_over_pct"]
                _text(pdf, 268, y, f"{sum(short == 0 for short in shorts)}/{len(shorts)}", 9)
                _text(pdf, 350, y, f"{sum(shorts):.2f}", 9)
                _text(pdf, 440, y, f"{rate:.2f}%", 9)
                pdf.setFillColor(YELLOW)
                pdf.rect(486, y, rate * .6, 6, fill=1, stroke=0)
            else:
                _text(pdf, 268, y, "No result. See site page.", 9, color=RED)
            y -= 25
        pdf.showPage()
    for site in sites:
        _site_page(pdf, site)
    pdf.save()
    return target.getvalue()
