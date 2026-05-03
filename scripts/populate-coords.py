#!/usr/bin/env python3
"""
Populate `location` (with coords) for timeline items in data/itinerary.json
using OpenStreetMap Nominatim. Curated list below — edit and re-run.

Match strategy: each entry is keyed on (day_number, time). The script finds
the timeline item at that time, skips if it already has location.coords,
geocodes the `query`, and writes back name + coords + mapsQuery.

Run:  python3 scripts/populate-coords.py
Then: python3 scripts/verify-coords.py
"""

import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path

NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "italy-trip-coord-populator/1.0 (gary.ho personal trip planner)"
SLEEP_SEC = 1.1

# Curated location list: (day_number, item_time, name_en, name_zh, geocode_query)
# Skip generic items like "Hotel Breakfast", "Lunch with a View", transit segments —
# those are intentionally left without a pin per the "skip if genuinely TBC" rule.
LOCATIONS = [
    # ---- Day 2: Vatican ----
    (2, "08:00", "Vatican Museums", "梵蒂岡博物館", "Vatican Museums, Vatican City"),
    (2, "10:30", "Sistine Chapel", "西斯汀禮拜堂", "Sistine Chapel, Vatican City"),
    (2, "11:30", "St. Peter's Basilica", "聖伯多祿大殿", "St. Peter's Basilica, Vatican City"),
    (2, "14:00", "Borgo Pio (lunch area)", "博爾戈皮奧（午餐區）", "Borgo Pio, Roma"),
    (2, "16:00", "Castel Sant'Angelo", "聖天使城堡", "Castel Sant'Angelo, Roma"),
    (2, "18:00", "Ponte Sant'Angelo", "聖天使橋", "Ponte Sant'Angelo, Roma"),
    # 20:00 Farewell Rome Dinner — skip (generic)

    # ---- Day 3: Ancient Rome ----
    (3, "08:30", "Colosseum", "羅馬鬥獸場", "Colosseum, Roma"),
    (3, "11:30", "Roman Forum & Palatine Hill", "古羅馬廣場與帕拉蒂諾山", "Roman Forum, Roma"),
    (3, "14:00", "Jewish Ghetto (Trastevere)", "猶太區（特拉斯提弗列）", "Jewish Ghetto, Roma"),
    (3, "16:00", "Pantheon", "萬神殿", "Pantheon, Roma"),
    (3, "18:00", "Piazza Navona", "納沃納廣場", "Piazza Navona, Roma"),
    (3, "20:00", "Campo de' Fiori (aperitivo area)", "鮮花廣場（餐前酒區）", "Campo de' Fiori, Roma"),

    # ---- Day 4: Train to Naples ----
    # 09:00 Check-out — skip (at stay)
    # 10:00 Train — skip (transit)
    (4, "11:15", "Napoli Centrale Station", "那不勒斯中央車站", "Napoli Centrale, Napoli"),
    (4, "12:30", "L'Antica Pizzeria da Michele", "古老的米歇爾披薩店", "L'Antica Pizzeria da Michele, Napoli"),
    (4, "14:30", "Naples National Archaeological Museum", "那不勒斯國立考古博物館", "Naples National Archaeological Museum, Napoli"),
    (4, "17:00", "Spaccanapoli (Historic Centre)", "斯帕卡那不勒斯（歷史中心）", "Spaccanapoli, Napoli"),
    (4, "19:00", "Castel Sant'Elmo", "聖埃爾莫城堡", "Castel Sant'Elmo, Napoli"),
    # 21:00 Seafood Dinner — skip (generic)

    # ---- Day 5: Capri ----
    (5, "07:30", "Molo Beverello (ferry terminal)", "貝弗雷洛碼頭（渡輪碼頭）", "Molo Beverello, Napoli"),
    (5, "08:30", "Grotta Azzurra (Blue Grotto)", "藍洞", "Grotta Azzurra, Capri"),
    (5, "12:30", "Marina Grande, Capri", "卡普里大碼頭", "Marina Grande, Capri"),
    (5, "14:00", "Piazzetta di Capri (Piazza Umberto I)", "卡普里小廣場（翁貝托一世廣場）", "Piazza Umberto I, Capri"),
    (5, "15:30", "Monte Solaro Chairlift", "索拉羅山纜椅", "Seggiovia Monte Solaro, Anacapri"),
    (5, "17:00", "Villa San Michele, Anacapri", "聖米歇爾別墅（阿納卡普里）", "Villa San Michele, Anacapri"),
    # 18:30 Ferry back — skip (transit)
    # 20:00 Dinner Naples — skip (generic)

    # ---- Day 6: Amalfi Coast ----
    # 07:30 Breakfast — skip
    (6, "09:00", "Corso Arnaldo Lucci (TRAMVIA pickup)", "阿納爾多·盧奇大道（TRAMVIA 接駁點）", "Corso Arnaldo Lucci, Napoli"),
    (6, "10:45", "Positano", "波西塔諾", "Positano, Salerno"),
    (6, "13:00", "Fiordo di Furore", "富羅雷峽灣", "Fiordo di Furore, Salerno"),
    (6, "13:30", "Amalfi", "阿馬爾菲", "Amalfi, Salerno"),
    # 17:30, 19:30, 20:30 — skip

    # ---- Day 7: Pompeii ----
    # 08:30 Breakfast — skip
    # 09:30 Train — skip
    (7, "10:30", "Pompeii Archaeological Park", "龐貝考古公園", "Pompeii Archaeological Park, Pompei"),
    (7, "14:00", "Pompei (modern town centre)", "現代龐貝鎮中心", "Pompei, Napoli"),
    (7, "16:00", "Spaccanapoli (Old Town)", "斯帕卡那不勒斯（舊城區）", "Spaccanapoli, Napoli"),
    # 20:00 Pizza — skip (generic)

    # ---- Day 8: Napoli → Bari ----
    # 08:00 Check-out, 08:30 Bus, 12:00 Check-in — skip
    (8, "15:00", "Polignano a Mare (Old Town)", "波利尼亞諾阿馬雷（舊城）", "Polignano a Mare, Bari"),
    (8, "17:00", "Lama Monachile Beach", "拉馬莫納奇萊海灘", "Lama Monachile, Polignano a Mare"),
    (8, "20:00", "Polignano a Mare (cliff dining)", "波利尼亞諾阿馬雷（懸崖餐廳）", "Polignano a Mare, Bari"),

    # ---- Day 9: Bari + boat + Alberobello ----
    # 08:30 Breakfast — skip
    (9, "10:00", "Polignano a Mare (boat tour)", "波利尼亞諾阿馬雷（遊船）", "Polignano a Mare, Bari"),
    (9, "12:00", "Polignano a Mare (lunch)", "波利尼亞諾阿馬雷（午餐）", "Polignano a Mare, Bari"),
    (9, "14:00", "Alberobello", "阿爾貝羅貝洛", "Alberobello, Bari"),
    (9, "17:30", "Rione Monti (Trulli District)", "蒙蒂區（特魯洛屋區）", "Rione Monti, Alberobello"),
    (9, "20:00", "Bari Vecchia (Old Town)", "巴里舊城", "Bari Vecchia, Bari"),

    # ---- Day 10: Bari → Roma ----
    # 08:30 Breakfast — skip
    (10, "09:30", "Bari Vecchia (souvenirs)", "巴里舊城（紀念品）", "Bari Vecchia, Bari"),
    (10, "11:30", "Lungomare di Bari", "巴里海濱大道", "Lungomare Nazario Sauro, Bari"),
    # 12:30 Walk to bus, 13:15 Bus — skip
    (10, "19:05", "Roma Tiburtina Station", "羅馬蒂布提納車站", "Roma Tiburtina, Roma"),
    # 20:30 Dinner, 22:30 Gelato — skip (generic)

    # ---- Day 11: Departure ----
    # 08:00 Breakfast — skip
    (11, "10:00", "Rome Fiumicino Airport (FCO)", "羅馬菲烏米奇諾機場（FCO）", "Rome Fiumicino Airport, Roma"),
    (11, "13:00", "Rome Fiumicino Airport (FCO)", "羅馬菲烏米奇諾機場（FCO）", "Rome Fiumicino Airport, Roma"),
]


