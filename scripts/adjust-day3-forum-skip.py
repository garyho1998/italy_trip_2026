#!/usr/bin/env python3
"""
One-off Day 3 adjustment: drop Forum interior entry (saves €16-18), use the
free Capitoline Belvedere overlook for the iconic Forum panorama instead.
Add Sant'Eustachio Il Caffè as a real coffee stop to fill time before
the noon Pantheon god-light. Update Pantheon comment to drop Sant'Eustachio
(now its own item) but keep Tazza d'Oro and Giolitti as callouts.
"""

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "italy-trip-day3-adjust/1.0"


def geocode(query):
    url = f"{NOMINATIM}?{urllib.parse.urlencode({'q': query, 'format': 'json', 'limit': 1})}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    if not data:
        raise RuntimeError(f"no result for {query}")
    return round(float(data[0]["lat"]), 4), round(float(data[0]["lon"]), 4)


def main():
    path = Path("data/itinerary.json")
    itin = json.loads(path.read_text())
    day3 = next(d for d in itin["days"] if d["number"] == 3)

    def find(prefix):
        for it in day3["timeline"]:
            if it.get("activity", {}).get("en", "").startswith(prefix):
                return it
        return None

    # 1. Forum: change from interior visit to free walk-by from Via dei Fori Imperiali
    forum = find("Roman Forum")
    if forum:
        forum["activity"] = {
            "en": "Roman Forum walk-by (Via dei Fori Imperiali)",
            "zh": "羅馬廣場路邊觀景（帝國廣場大道）"
        }
        forum["info"] = {
            "en": "Stroll along Via dei Fori Imperiali — the wide avenue runs above the Forum, free railings let you peek down at the Curia, Temple of Saturn and surviving columns. Best wide-angle photo comes a bit later from Capitoline Hill.",
            "zh": "沿著帝國廣場大道漫步 — 這條大道從高處俯瞰廣場，免費欄杆邊可俯視元老院、農神廟和殘存的圓柱。稍後從卡比托利歐山上會看到最佳的廣角照片。"
        }
        forum.pop("price", None)
        forum.pop("link", None)

    # 2. Capitoline: shift time 11:30 -> 09:45, emphasize Belvedere panorama
    cap = find("Capitoline Hill")
    if cap:
        cap["time"] = "09:45"
        cap["info"] = {
            "en": "Climb the Cordonata stairs to Piazza del Campidoglio (Michelangelo design, free). Walk past the Marcus Aurelius statue and around to the Belvedere terrace behind Palazzo Senatorio — the iconic Forum panorama opens up below. This is the postcard shot, no ticket needed.",
            "zh": "登上米開朗基羅設計的科爾多納塔階梯前往卡比托利歐廣場（免費）。經過馬庫斯·奧勒留雕像，繞到元老宮後面的觀景平台 — 標誌性的羅馬廣場全景就在腳下展開。這就是明信片照，無需門票。"
        }
        cap["activity"] = {
            "en": "⭐ Capitoline Belvedere (Forum panorama)",
            "zh": "⭐ 卡比托利歐觀景平台（羅馬廣場全景）"
        }
        cap["featured"] = True

    # 3. Largo Argentina: shift 11:50 -> 10:30
    arg = find("Largo di Torre")
    if arg:
        arg["time"] = "10:30"

    # 4. Add Sant'Eustachio Il Caffè at 10:45
    print("Geocoding Sant'Eustachio Il Caffè...")
    se_lat, se_lng = geocode("Sant'Eustachio Il Caffè, Roma")
    print(f"  -> {se_lat},{se_lng}")
    day3["timeline"].append({
        "time": "10:45",
        "picture": {
            "src": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=120&h=120&fit=crop",
            "alt": "Italian espresso"
        },
        "activity": {
            "en": "Sant'Eustachio Il Caffè (legendary espresso)",
            "zh": "Sant'Eustachio 咖啡館（傳奇義式濃縮咖啡）"
        },
        "info": {
            "en": "Tucked behind the Pantheon, this is one of Rome's most famous espresso spots — the secret-recipe gran caffè (whipped foam on espresso) is the signature. Stand at the marble counter like locals; ~45 min stop kills the wait until noon Pantheon.",
            "zh": "藏身於萬神殿後方，羅馬最著名的義式濃縮咖啡店之一 — 招牌是秘製配方的 gran caffè（濃縮咖啡上的奶泡）。像當地人一樣站在大理石吧檯前；約45分鐘的停留剛好等到中午萬神殿的時光。"
        },
        "comment": {
            "en": "💡 Alternative: Tazza d'Oro at the Pantheon, equally legendary. Pick whichever is less crowded.",
            "zh": "💡 替代選擇：萬神殿旁的金杯咖啡（Tazza d'Oro），同樣傳奇。哪間人少就去哪間。"
        },
        "location": {
            "name": {"en": "Sant'Eustachio Il Caffè", "zh": "Sant'Eustachio 咖啡館"},
            "coords": {"lat": se_lat, "lng": se_lng},
            "mapsQuery": "Sant'Eustachio Il Caffè, Roma",
        },
    })

    # 5. Pantheon: update comment, drop Sant'Eustachio (now its own item)
    pan = find("⭐ Pantheon") or find("Pantheon")
    if pan:
        pan["comment"] = {
            "en": "🍦 Walking out: Giolitti for Rome's best gelato (~150m, Via degli Uffici del Vicario), Tazza d'Oro for another shot of espresso right next to the Pantheon.",
            "zh": "🍦 離開時：步行約150公尺到喬利蒂（Giolitti）品嚐羅馬最棒的冰淇淋，或到萬神殿旁的金杯咖啡（Tazza d'Oro）再來一杯濃縮咖啡。"
        }

    # Sort timeline by time
    day3["timeline"].sort(key=lambda it: it.get("time", "00:00"))

    path.write_text(json.dumps(itin, indent=2, ensure_ascii=False) + "\n")
    print("\nDone.")


if __name__ == "__main__":
    main()
