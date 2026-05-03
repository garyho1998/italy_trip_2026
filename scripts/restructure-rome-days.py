#!/usr/bin/env python3
"""
One-off: restructure Day 1 + Day 3 of data/itinerary.json per the agreed plan.

Day 1: delete Trevi (moved to Day 3), insert Piazza del Popolo at 16:30.
Day 3: full reorder for early-morning crowd avoidance and god-light Pantheon
       at noon; add Capitoline + Vittoriano, Largo di Torre Argentina;
       add snack/coffee mentions (Sant'Eustachio, Tazza d'Oro, Giolitti) into
       the Pantheon item description; Piazza Navona becomes a 07:00 breakfast
       stop instead of an evening visit; Colosseum is exterior-only.
"""

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "italy-trip-restructure/1.0"
SLEEP = 1.1


def geocode(query):
    url = f"{NOMINATIM}?{urllib.parse.urlencode({'q': query, 'format': 'json', 'limit': 1})}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    if not data:
        raise RuntimeError(f"no result for {query}")
    return round(float(data[0]["lat"]), 4), round(float(data[0]["lng" if "lng" in data[0] else "lon"]), 4)


def make_loc(name_en, name_zh, query, lat, lng):
    return {
        "name": {"en": name_en, "zh": name_zh},
        "coords": {"lat": lat, "lng": lng},
        "mapsQuery": query,
    }


