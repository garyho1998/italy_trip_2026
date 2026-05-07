// ================================
// Budget Renderer
// Source of truth: data/itinerary.json (seed) + Firestore (live overrides)
//
// Page model:
//   - Items: timeline entries with a `price` field, hotel rows (one per stay
//     group, attached to the first day of that stay), and pre-trip items
//     (sibling `preTrip` block in the JSON). Plus user-added "extras" stored
//     only in Firestore.
//   - Display: each row shows HKD primary + source-currency in parens.
//     Toggle at top: Total ↔ Per person (divides by `travelers`).
//   - Editing: always-on number input + currency dropdown next to each row.
//     Live counter at top updates on every keystroke.
//     Blur commits to localStorage immediately, fire-and-forget PATCH to
//     Firestore. (Reload-from-Firestore wins on next page load — last write
//     wins is fine for this trip.)
//   - Day cards collapse by default. Single-open accordion: opening a day
//     closes all the others. Clicking the open one collapses it.
// ================================

(function () {
    const LANG_KEY = 'italy-trip-lang';
    const PRICES_CACHE_KEY = 'italy-trip-budget-prices';
    const EXTRAS_CACHE_KEY = 'italy-trip-budget-extras';
    const TRAVELERS_CACHE_KEY = 'italy-trip-budget-travelers';
    const FX_CACHE_KEY = 'italy-trip-fx-eur-hkd';
    const DEFAULT_CURRENCY_KEY = 'italy-trip-default-currency';
    const PER_PERSON_KEY = 'italy-trip-budget-per-person';
    const OPEN_DAY_KEY = 'italy-trip-budget-open-day';

    // Firestore — same parent doc as bookings-render.js
    const FIREBASE_PROJECT = 'trip-webapp-de677';
    const TRIP_ID = 'italy-2026';
    const FIRESTORE_DOC_BASE =
        `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}` +
        `/databases/(default)/documents/trips/${TRIP_ID}`;
    const PRICES_BASE = `${FIRESTORE_DOC_BASE}/prices`;
    const EXTRAS_BASE = `${FIRESTORE_DOC_BASE}/extras`;

    const SUPPORTED_CURRENCIES = ['EUR', 'HKD'];
    const CURRENCY_SYMBOL = { EUR: '€', HKD: 'HK$' };

    // Doc-id safe-form: ":" is illegal in REST URL paths
    const safeId = (id) => id.replace(/:/g, '-');

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
    function tr(key, lang, fallbackEn) {
        if (lang === 'zh' && typeof TRANSLATIONS !== 'undefined' && TRANSLATIONS[key]) {
            return TRANSLATIONS[key];
        }
        return fallbackEn;
    }

    // Trip start: June 3, 2026 = Day 1. Pre-trip = June 2.
    function dayDateLabel(dayKey, lang) {
        if (dayKey === 'preTrip') return lang === 'zh' ? '6/2' : 'Jun 2';
        const dayNum = 2 + Number(dayKey);
        return lang === 'zh' ? `6/${dayNum}` : `Jun ${dayNum}`;
    }

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) { return fallback; }
    }
    function writeJson(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    // ================================
    // State
    // ================================
    let cachedData = null;
    let prices = {};       // id -> { amount, currency }
    let extras = {};       // id -> { dayKey, time, activity:{en,zh}, info?:{en,zh}, amount, currency }
    let travelers = 6;
    let fxRate = 9.16;     // updated by getFxEurToHkd() on boot
    let fxSource = 'fallback';  // 'live' | 'cache' | 'fallback'
    let perPerson = readJson(PER_PERSON_KEY, false);
    let openDayKey = localStorage.getItem(OPEN_DAY_KEY) || null;
    let lastDeleted = null; // { id, value, timer } for undo toast

    // ================================
    // Storage layer — localStorage cache (fast paint) + Firestore (truth)
    // ================================
    function loadFromCache() {
        prices = readJson(PRICES_CACHE_KEY, {});
        extras = readJson(EXTRAS_CACHE_KEY, {});
        travelers = Number(localStorage.getItem(TRAVELERS_CACHE_KEY)) || 6;
    }

    function setPriceLocal(id, value) {
        prices[id] = value;
        writeJson(PRICES_CACHE_KEY, prices);
    }
    function deletePriceLocal(id) {
        delete prices[id];
        writeJson(PRICES_CACHE_KEY, prices);
    }
    function setExtraLocal(id, value) {
        extras[id] = value;
        writeJson(EXTRAS_CACHE_KEY, extras);
    }
    function deleteExtraLocal(id) {
        delete extras[id];
        writeJson(EXTRAS_CACHE_KEY, extras);
    }
    function setTravelersLocal(n) {
        travelers = n;
        try { localStorage.setItem(TRAVELERS_CACHE_KEY, String(n)); } catch (e) {}
    }

    // Encode a plain object to Firestore typed-JSON
    function encodeValue(v) {
        if (v === null || v === undefined) return { nullValue: null };
        if (typeof v === 'boolean') return { booleanValue: v };
        if (typeof v === 'number') {
            return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
        }
        if (typeof v === 'string') return { stringValue: v };
        if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
        if (typeof v === 'object') {
            const fields = {};
            for (const k of Object.keys(v)) fields[k] = encodeValue(v[k]);
            return { mapValue: { fields } };
        }
        return { stringValue: String(v) };
    }
    function encodeFields(obj) {
        const fields = {};
        for (const k of Object.keys(obj)) fields[k] = encodeValue(obj[k]);
        return { fields };
    }
    function decodeValue(field) {
        if (!field || typeof field !== 'object') return null;
        if ('nullValue' in field) return null;
        if ('booleanValue' in field) return field.booleanValue;
        if ('integerValue' in field) return Number(field.integerValue);
        if ('doubleValue' in field) return field.doubleValue;
        if ('stringValue' in field) return field.stringValue;
        if ('timestampValue' in field) return field.timestampValue;
        if ('arrayValue' in field) return (field.arrayValue.values || []).map(decodeValue);
        if ('mapValue' in field) {
            const out = {};
            const f = field.mapValue.fields || {};
            for (const k of Object.keys(f)) out[k] = decodeValue(f[k]);
            return out;
        }
        return null;
    }

    async function fetchAllDocs(baseUrl) {
        const out = {};
        let pageToken = null;
        do {
            const url = pageToken ? `${baseUrl}?pageToken=${encodeURIComponent(pageToken)}` : baseUrl;
            const res = await fetch(url);
            if (!res.ok) {
                if (res.status === 404) return out;
                throw new Error(`HTTP ${res.status}`);
            }
            const j = await res.json();
            for (const doc of (j.documents || [])) {
                const id = doc.name.split('/').pop();
                const fields = doc.fields || {};
                const decoded = {};
                for (const k of Object.keys(fields)) decoded[k] = decodeValue(fields[k]);
                out[id] = decoded;
            }
            pageToken = j.nextPageToken || null;
        } while (pageToken);
        return out;
    }

    async function writeFirestoreDoc(baseUrl, docId, body) {
        const url = `${baseUrl}/${safeId(docId)}`;
        const payload = JSON.stringify({
            ...encodeFields({
                ...body,
                updatedAt: new Date().toISOString()
            })
        });
        // Use timestampValue for updatedAt (encoded above as stringValue).
        // PATCH = upsert.
        const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });
        if (!res.ok) throw new Error(`Firestore PATCH ${docId}: HTTP ${res.status}`);
    }

    async function deleteFirestoreDoc(baseUrl, docId) {
        const url = `${baseUrl}/${safeId(docId)}`;
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) {
            throw new Error(`Firestore DELETE ${docId}: HTTP ${res.status}`);
        }
    }

    async function syncFromFirestore() {
        try {
            const [remotePrices, remoteExtras, parentDoc] = await Promise.all([
                fetchAllDocs(PRICES_BASE),
                fetchAllDocs(EXTRAS_BASE),
                fetch(FIRESTORE_DOC_BASE).then(r => r.ok ? r.json() : null)
            ]);
            // Map remote docs back to flat shape (drop updatedAt)
            const cleanPrices = {};
            for (const [id, v] of Object.entries(remotePrices)) {
                cleanPrices[id] = { amount: v.amount, currency: v.currency };
            }
            const cleanExtras = {};
            for (const [id, v] of Object.entries(remoteExtras)) {
                cleanExtras[id] = {
                    dayKey: v.dayKey,
                    time: v.time,
                    activity: v.activity,
                    info: v.info,
                    amount: v.amount,
                    currency: v.currency
                };
            }
            const remoteTravelers = parentDoc && parentDoc.fields && parentDoc.fields.travelers
                ? Number(parentDoc.fields.travelers.integerValue || parentDoc.fields.travelers.doubleValue || 6)
                : null;

            const changed =
                JSON.stringify(cleanPrices) !== JSON.stringify(prices) ||
                JSON.stringify(cleanExtras) !== JSON.stringify(extras) ||
                (remoteTravelers && remoteTravelers !== travelers);

            prices = cleanPrices;
            extras = cleanExtras;
            writeJson(PRICES_CACHE_KEY, prices);
            writeJson(EXTRAS_CACHE_KEY, extras);
            if (remoteTravelers) setTravelersLocal(remoteTravelers);

            if (changed) renderAll();
        } catch (e) {
            console.warn('[budget] Firestore sync skipped:', e.message);
        }
    }

    // Delete with 5-second undo window. Removes locally + from Firestore right away;
    // if user hits Undo, we put it back.
    function deleteExtraWithUndo(id) {
        const value = extras[id];
        if (!value) return;
        commitDeleteExtra(id);
        if (lastDeleted && lastDeleted.timer) {
            clearTimeout(lastDeleted.timer);
            hideToast();
        }
        const timer = setTimeout(() => {
            lastDeleted = null;
            hideToast();
        }, 5000);
        lastDeleted = { id, value, timer };
        showToast();
    }

    function showToast() {
        let toast = document.querySelector('.bg-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'bg-toast';
            document.body.appendChild(toast);
            // Toast lives outside #budget-app, so it needs its own click handler.
            toast.addEventListener('click', (e) => {
                if (e.target.closest('.bg-toast-undo') && lastDeleted) {
                    clearTimeout(lastDeleted.timer);
                    commitExtra(lastDeleted.id, lastDeleted.value);
                    lastDeleted = null;
                    hideToast();
                    renderAll();
                }
            });
        }
        const lang = getLang();
        const msg = tr('budget.toast.deleted', lang, 'Item deleted');
        const undoLabel = tr('budget.toast.undo', lang, 'Undo');
        toast.innerHTML = `
            <span class="bg-toast-msg">${escapeAttr(msg)}</span>
            <button type="button" class="bg-toast-undo">${escapeAttr(undoLabel)}</button>
        `;
        toast.classList.add('is-visible');
    }
    function hideToast() {
        const toast = document.querySelector('.bg-toast');
        if (toast) toast.classList.remove('is-visible');
    }

    // Fire-and-forget Firestore writes
    function commitPrice(id, amount, currency) {
        const value = { amount: amount == null ? null : Number(amount), currency };
        setPriceLocal(id, value);
        writeFirestoreDoc(PRICES_BASE, id, value).catch(err =>
            console.warn('[budget] price write failed (kept local):', err.message));
    }
    function commitExtra(id, value) {
        setExtraLocal(id, value);
        writeFirestoreDoc(EXTRAS_BASE, id, value).catch(err =>
            console.warn('[budget] extra write failed (kept local):', err.message));
    }
    function commitDeleteExtra(id) {
        deleteExtraLocal(id);
        deleteFirestoreDoc(EXTRAS_BASE, id).catch(err =>
            console.warn('[budget] extra delete failed (kept local):', err.message));
    }

    // ================================
    // Item collection
    // ================================
    // Build the flat list of budget rows grouped by dayKey.
    // dayKey = 'preTrip' | '1' | '2' | ... | '11'
    function collectItems(data) {
        const out = {}; // dayKey -> [items]

        // Pre-trip
        if (data.preTrip && Array.isArray(data.preTrip.timeline)) {
            const arr = [];
            data.preTrip.timeline.forEach((tl, idx) => {
                arr.push({
                    type: 'preTrip',
                    id: `pt-${tl.time || idx}`,
                    dayKey: 'preTrip',
                    time: tl.time || '',
                    activity: tl.activity,
                    info: tl.info,
                    seedPrice: tl.price || null,
                    deletable: false,
                    editableFields: ['price']
                });
            });
            out.preTrip = arr;
        }

        // Days
        let prevStayName = null;
        for (const day of (data.days || [])) {
            const dayKey = String(day.number);
            const items = [];

            // Hotel row — only on the first day of each stay group.
            // Detection: previous day's stay.name differs from this day's stay.name.
            const stay = day.stay || {};
            const stayName = (stay.name && (stay.name.en || stay.name.zh || stay.name)) || '';
            const isFirstOfGroup = stayName && stayName !== prevStayName;
            prevStayName = stayName;
            if (isFirstOfGroup) {
                // Count nights = days that share this stayName starting here
                let nights = 0;
                for (let k = day.number - 1; k < (data.days || []).length; k++) {
                    const dk = data.days[k];
                    const sn = (dk.stay && dk.stay.name &&
                        (dk.stay.name.en || dk.stay.name.zh || dk.stay.name)) || '';
                    if (sn === stayName) nights++;
                    else break;
                }
                // Short label: text before first " · " (e.g. "Rome Airbnb")
                const shortName = (label, full) => {
                    if (!full) return '';
                    const idx = full.indexOf(' · ');
                    return idx > 0 ? full.slice(0, idx) : full;
                };
                const fullEn = (stay.name && stay.name.en) || stayName;
                const fullZh = (stay.name && stay.name.zh) || stayName;
                items.push({
                    type: 'hotel',
                    id: `h-day${day.number}`,
                    dayKey,
                    // 23:00 puts hotels at the end of the day so they don't collide
                    // with 20:00 dinner items in the time sort.
                    time: '23:00',
                    activity: { en: shortName('en', fullEn), zh: shortName('zh', fullZh) },
                    info: nights > 0
                        ? {
                            en: `🏨 ${nights} night${nights === 1 ? '' : 's'} · ${travelers} guests`,
                            zh: `🏨 ${nights}晚 · ${travelers}位住客`
                        }
                        : { en: '', zh: '' },
                    seedPrice: (stay.budgetAmount != null || stay.budgetCurrency)
                        ? { amount: stay.budgetAmount, currency: stay.budgetCurrency || 'EUR' }
                        : null,
                    deletable: false,
                    editableFields: ['price']
                });
            }

            // Timeline items with a price
            for (const tl of (day.timeline || [])) {
                if (!tl.price) continue;
                items.push({
                    type: 'timeline',
                    id: `t-${day.number}-${tl.time}`,
                    dayKey,
                    time: tl.time || '',
                    activity: tl.activity,
                    info: tl.info,
                    seedPrice: tl.price,
                    deletable: false,
                    editableFields: ['price']
                });
            }

            out[dayKey] = items;
        }

        // Extras — append to whichever day they're on
        for (const [exId, ex] of Object.entries(extras)) {
            const dayKey = ex.dayKey || 'preTrip';
            if (!out[dayKey]) out[dayKey] = [];
            out[dayKey].push({
                type: 'extra',
                id: exId,
                dayKey,
                time: ex.time || '00:00',
                activity: ex.activity,
                info: ex.info,
                seedPrice: { amount: ex.amount, currency: ex.currency },
                deletable: true,
                editableFields: ['time', 'activity', 'info', 'price']
            });
        }

        // Sort each day by time
        for (const k of Object.keys(out)) {
            out[k].sort((a, b) => String(a.time).localeCompare(String(b.time)));
        }
        return out;
    }

    // Effective price: localStorage override beats seed
    function effectivePrice(id, seedPrice) {
        if (Object.prototype.hasOwnProperty.call(prices, id)) {
            return prices[id];
        }
        return seedPrice ? { amount: seedPrice.amount, currency: seedPrice.currency || 'EUR' } : { amount: null, currency: 'EUR' };
    }

    // ================================
    // Stats
    // ================================
    function computeStats(itemsByDay) {
        let total = 0;
        let entered = 0;
        for (const arr of Object.values(itemsByDay)) {
            for (const item of arr) {
                total++;
                const p = effectivePrice(item.id, item.seedPrice);
                if (p.amount != null && !isNaN(Number(p.amount))) entered++;
            }
        }
        return { total, entered, missing: total - entered };
    }
    function dayStats(items) {
        let entered = 0;
        for (const item of items) {
            const p = effectivePrice(item.id, item.seedPrice);
            if (p.amount != null && !isNaN(Number(p.amount))) entered++;
        }
        return { total: items.length, entered };
    }

    // ================================
    // Render — header
    // ================================
    function renderHeader(stats, lang) {
        const baseTitle = tr('budget.title', lang, 'Cost Breakdown');
        const modeSuffix = perPerson
            ? tr('budget.title.perPersonSuffix', lang, ' (Per person)')
            : tr('budget.title.totalSuffix', lang, ' (Total)');
        const title = baseTitle + modeSuffix;
        const itemsLabel = tr('budget.stats.items', lang, 'items');
        const enteredLabel = tr('budget.stats.entered', lang, 'entered');
        const missingLabel = tr('budget.stats.missing', lang, 'missing');

        return `
            <section class="bg-page-header">
                <div class="bg-page-header-top">
                    <h1 class="bg-title">${escapeAttr(title)}</h1>
                </div>
                <div class="bg-stats-row">
                    <div class="bg-stats">
                        <span class="bg-stat-chip"><span class="bg-stat-num bg-stat-total">${stats.total}</span> ${escapeAttr(itemsLabel)}</span>
                        <span class="bg-stat-chip"><span class="bg-stat-num bg-stat-entered">${stats.entered}</span> ${escapeAttr(enteredLabel)}</span>
                        <span class="bg-stat-chip"><span class="bg-stat-num bg-stat-missing">${stats.missing}</span> ${escapeAttr(missingLabel)}</span>
                    </div>
                </div>
            </section>
        `;
    }

    // ================================
    // Render — day card
    // ================================
    function renderDay(dayKey, items, dayMeta, lang) {
        const isOpen = openDayKey === dayKey;
        const stats = dayStats(items);
        const themeClass = dayMeta.theme ? `theme-${dayMeta.theme}` : '';

        // Header text
        let dayLabel, dateLabel, cityLabel;
        if (dayKey === 'preTrip') {
            dayLabel = lang === 'zh' ? '出發前' : 'Pre-trip';
            dateLabel = dayDateLabel('preTrip', lang);
            cityLabel = lang === 'zh' ? '香港 → 羅馬' : 'HK → Rome';
        } else {
            dayLabel = lang === 'zh' ? `第 ${dayKey} 天` : `Day ${dayKey}`;
            dateLabel = dayDateLabel(dayKey, lang);
            cityLabel = t(dayMeta.city, lang) || '';
        }

        // Mini-counter on collapsed header — colorless except at extremes
        const miniState = stats.total === 0
            ? 'empty'
            : stats.entered === stats.total ? 'complete'
            : stats.entered === 0 ? 'incomplete' : 'partial';
        const miniCounter = `<span class="bg-day-mini" data-state="${miniState}">${stats.entered}/${stats.total}</span>`;

        const rows = items.map(item => renderRow(item, lang)).join('');
        const addBtn = renderAddItemForm(dayKey, lang);

        return `
            <section class="bg-day ${themeClass}${isOpen ? ' is-open' : ''}" data-day="${escapeAttr(dayKey)}">
                <header class="bg-day-header" role="button" tabindex="0" aria-expanded="${isOpen}">
                    <span class="bg-day-stripe" aria-hidden="true"></span>
                    <span class="bg-day-label">${escapeAttr(dayLabel)}</span>
                    <span class="bg-day-date">${escapeAttr(dateLabel)}</span>
                    <span class="bg-day-city">${escapeAttr(cityLabel)}</span>
                    ${miniCounter}
                    <span class="bg-day-toggle" aria-hidden="true">▾</span>
                </header>
                <div class="bg-day-body">
                    <div class="bg-rows">${rows || `<div class="bg-day-empty">—</div>`}</div>
                    ${addBtn}
                </div>
            </section>
        `;
    }

    // ================================
    // Render — single row
    // ================================
    function renderRow(item, lang) {
        const p = effectivePrice(item.id, item.seedPrice);
        const isExtra = item.type === 'extra';
        const editable = isExtra;

        // Time cell — input for extras, static for everything else
        // type="text" with HH:MM pattern — avoids browser-locale 12h format
        // (Mac/Chrome default to "01:45 PM"). Always shows as 24h.
        const timeHtml = editable
            ? `<input class="bg-row-time-input" type="text" inputmode="numeric" maxlength="5" pattern="^([01]\\d|2[0-3]):[0-5]\\d$" value="${escapeAttr(item.time || '')}" placeholder="HH:MM" data-id="${escapeAttr(item.id)}" data-field="time">`
            : `<span class="bg-row-time">${escapeAttr(item.time || '')}</span>`;

        // Activity + info
        const activityText = t(item.activity, lang);
        const infoText = t(item.info, lang);
        const activityHtml = editable
            ? `<input class="bg-row-activity-input" type="text" value="${escapeAttr(activityText)}" placeholder="${escapeAttr(tr('budget.row.activityPlaceholder', lang, 'Item name'))}" data-id="${escapeAttr(item.id)}" data-field="activity">`
            : `<span class="bg-row-activity">${escapeAttr(activityText)}</span>`;
        const infoHtml = editable
            ? `<input class="bg-row-info-input" type="text" value="${escapeAttr(infoText)}" placeholder="${escapeAttr(tr('budget.row.infoPlaceholder', lang, 'Note (optional)'))}" data-id="${escapeAttr(item.id)}" data-field="info">`
            : (infoText ? `<span class="bg-row-info">${escapeAttr(infoText)}</span>` : '');

        // Price cell
        const amount = p.amount;
        const currency = p.currency || 'EUR';
        const priceInputValue = amount == null ? '' : String(amount);
        const placeholder = tr('budget.row.addPrice', lang, 'Add price');

        // Currency picker — display symbol, not code
        const currencyOpts = SUPPORTED_CURRENCIES.map(c =>
            `<option value="${c}" ${c === currency ? 'selected' : ''}>${CURRENCY_SYMBOL[c] || c}</option>`
        ).join('');

        // Display value: HKD primary, source secondary
        const displayAmount = perPerson && amount != null
            ? Math.round(amount / Math.max(travelers, 1))
            : amount;
        const hkdAmount = toHkd(displayAmount, currency, fxRate);
        const eurAmount = currency === 'EUR' ? displayAmount : fromHkd(displayAmount, 'EUR', fxRate);
        const hkdDisp = formatMoney(hkdAmount, 'HKD');
        const eurDisp = formatMoney(eurAmount, 'EUR');
        let displayHtml = '';
        if (amount != null) {
            const ppNote = perPerson
                ? `<span class="bg-row-pp">${escapeAttr(tr('budget.row.perPerson', lang, '/person'))}</span>`
                : '';
            displayHtml = `
                <span class="bg-row-display">
                    <span class="bg-row-hkd">${escapeAttr(hkdDisp)}</span>
                    <span class="bg-row-eur">(${escapeAttr(eurDisp)})</span>
                    ${ppNote}
                </span>
            `;
        }

        const deleteBtn = item.deletable
            ? `<button class="bg-row-delete" type="button" data-id="${escapeAttr(item.id)}" aria-label="Delete" title="Delete">×</button>`
            : '';

        return `
            <div class="bg-row${item.type === 'hotel' ? ' bg-row-hotel' : ''}${item.type === 'preTrip' ? ' bg-row-pretrip' : ''}${editable ? ' bg-row-extra' : ''}" data-id="${escapeAttr(item.id)}" data-type="${escapeAttr(item.type)}">
                <div class="bg-row-time-cell">${timeHtml}</div>
                <div class="bg-row-body">
                    ${activityHtml}
                    ${infoHtml}
                </div>
                <div class="bg-row-price">
                    <div class="bg-row-input-wrap">
                        <input class="bg-row-amount" type="number" inputmode="decimal" min="0" step="1"
                            value="${escapeAttr(priceInputValue)}"
                            placeholder="${escapeAttr(placeholder)}"
                            data-id="${escapeAttr(item.id)}" data-field="amount">
                        <select class="bg-row-currency" data-id="${escapeAttr(item.id)}" data-field="currency">
                            ${currencyOpts}
                        </select>
                    </div>
                    ${displayHtml}
                </div>
                ${deleteBtn}
            </div>
        `;
    }

    // ================================
    // Render — Add item form (inline, per day)
    // ================================
    function renderAddItemForm(dayKey, lang) {
        const addLabel = tr('budget.addItem.button', lang, '+ Add item');
        const timeLabel = tr('budget.addItem.time', lang, 'Time');
        const labelLabel = tr('budget.addItem.label', lang, 'Label');
        const infoLabel = tr('budget.addItem.info', lang, 'Info (optional)');
        const priceLabel = tr('budget.addItem.price', lang, 'Price');
        const cancelLabel = tr('budget.addItem.cancel', lang, 'Cancel');
        const saveLabel = tr('budget.addItem.save', lang, 'Save');

        const defCurrency = localStorage.getItem(DEFAULT_CURRENCY_KEY) || 'EUR';
        const currencyOpts = SUPPORTED_CURRENCIES.map(c =>
            `<option value="${c}" ${c === defCurrency ? 'selected' : ''}>${CURRENCY_SYMBOL[c] || c}</option>`
        ).join('');

        return `
            <div class="bg-add-wrap" data-day="${escapeAttr(dayKey)}">
                <button class="bg-add-btn" type="button" data-action="open-add">${escapeAttr(addLabel)}</button>
                <form class="bg-add-form" data-action="submit-add" hidden>
                    <input class="bg-add-time" type="text" inputmode="numeric" maxlength="5" pattern="^([01]\\d|2[0-3]):[0-5]\\d$" required placeholder="HH:MM" title="${escapeAttr(timeLabel)}">
                    <input class="bg-add-label" type="text" placeholder="${escapeAttr(labelLabel)}" required>
                    <input class="bg-add-info" type="text" placeholder="${escapeAttr(infoLabel)}">
                    <input class="bg-add-amount" type="number" inputmode="decimal" min="0" step="1" placeholder="${escapeAttr(priceLabel)}">
                    <select class="bg-add-currency">${currencyOpts}</select>
                    <button class="bg-add-cancel" type="button" data-action="cancel-add">${escapeAttr(cancelLabel)}</button>
                    <button class="bg-add-save" type="submit">${escapeAttr(saveLabel)}</button>
                </form>
            </div>
        `;
    }

    // ================================
    // Render — Trip Total card
    // ================================
    function computeTotalHkd(itemsByDay) {
        let totalHkd = 0;
        for (const arr of Object.values(itemsByDay)) {
            for (const item of arr) {
                const p = effectivePrice(item.id, item.seedPrice);
                if (p.amount == null) continue;
                const hkd = toHkd(Number(p.amount), p.currency || 'EUR', fxRate);
                if (hkd != null && !isNaN(hkd)) totalHkd += hkd;
            }
        }
        return totalHkd;
    }

    function renderTotalCard(itemsByDay, lang) {
        const totalHkdAll = computeTotalHkd(itemsByDay);
        const display = perPerson ? totalHkdAll / Math.max(travelers, 1) : totalHkdAll;
        const hkd = formatMoney(display, 'HKD');
        const eur = formatMoney(fromHkd(display, 'EUR', fxRate), 'EUR');
        const label = perPerson
            ? tr('budget.total.perPerson', lang, 'Trip Total · per person')
            : tr('budget.total.total', lang, 'Trip Total');
        const note = perPerson
            ? tr('budget.total.perPersonNote', lang, `÷ ${travelers} travelers`)
                .replace('{n}', String(travelers))
            : tr('budget.total.totalNote', lang, `for ${travelers} travelers`)
                .replace('{n}', String(travelers));

        return `
            <section class="bg-total-card">
                <div class="bg-total-label">${escapeAttr(label)}</div>
                <div class="bg-total-amounts">
                    <span class="bg-total-hkd">${escapeAttr(hkd)}</span>
                    <span class="bg-total-eur">${escapeAttr(eur)}</span>
                </div>
                <div class="bg-total-note">${escapeAttr(note)}</div>
            </section>
        `;
    }

    // ================================
    // Render — Footer links
    // ================================
    function renderFooterLinks(lang) {
        const back = lang === 'zh' ? '← 返回行程' : '← Back to Itinerary';
        return `
            <div class="bg-footer">
                <a href="itinerary.html" class="cta-button secondary">${escapeAttr(back)}</a>
            </div>
        `;
    }

    // ================================
    // Top-level render
    // ================================
    function renderAll() {
        const root = document.getElementById('budget-app');
        if (!root) return;
        const lang = getLang();

        const itemsByDay = collectItems(cachedData);
        const stats = computeStats(itemsByDay);

        // Day order: preTrip, then days 1..11
        const dayKeys = [];
        if (itemsByDay.preTrip) dayKeys.push('preTrip');
        for (const day of (cachedData.days || [])) {
            dayKeys.push(String(day.number));
        }

        const dayMetaByKey = { preTrip: { theme: 'rome' } };
        for (const day of (cachedData.days || [])) {
            dayMetaByKey[String(day.number)] = day;
        }

        const daysHtml = dayKeys.map(k => {
            const items = itemsByDay[k] || [];
            return renderDay(k, items, dayMetaByKey[k] || {}, lang);
        }).join('');

        root.innerHTML = `
            ${renderHeader(stats, lang)}
            <div class="bg-days">${daysHtml}</div>
            ${renderTotalCard(itemsByDay, lang)}
            ${renderFooterLinks(lang)}
        `;
    }

    function renderError(err) {
        const root = document.getElementById('budget-app');
        if (!root) return;
        root.innerHTML = `
            <div class="page-header">
                <h1>Failed to load budget</h1>
                <p class="page-subtitle">${escapeAttr(err.message || String(err))}</p>
            </div>
        `;
    }

    // ================================
    // Live update of one row's display (no full re-render)
    // Used while typing in a price input — keeps focus and avoids scroll jump.
    // ================================
    function refreshRowDisplay(rowEl) {
        const id = rowEl.dataset.id;
        const amountEl = rowEl.querySelector('.bg-row-amount');
        const currencyEl = rowEl.querySelector('.bg-row-currency');
        const displayEl = rowEl.querySelector('.bg-row-display');
        const amount = amountEl && amountEl.value !== '' ? Number(amountEl.value) : null;
        const currency = currencyEl ? currencyEl.value : 'EUR';

        let html = '';
        if (amount != null && !isNaN(amount)) {
            const dispAmount = perPerson ? Math.round(amount / Math.max(travelers, 1)) : amount;
            const hkdAmount = toHkd(dispAmount, currency, fxRate);
            const eurAmount = currency === 'EUR' ? dispAmount : fromHkd(dispAmount, 'EUR', fxRate);
            const ppNote = perPerson ? `<span class="bg-row-pp">${escapeAttr(tr('budget.row.perPerson', getLang(), '/person'))}</span>` : '';
            html = `
                <span class="bg-row-hkd">${escapeAttr(formatMoney(hkdAmount, 'HKD'))}</span>
                <span class="bg-row-eur">(${escapeAttr(formatMoney(eurAmount, 'EUR'))})</span>
                ${ppNote}
            `;
        }
        if (displayEl) {
            displayEl.innerHTML = html;
        } else if (html) {
            const priceCell = rowEl.querySelector('.bg-row-price');
            if (priceCell) {
                const span = document.createElement('span');
                span.className = 'bg-row-display';
                span.innerHTML = html;
                priceCell.appendChild(span);
            }
        }
    }

    // Refresh stat counters in the header without full re-render
    function refreshHeaderStats() {
        const itemsByDay = collectItems(cachedData);
        // Compute live stats using the CURRENT input field values, not the saved ones.
        const root = document.getElementById('budget-app');
        if (!root) return;
        let total = 0;
        let entered = 0;
        let totalHkdLive = 0;
        for (const arr of Object.values(itemsByDay)) {
            for (const item of arr) {
                total++;
                const rowEl = root.querySelector(`.bg-row[data-id="${CSS.escape(item.id)}"]`);
                let amount = null;
                let currency = 'EUR';
                if (rowEl) {
                    const amt = rowEl.querySelector('.bg-row-amount');
                    const cur = rowEl.querySelector('.bg-row-currency');
                    if (amt && amt.value !== '' && !isNaN(Number(amt.value))) {
                        amount = Number(amt.value);
                        currency = cur ? cur.value : 'EUR';
                        entered++;
                    }
                } else {
                    const p = effectivePrice(item.id, item.seedPrice);
                    if (p.amount != null) {
                        amount = Number(p.amount);
                        currency = p.currency || 'EUR';
                        entered++;
                    }
                }
                if (amount != null) {
                    const hkd = toHkd(amount, currency, fxRate);
                    if (hkd != null && !isNaN(hkd)) totalHkdLive += hkd;
                }
            }
        }
        const totalEl = root.querySelector('.bg-stat-total');
        const enteredEl = root.querySelector('.bg-stat-entered');
        const missingEl = root.querySelector('.bg-stat-missing');
        if (totalEl) totalEl.textContent = total;
        if (enteredEl) enteredEl.textContent = entered;
        if (missingEl) missingEl.textContent = total - entered;

        // Day mini-counters
        for (const dayKey of Object.keys(itemsByDay)) {
            const items = itemsByDay[dayKey];
            let dayEntered = 0;
            for (const item of items) {
                const rowEl = root.querySelector(`.bg-row[data-id="${CSS.escape(item.id)}"]`);
                if (rowEl) {
                    const amt = rowEl.querySelector('.bg-row-amount');
                    if (amt && amt.value !== '' && !isNaN(Number(amt.value))) dayEntered++;
                } else {
                    const p = effectivePrice(item.id, item.seedPrice);
                    if (p.amount != null) dayEntered++;
                }
            }
            const dayEl = root.querySelector(`.bg-day[data-day="${CSS.escape(dayKey)}"] .bg-day-mini`);
            if (dayEl) {
                dayEl.textContent = `${dayEntered}/${items.length}`;
                const dayState = items.length === 0 ? 'empty'
                    : dayEntered === items.length ? 'complete'
                    : dayEntered === 0 ? 'incomplete' : 'partial';
                dayEl.dataset.state = dayState;
            }
        }

        // Trip total card — live update
        const display = perPerson ? totalHkdLive / Math.max(travelers, 1) : totalHkdLive;
        const hkdEl = root.querySelector('.bg-total-hkd');
        const eurEl = root.querySelector('.bg-total-eur');
        if (hkdEl) hkdEl.textContent = formatMoney(display, 'HKD');
        if (eurEl) eurEl.textContent = formatMoney(fromHkd(display, 'EUR', fxRate), 'EUR');
    }

    // ================================
    // Event delegation
    // ================================
    function initEvents() {
        const root = document.getElementById('budget-app');
        if (!root) return;

        // Day header click -> single-open accordion
        root.addEventListener('click', (e) => {
            const header = e.target.closest('.bg-day-header');
            if (header && !e.target.closest('input, button, select, .bg-row-delete')) {
                const day = header.closest('.bg-day');
                if (!day) return;
                const dayKey = day.dataset.day;
                if (openDayKey === dayKey) {
                    openDayKey = null;
                } else {
                    openDayKey = dayKey;
                }
                try { localStorage.setItem(OPEN_DAY_KEY, openDayKey || ''); } catch (e2) {}
                // Update DOM directly to avoid re-render (preserves focus / scroll)
                root.querySelectorAll('.bg-day').forEach(el => {
                    const isOpen = el.dataset.day === openDayKey;
                    el.classList.toggle('is-open', isOpen);
                    const h = el.querySelector('.bg-day-header');
                    if (h) h.setAttribute('aria-expanded', String(isOpen));
                });
                return;
            }

            // Total / per-person toggle
            const ppBtn = e.target.closest('.bg-toggle-btn');
            if (ppBtn) {
                perPerson = ppBtn.dataset.pp === '1';
                writeJson(PER_PERSON_KEY, perPerson);
                renderAll();
                return;
            }

            // Add item form open / cancel
            const openAdd = e.target.closest('[data-action="open-add"]');
            if (openAdd) {
                const wrap = openAdd.closest('.bg-add-wrap');
                if (wrap) {
                    openAdd.hidden = true;
                    const form = wrap.querySelector('.bg-add-form');
                    if (form) {
                        form.hidden = false;
                        const timeInput = form.querySelector('.bg-add-time');
                        if (timeInput && !timeInput.value) {
                            const now = new Date();
                            timeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                        }
                        const labelInput = form.querySelector('.bg-add-label');
                        if (labelInput) labelInput.focus();
                    }
                }
                return;
            }
            const cancelAdd = e.target.closest('[data-action="cancel-add"]');
            if (cancelAdd) {
                const wrap = cancelAdd.closest('.bg-add-wrap');
                if (wrap) {
                    const form = wrap.querySelector('.bg-add-form');
                    const btn = wrap.querySelector('[data-action="open-add"]');
                    if (form) { form.hidden = true; form.reset(); }
                    if (btn) btn.hidden = false;
                }
                return;
            }

            // Delete extra (with undo toast — no confirm dialog)
            const del = e.target.closest('.bg-row-delete');
            if (del) {
                const id = del.dataset.id;
                if (!id) return;
                deleteExtraWithUndo(id);
                renderAll();
                return;
            }
            // (Toast undo handled by its own listener — toast lives outside #budget-app)
        });

        // Add-form submit
        root.addEventListener('submit', (e) => {
            const form = e.target.closest('[data-action="submit-add"]');
            if (!form) return;
            e.preventDefault();
            const wrap = form.closest('.bg-add-wrap');
            const dayKey = wrap.dataset.day;
            const time = form.querySelector('.bg-add-time').value;
            const label = form.querySelector('.bg-add-label').value.trim();
            const info = form.querySelector('.bg-add-info').value.trim();
            const amountStr = form.querySelector('.bg-add-amount').value;
            const currency = form.querySelector('.bg-add-currency').value;
            if (!label || !time) return;
            const amount = amountStr === '' ? null : Number(amountStr);
            // Plain string label/info — auto-mirror to both en/zh per design (4d-ii).
            const id = `e-${dayKey}-${Date.now()}`;
            const value = {
                dayKey,
                time,
                activity: { en: label, zh: label },
                info: info ? { en: info, zh: info } : { en: '', zh: '' },
                amount,
                currency
            };
            commitExtra(id, value);
            // Remember the chosen currency as default for next time
            try { localStorage.setItem(DEFAULT_CURRENCY_KEY, currency); } catch (e2) {}
            renderAll();
        });

        // Live updates while typing in price inputs
        root.addEventListener('input', (e) => {
            const t = e.target;
            if (t.matches('.bg-row-amount, .bg-row-currency')) {
                const row = t.closest('.bg-row');
                if (row) refreshRowDisplay(row);
                refreshHeaderStats();
            }
        });

        // Commit on blur (price + currency for any row, plus other fields for extras)
        root.addEventListener('change', (e) => {
            const t = e.target;
            const row = t.closest('.bg-row');
            if (!row) return;
            const id = row.dataset.id;
            const type = row.dataset.type;
            if (!id) return;

            if (t.classList.contains('bg-row-amount') || t.classList.contains('bg-row-currency')) {
                const amountEl = row.querySelector('.bg-row-amount');
                const currencyEl = row.querySelector('.bg-row-currency');
                const amount = amountEl.value === '' ? null : Number(amountEl.value);
                const currency = currencyEl.value;
                if (type === 'extra') {
                    const ex = extras[id] || {};
                    const next = { ...ex, amount, currency };
                    commitExtra(id, next);
                } else {
                    commitPrice(id, amount, currency);
                }
                return;
            }

            if (type === 'extra' && (
                t.classList.contains('bg-row-time-input') ||
                t.classList.contains('bg-row-activity-input') ||
                t.classList.contains('bg-row-info-input')
            )) {
                const ex = extras[id] || {};
                const time = row.querySelector('.bg-row-time-input').value;
                const activity = row.querySelector('.bg-row-activity-input').value;
                const info = row.querySelector('.bg-row-info-input').value;
                const amountEl = row.querySelector('.bg-row-amount');
                const currencyEl = row.querySelector('.bg-row-currency');
                const amount = amountEl.value === '' ? null : Number(amountEl.value);
                const currency = currencyEl.value;
                const next = {
                    ...ex,
                    time,
                    activity: { en: activity, zh: activity },
                    info: info ? { en: info, zh: info } : { en: '', zh: '' },
                    amount,
                    currency
                };
                commitExtra(id, next);
            }
        });

        // Keyboard accordion toggle
        root.addEventListener('keydown', (e) => {
            const header = e.target.closest('.bg-day-header');
            if (!header) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                header.click();
            }
        });
    }

    // ================================
    // Boot
    // ================================
    async function loadItinerary() {
        // Try Firestore first (single round trip), fallback to JSON file
        try {
            const res = await fetch(FIRESTORE_DOC_BASE);
            if (res.ok) {
                const j = await res.json();
                const decoded = {};
                const f = j.fields || {};
                for (const k of Object.keys(f)) decoded[k] = decodeValue(f[k]);
                return decoded;
            }
        } catch (e) { /* fall through */ }
        const res2 = await fetch('data/itinerary.json', { cache: 'no-cache' });
        if (!res2.ok) throw new Error(`HTTP ${res2.status} fetching itinerary.json`);
        return res2.json();
    }

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            // Cached FX rate first (instant), then refresh in background
            try {
                const cached = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || 'null');
                if (cached && cached.rate > 0) fxRate = cached.rate;
            } catch (e) {}

            loadFromCache();
            cachedData = await loadItinerary();
            // Pull travelers from itinerary doc if present
            if (cachedData.travelers && Number(cachedData.travelers) > 0) {
                travelers = Number(cachedData.travelers);
                setTravelersLocal(travelers);
            }
            renderAll();
            initEvents();

            // Background tasks
            getFxEurToHkd().then(({ rate, source }) => {
                const changed = rate !== fxRate || source !== fxSource;
                fxRate = rate;
                fxSource = source;
                if (changed) renderAll();
            });
            syncFromFirestore();
        } catch (err) {
            console.error('Budget load failed:', err);
            renderError(err);
        }
    });

    window.addEventListener('app-lang-change', () => {
        if (cachedData) renderAll();
    });
})();