def geocode(query):
    url = f"{NOMINATIM}?{urllib.parse.urlencode({'q': query, 'format': 'json', 'limit': 1})}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    if not data:
        return None
    return float(data[0]["lat"]), float(data[0]["lon"])


def main():
    path = Path("data/itinerary.json")
    itin = json.loads(path.read_text())
    days_by_num = {d["number"]: d for d in itin["days"]}

    added, skipped, missing = 0, 0, []
    for day_n, item_time, name_en, name_zh, query in LOCATIONS:
        day = days_by_num.get(day_n)
        if not day:
            print(f"  Day {day_n} not found")
            missing.append((day_n, item_time, query, "no day"))
            continue
        item = next((it for it in day.get("timeline", []) if it.get("time") == item_time), None)
        if not item:
            print(f"  Day {day_n} {item_time}: no item at this time")
            missing.append((day_n, item_time, query, "no item"))
            continue
        if item.get("location") and item["location"].get("coords"):
            print(f"  Day {day_n} {item_time}: already pinned, skipping")
            skipped += 1
            continue
        try:
            geo = geocode(query)
        except Exception as e:
            print(f"  Day {day_n} {item_time}: geocode error — {e}")
            missing.append((day_n, item_time, query, str(e)))
            time.sleep(SLEEP_SEC)
            continue
        if not geo:
            print(f"  Day {day_n} {item_time}: no result for {query!r}")
            missing.append((day_n, item_time, query, "no result"))
            time.sleep(SLEEP_SEC)
            continue
        item["location"] = {
            "name": {"en": name_en, "zh": name_zh},
            "coords": {"lat": round(geo[0], 4), "lng": round(geo[1], 4)},
            "mapsQuery": query,
        }
        print(f"  Day {day_n} {item_time}: {name_en} -> {geo[0]:.4f},{geo[1]:.4f}")
        added += 1
        time.sleep(SLEEP_SEC)

    path.write_text(json.dumps(itin, indent=2, ensure_ascii=False) + "\n")
    print(f"\nDone. Added: {added}, Skipped (already pinned): {skipped}, Missing: {len(missing)}")
    if missing:
        print("\nMissing entries (manual review):")
        for m in missing:
            print(f"  Day {m[0]} {m[1]} — {m[2]} — {m[3]}")


if __name__ == "__main__":
    main()
