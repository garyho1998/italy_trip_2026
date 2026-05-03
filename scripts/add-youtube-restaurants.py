#!/usr/bin/env python3
"""
Apply the 5 YouTube-recommended restaurant updates to data/itinerary.json:
1. Day 1 dinner: keep La Gattabuia, add Miraggio Trastevere as alternative in comment
2. Day 2 14:00: replace generic Borgo Pio lunch with Forno Feliziani + Mercato Trionfale + Chef Box combo
3. Day 2 ~14:30: NEW — Panificio Bonci maritozzo dessert
4. Day 3 13:00: upgrade Jewish Ghetto lunch to Sora Lella (Tiber Island, "4 Ristoranti" winner)
5. Day 3 19:30: NEW — La Campana dinner (Rome's oldest restaurant, since 1518)
+ Day 3 Trevi 06:30: mention Baccano (champion carbonara, right next door) in comment
"""

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "italy-trip-add-restaurants/1.0"
SLEEP = 1.1


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
    days = {d["number"]: d for d in itin["days"]}

    # ---- Geocode 4 new pins ----
    print("Geocoding 4 new pins...")
    pins = {}
    for label, query in [
        ("trionfale", "Mercato Trionfale, Roma"),
        ("bonci", "Via Trionfale 36, Roma"),  # OSM lists it as "Bonci"
        ("soralella", "Trattoria Sora Lella, Roma"),
        ("campana", "Ristorante La Campana, Roma"),
    ]:
        pins[label] = geocode(query)
        print(f"  {label} ({query!r}) -> {pins[label]}")
        time.sleep(SLEEP)

    # ---- 1. Day 1 dinner: add Miraggio note in comment ----
    d1_dinner = days[1]["timeline"][-1]  # last item is the 20:00 dinner
    assert d1_dinner.get("time") == "20:00"
    d1_dinner["comment"] = {
        "en": "🍴 Alternative pick: Miraggio Trastevere (Via della Lungara 16A) — family-run since 1955, classics like coda alla vaccinara and trippa romana. 🍧 Or grab a Grattachecca (Roman shaved ice) at Sora Mirella nearby!",
        "zh": "🍴 替代選擇：Miraggio Trastevere（Via della Lungara 16A）— 1955年起家族經營，招牌燉牛尾和羅馬式牛肚。🍧 或到附近的 Sora Mirella 嚐 Grattachecca（羅馬傳統水果剉冰）！"
    }

    # ---- 2. Day 2 14:00: replace Borgo Pio with Forno Feliziani + Mercato Trionfale combo ----
    d2 = days[2]["timeline"]
    lunch = next(it for it in d2 if it.get("time") == "14:00")
    lunch["time"] = "13:00"  # earlier so we have time for Bonci dessert
    lunch["picture"] = {
        "src": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=120&h=120&fit=crop",
        "alt": "Roman pizza al taglio"
    }
    lunch["activity"] = {
        "en": "⭐ Trionfale lunch: Forno Feliziani + Mercato Trionfale",
        "zh": "⭐ Trionfale 區午餐：Forno Feliziani + Trionfale 市場"
    }
    lunch["info"] = {
        "en": "Roman pizza al taglio crawl through the Trionfale district. Start at Forno Feliziani (Via Candia 61) for thick-crust slices — try the broccoli/mushroom. Then walk to Mercato Trionfale (Via Andrea Doria) for the legendary porchetta panini (€3.5, host's #1 pick of the day) and Chef Box's fresh handmade pasta — Cozze Pecorino or Faraona Tartufo (~€23 for 2 plates).",
        "zh": "在 Trionfale 區掃街吃羅馬式披薩。先到 Forno Feliziani（Via Candia 61）品嚐厚皮披薩 — 推薦花椰菜香菇口味。再走到 Trionfale 市場（Via Andrea Doria）吃傳奇的脆皮烤豬肉帕尼尼（€3.5，YouTuber 當日最愛！）和 Chef Box 的新鮮手工義大利麵 — 淡菜羊乾酪或珍珠雞松露（約 €23 兩盤）。"
    }
    lunch["featured"] = True
    lunch["location"] = {
        "name": {"en": "Mercato Trionfale", "zh": "Trionfale 市場"},
        "coords": {"lat": pins["trionfale"][0], "lng": pins["trionfale"][1]},
        "mapsQuery": "Mercato Trionfale, Roma",
    }

    # ---- 3. Day 2 14:30: NEW Panificio Bonci ----
    d2.append({
        "time": "14:30",
        "picture": {
            "src": "https://images.unsplash.com/photo-1551404973-761c83cd8339?w=120&h=120&fit=crop",
            "alt": "Maritozzo cream bun"
        },
        "activity": {
            "en": "Panificio Bonci (maritozzo dessert)",
            "zh": "Panificio Bonci（生乳包甜點）"
        },
        "info": {
            "en": "Gabriele Bonci's bakery on Via Trionfale, ~600m walk from the market. Their maritozzo is rated the 'ceiling' of Rome — soft milk-bread roll split open and stuffed with a giant pillow of unsweetened whipped cream. Perfect dessert before walking south to Castel Sant'Angelo.",
            "zh": "Gabriele Bonci 在 Via Trionfale 的麵包店，距市場約 600 公尺。他們的生乳包被評為「羅馬天花板」— 鬆軟的牛奶麵包剖開夾入巨大的無糖鮮奶油。在往南走到聖天使城堡之前的完美甜點。"
        },
        "location": {
            "name": {"en": "Panificio Bonci", "zh": "Panificio Bonci 麵包店"},
            "coords": {"lat": pins["bonci"][0], "lng": pins["bonci"][1]},
            "mapsQuery": "Panificio Bonci, Via Trionfale 36, Roma",
        },
    })

    # ---- 4. Day 3 13:00 lunch: upgrade to Sora Lella ----
    d3 = days[3]["timeline"]
    ghetto = next(it for it in d3 if it.get("time") == "13:00")
    ghetto["picture"] = {
        "src": "https://images.unsplash.com/photo-1481931098730-318b6f776db0?w=120&h=120&fit=crop",
        "alt": "Roman trattoria"
    }
    ghetto["activity"] = {
        "en": "⭐ Sora Lella (Tiber Island)",
        "zh": "⭐ Sora Lella 餐廳（台伯島）"
    }
    ghetto["info"] = {
        "en": "Iconic Roman trattoria on Tiber Island, since 1940 — winner of '4 Ristoranti' as Rome's best restaurant. Walk through the Jewish Ghetto first (carciofi alla giudia photos at Boccione bakery), then cross the bridge to Sora Lella for sit-down lunch: 22-month prosciutto + burrata, gnocchi all'amatriciana, trippa alla romana, and a classic maritozzo for dessert.",
        "zh": "台伯島上的傳奇羅馬餐館，1940年起家 — 義大利真人秀「4 Ristoranti」羅馬最佳餐廳得主。先穿過猶太區（在 Boccione 烘焙坊拍炸朝鮮薊照），再過橋到 Sora Lella 坐下吃：22個月熟成生火腿配布拉塔起司、阿瑪翠斯醬麵疙瘩、羅馬式牛肚，甜點當然是經典的生乳包。"
    }
    ghetto["featured"] = True
    ghetto["location"] = {
        "name": {"en": "Trattoria Sora Lella", "zh": "Sora Lella 餐廳"},
        "coords": {"lat": pins["soralella"][0], "lng": pins["soralella"][1]},
        "mapsQuery": "Trattoria Sora Lella, Via di Ponte Quattro Capi 16, Roma",
    }

    # ---- 5. Day 3 19:30: NEW La Campana dinner ----
    d3.append({
        "time": "19:30",
        "featured": True,
        "picture": {
            "src": "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=120&h=120&fit=crop",
            "alt": "Roman classic dinner"
        },
        "activity": {
            "en": "⭐ Ristorante La Campana (Rome's oldest, since 1518)",
            "zh": "⭐ La Campana 餐廳（羅馬最古老餐廳，1518年起）"
        },
        "info": {
            "en": "500-year-old trattoria in centro storico, near Pantheon/Piazza Navona. Order the things tourists never order: carciofo alla romana (braised artichoke), tagliolini alici e pecorino (anchovy + sheep cheese pasta), petto di vitella alla fornara (roast veal breast), animella di abbacchio (lamb sweetbreads). Save room for the warm apple pie + gelato.",
            "zh": "centro storico 500 年老店，鄰近萬神殿和納沃納廣場。點那些遊客從不點的菜：羅馬式燉朝鮮薊、鯷魚羊乾酪細麵、烘培者烤小牛胸肉、嫩煎羊胸線。記得留肚子吃招牌的暖蘋果派配 gelato。"
        },
        "comment": {
            "en": "📞 Reservations strongly recommended — small dining room, very popular with locals.",
            "zh": "📞 強烈建議訂位 — 用餐空間不大，當地人很愛來。"
        },
        "location": {
            "name": {"en": "Ristorante La Campana", "zh": "La Campana 餐廳"},
            "coords": {"lat": pins["campana"][0], "lng": pins["campana"][1]},
            "mapsQuery": "Ristorante La Campana, Vicolo della Campana 18, Roma",
        },
    })

    # ---- Bonus: Day 3 Trevi 06:30 — mention Baccano in comment ----
    trevi = next(it for it in d3 if it.get("time") == "06:30")
    trevi["comment"] = {
        "en": "📸 By 8am the piazza fills with tour groups — leave before 7:30 for clean photos. 🍝 FYI: Baccano (Via delle Muratte 23, 50m away) is widely rated Rome's champion carbonara — chef Nabil Hassen, ex-Roscioli. Worth a return trip later in the day.",
        "zh": "📸 早上8點後廣場會擠滿旅行團 — 7:30前離開可拍到乾淨照片。🍝 順帶一提：Baccano（Via delle Muratte 23，距特雷維 50公尺）被公認為羅馬冠軍培根蛋麵 — 主廚 Nabil Hassen 來自 Roscioli。值得稍後再回來吃一次。"
    }

    # Sort timelines
    days[2]["timeline"].sort(key=lambda it: it.get("time", "00:00"))
    days[3]["timeline"].sort(key=lambda it: it.get("time", "00:00"))

    path.write_text(json.dumps(itin, indent=2, ensure_ascii=False) + "\n")
    print("\nDone.")


if __name__ == "__main__":
    main()
