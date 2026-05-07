#!/usr/bin/env python3
"""
Budget data enrichment (run after migrate-budget-data.py).

1. Add price fields to specific timeline items (transport + sights with known
   per-person pricing from budget.html). Skips any item that already has a
   price (idempotent).

2. Seed hotel budgetAmount on the first day of each stay group. Only sets
   when currently null (idempotent).

3. Seed outbound flight HKD total in preTrip.timeline. Only sets when null.

Per-person prices are converted to group totals (× travelers, default 6).

Run:
    python3 scripts/migrate-budget-data-v2.py
"""
import json
import os

JSON_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'itinerary.json')
TRAVELERS = 6

# (day, time, expected_keyword_in_activity, price_per_person_eur, source_note)
TIMELINE_PRICE_SEEDS = [
    (4, '10:00',  'High-Speed Train',         22, 'Trenitalia €21.90/pp booked'),
    (5, '07:30',  'Ferry to Capri',           40, 'Caremar/SNAV round-trip €30-50/pp'),
    (5, '08:30',  'Blue Grotto',              25, 'Entry + boat €18-25/pp'),
    (5, '15:30',  'Chairlift',                18, 'Monte Solaro chairlift €18/pp'),
    (8, '08:30',  'MarinoBus',                15, 'MarinoBus €14.83/pp booked'),
    (9, '14:00',  'Alberobello',              35, 'GetYourGuide tour ~€25-35/pp'),
    (10, '13:15', 'FlixBus',                  15, 'FlixBus €14.66/pp booked'),
]

# (day, hotel_total_eur, source_note)
HOTEL_BUDGET_SEEDS = {
    1:  (1350, 'Rome Airbnb 3 nights × 3 rooms × ~€150/night'),
    4:  (1440, 'Naples Airbnb 4 nights × 3 rooms × ~€120/night'),
    8:  (480,  'Bari Airbnb 2 nights × 3 rooms × ~€80/night'),
    10: (390,  'Champagne Palace 1 night × 3 rooms × ~€130/night'),
}

# Outbound flight HKD (round-trip, total for 6)
FLIGHT_HKD_TOTAL = 49590  # 8265/pp × 6, Cathay E22Y7L


def en(v):
    if v is None: return ''
    if isinstance(v, dict): return v.get('en','') or v.get('zh','')
    return str(v)


def main():
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    changes = []

    # 1. Timeline price seeds
    for day_num, time, kw, pp_eur, note in TIMELINE_PRICE_SEEDS:
        day = next((d for d in data['days'] if d.get('number') == day_num), None)
        if not day:
            changes.append(f"  [SKIP] Day {day_num} not found")
            continue
        item = next((it for it in day.get('timeline', [])
                     if it.get('time') == time and kw.lower() in en(it.get('activity')).lower()), None)
        if not item:
            changes.append(f"  [SKIP] Day {day_num} {time} '{kw}' not matched")
            continue
        if item.get('price') is not None:
            changes.append(f"  [SKIP] Day {day_num} {time} '{kw}' already priced")
            continue
        item['price'] = {
            'amount': pp_eur * TRAVELERS,
            'currency': 'EUR',
            'note': {'en': note, 'zh': note}
        }
        changes.append(f"  Day {day_num} {time} '{kw}' -> €{pp_eur*TRAVELERS} ({pp_eur}×{TRAVELERS})")

    # 2. Hotel budgetAmount seeds
    for day_num, (total_eur, note) in HOTEL_BUDGET_SEEDS.items():
        day = next((d for d in data['days'] if d.get('number') == day_num), None)
        if not day:
            changes.append(f"  [SKIP] Day {day_num} not found for hotel seed")
            continue
        stay = day.get('stay') or {}
        if 'budgetAmount' not in stay:
            changes.append(f"  [SKIP] Day {day_num} stay has no budgetAmount slot (run v1 migration first)")
            continue
        if stay['budgetAmount'] is not None:
            changes.append(f"  [SKIP] Day {day_num} hotel already has budgetAmount={stay['budgetAmount']}")
            continue
        stay['budgetAmount'] = total_eur
        stay['budgetCurrency'] = 'EUR'
        changes.append(f"  Day {day_num} hotel -> €{total_eur} ({note})")

    # 3. Outbound flight HKD
    pre = data.get('preTrip', {})
    if pre.get('timeline'):
        flight_item = pre['timeline'][0]
        p = flight_item.get('price') or {}
        if p.get('amount') is None:
            flight_item['price'] = {
                'amount': FLIGHT_HKD_TOTAL,
                'currency': 'HKD',
                'note': {'en': 'Cathay round-trip × 6 (HKD 8,265/pp, ref E22Y7L)',
                         'zh': '國泰來回 × 6（每人 HKD 8,265，預訂編號 E22Y7L）'}
            }
            changes.append(f"  Pre-trip flight -> HKD {FLIGHT_HKD_TOTAL}")
        else:
            changes.append(f"  [SKIP] Pre-trip flight already has amount={p.get('amount')}")

    if not changes:
        print("Nothing to change.")
        return

    print("Changes:")
    for c in changes:
        print(c)

    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print(f"\n[OK] Wrote {JSON_PATH}")


if __name__ == '__main__':
    main()
