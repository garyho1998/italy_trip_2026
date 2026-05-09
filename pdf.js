// ================================
// PDF helpers — booking-pdfs subcollection in Firestore
//                + Firebase Storage uploads/deletes
//                + shared upload/viewer modals
//
// Loaded on bookings.html and itinerary.html. Depends on:
//   - script.js  (fbAuthState, fbGetIdToken, uploadFileToStorage, deleteFileFromStorage,
//                  slugifyForFilename, FB_PROJECT_ID, FB_AUTH_EVT)
//   - translations.js (TRANSLATIONS)
//
// Public API exposed on window.PdfHelpers:
//   loadAll()                    -> Promise<{ [itemId]: { pdfs: [...] } }>
//   getFor(itemId)               -> { pdfs: [...] }                (sync, from cache)
//   renderActions(itemId, pdfs, lang) -> HTML  (view/upload/etc buttons)
//   openUploadModal({ itemId, day, time, prefill, onSaved })
//   openViewerModal({ itemId, day, time, pdfs, onChanged })
// ================================

(function () {
    const PROJECT_ID = window.FB_PROJECT_ID || 'trip-webapp-de677';
    const FIRESTORE_DOC_BASE =
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
        `/databases/(default)/documents/trips/italy-2026`;
    const PDFS_BASE = `${FIRESTORE_DOC_BASE}/booking-pdfs`;

    const CACHE_KEY = 'italy-trip-booking-pdfs';
    const LANG_KEY = 'italy-trip-lang';
    const getLang = () => localStorage.getItem(LANG_KEY) || 'en';

    const safeId = (id) => String(id).replace(/:/g, '-');

    function tr(key, lang, fallbackEn) {
        if (lang === 'zh' && typeof TRANSLATIONS !== 'undefined' && TRANSLATIONS[key]) {
            return TRANSLATIONS[key];
        }
        return fallbackEn;
    }
    const escapeAttr = (s) => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const t = (field, lang) => {
        if (field == null) return '';
        if (typeof field === 'string') return field;
        return field[lang] || field.en || '';
    };

    // ================================
    // State
    // ================================
    let cache = {};   // { itemId: { pdfs: [...] } }

    function readCache() {
        try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
        catch (e) { cache = {}; }
    }
    function writeCache() {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
    }
    readCache();

    // ================================
    // Firestore typed-JSON encode/decode
    // ================================
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

    // ================================
    // Firestore I/O
    // ================================
    async function loadAll() {
        try {
            const res = await fetch(PDFS_BASE);
            if (!res.ok) {
                if (res.status === 404) return cache;
                throw new Error(`HTTP ${res.status}`);
            }
            const j = await res.json();
            const out = {};
            for (const doc of (j.documents || [])) {
                const id = doc.name.split('/').pop();
                const fields = doc.fields || {};
                const decoded = {};
                for (const k of Object.keys(fields)) decoded[k] = decodeValue(fields[k]);
                out[id] = { pdfs: decoded.pdfs || [] };
            }
            cache = out;
            writeCache();
            return cache;
        } catch (e) {
            console.warn('[pdf] load failed (using cache):', e.message);
            return cache;
        }
    }

    async function savePdfs(itemId, pdfs) {
        const safe = safeId(itemId);
        const body = JSON.stringify({
            fields: {
                pdfs: encodeValue(pdfs),
                updatedAt: { timestampValue: new Date().toISOString() }
            }
        });
        const url = `${PDFS_BASE}/${safe}`;
        const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body
        });
        if (!res.ok) throw new Error(`Firestore PATCH ${itemId}: HTTP ${res.status}`);
        // update cache
        cache[safe] = { pdfs };
        writeCache();
    }

    function getFor(itemId) {
        const safe = safeId(itemId);
        return cache[safe] || { pdfs: [] };
    }

    // ================================
    // Render — view/upload action buttons
    // ================================
    function renderActions(itemId, pdfs, lang) {
        lang = lang || getLang();
        pdfs = pdfs || [];
        const auth = (window.fbAuthState && window.fbAuthState()) || { signedIn: false };
        const safe = safeId(itemId);

        const out = [];
        if (pdfs.length === 1 && !auth.signedIn) {
            // Single doc, public viewer — direct link
            const p = pdfs[0];
            const label = t(p.label, lang) || tr('pdfs.view', lang, 'View');
            out.push(
                `<a class="bk-action bk-action-doc" href="${escapeAttr(p.url)}" target="_blank" rel="noopener" title="${escapeAttr(label)}">📎 ${escapeAttr(label)}</a>`
            );
        } else if (pdfs.length >= 1) {
            // Multi-doc OR signed-in (so they can edit) — open viewer modal
            const labelText = pdfs.length === 1
                ? (t(pdfs[0].label, lang) || tr('pdfs.view', lang, 'View'))
                : tr('pdfs.tickets', lang, 'Tickets ({n})').replace('{n}', String(pdfs.length));
            out.push(
                `<button type="button" class="bk-action bk-action-doc" data-pdf-list="${escapeAttr(safe)}">📎 ${escapeAttr(labelText)}</button>`
            );
        }

        if (auth.signedIn) {
            const uploadLabel = tr('pdfs.upload', lang, 'Upload');
            out.push(
                `<button type="button" class="bk-action bk-action-upload" data-upload-for="${escapeAttr(safe)}">📤 ${escapeAttr(uploadLabel)}</button>`
            );
        }
        return out.join('');
    }

    // ================================
    // Modals — shared, injected once
    // ================================
    function ensureModalDom() {
        if (document.getElementById('pdf-modal-root')) return;
        const root = document.createElement('div');
        root.id = 'pdf-modal-root';
        root.innerHTML = `
            <div class="pdf-overlay" id="pdf-overlay" hidden></div>
            <div class="pdf-modal pdf-upload-modal" id="pdf-upload-modal" role="dialog" aria-modal="true" hidden>
                <div class="pdf-modal-head">
                    <h3 class="pdf-modal-title" id="pdf-upload-title">Add document</h3>
                    <button class="pdf-modal-close" type="button" aria-label="Close" data-pdf-action="close">×</button>
                </div>
                <form class="pdf-modal-body" id="pdf-upload-form">
                    <label class="pdf-field">
                        <span class="pdf-field-label" id="pdf-url-label">Google Drive share link</span>
                        <input type="url" id="pdf-url-input" placeholder="https://drive.google.com/file/d/..." required>
                        <span class="pdf-field-help" id="pdf-url-help">Open the file in Drive → Share → "Anyone with the link" → Copy link → paste here.</span>
                    </label>
                    <label class="pdf-field">
                        <span class="pdf-field-label" id="pdf-label-label">Label</span>
                        <input type="text" id="pdf-label-input" placeholder="e.g. Cathay CX293 ticket" required>
                    </label>
                    <label class="pdf-field">
                        <span class="pdf-field-label" id="pdf-person-label">Person <span class="pdf-field-hint">(optional, blank = shared)</span></span>
                        <input type="text" id="pdf-person-input" placeholder="e.g. HO CHUN YIN">
                    </label>
                    <div class="pdf-error" id="pdf-upload-error" hidden></div>
                    <div class="pdf-actions">
                        <button type="button" class="pdf-btn pdf-btn-secondary" data-pdf-action="close" id="pdf-cancel-btn">Cancel</button>
                        <button type="submit" class="pdf-btn pdf-btn-primary" id="pdf-submit-btn">Save</button>
                    </div>
                </form>
            </div>
            <div class="pdf-modal pdf-viewer-modal" id="pdf-viewer-modal" role="dialog" aria-modal="true" hidden>
                <div class="pdf-modal-head">
                    <h3 class="pdf-modal-title" id="pdf-viewer-title">Documents</h3>
                    <button class="pdf-modal-close" type="button" aria-label="Close" data-pdf-action="close">×</button>
                </div>
                <div class="pdf-modal-body">
                    <ul class="pdf-list" id="pdf-list"></ul>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        // Single global click handler for close + viewer-row actions
        root.addEventListener('click', (e) => {
            if (e.target.closest('[data-pdf-action="close"]') || e.target.id === 'pdf-overlay') {
                closeAllModals();
                return;
            }
            const editBtn = e.target.closest('[data-pdf-edit]');
            if (editBtn) {
                handleEditClick(editBtn);
                return;
            }
            const delBtn = e.target.closest('[data-pdf-delete]');
            if (delBtn) {
                handleDeleteClick(delBtn);
                return;
            }
        });

        // Wire upload form submit
        document.getElementById('pdf-upload-form').addEventListener('submit', handleUploadSubmit);
    }

    function setLabels(lang) {
        lang = lang || getLang();
        document.getElementById('pdf-url-label').textContent =
            tr('pdfs.field.url', lang, 'Google Drive share link');
        document.getElementById('pdf-url-help').textContent =
            tr('pdfs.field.urlHelp', lang,
               'Open the file in Drive → Share → "Anyone with the link" → Copy link → paste here.');
        document.getElementById('pdf-label-label').textContent =
            tr('pdfs.field.label', lang, 'Label');
        const personEl = document.getElementById('pdf-person-label');
        const personHint = ` <span class="pdf-field-hint">(${tr('pdfs.field.personHint', lang, 'optional, blank = shared')})</span>`;
        personEl.innerHTML = escapeAttr(tr('pdfs.field.person', lang, 'Person')) + personHint;
        document.getElementById('pdf-cancel-btn').textContent = tr('pdfs.cancel', lang, 'Cancel');
        document.getElementById('pdf-submit-btn').textContent = tr('pdfs.save', lang, 'Save');
    }

    function showOverlayAnd(modalId) {
        document.getElementById('pdf-overlay').hidden = false;
        document.getElementById(modalId).hidden = false;
    }
    function closeAllModals() {
        document.getElementById('pdf-overlay').hidden = true;
        document.getElementById('pdf-upload-modal').hidden = true;
        document.getElementById('pdf-viewer-modal').hidden = true;
        // reset upload form state
        const form = document.getElementById('pdf-upload-form');
        form.reset();
        document.getElementById('pdf-upload-error').hidden = true;
        document.getElementById('pdf-submit-btn').disabled = false;
        // clear edit-mode markers
        form.dataset.mode = '';
        form.dataset.itemId = '';
        form.dataset.editId = '';
        form.dataset.day = '';
        form.dataset.time = '';
    }

    // ================================
    // Upload modal
    // ================================
    let activeContext = null;   // { itemId, day, time, onSaved, onChanged, mode, editId }

    function openUploadModal(opts) {
        ensureModalDom();
        setLabels();
        activeContext = {
            itemId: opts.itemId,
            day: opts.day,
            time: opts.time,
            onSaved: opts.onSaved,
            mode: opts.mode || 'create',          // 'create' | 'edit'
            editId: opts.editId || null
        };

        const form = document.getElementById('pdf-upload-form');
        form.dataset.mode = activeContext.mode;
        form.dataset.itemId = String(opts.itemId || '');
        form.dataset.editId = String(opts.editId || '');
        form.dataset.day = String(opts.day || '');
        form.dataset.time = String(opts.time || '');

        // Title
        const lang = getLang();
        const baseTitle = activeContext.mode === 'edit'
            ? tr('pdfs.editTitle', lang, 'Edit document')
            : tr('pdfs.uploadTitle', lang, 'Add document');
        const dayLabel = opts.day != null
            ? (lang === 'zh' ? `第 ${opts.day} 天` : `Day ${opts.day}`) +
              (opts.time ? ` · ${opts.time}` : '')
            : '';
        document.getElementById('pdf-upload-title').textContent =
            dayLabel ? `${baseTitle} — ${dayLabel}` : baseTitle;

        // Prefill (edit mode)
        const urlInput = document.getElementById('pdf-url-input');
        const labelInput = document.getElementById('pdf-label-input');
        const personInput = document.getElementById('pdf-person-input');
        if (opts.prefill) {
            urlInput.value = opts.prefill.url || '';
            labelInput.value = t(opts.prefill.label, lang) || '';
            personInput.value = opts.prefill.person || '';
            // URL editable in edit mode but not required (keep existing if blank)
            urlInput.required = false;
        } else {
            urlInput.required = true;
        }
        document.getElementById('pdf-submit-btn').textContent =
            tr('pdfs.save', lang, 'Save');

        showOverlayAnd('pdf-upload-modal');
        setTimeout(() => urlInput.focus(), 50);
    }

    // Normalize a Drive URL into a canonical /file/d/<id>/view form. If the
    // pasted URL doesn't look like a Drive link, return it unchanged so other
    // formats (Dropbox, OneDrive direct links, etc.) still work.
    function normalizeDriveUrl(input) {
        if (!input) return input;
        const s = String(input).trim();
        let m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (m) return `https://drive.google.com/file/d/${m[1]}/view`;
        m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (m) return `https://drive.google.com/file/d/${m[1]}/view`;
        return s;
    }

    async function handleUploadSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const errorEl = document.getElementById('pdf-upload-error');
        const submitBtn = document.getElementById('pdf-submit-btn');
        errorEl.hidden = true;
        submitBtn.disabled = true;

        const itemId = form.dataset.itemId;
        const mode = form.dataset.mode;
        const editId = form.dataset.editId;

        const urlInput = document.getElementById('pdf-url-input');
        const labelInput = document.getElementById('pdf-label-input');
        const personInput = document.getElementById('pdf-person-input');
        const urlStr = normalizeDriveUrl(urlInput.value.trim());
        const labelStr = labelInput.value.trim();
        const personStr = personInput.value.trim();

        if (!labelStr) {
            errorEl.textContent = 'Label required';
            errorEl.hidden = false;
            submitBtn.disabled = false;
            return;
        }
        if (mode === 'create' && !urlStr) {
            errorEl.textContent = 'Link required';
            errorEl.hidden = false;
            submitBtn.disabled = false;
            return;
        }
        if (urlStr && !/^https?:\/\//i.test(urlStr)) {
            errorEl.textContent = 'Link must start with https://';
            errorEl.hidden = false;
            submitBtn.disabled = false;
            return;
        }

        try {
            const safe = safeId(itemId);
            const existing = (cache[safe] && cache[safe].pdfs) || [];
            let pdfs = existing.slice();

            if (mode === 'edit' && editId) {
                const idx = pdfs.findIndex(p => p.id === editId);
                if (idx === -1) throw new Error('Entry not found');
                pdfs[idx] = {
                    ...pdfs[idx],
                    label: { en: labelStr, zh: labelStr },
                    person: personStr,
                    // Only overwrite URL if user provided a new one
                    ...(urlStr ? { url: urlStr } : {})
                };
            } else {
                pdfs.push({
                    id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                    person: personStr,
                    label: { en: labelStr, zh: labelStr },
                    url: urlStr,
                    addedAt: new Date().toISOString(),
                    addedBy: ((window.fbAuthState && window.fbAuthState().uid) || '')
                });
            }

            await savePdfs(itemId, pdfs);
            closeAllModals();
            if (activeContext && activeContext.onSaved) activeContext.onSaved();
        } catch (err) {
            errorEl.textContent = err.message || String(err);
            errorEl.hidden = false;
            submitBtn.disabled = false;
        }
    }

    // ================================
    // Viewer modal
    // ================================
    function openViewerModal(opts) {
        ensureModalDom();
        setLabels();
        activeContext = {
            itemId: opts.itemId,
            day: opts.day,
            time: opts.time,
            onChanged: opts.onChanged
        };
        const lang = getLang();
        const dayLabel = opts.day != null
            ? (lang === 'zh' ? `第 ${opts.day} 天` : `Day ${opts.day}`) +
              (opts.time ? ` · ${opts.time}` : '')
            : '';
        const baseTitle = tr('pdfs.title', lang, 'Documents');
        document.getElementById('pdf-viewer-title').textContent =
            dayLabel ? `${baseTitle} — ${dayLabel}` : baseTitle;

        renderViewerList(opts.pdfs || []);
        showOverlayAnd('pdf-viewer-modal');
    }

    function renderViewerList(pdfs) {
        const list = document.getElementById('pdf-list');
        const lang = getLang();
        const auth = (window.fbAuthState && window.fbAuthState()) || { signedIn: false };
        const openLabel = tr('pdfs.open', lang, 'Open');
        const editLabel = tr('pdfs.edit', lang, 'Edit');
        const deleteLabel = tr('pdfs.delete', lang, 'Delete');

        if (!pdfs.length) {
            list.innerHTML = `<li class="pdf-list-empty">${escapeAttr(tr('pdfs.empty', lang, 'No documents.'))}</li>`;
            return;
        }
        list.innerHTML = pdfs.map(p => {
            const labelText = t(p.label, lang) || '(untitled)';
            const personText = p.person || '';
            const adminBtns = auth.signedIn ? `
                <button class="pdf-row-icon" type="button" data-pdf-edit="${escapeAttr(p.id)}" title="${escapeAttr(editLabel)}" aria-label="${escapeAttr(editLabel)}">✏️</button>
                <button class="pdf-row-icon" type="button" data-pdf-delete="${escapeAttr(p.id)}" title="${escapeAttr(deleteLabel)}" aria-label="${escapeAttr(deleteLabel)}">🗑️</button>
            ` : '';
            return `
                <li class="pdf-row" data-pdf-id="${escapeAttr(p.id)}">
                    <div class="pdf-row-meta">
                        ${personText ? `<span class="pdf-row-person">${escapeAttr(personText)}</span>` : ''}
                        <span class="pdf-row-label">${escapeAttr(labelText)}</span>
                    </div>
                    <a class="pdf-row-open" href="${escapeAttr(p.url)}" target="_blank" rel="noopener">${escapeAttr(openLabel)} →</a>
                    ${adminBtns}
                </li>
            `;
        }).join('');
    }

    async function handleEditClick(btn) {
        const id = btn.dataset.pdfEdit;
        const ctx = activeContext;
        if (!ctx || !ctx.itemId) return;
        const safe = safeId(ctx.itemId);
        const entry = ((cache[safe] && cache[safe].pdfs) || []).find(p => p.id === id);
        if (!entry) return;
        // Close viewer, open upload in edit mode
        document.getElementById('pdf-viewer-modal').hidden = true;
        openUploadModal({
            itemId: ctx.itemId,
            day: ctx.day,
            time: ctx.time,
            mode: 'edit',
            editId: id,
            prefill: { label: entry.label, person: entry.person, url: entry.url },
            onSaved: () => {
                if (ctx.onChanged) ctx.onChanged();
                // Re-open viewer with updated list
                const updated = ((cache[safe] && cache[safe].pdfs) || []);
                openViewerModal({
                    itemId: ctx.itemId, day: ctx.day, time: ctx.time,
                    pdfs: updated, onChanged: ctx.onChanged
                });
            }
        });
    }

    async function handleDeleteClick(btn) {
        const id = btn.dataset.pdfDelete;
        const lang = getLang();
        // PDFs live on Drive, so this only removes the entry from the trip site.
        // The Drive file itself is untouched.
        const confirmMsg = tr('pdfs.deleteConfirm', lang,
            'Remove this link from the trip site? The Drive file is not deleted.');
        if (!confirm(confirmMsg)) return;

        const ctx = activeContext;
        if (!ctx || !ctx.itemId) return;
        const safe = safeId(ctx.itemId);
        try {
            const remaining = ((cache[safe] && cache[safe].pdfs) || []).filter(p => p.id !== id);
            await savePdfs(ctx.itemId, remaining);
            if (ctx.onChanged) ctx.onChanged();
            if (remaining.length === 0) {
                closeAllModals();
            } else {
                renderViewerList(remaining);
            }
        } catch (e) {
            alert((tr('pdfs.deleteFailed', lang, 'Delete failed: ') || 'Delete failed: ') + e.message);
        }
    }

    // ================================
    // Public API
    // ================================
    window.PdfHelpers = {
        loadAll,
        getFor,
        renderActions,
        openUploadModal,
        openViewerModal
    };

    // Re-render hint: when auth state changes, callers should re-render
    // because upload buttons + edit/delete affordances depend on auth.
    // (No auto re-render here — bookings/itinerary renderers listen and react.)
})();
