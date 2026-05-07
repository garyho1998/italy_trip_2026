#!/usr/bin/env python3
"""
Budget enrichment v3 — add empty price slots to all the lunch/dinner/snack
items (and a few sights/transports) that are paid but lack a price field.

Idempotent: if an item already has a price, it's left alone. The price slot
is `{amount: null, currency: "EUR"}` — the row will display "Add price" on
the budget page until the user fills it in.

Run from project root:
    python3 scripts/migrate-budget-data-v3.py
"""
import json
import os

JSON_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'itinerary.json')

# (day, time, expected_keyword_in_activity, optional_default_currency)
# Only items that are unambiguously paid expenses go here.
NULL_PRICE_SLOTS = [
    # Day 1 — Rome arrival
    (1,  '08:00', 'Leonardo Express',       'EUR'),
    (1,  '13:00', 'Sora Lella',              'EUR'),
    (1,  '20:00', 'Welcome Dinner',          'EUR'),
    # Day 2 — Vatican / Rome
    (2,  '13:00', 'Trionfale lunch',         'EUR'),
    (2,  '16:00', 'Castel Sant',             'EUR'),  # Castel Sant'Angelo
    (2,  '20:00', 'Farewell Rome Dinner',    'EUR'),
    # Day 3 — Rome
    (3,  '20:30', 'La Campana',              'EUR'),
    # Day 4 — Rome -> Naples
    (4,  '12:30', 'Authentic Neapolitan',    'EUR'),
    (4,  '14:30', 'Naples Archaeological',   'EUR'),
    (4,  '19:00', "Castel Sant'Elmo",        'EUR'),
    (4,  '21:00', 'Naples Seafood Dinner',   'EUR'),
    # Day 5 — Capri
    (5,  '12:30', 'Lunch with a View',       'EUR'),
    (5,  '17:00', 'Anacapri',                'EUR'),
    (5,  '20:00', 'Naples Dinner',           'EUR'),
    # Day 6 — Amalfi
    (6,  '13:30', 'Amalfi Town',             'EUR'),  # includes lunch
    (6,  '20:30', 'Late Naples Dinner',      'EUR'),
    # Day 7 — Pompeii
    (7,  '09:30', 'Circumvesuviana',         'EUR'),
    (7,  '14:00', 'Lunch near Pompeii',      'EUR'),
    # Day 8 — Naples -> Bari
    (8,  '12:00', 'Bari Lunch',              'EUR'),
    (8,  '15:00', 'Train to Polignano',      'EUR'),
    (8,  '20:00', 'Cliff-edge Seafood',      'EUR'),
    # Day 9 — Bari / Polignano
    (9,  '12:00', 'Lunch in Polignano',      'EUR'),
    (9,  '20:00', 'Farewell Puglia Dinner',  'EUR'),
    # Day 10 — Bari -> Rome
    (10, '11:30', 'Quick Lunch',             'EUR'),
    (10, '20:30', 'Final Italian Farewell',  'EUR'),
    (10, '22:30', 'Giolitti',                'EUR'),
    # Day 11 — Departure
    (11, '10:00', 'Rome Fiumicino',          'EUR'),  # taxi to FCO
]


def en(v):
    if v is None: return ''
    if isinstance(v, dict): return v.get('en','') or v.get('zh','')
    return str(v)


def main():
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    changes = []
    skipped = []

    for day_num, time, kw, currency in NULL_PRICE_SLOTS:
        day = next((d for d in data['days'] if d.get('number') == day_num), None)
        if not day:
            skipped.append(f"Day {day_num} not found")
            continue
        item = next((it for it in day.get('timeline', [])
                     if it.get('time') == time and kw.lower() in en(it.get('activity')).lower()), None)
        if not item:
            skipped.append(f"Day {day_num} {time} '{kw}' not matched")
            continue
        if item.get('price') is not None:
            skipped.append(f"Day {day_num} {time} already has price={item['price'].get('amount')}")
            continue
        item['price'] = {'amount': None, 'currency': currency}
        changes.append(f"  Day {day_num} {time} '{kw}'  ({en(item.get('activity'))[:50]})")

    if skipped:
        print("Skipped:")
        for s in skipped:
            print(f"  [SKIP] {s}")
        print()

    if not changes:
        print("Nothing changed.")
        return

    print(f"Added empty price slot to {len(changes)} items:")
    for c in changes:
        print(c)

    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print(f"\n[OK] Wrote {JSON_PATH}")


if __name__ == '__main__':
    main()