def main():
    path = Path("data/itinerary.json")
    itin = json.loads(path.read_text())
    days = {d["number"]: d for d in itin["days"]}

    # ---- Geocode 3 new pins ----
    print("Geocoding new pins...")
    coords = {}
    for label, query in [
        ("popolo", "Piazza del Popolo, Roma"),
        ("campidoglio", "Piazza del Campidoglio, Roma"),
        ("argentina", "Largo di Torre Argentina, Roma"),
    ]:
        coords[label] = geocode(query)
        print(f"  {label} ({query!r}) -> {coords[label]}")
        time.sleep(SLEEP)

    # ---- Day 1 ----
    d1 = days[1]["timeline"]
    # Remove the Trevi Fountain item
    d1[:] = [it for it in d1 if it.get("activity", {}).get("en", "") != "Trevi Fountain"]
    # Insert Piazza del Popolo at 16:30
    d1.append({
        "time": "16:30",
        "picture": {
            "src": "https://images.unsplash.com/photo-1554080354-ab1ca08fd64d?w=120&h=120&fit=crop",
            "alt": "Piazza del Popolo, Rome"
        },
        "activity": {
            "en": "Piazza del Popolo (Pincio walkdown)",
            "zh": "人民廣場（從平喬山步行而下）"
        },
        "info": {
            "en": "Walk down from Pincio terrace into the oval Piazza del Popolo — twin churches, central obelisk. Easy stop on the way to Spanish Steps / Trastevere.",
            "zh": "從平喬觀景台步行而下，進入橢圓形的人民廣場 — 雙子教堂與中央方尖碑。前往西班牙階梯／特拉斯提弗列途中的輕鬆停留。"
        },
        "location": make_loc(
            "Piazza del Popolo", "人民廣場",
            "Piazza del Popolo, Roma",
            coords["popolo"][0], coords["popolo"][1]
        ),
    })
    d1.sort(key=lambda it: it.get("time", "00:00"))

    # ---- Day 3: full restructure ----
    d3 = days[3]["timeline"]
    # Helper to find the item whose activity en starts with a given prefix
    def find(prefix):
        for it in d3:
            act = it.get("activity", {}).get("en", "")
            if act.startswith(prefix):
                return it
        return None

    # 1. Add Trevi Fountain at 06:30 (new on Day 3)
    trevi = {
        "time": "06:30",
        "featured": True,
        "picture": {
            "src": "https://images.unsplash.com/photo-1525874684015-58379d421a52?w=120&h=120&fit=crop",
            "alt": "Trevi Fountain at sunrise"
        },
        "activity": {
            "en": "⭐ Trevi Fountain (sunrise, empty)",
            "zh": "⭐ 特雷維噴泉（日出時分，無人）"
        },
        "info": {
            "en": "Arrive early to a near-empty piazza and golden-hour light on the Baroque marble. Toss a coin (right hand over left shoulder) — Roman tradition says you'll return.",
            "zh": "提早抵達幾乎無人的廣場，享受巴洛克大理石上的黃金時刻光線。投入一枚硬幣（右手越過左肩）— 羅馬傳說你將會再來。"
        },
        "comment": {
            "en": "📸 By 8am the piazza fills with tour groups — stay before 7:30 for clean photos.",
            "zh": "📸 早上8點後廣場會擠滿旅行團 — 7:30前離開可拍到乾淨照片。"
        },
        "location": make_loc(
            "Trevi Fountain", "特雷維噴泉",
            "Trevi Fountain, Roma",
            41.901, 12.4833
        ),
    }
    d3.append(trevi)

    # 2. Modify Piazza Navona evening item -> Piazza Navona breakfast 07:00
    nav = find("Piazza Navona")
    if nav:
        nav["time"] = "07:00"
        nav["activity"] = {
            "en": "Breakfast at Piazza Navona",
            "zh": "納沃納廣場早餐"
        }
        nav["info"] = {
            "en": "Café tables under awnings around Bernini's Fountain of the Four Rivers. Cornetto + cappuccino at a sleepy outdoor table — Rome at its best.",
            "zh": "貝尼尼的四河噴泉周圍咖啡座。在悠閒的戶外桌享用可頌與卡布奇諾 — 羅馬最美的時刻。"
        }
        nav.pop("featured", None)

    # 3. Modify Colosseum item -> exterior emphasis, keep 08:30
    col = find("⭐ Colosseum") or find("Colosseum")
    if col:
        col["activity"] = {
            "en": "Colosseum (exterior + Arch of Constantine)",
            "zh": "羅馬鬥獸場（外觀 + 君士坦丁凱旋門）"
        }
        col["info"] = {
            "en": "Photos from outside. Walk the perimeter, pose at the Arch of Constantine right next door. Skip the interior — saves 90 min and €18, and we head straight into the Forum next.",
            "zh": "外觀拍照。繞外圍一圈，到旁邊的君士坦丁凱旋門合照。跳過內部 — 省下90分鐘和€18，緊接著進羅馬廣場。"
        }
        col.pop("link", None)
        col.pop("price", None)
        col.pop("featured", None)

    # 4. Forum: change time 11:30 -> 09:00
    forum = find("Roman Forum")
    if forum:
        forum["time"] = "09:00"

    # 5. Add Capitoline Hill + Piazza Venezia 11:30
    d3.append({
        "time": "11:30",
        "picture": {
            "src": "https://images.unsplash.com/photo-1580916861017-ad6dec90fdb1?w=120&h=120&fit=crop",
            "alt": "Piazza del Campidoglio"
        },
        "activity": {
            "en": "Capitoline Hill + Vittoriano",
            "zh": "卡比托利歐山 + 維托里亞諾紀念堂"
        },
        "info": {
            "en": "Climb Michelangelo's Cordonata staircase up to Piazza del Campidoglio (free) for a top-down view of the Forum behind you. Walk past the massive Vittoriano (Wedding Cake) on Piazza Venezia.",
            "zh": "登上米開朗基羅設計的科爾多納塔階梯前往卡比托利歐廣場（免費），可俯瞰身後的羅馬廣場。經過威尼斯廣場上巨大的維托里亞諾紀念堂（婚禮蛋糕）。"
        },
        "location": make_loc(
            "Piazza del Campidoglio", "卡比托利歐廣場",
            "Piazza del Campidoglio, Roma",
            coords["campidoglio"][0], coords["campidoglio"][1]
        ),
    })

    # 6. Add Largo di Torre Argentina 11:50
    d3.append({
        "time": "11:50",
        "picture": {
            "src": "https://images.unsplash.com/photo-1551018612-9715965c6742?w=120&h=120&fit=crop",
            "alt": "Roman cat"
        },
        "activity": {
            "en": "Largo di Torre Argentina (cat sanctuary)",
            "zh": "阿根廷塔廣場（貓咪保護區）"
        },
        "info": {
            "en": "Sunken Republican-era ruins where Caesar was assassinated, now a famous Roman cat sanctuary. 5-min stop from street level — peek down, wave at the cats, move on.",
            "zh": "下沉式的共和時期遺跡，凱撒遇刺之地，現為著名的羅馬貓咪保護區。從街道層觀看 — 探頭看看，跟貓咪揮揮手，繼續前進。"
        },
        "location": make_loc(
            "Largo di Torre Argentina", "阿根廷塔廣場",
            "Largo di Torre Argentina, Roma",
            coords["argentina"][0], coords["argentina"][1]
        ),
    })

    # 7. Pantheon: change time 16:00 -> 12:00, add god-light + snack mentions
    pan = find("Pantheon")
    if pan:
        pan["time"] = "12:00"
        pan["activity"] = {
            "en": "⭐ Pantheon interior (god-light beam ☀️)",
            "zh": "⭐ 萬神殿內部（神聖光柱 ☀️）"
        }
        pan["info"] = {
            "en": "Solar noon (~13:08) lands the oculus beam near the floor center — visit between 11:45 and 13:00 for the strongest 'god light' on the dome's coffered interior.",
            "zh": "太陽正午（約13:08）光柱落在地板中央附近 — 在11:45至13:00之間造訪，可看到最強烈的「神聖光柱」打在穹頂藻井內部。"
        }
        pan["comment"] = {
            "en": "🍦 Right next door: Sant'Eustachio Il Caffè or Tazza d'Oro for legendary coffee, Giolitti for Rome's best gelato. Walk by on the way out.",
            "zh": "🍦 緊鄰萬神殿：Sant'Eustachio 咖啡館或金杯咖啡（Tazza d'Oro）有傳奇咖啡，喬利蒂（Giolitti）有羅馬最棒的冰淇淋。離開時順道一訪。"
        }
        pan["featured"] = True

    # 8. Lunch Jewish Ghetto 14:00 -> 13:00
    lunch = find("Lunch in Jewish")
    if lunch:
        lunch["time"] = "13:00"

    # 9. Aperitivo & Dinner 20:00 -> 15:30 Campo de' Fiori
    aper = find("Aperitivo")
    if aper:
        aper["time"] = "15:30"
        aper["activity"] = {
            "en": "Campo de' Fiori (afternoon stroll)",
            "zh": "鮮花廣場（午後漫步）"
        }
        aper["info"] = {
            "en": "Late-afternoon market wind-down, flower stalls and locals at the bars. Great spot for a sit-down spritz before the evening dinner.",
            "zh": "傍晚市集收攤時分，花攤與酒吧裡的當地人。晚餐前坐下來喝杯氣泡飲料的絕佳地點。"
        }

    # Sort Day 3 timeline by time
    d3.sort(key=lambda it: it.get("time", "00:00"))

    # ---- Save ----
    path.write_text(json.dumps(itin, indent=2, ensure_ascii=False) + "\n")
    print("\nDone. Run python3 scripts/verify-coords.py to confirm.")


if __name__ == "__main__":
    main()
