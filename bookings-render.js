// ================================
// Bookings Renderer
// Single source of truth: data/itinerary.json (booking objects on timeline items)
// EN + ZH inline per field. Static UI strings via translations.js.
//
// Page model:
//   - Items with booking.required === true and urgency !== 'day_of' show on this page
//   - Three urgency sections: Book Now / Book Soon / Casual
//   - Filter pills group categories: Transportation = flight|train|bus|ferry|car;
//     Food = restaurant; Sights = attraction; Stays = accommodation
//   - Done state seeds from JSON booking.done; localStorage overrides per item id (`<day>-<time>`)
// ================================

(function () {
    const LANG_KEY = 'italy-trip-lang';
    const DONE_KEY = 'italy-trip-bookings';
    const FILTER_KEY = 'italy-trip-bookings-filters'; // remembered across page loads

    // Firestore — used as the source of truth for booking done-state across devices.
    // localStorage is a write-through cache for instant UX + offline resilience.
    const FIREBASE_PROJECT = 'trip-webapp-de677';
    const TRIP_ID = 'italy-2026';
    const FIRESTORE_BASE =
        `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}` +
        `/databases/(default)/documents/trips/${TRIP_ID}/bookings`;
    // Doc-id safe-form: "3-13:00" -> "3-13-00" (avoid colons in URL paths)
    const docIdFor = (id) => id.replace(/:/g, '-');
    // Reverse: "3-13-00" -> "3-13:00" (last "-DD" becomes ":DD" for time)
    const idFromDoc = (safeId) => safeId.replace(/^(\d+)-(\d+)-(\d+)$/, '$1-$2:$3');

    const URGENCY_ORDER = ['now', 'soon', 'casual'];
    const URGENCY_ICONS = { now: '⚡', soon: '⏰', casual: '🚶' };

    // category → emoji used inside the round badge on each card
    const CAT_ICON = {
        flight: '✈️', train: '🚆', bus: '🚌', ferry: '⛴️', car: '🚗',
        restaurant: '🍝', attraction: '🎟️', accommodation: '🏨'
    };
    // category → CSS class used to color the title + badge
    const CAT_CLASS = {
        flight: 'cat-transport', train: 'cat-transport', bus: 'cat-transport',
        ferry: 'cat-transport', car: 'cat-transport',
        restaurant: 'cat-food',
        attraction: 'cat-sights',
        accommodation: 'cat-stays'
    };
    // Pill ↔ category-set mapping. Keep in sync with the CAT_CLASS groups.
    const PILL_CATS = {
        transport: ['flight', 'train', 'bus', 'ferry', 'car'],
        food: ['restaurant'],
        sights: ['attraction'],
        stays: ['accommodation']
    };
    const ALL_PILLS = ['transport', 'food', 'sights', 'stays'];

    // ================================
    // Helpers
    // ================================
    const getLang = () => localStorage.getItem(LANG_KEY) || 'en';
    const t = (field, lang) => {
        if (field == null) return '';
        if (typeof field === 'string') return field;
        return field[lang] || field.en || '';
    };
    const escapeAttr = (s) => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Look up a translations.js key, falling back to a sensible default.
    function tr(key, lang, fallbackEn) {
        if (lang === 'zh' && typeof TRANSLATIONS !== 'undefined' && TRANSLATIONS[key]) {
            return TRANSLATIONS[key];
        }
        return fallbackEn;
    }

    // Trip start: June 3, 2026. Day N = June (2 + N).
    // ZH uses compact "M/D" format ("6/3") to match Figma mobile spec.
    function dayDateLabel(dayNumber, lang) {
        const dayNum = 2 + Number(dayNumber);
        return lang === 'zh' ? `6/${dayNum}` : `Jun ${dayNum}`;
    }

    // Maps "directions" URL — same convention as itinerary-render.js
    function buildMapsUrl(location) {
        if (!location) return '';
        const en = (f) => {
            if (f == null) return '';
            if (typeof f === 'string') return f;
            return f.en || f.zh || '';
        };
        let q = en(location.mapsQuery);
        if (!q && location.address) {
            const name = en(location.name);
            const addr = en(location.address);
            q = name ? `${name}, ${addr}` : addr;
        }
        if (!q) {
            const name = en(location.name);
            if (name) q = name;
        }
        q = q.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
        if (!q) return '';
        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
    }

    // ================================
    // State
    // ================================
    let cachedData = null;     // raw itinerary.json
    let bookings = [];         // flat list of {dayNumber, dayDate, dayCity, item, idx}
    let filterState = loadFilterState();

    function loadFilterState() {
        try {
            const raw = localStorage.getItem(FILTER_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.pills) && typeof parsed.hideDone === 'boolean') {
                    return parsed;
                }
            }
        } catch (e) { /* fall through */ }
        return { pills: ALL_PILLS.slice(), hideDone: false };
    }
    function saveFilterState() {
        try { localStorage.setItem(FILTER_KEY, JSON.stringify(filterState)); } catch (e) {}
    }
    function isDefaultFilter() {
        return !filterState.hideDone
            && filterState.pills.length === ALL_PILLS.length
            && ALL_PILLS.every(p => filterState.pills.includes(p));
    }

    // ================================
    // Storage layer — Firestore (truth) + localStorage (cache)
    // ================================
    function loadDoneOverrides() {
        try {
            const raw = localStorage.getItem(DONE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }
    function setDoneOverride(id, value) {
        // Write-through: cache locally first (instant UX), then push to Firestore.
        const map = loadDoneOverrides();
        map[id] = value;
        try { localStorage.setItem(DONE_KEY, JSON.stringify(map)); } catch (e) {}
        writeFirestoreDone(id, value).catch(err =>
            console.warn('[bookings] Firestore write failed (kept locally):', err));
    }
    function effectiveDone(id, jsonDone) {
        const map = loadDoneOverrides();
        return Object.prototype.hasOwnProperty.call(map, id) ? !!map[id] : !!jsonDone;
    }

    // Fetch the entire bookings collection in one round-trip.
    async function fetchFirestoreOverrides() {
        const res = await fetch(FIRESTORE_BASE);
        if (!res.ok) {
            if (res.status === 404) return {}; // empty collection
            throw new Error(`Firestore read failed: HTTP ${res.status}`);
        }
        const json = await res.json();
        const out = {};
        for (const doc of (json.documents || [])) {
            // doc.name = "projects/.../bookings/3-13-00"
            const safeId = doc.name.split('/').pop();
            const id = idFromDoc(safeId);
            const fields = doc.fields || {};
            if (fields.done && typeof fields.done.booleanValue === 'boolean') {
                out[id] = fields.done.booleanValue;
            }
        }
        return out;
    }

    // PATCH = create-or-update for a single booking doc.
    async function writeFirestoreDone(id, value) {
        const url = `${FIRESTORE_BASE}/${docIdFor(id)}`;
        const body = JSON.stringify({
            fields: {
                done: { booleanValue: !!value },
                updatedAt: { timestampValue: new Date().toISOString() }
            }
        });
        const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }

    // Called once on page load AFTER the initial JSON+cache render.
    // Merges remote state in, refreshes cache + UI if anything changed.
    async function syncFromFirestoreAndRerender() {
        try {
            const remote = await fetchFirestoreOverrides();
            const local = loadDoneOverrides();
            const merged = Object.assign({}, local, remote); // remote wins on conflict
            const changed = JSON.stringify(merged) !== JSON.stringify(local);
            if (changed) {
                try { localStorage.setItem(DONE_KEY, JSON.stringify(merged)); } catch (e) {}
                renderAll();
            }
        } catch (err) {
            console.warn('[bookings] Firestore sync skipped (offline or error):', err);
        }
    }

    // ================================
    // Data flatten
    // ================================
    function collectBookings(data) {
        const out = [];
        for (const day of (data.days || [])) {
            const dayNumber = day.number;
            const dayDate = day.date;
            const dayCity = day.city;
            const dayTheme = day.theme;
            for (const item of (day.timeline || [])) {
                const b = item.booking;
                if (!b || !b.required) continue;
                if (b.urgency === 'day_of') continue;
                out.push({ dayNumber, dayDate, dayCity, dayTheme, item });
            }
        }
        return out;
    }

    function bookingId(entry) {
        return `${entry.dayNumber}-${entry.item.time}`;
    }

    function categoryPill(category) {
        for (const [pill, cats] of Object.entries(PILL_CATS)) {
            if (cats.includes(category)) return pill;
        }
        return null;
    }

    function passesFilter(entry) {
        const cat = entry.item.booking.category;
        const pill = categoryPill(cat);
        if (pill && !filterState.pills.includes(pill)) return false;
        if (filterState.hideDone) {
            const id = bookingId(entry);
            const done = effectiveDone(id, entry.item.booking.done);
            if (done) return false;
        }
        return true;
    }

    // ================================
    // Render — hero / intro
    // ================================
    function renderHero(stats, lang) {
        const title = tr('bookings.title', lang, 'Bookings & Reservations');
        const subtitle = tr('bookings.subtitle', lang, 'Track what to book before the trip');
        // Three separate chips per the mockup, instead of one combined pill.
        const itemsLabel  = tr('bookings.stats.items',  lang, 'items');
        const bookedLabel = tr('bookings.stats.booked', lang, 'booked');
        const toGoLabel   = tr('bookings.stats.toGo',   lang, 'to go');
        const chips = `
            <span class="bk-stat-chip"><span class="stat-num stat-total">${stats.total}</span> ${escapeAttr(itemsLabel)}</span>
            <span class="bk-stat-chip"><span class="stat-num stat-done">${stats.done}</span> ${escapeAttr(bookedLabel)}</span>
            <span class="bk-stat-chip"><span class="stat-num stat-remaining">${stats.remaining}</span> ${escapeAttr(toGoLabel)}</span>
        `;
        return `
            <section class="bookings-hero">
                <div class="bookings-hero-inner">
                    <div class="bookings-hero-icon" aria-hidden="true">📅</div>
                    <div class="bookings-hero-text">
                        <h1>${escapeAttr(title)}</h1>
                        <p class="bookings-hero-subtitle">${escapeAttr(subtitle)}</p>
                        <div class="bookings-hero-stats">${chips}</div>
                    </div>
                    <div class="bookings-hero-illustration" aria-hidden="true">
                        ${heroIllustrationSvg()}
                    </div>
                </div>
            </section>
        `;
    }

    // Per the Figma design, the hero illustration is just three simple emoji
    // icons floating side by side — a classical building between two cypress
    // trees. Cleaner and more in keeping with the rest of the page than a
    // custom SVG.
    function heroIllustrationSvg() {
        return `
            <span class="hero-emoji hero-emoji-building" aria-hidden="true">🏛️</span>
            <span class="hero-emoji hero-emoji-tree" aria-hidden="true">🌲</span>
            <span class="hero-emoji hero-emoji-tree" aria-hidden="true">🌲</span>
        `;
    }

    // ================================
    // Render — filter pills
    // ================================
    function renderFilterBar(lang) {
        const labels = {
            transport: tr('bookings.filter.transport', lang, 'Transportation'),
            food: tr('bookings.filter.food', lang, 'Food'),
            sights: tr('bookings.filter.sights', lang, 'Sights'),
            stays: tr('bookings.filter.stays', lang, 'Stays')
        };
        const icons = { transport: '🚆', food: '🍝', sights: '🎟️', stays: '🏨' };
        const pills = ALL_PILLS.map(p => {
            const active = filterState.pills.includes(p);
            return `
                <button class="bk-pill bk-pill-${p}${active ? ' active' : ''}"
                        type="button"
                        data-pill="${p}"
                        aria-pressed="${active}">
                    <span class="bk-pill-icon" aria-hidden="true">${icons[p]}</span>
                    <span class="bk-pill-label">${escapeAttr(labels[p])}</span>
                </button>`;
        }).join('');

        const hideDoneLabel = tr('bookings.filter.hideDone', lang, 'Hide done');
        const resetLabel = tr('bookings.filter.reset', lang, 'Reset');

        // Reset is always rendered (per mockup); clicking when already in default
        // state is a no-op. Visual state is dimmed when at default to convey "no
        // filter to reset" without making it actually disappear.
        const isDefault = isDefaultFilter();

        return `
            <section class="bk-filter-bar" role="toolbar" aria-label="Bookings filter">
                <div class="bk-filter-pills">${pills}</div>
                <div class="bk-filter-controls">
                    <label class="bk-toggle">
                        <span class="bk-toggle-label">${escapeAttr(hideDoneLabel)}</span>
                        <input type="checkbox" id="bk-hide-done" ${filterState.hideDone ? 'checked' : ''}>
                        <span class="bk-toggle-track" aria-hidden="true"><span class="bk-toggle-thumb"></span></span>
                    </label>
                    <button class="bk-reset${isDefault ? ' bk-reset-default' : ''}" type="button" id="bk-reset" aria-disabled="${isDefault}">
                        <span aria-hidden="true">↻</span> ${escapeAttr(resetLabel)}
                    </button>
                </div>
            </section>
        `;
    }

    // ================================
    // Render — section + cards
    // ================================
    function renderSection(urgency, entries, lang) {
        // entries already filtered + sorted (chronological by trip day)
        const total = entries.length;
        const doneCount = entries.filter(e => effectiveDone(bookingId(e), e.item.booking.done)).length;
        const allDone = total > 0 && doneCount === total;

        const titleKey = `bookings.section.${urgency}`;
        const fallback = { now: 'Book Now', soon: 'Book Soon', casual: 'Casual / Walk-in' }[urgency];
        const title = tr(titleKey, lang, fallback);

        const countTemplate = tr('bookings.count', lang, '{done} of {total} done');
        const countText = countTemplate
            .replace('{done}', String(doneCount))
            .replace('{total}', String(total));

        let body;
        if (total === 0) {
            // Section has no items at all (e.g. filter excludes everything)
            body = `<div class="bk-section-empty">—</div>`;
        } else if (allDone) {
            const allDoneLabel = tr('bookings.empty.allDone', lang, '🎉 All booked!');
            const subtitle = tr('bookings.empty.allDoneSubtitle', lang,
                'Great job! Nothing in this section needs booking.');
            // Per Figma, the celebrate state is a single inline "🎉 All booked!"
            // line followed by a small grey subtitle — no decorative confetti.
            const labelText = allDoneLabel.replace(/^🎉\s*/, '');
            body = `
                <div class="bk-section-celebrate">
                    <div class="bk-celebrate-icon-row">
                        <span class="bk-celebrate-icon" aria-hidden="true">🎉</span>
                        <span class="bk-celebrate-text">${escapeAttr(labelText)}</span>
                    </div>
                    <div class="bk-celebrate-subtitle">${escapeAttr(subtitle)}</div>
                </div>`;
        } else {
            body = entries.map(e => renderCard(e, lang)).join('');
        }

        return `
            <section class="bk-section bk-section-${urgency}" data-urgency="${urgency}">
                <header class="bk-section-header" role="button" tabindex="0" aria-expanded="true">
                    <span class="bk-section-icon" aria-hidden="true">${URGENCY_ICONS[urgency]}</span>
                    <h2 class="bk-section-title">${escapeAttr(title)}</h2>
                    <span class="bk-section-count">${escapeAttr(countText)}</span>
                    <span class="bk-section-toggle" aria-hidden="true">▾</span>
                </header>
                <div class="bk-section-body">${body}</div>
            </section>
        `;
    }

    function renderCard(entry, lang) {
        const item = entry.item;
        const b = item.booking;
        const id = bookingId(entry);
        const done = effectiveDone(id, b.done);
        const cat = b.category;
        const catClass = CAT_CLASS[cat] || '';
        const catIcon = CAT_ICON[cat] || '•';

        // Day + date label (top-left meta column). Format matches Figma:
        //   EN: "Day 4"   ZH: "第 4 天"
        const dayDateLabelStr = lang === 'zh'
            ? `第 ${entry.dayNumber} 天`
            : `Day ${entry.dayNumber}`;
        const monthDay = dayDateLabel(entry.dayNumber, lang);
        const time = item.time || '';

        const titleHtml = escapeAttr(t(item.activity, lang));
        const hint = b.hint ? t(b.hint, lang) : '';

        // Price (right column on desktop; CSS toggles which copy is visible)
        let priceHtml = '';
        let mobilePriceHtml = '';
        if (item.price) {
            const amount = escapeAttr(item.price.amount || '');
            const perPerson = item.price.perPerson
                ? `<span class="bk-price-pp">${lang === 'zh' ? '每人' : 'per person'}</span>`
                : '';
            priceHtml = `<div class="bk-price"><span class="bk-price-amount">${amount}</span>${perPerson}</div>`;
            // Compact mobile-only mirror (slots into .bk-body grid via CSS).
            mobilePriceHtml = `<span class="bk-mobile-price">${amount}</span>`;
        }

        // Action links
        const bookCta = tr('bookings.bookCta', lang, 'book →');
        const itinLabel = (lang === 'zh' ? `行程：第 ${entry.dayNumber} 天` : `Itinerary: Day ${entry.dayNumber}`);
        const dirLabel = tr('bookings.directions', lang, 'Directions');

        const actions = [];
        if (item.link && item.link.url) {
            actions.push(`<a class="bk-action bk-action-book" href="${escapeAttr(item.link.url)}" target="_blank" rel="noopener">${escapeAttr(bookCta)}</a>`);
        }
        actions.push(`<a class="bk-action bk-action-itin" href="itinerary.html#day-${entry.dayNumber}">${escapeAttr(itinLabel)} ↗</a>`);
        const mapsUrl = buildMapsUrl(item.location);
        if (mapsUrl) {
            actions.push(`<a class="bk-action bk-action-dir" href="${escapeAttr(mapsUrl)}" target="_blank" rel="noopener">📍 ${escapeAttr(dirLabel)}</a>`);
        }

        // Title is always wrapped in an anchor to the matching itinerary day.
        // Desktop CSS suppresses link styling so it reads as plain text; on mobile
        // (where action links are hidden) tapping the title is the navigation.
        const titleAnchorOpen = `<a class="bk-title-link" href="itinerary.html#day-${entry.dayNumber}">`;
        const titleAnchorClose = `</a>`;

        return `
            <article class="bk-card${done ? ' is-done' : ''} ${catClass}" data-id="${escapeAttr(id)}">
                <label class="bk-checkbox" aria-label="Mark booked">
                    <input type="checkbox" class="bk-check" ${done ? 'checked' : ''}>
                    <span class="bk-checkbox-box" aria-hidden="true"></span>
                </label>
                <div class="bk-cat-badge ${catClass}" aria-hidden="true">${catIcon}</div>
                <div class="bk-meta">
                    <span class="bk-day">${escapeAttr(dayDateLabelStr)}</span>
                    <span class="bk-date">${escapeAttr(monthDay)}</span>
                </div>
                <div class="bk-time">${escapeAttr(time)}</div>
                <div class="bk-body">
                    <h3 class="bk-title ${catClass}">${titleAnchorOpen}${titleHtml}${titleAnchorClose}</h3>
                    ${hint ? `<p class="bk-hint">${escapeAttr(hint)}</p>` : ''}
                    ${mobilePriceHtml}
                </div>
                <div class="bk-right">
                    ${priceHtml}
                    <div class="bk-actions">${actions.join('')}</div>
                </div>
            </article>
        `;
    }

    function renderFooterLinks(lang) {
        const back = lang === 'zh' ? '← 返回行程' : '← Back to Itinerary';
        const tips = lang === 'zh' ? '貼士與行李 →' : 'Tips & Packing →';
        return `
            <div class="bookings-footer">
                <a href="itinerary.html" class="cta-button secondary">${escapeAttr(back)}</a>
                <a href="tips.html" class="cta-button">${escapeAttr(tips)}</a>
            </div>
        `;
    }

    // ================================
    // Top-level render
    // ================================
    function renderAll() {
        const root = document.getElementById('bookings-app');
        if (!root) return;
        const lang = getLang();

        // Always recompute against the current cached data (lang change re-renders)
        bookings = collectBookings(cachedData);

        // Group by urgency, with each section already filtered + chronologically sorted
        const byUrgency = { now: [], soon: [], casual: [] };
        for (const e of bookings) {
            const u = e.item.booking.urgency;
            if (!URGENCY_ORDER.includes(u)) continue;
            if (!passesFilter(e)) continue;
            byUrgency[u].push(e);
        }
        // Stable chronological sort: by day number then time
        for (const u of URGENCY_ORDER) {
            byUrgency[u].sort((a, b) => {
                if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
                return String(a.item.time).localeCompare(String(b.item.time));
            });
        }

        // Stats are computed across ALL bookings (not filtered) so the headline number is stable.
        const totalAll = bookings.length;
        const doneAll = bookings.filter(e => effectiveDone(bookingId(e), e.item.booking.done)).length;
        const stats = { total: totalAll, done: doneAll, remaining: totalAll - doneAll };

        const sections = URGENCY_ORDER.map(u => renderSection(u, byUrgency[u], lang)).join('');

        root.innerHTML = `
            ${renderHero(stats, lang)}
            ${renderFilterBar(lang)}
            <div class="bk-sections">${sections}</div>
            ${renderFooterLinks(lang)}
        `;
    }

    function renderError(err) {
        const root = document.getElementById('bookings-app');
        if (!root) return;
        root.innerHTML = `
            <div class="page-header">
                <h1>Failed to load bookings</h1>
                <p class="page-subtitle">Check <code>data/itinerary.json</code> — ${escapeAttr(err.message || String(err))}</p>
            </div>
        `;
    }

    // ================================
    // Event delegation
    // ================================
    function initDelegatedEvents() {
        const root = document.getElementById('bookings-app');
        if (!root) return;

        // Checkbox toggle (done state)
        root.addEventListener('change', (e) => {
            const cb = e.target.closest('.bk-check');
            if (!cb) return;
            const card = cb.closest('.bk-card');
            if (!card) return;
            const id = card.dataset.id;
            const checked = !!cb.checked;
            setDoneOverride(id, checked);
            // Re-render — counts and (if hide-done is on) visibility update
            renderAll();
        });

        // Hide-done toggle
        root.addEventListener('change', (e) => {
            const t = e.target;
            if (t && t.id === 'bk-hide-done') {
                filterState.hideDone = !!t.checked;
                saveFilterState();
                renderAll();
            }
        });

        // Click handlers (delegated)
        root.addEventListener('click', (e) => {
            // Filter pill toggle
            const pill = e.target.closest('.bk-pill');
            if (pill) {
                const p = pill.dataset.pill;
                const idx = filterState.pills.indexOf(p);
                if (idx === -1) filterState.pills.push(p);
                else filterState.pills.splice(idx, 1);
                saveFilterState();
                renderAll();
                return;
            }

            // Reset filter
            const reset = e.target.closest('#bk-reset');
            if (reset) {
                filterState = { pills: ALL_PILLS.slice(), hideDone: false };
                saveFilterState();
                renderAll();
                return;
            }

            // Section collapse
            const header = e.target.closest('.bk-section-header');
            if (header && !e.target.closest('a, button, input, label')) {
                const section = header.closest('.bk-section');
                if (section) {
                    const isCollapsed = section.classList.toggle('is-collapsed');
                    header.setAttribute('aria-expanded', String(!isCollapsed));
                }
                return;
            }
        });

        // Keyboard toggle for section header
        root.addEventListener('keydown', (e) => {
            const header = e.target.closest('.bk-section-header');
            if (!header) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const section = header.closest('.bk-section');
                if (section) {
                    const isCollapsed = section.classList.toggle('is-collapsed');
                    header.setAttribute('aria-expanded', String(!isCollapsed));
                }
            }
        });
    }

    // ================================
    // Boot
    // ================================
    async function loadItinerary() {
        const res = await fetch('data/itinerary.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching itinerary.json`);
        return res.json();
    }

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            cachedData = await loadItinerary();
            renderAll();
            initDelegatedEvents();
            // Fire-and-forget: instant first paint from JSON+cache, then upgrade
            // with Firestore data if/when it arrives.
            syncFromFirestoreAndRerender();
        } catch (err) {
            console.error('Bookings load failed:', err);
            renderError(err);
        }
    });

    window.addEventListener('app-lang-change', () => {
        if (cachedData) renderAll();
    });
})();
