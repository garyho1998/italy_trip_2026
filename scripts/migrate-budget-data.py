#!/usr/bin/env python3
"""
One-time data migration for the budget feature. Edits data/itinerary.json
in place:

1. Timeline prices:
   - Range strings ("€20-25", "€20–25") -> high-end as a number (25)
   - perPerson:true -> multiply amount by travelers (6), drop the flag
   - All prices get currency:"EUR" (the JSON's seed currency)
   - amount becomes a number (or null if unparseable)

2. Add top-level "travelers": 6

3. Add top-level "preTrip" block (outbound Cathay CX293 round trip,
   amount:null since the actual paid HKD figure should come from the
   user via the budget page).

4. Add stay.budgetAmount:null, stay.budgetCurrency:"EUR" on the first
   day of each stay group (consecutive days sharing the same stay.name).

Idempotent: re-running detects already-migrated fields and skips them.

Run from project root:
    python3 scripts/migrate-budget-data.py
"""

import json
import re
import os
import sys

JSON_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'itinerary.json')


def en(v):
    if v is None:
        return ''
    if isinstance(v, dict):
        return v.get('en', '') or v.get('zh', '')
    return str(v)


def parse_amount(s):
    """Parse '€20-25' -> 25 (high-end). '€10' -> 10. Returns int, or None."""
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return int(s)
    s = str(s).strip()
    if not s:
        return None
    s = re.sub(r'[€$¥£,]', '', s).strip()
    # Range using -, en-dash, em-dash or ~
    m = re.match(r'^\s*(\d+(?:\.\d+)?)\s*[-–—~]\s*(\d+(?:\.\d+)?)\s*$', s)
    if m:
        return int(round(float(m.group(2))))
    m = re.match(r'^\s*(\d+(?:\.\d+)?)\s*$', s)
    if m:
        return int(round(float(m.group(1))))
    return None


def migrate():
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    travelers = 6
    changes = []

    # 1. Timeline prices
    for d in data.get('days', []):
        for item in d.get('timeline', []):
            p = item.get('price')
            if not p:
                continue
            amt = p.get('amount')
            cur = p.get('currency')
            pp = p.get('perPerson', False)
            # Already migrated?
            if cur and isinstance(amt, (int, float, type(None))) and 'perPerson' not in p:
                continue
            num = parse_amount(amt)
            multiplied = False
            if pp and num is not None:
                num *= travelers
                multiplied = True
            new_price = {'amount': num, 'currency': 'EUR'}
            if 'note' in p:
                new_price['note'] = p['note']
            item['price'] = new_price
            tag = ' (×6)' if multiplied else ''
            changes.append(
                f"  Day {d['number']} {item['time']}: {amt!r} (perPerson={pp}) -> amount={num}{tag} EUR"
            )

    # 2. Travelers
    if 'travelers' not in data:
        data['travelers'] = travelers
        changes.append(f"  Added top-level travelers: {travelers}")

    # 3. Pre-trip
    if 'preTrip' not in data:
        data['preTrip'] = {
            'title': {'en': 'Pre-trip', 'zh': '出發前'},
            'date': {'en': 'June 2, Tuesday', 'zh': '6月2日，星期二'},
            'timeline': [
                {
                    'time': '23:50',
                    'activity': {
                        'en': '✈️ Cathay CX293 — HK → Rome (round trip incl. CX292 return)',
                        'zh': '✈️ 國泰 CX293 — 香港 → 羅馬（來回機票，包括 CX292 回程）',
                    },
                    'info': {
                        'en': 'HKG 23:50 (Jun 2) → FCO 06:30 (Jun 3). Return: CX292 Jun 13. Booking ref: E22Y7L.',
                        'zh': 'HKG 23:50（6月2日） → FCO 06:30（6月3日）。回程：CX292 6月13日。預訂編號：E22Y7L。',
                    },
                    'price': {'amount': None, 'currency': 'HKD'},
                }
            ],
        }
        changes.append("  Added top-level preTrip block (Cathay CX293 placeholder)")

    # 4. Hotel budget on first day of each stay group
    prev_stay = None
    for d in data.get('days', []):
        stay = d.get('stay') or {}
        stay_name = en(stay.get('name', ''))
        if not stay_name:
            prev_stay = stay_name
            continue
        is_first = stay_name != prev_stay
        prev_stay = stay_name
        if is_first and 'budgetAmount' not in stay:
            stay['budgetAmount'] = None
            stay['budgetCurrency'] = 'EUR'
            changes.append(
                f"  Day {d['number']}: '{stay_name[:50]}' marked as first-of-group (budgetAmount: null)"
            )

    if not changes:
        print("No changes — JSON already migrated.")
        return False

    print("Changes:")
    for c in changes:
        print(c)

    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print(f"\n[OK] Wrote {JSON_PATH}")
    return True


if __name__ == '__main__':
    migrate()
