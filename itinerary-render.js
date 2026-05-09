// ================================
// Itinerary Renderer + Per-Day Map
// Single source of truth: data/itinerary.json
// EN + ZH inline per field. See data/itinerary.json $schema.
//
// Layouts:
//   Desktop (≥1024px): days list (left) + sticky map (right)
//   Mobile  (<1024px): full-screen map + left date strip + draggable bottom sheet
// ================================

(function () {
    const LANG_STORAGE_KEY = 'italy-trip-lang';
    const getCurrentLang = () => localStorage.getItem(LANG_STORAGE_KEY) || 'en';

    // ================================
    // Helpers
    // ================================
    const t = (field, lang) => {
        if (field == null) return '';
        if (typeof field === 'string') return field;
        return field[lang] || field.en || '';
    };

    // Build a Google Maps search URL using place keywords ONLY — never AI-generated
    // coords (which can be wrong by hundreds of meters). Returns '' if no keyword
    // is available; callers should hide the link in that case.
    const buildMapsUrl = (location, day) => {
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
            const city = day ? en(day.city) : '';
            if (name && city && !name.includes(city)) {
                q = `${name}, ${city}`;
            } else if (name) {
                q = name;
            }
        }
        // Strip parentheticals like "(lunch area)" that confuse geocoding
        q = q.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
        if (!q) return '';
        // Use the Directions URL format so a tap lands the user on a route page
        // with their current location as origin — one more tap to start nav,
        // no search-results step. https://developers.google.com/maps/documentation/urls/get-started#directions-action
        return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
    };

    const escapeAttr = (s) => String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Trip start: June 3, 2026. Day N = June (2+N).
    const TRIP_START_MONTH = { en: 'Jun', zh: '6月' };
    function dayDateLabel(dayNumber, lang) {
        return {
            month: TRIP_START_MONTH[lang] || TRIP_START_MONTH.en,
            day: String(2 + Number(dayNumber))
        };
    }

    // ================================
    // State
    // ================================
    let cachedData = null;
    let mapInstance = null;
    let mapMarkers = [];
    let mapPolyline = null;
    let mapHotelMarker = null;
    let activeDayNumber = null;
    let activePinIndex = 0; // 0-indexed within active day's pinned items
    let activeDayGroups = []; // cached groupTimelineByCoord for active day
    let sheetSnapState = 'default';

    // ================================
    // Data loading
    // ================================
    async function loadItinerary() {
        const res = await fetch('data/itinerary.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching itinerary.json`);
        return res.json();
    }

    // ================================
    // HTML rendering — desktop pieces
    // ================================
    function renderPageHeader(page, lang) {
        return `
            <div class="page-header">
                <span class="section-tag">${t(page.headerTag, lang)}</span>
                <h1>${t(page.headerTitle, lang)}</h1>
                <p class="page-subtitle">${t(page.headerSubtitle, lang)}</p>
            </div>
        `;
    }

    function renderStay(stay, lang, day) {
        if (!stay) return '';
        const addr = stay.address || '';
        const query = buildMapsUrl(stay, day);
        const addrHtml = query
            ? `<a href="${escapeAttr(query)}" target="_blank" rel="noopener">${escapeAttr(addr)}</a>`
            : escapeAttr(addr);
        return `
            <div class="accommodation-info">
                <span class="accom-icon">🏠</span>
                <div class="accom-body">
                    <span class="accom-label">${t(stay.label, lang)}</span>
                    <span class="accom-name">${t(stay.name, lang)}</span>
                    <span class="accom-address">${addrHtml}</span>
                </div>
            </div>
        `;
    }

    function renderDriveInfo(item, lang) {
        const hasStructured = item.price || item.link;
        if (hasStructured) {
            const parts = [];
            if (item.link) {
                parts.push(`<a href="${escapeAttr(item.link.url)}" target="_blank" rel="noopener">${t(item.link.label, lang)}</a>`);
            }
            if (item.price) {
                let priceStr = escapeAttr(item.price.amount || '');
                if (item.price.perPerson) priceStr += '/person';
                if (item.price.note) priceStr += ` — ${t(item.price.note, lang)}`;
                parts.push(priceStr);
            }
            return `<span class="drive-info">🎫 ${parts.join(' — ')}</span>`;
        }
        if (item.note) {
            return `<span class="drive-info">${t(item.note, lang)}</span>`;
        }
        return '';
    }

    function renderLocation(location, lang, day) {
        if (!location) return '';
        const name = t(location.name, lang);
        const url = buildMapsUrl(location, day);
        if (!url || !name) return '';
        return `<a class="activity-location" href="${escapeAttr(url)}" target="_blank" rel="noopener">📍 ${escapeAttr(name)}</a>`;
    }

    function renderTimelineItem(item, lang, day, pinIdx) {
        const featuredClass = item.featured ? ' featured-activity' : '';
        const pinAttr = (pinIdx != null) ? ` data-pin-idx="${pinIdx}"` : '';
        const picture = item.picture
            ? `<img src="${escapeAttr(item.picture.src)}" alt="${escapeAttr(item.picture.alt || '')}" class="spot-thumb">`
            : '';
        const comment = item.comment
            ? `<p class="activity-detail">${t(item.comment, lang)}</p>`
            : '';
        const driveInfo = renderDriveInfo(item, lang);
        const locationLink = renderLocation(item.location, lang, day);

        // PDF actions (view / upload) — same itemId convention as bookings.
        let pdfActions = '';
        if (window.PdfHelpers && day && item.time) {
            const itemId = `${day.number}-${item.time}`;
            const pdfData = window.PdfHelpers.getFor(itemId);
            const html = window.PdfHelpers.renderActions(itemId, pdfData.pdfs, lang);
            if (html) pdfActions = `<div class="timeline-pdf-actions">${html}</div>`;
        }

        return `
            <div class="timeline-item${featuredClass}"${pinAttr}>
                <span class="time">${escapeAttr(item.time)}</span>
                ${picture}
                <div class="activity">
                    <h4>${t(item.activity, lang)}</h4>
                    <p>${t(item.info, lang)}</p>
                    ${comment}
                    ${locationLink}
                    ${driveInfo}
                    ${pdfActions}
                </div>
            </div>
        `;
    }

    function renderHighlights(highlights, lang) {
        if (!highlights || highlights.length === 0) return '';
        const pills = highlights
            .map(h => `<span class="highlight">${t(h, lang)}</span>`)
            .join('');
        return `<div class="day-highlights">${pills}</div>`;
    }

    function renderDay(day, lang) {
        const featuredClass = day.featured ? ' featured' : '';
        const themeClass = day.theme ? ` ${escapeAttr(day.theme)}` : '';
        const numberPadded = String(day.number).padStart(2, '0');
        const stayHtml = renderStay(day.stay, lang, day);
        const timelineHtml = (day.timeline || [])
            .map(item => renderTimelineItem(item, lang, day))
            .join('');
        const highlightsHtml = renderHighlights(day.highlights, lang);
        return `
            <article class="day-card${featuredClass}" data-day="${day.number}" id="day-${day.number}">
                <div class="day-header${themeClass}" role="button" tabindex="0" aria-expanded="false">
                    <div class="day-number">${numberPadded}</div>
                    <div class="day-info">
                        <h3>${t(day.title, lang)}</h3>
                        <span class="day-date">${t(day.date, lang)}</span>
                    </div>
                    <div class="day-city">${t(day.city, lang)}</div>
                    <span class="day-toggle-icon" aria-hidden="true">▾</span>
                </div>
                <div class="day-content">
                    ${stayHtml}
                    <div class="day-timeline">${timelineHtml}</div>
                    ${highlightsHtml}
                </div>
            </article>
        `;
    }

    function renderFooterLinks(links, lang) {
        if (!links || links.length === 0) return '';
        const buttons = links.map(link => {
            const cls = link.primary ? 'cta-button' : 'cta-button secondary';
            return `<a href="${escapeAttr(link.href)}" class="${cls}">${t(link.label, lang)}</a>`;
        }).join('');
        return `<div class="itinerary-footer">${buttons}</div>`;
    }

    // ================================
    // HTML rendering — mobile pieces
    // ================================
    function renderDateStrip(days, lang) {
        const pills = days.map(day => {
            const d = dayDateLabel(day.number, lang);
            return `
                <button class="date-pill" data-day="${day.number}" type="button" aria-label="${escapeAttr(t(day.title, lang))}">
                    <span class="date-month">${escapeAttr(d.month)}</span>
                    <span class="date-day">${escapeAttr(d.day)}</span>
                </button>
            `;
        }).join('');
        return `<nav class="itinerary-date-strip" aria-label="Day selector">${pills}</nav>`;
    }

    function renderSheetShell() {
        return `
            <section class="itinerary-sheet sheet-default" id="itinerary-sheet" aria-label="Day details">
                <div class="sheet-handle" role="button" aria-label="Drag handle">
                    <div class="sheet-handle-bar"></div>
                </div>
                <div class="sheet-content" id="sheet-content"></div>
            </section>
        `;
    }

    function renderSheetContent(day, pins, pinIdx, lang) {
        if (!day) return '<div class="sheet-empty">No day selected.</div>';
        const dayTitle = t(day.title, lang);
        const dayDate = t(day.date, lang);
        const dayCity = t(day.city, lang);

        // Peek line — shown only in peek state
        let peekLine = '';
        if (pins.length > 0 && pins[pinIdx]) {
            const p = pins[pinIdx];
            const name = t(p.location && p.location.name, lang) || t(p.activity, lang);
            peekLine = `<div class="pin-peek-line"><strong>${pinIdx + 1}/${pins.length}</strong> · ${escapeAttr(name)}</div>`;
        } else {
            peekLine = `<div class="pin-peek-line">${escapeAttr(dayTitle)}</div>`;
        }

        // Single-pin card — shown in default state
        let pinCard = '';
        if (pins.length > 0 && pins[pinIdx]) {
            const p = pins[pinIdx];
            const name = t(p.location && p.location.name, lang) || t(p.activity, lang);
            const time = p.time || '';
            const info = t(p.info, lang);
            const comment = p.comment ? `<p class="pin-comment">${t(p.comment, lang)}</p>` : '';
            const photo = p.picture
                ? `<img class="pin-photo" src="${escapeAttr(p.picture.src.replace('w=120', 'w=400').replace('h=120', 'h=400').replace('width=240', 'width=600'))}" alt="${escapeAttr(p.picture.alt || '')}">`
                : '';
            const mapsUrl = buildMapsUrl(p.location, day);
            const mapLink = mapsUrl
                ? `<a class="pin-maps-link" href="${escapeAttr(mapsUrl)}" target="_blank" rel="noopener">📍 Open in Google Maps</a>`
                : '';
            // PDF chip (view-only on the active-pin card; uploads belong on bookings)
            let pdfActions = '';
            if (window.PdfHelpers && p.time) {
                const itemId = `${day.number}-${p.time}`;
                const pdfData = window.PdfHelpers.getFor(itemId);
                const html = window.PdfHelpers.renderActions(itemId, pdfData.pdfs, lang);
                if (html) pdfActions = `<div class="pin-pdf-actions">${html}</div>`;
            }
            pinCard = `
                <div class="pin-card">
                    <div class="pin-card-header">
                        <span class="pin-card-num">${pinIdx + 1}</span>
                        <div class="pin-card-meta">
                            <span class="pin-card-time">${escapeAttr(time)}</span>
                            <h3 class="pin-card-name">${escapeAttr(name)}</h3>
                        </div>
                        <span class="pin-card-counter">${pinIdx + 1}/${pins.length}</span>
                    </div>
                    ${photo}
                    <div class="pin-card-body">
                        <p class="pin-card-info">${escapeAttr(info)}</p>
                        ${comment}
                        ${mapLink}
                        ${pdfActions}
                    </div>
                </div>
            `;
        } else {
            pinCard = `<div class="pin-card pin-card-empty"><p>No pinned stops yet for this day.</p></div>`;
        }

        // Full day list — shown in full state
        const stayHtml = day.stay ? renderStay(day.stay, lang, day) : '';
        const highlightsHtml = renderHighlights(day.highlights, lang);
        let pinCounter = 0;
        const timelineHtml = (day.timeline || [])
            .map(item => {
                const isPin = !!(item.location && item.location.coords);
                const html = renderTimelineItem(item, lang, day, isPin ? pinCounter : null);
                if (isPin) pinCounter += 1;
                return html;
            })
            .join('');
        const fullList = `
            <div class="sheet-day-view">
                <header class="sheet-day-header">
                    <h2>${escapeAttr(dayTitle)}</h2>
                    <p>${escapeAttr(dayDate)} · ${escapeAttr(dayCity)}</p>
                </header>
                ${stayHtml}
                <div class="day-timeline">${timelineHtml}</div>
                ${highlightsHtml}
            </div>
        `;

        return `
            ${peekLine}
            <div class="sheet-pin-view">${pinCard}</div>
            ${fullList}
        `;
    }

    function renderAll(data, lang) {
        const root = document.getElementById('itinerary-app');
        if (!root) return;
        const daysHtml = (data.days || [])
            .map(day => renderDay(day, lang))
            .join('');
        const dateStripHtml = renderDateStrip(data.days || [], lang);
        const sheetHtml = renderSheetShell();
        root.innerHTML = `
            ${renderPageHeader(data.page, lang)}
            <div class="itinerary-layout">
                ${dateStripHtml}
                <div class="itinerary-days">${daysHtml}</div>
                <aside class="itinerary-map-wrap" aria-label="Day route map">
                    <div class="itinerary-map" id="itinerary-map"></div>
                </aside>
                ${sheetHtml}
            </div>
            ${renderFooterLinks(data.page && data.page.footerLinks, lang)}
        `;
    }

    function renderError(err) {
        const root = document.getElementById('itinerary-app');
        if (!root) return;
        root.innerHTML = `
            <div class="page-header">
                <h1>Failed to load itinerary</h1>
                <p class="page-subtitle">Check <code>data/itinerary.json</code> — ${escapeAttr(err.message || String(err))}</p>
            </div>
        `;
    }

    // ================================
    // Map module (Leaflet)
    // ================================
    function initMap() {
        const el = document.getElementById('itinerary-map');
        if (!el || typeof L === 'undefined') return;
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
        }
        mapMarkers = [];
        mapPolyline = null;
        mapHotelMarker = null;
        mapInstance = L.map(el, { scrollWheelZoom: false }).setView([41.9, 12.5], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(mapInstance);
    }

    function clearMapLayers() {
        if (!mapInstance) return;
        mapMarkers.forEach(m => mapInstance.removeLayer(m));
        mapMarkers = [];
        if (mapPolyline) {
            mapInstance.removeLayer(mapPolyline);
            mapPolyline = null;
        }
        if (mapHotelMarker) {
            mapInstance.removeLayer(mapHotelMarker);
            mapHotelMarker = null;
        }
    }

    // Classify a timeline item as 'lunch' / 'dinner' / 'snack' / 'sight'.
    // Prefers the explicit `category` field on the item; otherwise treats it as a sight.
    function getPinCategory(item) {
        if (!item) return 'sight';
        const c = item.category;
        if (c === 'lunch' || c === 'dinner' || c === 'snack') return c;
        return 'sight';
    }

    // Per-category icon emoji (overrides the number for non-sight pins).
    const CATEGORY_ICON = { lunch: '🍝', dinner: '🍷', snack: '🍦' };
    const CATEGORY_CLASS = { lunch: 'pin-bubble-lunch', dinner: 'pin-bubble-dinner', snack: 'pin-bubble-snack' };

    function makeNumberedIcon(numbers, isActive, category) {
        const cat = category || 'sight';
        const baseCls = isActive ? 'pin-bubble pin-bubble-active' : 'pin-bubble';
        const catCls = CATEGORY_CLASS[cat] ? ' ' + CATEGORY_CLASS[cat] : '';
        // Meal/snack pins show a food emoji instead of the number sequence —
        // chronological ordering is already obvious from the timeline time.
        const label = CATEGORY_ICON[cat] || numbers.join(',');
        return L.divIcon({
            className: 'map-pin-numbered',
            html: `<div class="${baseCls}${catCls}">${label}</div>`,
            iconSize: isActive ? [42, 42] : [30, 30],
            iconAnchor: isActive ? [21, 42] : [15, 30],
            popupAnchor: [0, -30]
        });
    }

    function makeHotelIcon() {
        return L.divIcon({
            className: 'map-pin-hotel',
            html: `<div class="pin-hotel">🏠</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 30],
            popupAnchor: [0, -30]
        });
    }

    function groupTimelineByCoord(timeline) {
        const groups = [];
        let pinNum = 0;
        for (const item of (timeline || [])) {
            if (!item.location || !item.location.coords) continue;
            pinNum += 1;
            const c = item.location.coords;
            const cat = getPinCategory(item);
            const last = groups[groups.length - 1];
            if (last
                && Math.abs(last.coords.lat - c.lat) < 1e-6
                && Math.abs(last.coords.lng - c.lng) < 1e-6) {
                last.numbers.push(pinNum);
                last.items.push(item);
                last.firstPinIndex = last.firstPinIndex; // unchanged
                last.pinIndices.push(pinNum - 1);
                // If any item in the group is a meal, prefer that category.
                if (last.category === 'sight' && cat !== 'sight') last.category = cat;
            } else {
                groups.push({
                    numbers: [pinNum],
                    items: [item],
                    coords: c,
                    category: cat,
                    firstPinIndex: pinNum - 1,
                    pinIndices: [pinNum - 1]
                });
            }
        }
        return groups;
    }

    // Get flat list of pinned items (with location.coords) for the day, in order.
    function getPinsForDay(day) {
        if (!day || !day.timeline) return [];
        return day.timeline.filter(it => it.location && it.location.coords);
    }

    function updateMap(day, lang) {
        if (!mapInstance) return;
        clearMapLayers();
        if (!day) return;

        activeDayGroups = groupTimelineByCoord(day.timeline);
        const bounds = [];

        for (const g of activeDayGroups) {
            const ll = [g.coords.lat, g.coords.lng];
            bounds.push(ll);
            const isActive = g.pinIndices.includes(activePinIndex);
            const marker = L.marker(ll, { icon: makeNumberedIcon(g.numbers, isActive, g.category) }).addTo(mapInstance);
            marker._groupFirstPinIndex = g.firstPinIndex;
            marker.on('click', () => {
                activePinIndex = g.firstPinIndex;
                refreshActivePin(day, lang);
                // Desktop: scroll the matching timeline item into view + persistent border
                if (window.matchMedia('(min-width: 1280px)').matches) {
                    scrollToPinTarget(g.firstPinIndex);
                }
            });
            mapMarkers.push(marker);
        }

        if (activeDayGroups.length >= 2) {
            const path = activeDayGroups.map(g => [g.coords.lat, g.coords.lng]);
            mapPolyline = L.polyline(path, {
                color: '#C65D3B',
                weight: 3,
                opacity: 0.75,
                dashArray: '6, 8'
            }).addTo(mapInstance);
        }

        if (day.stay && day.stay.coords && day.stay.coords.lat != null) {
            const hll = [day.stay.coords.lat, day.stay.coords.lng];
            bounds.push(hll);
            mapHotelMarker = L.marker(hll, { icon: makeHotelIcon() }).addTo(mapInstance);
            mapHotelMarker.bindPopup(`<strong>🏠 ${escapeAttr(t(day.stay.name, lang))}</strong>`, { autoPan: true });
        }

        if (bounds.length > 0) {
            // Pad bottom heavily on mobile to account for sheet covering lower portion.
            const isMobile = window.matchMedia('(max-width: 1023px)').matches;
            const bottomPad = isMobile ? Math.round(window.innerHeight * 0.45) : 40;
            mapInstance.fitBounds(bounds, {
                paddingTopLeft: [40, 40],
                paddingBottomRight: [40, bottomPad],
                maxZoom: 16
            });
        }
    }

    // Re-paint markers only (without resetting bounds) when active pin changes.
    function refreshMapMarkers() {
        if (!mapInstance || activeDayGroups.length === 0) return;
        mapMarkers.forEach((marker, i) => {
            const g = activeDayGroups[i];
            if (!g) return;
            const isActive = g.pinIndices.includes(activePinIndex);
            marker.setIcon(makeNumberedIcon(g.numbers, isActive, g.category));
        });
    }

    // ================================
    // Active state management
    // ================================
    function setActiveDay(dayNumber, data, lang, opts) {
        const root = document.getElementById('itinerary-app');
        if (!root) return;
        opts = opts || {};
        // Toggle .expanded class on day cards (desktop)
        root.querySelectorAll('.day-card').forEach(card => {
            const isTarget = String(card.dataset.day) === String(dayNumber);
            card.classList.toggle('expanded', isTarget);
            const header = card.querySelector('.day-header');
            if (header) header.setAttribute('aria-expanded', String(isTarget));
        });
        // Toggle .active on date strip pills (mobile) + auto-scroll to center
        let activePill = null;
        root.querySelectorAll('.date-pill').forEach(pill => {
            const isActive = String(pill.dataset.day) === String(dayNumber);
            pill.classList.toggle('active', isActive);
            if (isActive) activePill = pill;
        });
        if (activePill) {
            // Center the active pill within its scroll container. Computing
            // scrollTop directly avoids scrollIntoView spilling into ancestor
            // scroll (e.g. window) on position:fixed strips. Using 'auto'
            // behavior — Chrome silently drops 'smooth' on overflow:auto
            // children of position:fixed parents.
            try {
                const strip = activePill.closest('.itinerary-date-strip');
                if (strip) {
                    const targetTop = activePill.offsetTop
                        - (strip.clientHeight / 2)
                        + (activePill.offsetHeight / 2);
                    strip.scrollTop = Math.max(0, targetTop);
                }
            } catch (e) { /* no-op */ }
        }
        activeDayNumber = dayNumber;
        if (!opts.preservePin) activePinIndex = 0;

        const day = (data.days || []).find(d => String(d.number) === String(dayNumber));
        if (mapInstance) setTimeout(() => mapInstance.invalidateSize(), 60);
        updateMap(day, lang);
        renderActivePinSheet(day, lang);
        // Snap sheet to default when day changes (so user sees the new day's pin 1)
        if (sheetSnapState !== 'default') setSheetState('default');
    }

    function refreshActivePin(day, lang, opts) {
        opts = opts || {};
        refreshMapMarkers();
        renderActivePinSheet(day, lang);
        // Always snap to default when active pin changes (from pin click, swipe, or list tap)
        if (opts.snapToDefault !== false && sheetSnapState !== 'default') {
            setSheetState('default');
        }
    }

    function renderActivePinSheet(day, lang) {
        const sheetContent = document.getElementById('sheet-content');
        if (!sheetContent) return;
        const pins = getPinsForDay(day);
        if (activePinIndex >= pins.length) activePinIndex = Math.max(0, pins.length - 1);
        sheetContent.innerHTML = renderSheetContent(day, pins, activePinIndex, lang);
    }

    // Desktop: scroll the matching timeline item into view and apply a
    // persistent terracotta border. Re-rendering wipes prior highlights.
    function scrollToPinTarget(pinIdx) {
        const sheet = document.getElementById('itinerary-sheet');
        if (!sheet) return;
        sheet.querySelectorAll('.timeline-item.pin-scroll-target').forEach(el => {
            el.classList.remove('pin-scroll-target');
        });
        const target = sheet.querySelector(`.timeline-item[data-pin-idx="${pinIdx}"]`);
        if (target) {
            target.classList.add('pin-scroll-target');
            try {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (e) { /* no-op */ }
        }
    }

    // ================================
    // Mobile sheet — snap state machine + drag gestures
    // ================================
    function setSheetState(state) {
        const sheet = document.getElementById('itinerary-sheet');
        if (!sheet) return;
        sheet.style.transform = '';
        sheet.classList.remove('sheet-peek', 'sheet-default', 'sheet-full');
        sheet.classList.add(`sheet-${state}`);
        // Mirror onto body so other UI (date strip) can react.
        document.body.classList.remove('sheet-peek', 'sheet-default', 'sheet-full');
        document.body.classList.add(`sheet-${state}`);
        sheetSnapState = state;
    }

    function getCurrentTranslate(sheet) {
        const m = window.getComputedStyle(sheet).transform;
        if (!m || m === 'none') return 0;
        const match = m.match(/matrix.*\(([^)]+)\)/);
        if (!match) return 0;
        const vals = match[1].split(',').map(parseFloat);
        return vals[5] || 0;
    }

    function snapToNearest(translate, sheet) {
        const h = sheet.offsetHeight;
        const peekTr = h - 80;
        const defaultTr = h * 0.55;
        const fullTr = 0;
        const candidates = [
            { state: 'full', d: Math.abs(translate - fullTr) },
            { state: 'default', d: Math.abs(translate - defaultTr) },
            { state: 'peek', d: Math.abs(translate - peekTr) }
        ];
        candidates.sort((a, b) => a.d - b.d);
        setSheetState(candidates[0].state);
    }

    function initSheetDrag() {
        const sheet = document.getElementById('itinerary-sheet');
        if (!sheet) return;
        const handle = sheet.querySelector('.sheet-handle');
        if (!handle) return;

        let dragStartY = null;
        let dragStartTranslate = null;
        let isDragging = false;

        function onStart(e) {
            const y = e.touches ? e.touches[0].clientY : e.clientY;
            dragStartY = y;
            dragStartTranslate = getCurrentTranslate(sheet);
            isDragging = true;
            sheet.style.transition = 'none';
        }

        function onMove(e) {
            if (!isDragging) return;
            const y = e.touches ? e.touches[0].clientY : e.clientY;
            const dy = y - dragStartY;
            const newTranslate = Math.max(0, dragStartTranslate + dy);
            sheet.style.transform = `translateY(${newTranslate}px)`;
            if (e.cancelable && e.touches) e.preventDefault();
        }

        function onEnd() {
            if (!isDragging) return;
            isDragging = false;
            sheet.style.transition = '';
            const finalTranslate = getCurrentTranslate(sheet);
            snapToNearest(finalTranslate, sheet);
        }

        handle.addEventListener('touchstart', onStart, { passive: true });
        handle.addEventListener('touchmove', onMove, { passive: false });
        handle.addEventListener('touchend', onEnd);
        handle.addEventListener('mousedown', onStart);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);

        // Tap on handle (no drag) cycles snap state
        let tapStartY = null;
        handle.addEventListener('touchstart', (e) => { tapStartY = e.touches[0].clientY; }, { passive: true });
        handle.addEventListener('touchend', (e) => {
            const endY = e.changedTouches[0].clientY;
            if (tapStartY !== null && Math.abs(endY - tapStartY) < 8) {
                cycleSheetSnap();
            }
            tapStartY = null;
        });
        handle.addEventListener('click', (e) => {
            // Only trigger if not part of a drag (mouse path)
            if (!isDragging) cycleSheetSnap();
        });
    }

    function cycleSheetSnap() {
        const order = ['peek', 'default', 'full'];
        const idx = order.indexOf(sheetSnapState);
        const next = order[(idx + 1) % order.length];
        setSheetState(next);
    }

    // ================================
    // Pin card swipe gestures (replaces prev/next buttons)
    // Horizontal swipe ≥50px → switch pin
    // ================================
    function initPinCardSwipe() {
        const sheet = document.getElementById('itinerary-sheet');
        if (!sheet) return;
        let startX = null, startY = null, isHoriz = null, locked = false;

        sheet.addEventListener('touchstart', (e) => {
            if (!e.target.closest('.sheet-pin-view')) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isHoriz = null;
            locked = false;
        }, { passive: true });

        sheet.addEventListener('touchmove', (e) => {
            if (startX === null) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            if (isHoriz === null) {
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                    isHoriz = Math.abs(dx) > Math.abs(dy);
                }
            }
            if (isHoriz && e.cancelable) e.preventDefault();
        }, { passive: false });

        sheet.addEventListener('touchend', (e) => {
            if (startX === null) return;
            const dx = e.changedTouches[0].clientX - startX;
            if (isHoriz && Math.abs(dx) > 50 && !locked) {
                locked = true;
                const day = (cachedData.days || []).find(d => String(d.number) === String(activeDayNumber));
                const pins = getPinsForDay(day);
                if (dx < 0 && activePinIndex < pins.length - 1) {
                    activePinIndex += 1;
                    refreshActivePin(day, getCurrentLang());
                } else if (dx > 0 && activePinIndex > 0) {
                    activePinIndex -= 1;
                    refreshActivePin(day, getCurrentLang());
                }
            }
            startX = null; startY = null; isHoriz = null;
        });
    }

    // ================================
    // Click handlers (delegated)
    // ================================
    function initDelegatedClicks() {
        const root = document.getElementById('itinerary-app');
        if (!root) return;

        const handle = (e) => {
            // PDF actions (delegate to pdf.js shared modals) — handled before
            // other click logic so clicks on these buttons don't bubble into
            // day-toggle or pin-snap logic.
            const pdfList = e.target.closest('[data-pdf-list]');
            if (pdfList && window.PdfHelpers) {
                const itemId = pdfList.dataset.pdfList;
                const data = window.PdfHelpers.getFor(itemId);
                const m = itemId.match(/^(\d+)-(.+)$/);
                window.PdfHelpers.openViewerModal({
                    itemId,
                    day: m ? Number(m[1]) : undefined,
                    time: m ? m[2].replace(/-/, ':') : undefined,
                    pdfs: data.pdfs,
                    onChanged: () => setActiveDay(activeDayNumber, cachedData, getCurrentLang(), { preservePin: true })
                });
                e.preventDefault();
                return;
            }
            const pdfUpload = e.target.closest('[data-upload-for]');
            if (pdfUpload && window.PdfHelpers) {
                const itemId = pdfUpload.dataset.uploadFor;
                const m = itemId.match(/^(\d+)-(.+)$/);
                window.PdfHelpers.openUploadModal({
                    itemId,
                    day: m ? Number(m[1]) : undefined,
                    time: m ? m[2].replace(/-/, ':') : undefined,
                    onSaved: () => setActiveDay(activeDayNumber, cachedData, getCurrentLang(), { preservePin: true })
                });
                e.preventDefault();
                return;
            }

            // Date strip click (mobile)
            const pill = e.target.closest('.date-pill');
            if (pill && root.contains(pill)) {
                const dayNumber = pill.dataset.day;
                if (String(dayNumber) !== String(activeDayNumber)) {
                    setActiveDay(dayNumber, cachedData, getCurrentLang());
                }
                return;
            }

            // Day card header click (desktop)
            const header = e.target.closest('.day-header');
            if (header && !e.target.closest('a, button')) {
                if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
                if (e.type === 'keydown') e.preventDefault();
                const card = header.closest('.day-card');
                if (card) {
                    const dayNumber = card.dataset.day;
                    if (String(dayNumber) !== String(activeDayNumber)) {
                        setActiveDay(dayNumber, cachedData, getCurrentLang());
                    }
                }
                return;
            }

            // Tap on a timeline item inside full sheet → snap to default for that pin
            const tlItem = e.target.closest('.sheet-day-view .timeline-item');
            if (tlItem && !e.target.closest('a, button')) {
                const day = (cachedData.days || []).find(d => String(d.number) === String(activeDayNumber));
                const pins = getPinsForDay(day);
                // Find which pin index this timeline item corresponds to
                const tlItems = Array.from(tlItem.parentElement.children);
                const tlIdx = tlItems.indexOf(tlItem);
                const fullTimeline = (day.timeline || []);
                const itemRef = fullTimeline[tlIdx];
                if (itemRef) {
                    const pinIdx = pins.indexOf(itemRef);
                    if (pinIdx >= 0) {
                        activePinIndex = pinIdx;
                        refreshActivePin(day, getCurrentLang());
                    }
                }
            }
        };
        root.addEventListener('click', handle);
        root.addEventListener('keydown', handle);
    }

    // ================================
    // Lightbox (event delegation)
    // ================================
    function initLightbox() {
        const root = document.getElementById('itinerary-app');
        const lightbox = document.getElementById('lightbox');
        const lightboxImg = document.getElementById('lightbox-img');
        const lightboxCaption = document.getElementById('lightbox-caption');
        if (!root || !lightbox) return;

        root.addEventListener('click', (e) => {
            const img = e.target.closest('.spot-thumb');
            if (!img) return;
            e.stopPropagation();
            const highRes = img.src.replace('w=120', 'w=1200').replace('h=120', 'h=1200').replace('width=240', 'width=1200').replace('width=600', 'width=1200');
            lightboxImg.src = highRes;
            lightboxCaption.textContent = img.alt;
            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
        });

        lightbox.addEventListener('click', () => {
            lightbox.classList.remove('active');
            document.body.style.overflow = '';
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                lightbox.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // ================================
    // Boot
    // ================================
    function bootRender() {
        renderAll(cachedData, getCurrentLang());
        initLightbox();
        initDelegatedClicks();
        initMap();
        initSheetDrag();
        initPinCardSwipe();

        // If the URL has a #day-N hash (typically from the bookings page deep-linking
        // back to a specific day), activate that day instead of the default first day,
        // and scroll the day card into view.
        const hashMatch = (window.location.hash || '').match(/^#day-(\d+)$/);
        const firstDay = cachedData.days && cachedData.days[0];
        const target = hashMatch
            ? Number(hashMatch[1])
            : (activeDayNumber != null
                ? activeDayNumber
                : (firstDay ? firstDay.number : null));
        if (target != null) {
            setActiveDay(target, cachedData, getCurrentLang());
            if (hashMatch) {
                // Defer to next frame so the day card has been laid out post-render.
                requestAnimationFrame(() => {
                    const el = document.getElementById(`day-${target}`);
                    if (el) {
                        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
                        catch (e) { el.scrollIntoView(); }
                    }
                });
            }
        }
        setSheetState(sheetSnapState);
    }

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            cachedData = await loadItinerary();
            bootRender();
            // Background-load PDF subcollection then re-render to surface chips.
            if (window.PdfHelpers) {
                window.PdfHelpers.loadAll().then(() => {
                    if (cachedData && activeDayNumber != null) {
                        setActiveDay(activeDayNumber, cachedData, getCurrentLang(), { preservePin: true });
                    } else if (cachedData) {
                        bootRender();
                    }
                }).catch(err => console.warn('[itinerary] pdfs load:', err.message));
            }
        } catch (err) {
            console.error('Itinerary load failed:', err);
            renderError(err);
        }
    });

    window.addEventListener('app-lang-change', () => {
        if (cachedData) bootRender();
    });
    // Re-render when sign-in state changes (so upload buttons appear/disappear).
    window.addEventListener('app-fb-auth-change', () => {
        if (cachedData) bootRender();
    });
})();
