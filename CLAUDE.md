# CLAUDE.md - Italy Trip Planner 2026

## Project Overview
A multi-page static website for planning an 11-day Italy trip (June 3-13, 2026) for 6 travelers. Flights depart HK June 2 (evening), arrive Rome June 3 morning. Return flight from Rome June 13, arrive back HK June 14. The journey covers Rome, Naples (+ Capri/Blue Grotto + Amalfi Coast), and Puglia (Polignano a Mare + Alberobello), traveling by train.

## Tech Stack
- **HTML5** - Semantic markup
- **CSS3** - Custom properties, Flexbox, Grid, responsive design
- **Vanilla JavaScript** - No frameworks, ES6+
- **Google Fonts** - Cormorant Garamond (display) + DM Sans (body)

## File Structure
```
italy_trip/
├── index.html        # Home page with trip overview
├── itinerary.html    # Day-by-day detailed schedule
├── flights.html      # Flight options and booking links
├── budget.html       # Cost breakdown per person
├── map.html          # Transport route information
├── tips.html         # Packing list & travel tips
├── styles.css        # All styles (single file)
├── script.js         # All JavaScript (single file)
├── translations.js   # Traditional Chinese (繁體中文) i18n strings
└── images/           # Trip photos
```

## Design System

### Color Palette (CSS Variables in `:root`)
| Variable | Color | Usage |
|----------|-------|-------|
| `--terracotta` | #C65D3B | Primary accent, CTAs |
| `--venetian-blue` | #1E3A5F | Headers, nav, dark sections |
| `--tuscany-gold` | #D4A84B | Highlights, numbers |
| `--cream` | #FDF6E3 | Page background |
| `--parchment` | #F5E6D3 | Card backgrounds |
| `--deep-wine` | #722F37 | Gradients |
| `--olive` | #4A5D23 | Transport/route info |

### Typography
- **Display font**: `var(--font-display)` - Cormorant Garamond (headings, large text)
- **Body font**: `var(--font-body)` - DM Sans (paragraphs, UI)

### Key CSS Classes
- `.container` - Max-width wrapper (1200px)
- `.section-header` - Standard section title layout
- `.cta-button` / `.cta-button.secondary` - Button styles
- `.day-card` - Itinerary day container
- `.highlight-card` - Photo card with overlay

## JavaScript Features

### Initialization (DOMContentLoaded)
1. `initMobileNav()` - Mobile hamburger menu
2. `initScrollAnimations()` - Intersection Observer animations
3. `initPackingListPersistence()` - LocalStorage for packing checkboxes
4. `initChecklistPersistence()` - LocalStorage for pre-booking checklist
5. `initCountdown()` - Days-until-trip counter (bilingual EN/ZH)
6. `initNavScroll()` - Transparent-to-solid nav on scroll
7. `initLanguage()` - Apply saved language preference on page load

### Language Toggle (EN / 繁體中文)
- All translatable elements have `data-i18n="key"` attributes
- `translations.js` holds ~600 Traditional Chinese (HK) strings keyed by ID
- Toggle button in nav calls `toggleLanguage()` → swaps text via `applyTranslations()`
- English text is the HTML default; Chinese is applied as JS overlay
- Original English text is cached in `ORIGINAL_TEXTS` object on first load

### LocalStorage Keys
- `italy-trip-packing-list` - Packing list checkbox states
- `italy-trip-checklist` - Pre-booking checklist states
- `italy-trip-lang` - Language preference (`en` or `zh`)

### Global Functions
- `toggleMobileNav()` - Called from HTML onclick
- `toggleLanguage()` - Called from HTML onclick (lang toggle button)

## Trip Details

### Route
Rome (3 nights) → Naples (4 nights) + Capri + Amalfi Coast + Pompeii → Bari/Puglia (2 nights) + Polignano day trips + Alberobello → Train back to Rome → Fly home from Rome

### Transport
- **High-speed train**: Rome → Naples (1h 10min, Frecciarossa)
- **Budget bus**: Naples → Bari (~3h, FlixBus/Itabus/Marino, €11-20) + regional train to Polignano a Mare (~20min)
- **FlixBus direct**: Bari → Rome (5h 50m, ✓ booked — €14.66/person, 13:15→19:05, Bari FS Park Via Capruzzi → Roma Tiburtina). Note: Trenitalia has NO direct trains on this route — all options require ≥1 transfer and 6.5+ hours, making the bus both faster and dramatically cheaper.
- **GetYourGuide tour**: Polignano boat tour — sea caves & swimming (~€25-35/person)
- **GetYourGuide tour**: Alberobello guided tour from Polignano — UNESCO trulli houses (~€25-35/person)
- **Ferry**: Naples → Capri (day trip for Blue Grotto)
- **Bus/driver**: Naples → Amalfi Coast (day trip: Positano, Amalfi, Ravello)
- **Campania Artecard**: 3-day pass covering 2 attractions + transport in Campania region

