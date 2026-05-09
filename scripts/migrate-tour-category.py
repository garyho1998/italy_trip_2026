#!/usr/bin/env python3
"""
Tour category enrichment.

1. Add a new booking.category="tour" to clearly-tour items:
   - Day 6 09:00 TRAMVIA Amalfi Coast bus tour (was 'bus')
   - Day 9 10:00 Polignano boat tour (was 'attraction')
   - Day 9 14:00 Alberobello guided tour (was 'attraction')

2. Prefix Day 6 Amalfi tour items' activity (en+zh) with 'Amalfi Tour: '
   so the day-by-day timeline groups them visually as one tour.

Idempotent — re-running detects already-prefixed titles and existing categories.

Run from project root:
    python3 scripts/migrate-tour-category.py
"""
import json
import os

JSON_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'itinerary.json')

PREFIX_EN = 'Amalfi Tour: '
PREFIX_ZH = '阿馬爾菲導賞團：'

# (day, time, set_category) — set_category=None means leave alone
TOUR_BOOKINGS = [
    (6, '09:00', 'tour'),       # TRAMVIA pickup, was 'bus'
    (9, '10:00', 'tour'),       # Polignano boat, was 'attraction'
    (9, '14:00', 'tour'),       # Alberobello guided, was 'attraction'
]

# Day 6 items to prefix with "Amalfi Tour: "
AMALFI_PREFIX_TIMES = ['09:00', '10:45', '13:00', '13:30', '17:30']


def main():
    with open(JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    changes = []

    # 1. Re-categorize tour bookings
    for day_num, time, new_cat in TOUR_BOOKINGS:
        day = next((d for d in data['days'] if d.get('number') == day_num), None)
        if not day: continue
        item = next((it for it in day.get('timeline', []) if it.get('time') == time), None)
        if not item: continue
        b = item.get('booking') or {}
        old_cat = b.get('category')
        if old_cat == new_cat:
            changes.append(f"  [skip] Day {day_num} {time}: already category={new_cat}")
            continue
        b['category'] = new_cat
        item['booking'] = b
        changes.append(f"  Day {day_num} {time}: category {old_cat!r} -> {new_cat!r}")

    # 2. Prefix Day 6 Amalfi tour titles
    day6 = next((d for d in data['days'] if d.get('number') == 6), None)
    if day6:
        for it in day6.get('timeline', []):
            if it.get('time') not in AMALFI_PREFIX_TIMES:
                continue
            act = it.get('activity') or {}
            if not isinstance(act, dict):
                continue
            en = act.get('en', '')
            zh = act.get('zh', '')
            if en.startswith(PREFIX_EN):
                changes.append(f"  [skip] Day 6 {it['time']}: already prefixed")
                continue
            act['en'] = PREFIX_EN + en
            act['zh'] = PREFIX_ZH + zh
            it['activity'] = act
            changes.append(f"  Day 6 {it['time']}: prefixed -> {act['en'][:60]}…")

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
