#!/usr/bin/env python3
"""
Verify AI-generated coordinates in data/itinerary.json against OSM Nominatim.

For every timeline location and stay with coords, geocode the place name
and compare against the stored lat/lng. Flags anything > 500 m off as
SUSPECT and > 5 km as LIKELY-WRONG.

Usage: python3 scripts/verify-coords.py [--threshold-m 500]
Output sorted worst-first so you see the broken pins immediately.
"""

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "italy-trip-coord-verifier/1.0 (gary.ho personal trip planner)"
SLEEP_SEC = 1.1  # Nominatim usage policy: max 1 req/sec
SUSPECT_M = 500
LIKELY_WRONG_M = 5000


def haversine_m(lat1, lng1, lat2, lng2):
    R = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def en(field):
    if field is None:
        return ""
    if isinstance(field, str):
        return field
    return field.get("en") or field.get("zh") or ""


def strip_parenthetical(s):
    out, depth = [], 0
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif depth == 0:
            out.append(ch)
    return " ".join("".join(out).split())


def build_query(name, city):
    name = strip_parenthetical(name).strip()
    if not name:
        return ""
    if city and city.lower() not in name.lower():
        return f"{name}, {city}"
    return name


def geocode(query):
    url = f"{NOMINATIM}?{urllib.parse.urlencode({'q': query, 'format': 'json', 'limit': 1})}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    if not data:
        return None
    return float(data[0]["lat"]), float(data[0]["lon"])


def collect_targets(itin):
    out = []
    for day in itin.get("days", []):
        city = en(day.get("city"))
        if day.get("stay") and day["stay"].get("coords"):
            s = day["stay"]
            out.append({
                "day": day.get("number"),
                "kind": "stay",
                "name": en(s.get("name")) or en(s.get("address")) or "?",
                "address": en(s.get("address")),
                "city": city,
                "coords": s["coords"],
            })
        for item in day.get("timeline", []):
            loc = item.get("location")
            if not loc or not loc.get("coords"):
                continue
            out.append({
                "day": day.get("number"),
                "kind": "pin",
                "name": en(loc.get("name")) or en(item.get("activity")) or "?",
                "address": en(loc.get("address")),
                "city": city,
                "coords": loc["coords"],
            })
    return out


def main():
    threshold = SUSPECT_M
    if "--threshold-m" in sys.argv:
        threshold = int(sys.argv[sys.argv.index("--threshold-m") + 1])

    itin = json.loads(Path("data/itinerary.json").read_text())
    targets = collect_targets(itin)
    print(f"Verifying {len(targets)} coordinates against OSM Nominatim...\n")

    # Trailing English nouns that frequently differ between display name and OSM canonical name
    DROPPABLE_SUFFIXES = ("Gardens", "Garden", "Station", "Park", "Square", "Plaza")

    results = []
    for i, t in enumerate(targets, 1):
        # Generate query variants from broadest to simplest
        queries = []
        bare = strip_parenthetical(t["name"]).strip()
        if t["address"]:
            full_addr = f"{t['address']}, {t['city']}" if t["city"] else t["address"]
            queries.append(full_addr)
            # Address often gets over-specified ("street, num, City, Region, postcode, Country, City")
            # Take only the leading street fragment
            head = t["address"].split(",")[0].strip()
            if head and t["city"]:
                queries.append(f"{head}, {t['city']}")
        queries.append(build_query(t["name"], t["city"]))
        if bare and t["city"]:
            queries.append(f"{bare}, {t['city']}")
        # Strip droppable suffix words
        for sfx in DROPPABLE_SUFFIXES:
            if bare.endswith(" " + sfx):
                trimmed = bare[: -(len(sfx) + 1)].strip()
                if trimmed and t["city"]:
                    queries.append(f"{trimmed}, {t['city']}")
                if trimmed:
                    queries.append(trimmed)
        if bare:
            queries.append(bare)
        seen = set()
        queries = [q for q in queries if q and not (q in seen or seen.add(q))]

        geo, query, err = None, queries[0], None
        for q in queries:
            try:
                g = geocode(q)
                if g:
                    geo, query = g, q
                    break
            except Exception as e:
                err = str(e)
            time.sleep(SLEEP_SEC)

        if geo is None:
            results.append({**t, "query": query, "geo": None, "dist_m": None, "error": err or "no result"})
            print(f"[{i:2}/{len(targets)}] ???  {t['name'][:45]:45} no Nominatim result (tried {len(queries)} variants)", flush=True)
            continue

        dist = haversine_m(t["coords"]["lat"], t["coords"]["lng"], geo[0], geo[1])
        flag = "OK  " if dist < SUSPECT_M else ("WARN" if dist < LIKELY_WRONG_M else "BAD ")
        results.append({**t, "query": query, "geo": geo, "dist_m": dist, "error": None})
        print(f"[{i:2}/{len(targets)}] {flag} {t['name'][:45]:45} {dist:7.0f} m off", flush=True)
        time.sleep(SLEEP_SEC)

    print("\n" + "=" * 78)
    print(f"SUMMARY (threshold {threshold} m)")
    print("=" * 78)

    suspects = [r for r in results if r["dist_m"] is not None and r["dist_m"] >= threshold]
    suspects.sort(key=lambda r: -r["dist_m"])
    misses = [r for r in results if r["geo"] is None]

    if not suspects and not misses:
        print(f"All {len(results)} coordinates are within {threshold} m. No action needed.")
        return

    if suspects:
        print(f"\n{len(suspects)} coords > {threshold} m off (worst first):\n")
        for r in suspects:
            print(f"  Day {r['day']} [{r['kind']}] {r['name']}")
            print(f"    stored: {r['coords']['lat']:.4f},{r['coords']['lng']:.4f}")
            print(f"    OSM:    {r['geo'][0]:.4f},{r['geo'][1]:.4f}  ({r['dist_m']:.0f} m off)")
            print(f"    query:  {r['query']}")
            print()

    if misses:
        print(f"\n{len(misses)} could not be geocoded (worth a manual check):\n")
        for r in misses:
            print(f"  Day {r['day']} [{r['kind']}] {r['name']} — {r['error']}")
            print(f"    query: {r['query']}")
            print()


if __name__ == "__main__":
    main()