### Day-by-Day Overview
- Day 1 (June 3, Wed): Rome — Trevi Fountain, Spanish Steps, Trastevere
- Day 2 (June 4, Thu): Rome — Vatican City (Sistine Chapel, St. Peter's)
- Day 3 (June 5, Fri): Rome — Colosseum, Roman Forum, Pantheon
- Day 4 (June 6, Sat): Train to Naples — Archaeological Museum, Castel Sant'Elmo night view
- Day 5 (June 7, Sun): Naples — Blue Grotto 藍洞 day trip (Capri)
- Day 6 (June 8, Mon): Naples — Amalfi Coast day trip (Positano, Amalfi, Ravello)
- Day 7 (June 9, Tue): Naples — Pompeii day trip, Spaccanapoli, last pizza night
- Day 8 (June 10, Wed): Bus to Bari, train to Polignano — old town, Lama Monachile beach, cliff-edge dinner
- Day 9 (June 11, Thu): Puglia — Boat tour (sea caves) + Alberobello trulli (UNESCO)
- Day 10 (June 12, Fri): Bari old town + Lungomare + panzerotti lunch, FlixBus 13:15 → 19:05 Rome, final dinner in Monti
- Day 11 (June 13, Sat): Fly home to HK

### Key Highlights
- ⛪ Vatican City (Sistine Chapel, St. Peter's)
- 🏛️ Colosseum & Roman Forum
- 🏛️ Naples Archaeological Museum + Castel Sant'Elmo
- 🌊 Blue Grotto 藍洞 (Capri)
- 🏖️ Amalfi Coast (Positano, Amalfi, Ravello)
- 🍕 Naples authentic pizza
- 🏛️ Pompeii Archaeological Park
- 🏖️ Polignano a Mare — Lama Monachile beach, sea caves
- 🏘️ Alberobello trulli houses (UNESCO)

### Budget Range
~HKD 22,200 per person

## Development Notes

### Images
- **Unsplash** (most pages): Use CDN URL format `https://images.unsplash.com/photo-{id}?w=120&h=120&fit=crop`
  - The `{id}` is a `{unix_timestamp}-{12char_hex}` string (e.g. `1552832230-c0197dd311b5`)
  - Only use IDs already verified in the codebase, or confirmed via Unsplash website — fabricated IDs will 404
- **Wikimedia Commons** (Capri/Blue Grotto): Use `Special:FilePath` redirect for stable URLs
  - Format: `https://commons.wikimedia.org/wiki/Special:FilePath/{Filename}?width=240`
  - e.g. `Blue_grotto_in_capri_arp.jpg`, `Porto_di_Marina_Grande_-_Isola_di_Capri.jpg`
- **Local images**: Stored in `images/` folder (e.g. `images/positano-beach3.jpg`)
- When adding new images, **always verify the URL loads** before committing

### Pricing & Data Accuracy
- **Always research current prices online before updating any cost information**
- **Always find the accurate price online with reference link embedded**
- Include reference links to official sources (museum websites, train operators)
- Flight prices change frequently - link to comparison sites (Skyscanner, Google Flights)
- Key reference sites:
  - Flights: [Skyscanner](https://www.skyscanner.com.hk/)
  - Trains: [Trenitalia](https://www.trenitalia.com/en.html), [Italo](https://www.italotreno.it/en)
  - Colosseum: [parcocolosseo.it](https://parcocolosseo.it/en/)
  - Vatican: [museivaticani.va](https://www.museivaticani.va/content/museivaticani/en.html)
  - Capri ferries: [caremar.it](https://www.caremar.it/), [snav.it](https://www.snav.it/)
  - Car rental: [RentalCars](https://www.rentalcars.com), [DiscoverCars](https://www.discovercars.com)

### Adding New Pages
1. Copy nav structure from existing page
2. Include `styles.css` and `script.js`
3. Use `.page-body` class on `<body>` for non-hero pages
4. Wrap main content in `.page-main`
5. Update nav link text: "Route" instead of "Map"

### Responsive Breakpoints
- 1024px - Tablet adjustments
- 768px - Mobile layout (nav toggle visible)
- 480px - Small mobile tweaks

### Animation Pattern
Elements with these classes auto-animate on scroll:
```
.day-card, .budget-card, .tip-card-small, .packing-category,
.flight-detail-card, .quick-link-card, .route-card, .highlight-card,
.checklist-item, .tip-item, .currency-card, .emergency-card,
.phrase-card, .alternative-card
```

## Common Tasks

### Update trip dates
1. Edit hero-subtitle in `index.html` (June 3 - 13, 2026)
2. Update `tripDate` in `script.js` countdown function (2026-06-03)
3. Update footer dates (June 3-13, 2026)

### Add new itinerary day
Use this HTML structure in `itinerary.html`:
```html
<div class="day-card">
    <div class="day-header">
        <span class="day-number">X</span>
        <div class="day-info">
            <h3>Day X Title</h3>
            <span class="day-date">Month Day, 2026</span>
        </div>
        <span class="day-city">City Name</span>
    </div>
    <div class="day-content">
        <div class="day-timeline">
            <!-- timeline-item elements -->
        </div>
    </div>
</div>
```

### Featured day headers
Add special classes for themed headers:
- `.vatican` - Purple sacred theme
- `.naples` - Orange warm theme
- `.capri` - Blue sea theme
