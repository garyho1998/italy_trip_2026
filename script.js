// ================================
// Italy Trip Planner - JavaScript
// Multi-page webapp support
// ================================

document.addEventListener('DOMContentLoaded', () => {
    initMobileNav();
    initScrollAnimations();
    initPackingListPersistence();
    initCountdown();
    initNavScroll();
    initLanguage();
    initDayCardCollapse();
});

// ================================
// Mobile Navigation
// ================================
function toggleMobileNav() {
    const mobileNav = document.getElementById('mobileNav');
    if (mobileNav) {
        mobileNav.classList.toggle('active');
    }
}

function initMobileNav() {
    // Close mobile nav when clicking outside
    document.addEventListener('click', (e) => {
        const mobileNav = document.getElementById('mobileNav');
        const isToggleClick = e.target.closest('.nav-toggle, .floating-nav-btn, .site-header-toggle');

        if (mobileNav && mobileNav.classList.contains('active')) {
            if (!mobileNav.contains(e.target) && !isToggleClick) {
                mobileNav.classList.remove('active');
            }
        }
    });

    // Close mobile nav when clicking a link
    const mobileNavLinks = document.querySelectorAll('.mobile-nav a');
    mobileNavLinks.forEach(link => {
        link.addEventListener('click', () => {
            const mobileNav = document.getElementById('mobileNav');
            if (mobileNav) {
                mobileNav.classList.remove('active');
            }
        });
    });
}

// Make toggleMobileNav globally available
window.toggleMobileNav = toggleMobileNav;

// ================================
// Navigation Scroll Effect
// ================================
function initNavScroll() {
    const nav = document.querySelector('.nav');
    
    if (nav && !nav.classList.contains('nav-sticky')) {
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 100) {
                nav.style.background = 'rgba(30, 58, 95, 0.95)';
                nav.style.backdropFilter = 'blur(10px)';
                nav.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.2)';
            } else {
                nav.style.background = 'transparent';
                nav.style.backdropFilter = 'none';
                nav.style.boxShadow = 'none';
            }
        });
    }
}

// ================================
// Scroll Animations
// ================================
function initScrollAnimations() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe elements for animation
    const animateElements = document.querySelectorAll(
        '.day-card, .budget-card, .tip-card-small, .packing-category, .flight-detail-card, ' +
        '.quick-link-card, .route-card, .highlight-card, .checklist-item, .tip-item, ' +
        '.currency-card, .emergency-card, .phrase-card, .alternative-card'
    );
    
    animateElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = `all 0.5s ease ${Math.min(index * 0.05, 0.3)}s`;
        observer.observe(el);
    });
    
    // Add animate-in class styles
    if (!document.getElementById('animate-styles')) {
        const style = document.createElement('style');
        style.id = 'animate-styles';
        style.textContent = `
            .animate-in {
                opacity: 1 !important;
                transform: translateY(0) !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// ================================
// Packing List Persistence
// ================================
function initPackingListPersistence() {
    const checkboxes = document.querySelectorAll('.packing-list input[type="checkbox"]');
    const storageKey = 'italy-trip-packing-list';
    
    if (checkboxes.length === 0) return;
    
    // Load saved state
    const savedState = JSON.parse(localStorage.getItem(storageKey) || '{}');
    
    checkboxes.forEach((checkbox, index) => {
        const id = `packing-${index}`;
        checkbox.dataset.id = id;
        
        // Restore saved state
        if (savedState[id]) {
            checkbox.checked = true;
            updatePackingStyle(checkbox);
        }
        
        // Save on change
        checkbox.addEventListener('change', () => {
            savedState[id] = checkbox.checked;
            localStorage.setItem(storageKey, JSON.stringify(savedState));
            updatePackingStyle(checkbox);
        });
    });
}

function updatePackingStyle(checkbox) {
    const label = checkbox.parentElement;
    if (checkbox.checked) {
        label.style.textDecoration = 'line-through';
        label.style.opacity = '0.6';
    } else {
        label.style.textDecoration = 'none';
        label.style.opacity = '1';
    }
}

// ================================
// Countdown to Trip
// ================================
function initCountdown() {
    const tripDate = new Date('2026-06-03T00:00:00');
    
    function updateCountdown() {
        const now = new Date();
        const diff = tripDate - now;
        
        if (diff > 0) {
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            
            // Update hero subtitle if on home page
            const subtitle = document.querySelector('.hero-subtitle');
            if (subtitle && days > 0) {
                const lang = getCurrentLang();
                const dateText = lang === 'zh' ? '2026年6月3日 - 13日' : 'June 3 - 13, 2026';
                const countdownText = lang === 'zh'
                    ? `距離出發還有 ${days} 天！`
                    : `${days} days to go!`;
                subtitle.innerHTML = `${dateText} <span style="margin-left: 12px; background: rgba(212, 168, 75, 0.3); padding: 4px 12px; border-radius: 4px; font-size: 0.85em;">${countdownText}</span>`;
            }
        }
    }
    
    updateCountdown();
    setInterval(updateCountdown, 3600000); // Update every hour
}

// ================================
// Collapsible Day Cards (Itinerary)
// ================================
function initDayCardCollapse() {
    const dayCards = document.querySelectorAll('.day-card');
    if (dayCards.length === 0) return;

    dayCards.forEach(card => {
        const header = card.querySelector('.day-header');
        if (!header) return;

        if (!header.querySelector('.day-toggle-icon')) {
            const icon = document.createElement('span');
            icon.className = 'day-toggle-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = '▾';
            header.appendChild(icon);
        }

        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');
        header.setAttribute('aria-expanded', 'false');

        const toggle = () => {
            const isExpanded = card.classList.toggle('expanded');
            header.setAttribute('aria-expanded', String(isExpanded));
        };

        header.addEventListener('click', toggle);
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        });
    });
}

// ================================
// Smooth Scrolling
// ================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
            const headerOffset = 80;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// ================================
// Parallax Effect for Hero
// ================================
if (document.querySelector('.hero')) {
    window.addEventListener('scroll', () => {
        const hero = document.querySelector('.hero');
        const scrolled = window.pageYOffset;
        
        if (scrolled < window.innerHeight) {
            hero.style.backgroundPositionY = `${scrolled * 0.3}px`;
        }
    });
}

// ================================
// Language Toggle (EN / 繁體中文)
// ================================
const LANG_STORAGE_KEY = 'italy-trip-lang';
// Originals are keyed by *element*, not by i18n key, because multiple elements
// can share the same data-i18n key (e.g. nav-route appears in the top nav as
// "Map" and in the footer nav as "Route"). Using a WeakMap also lets the
// browser GC originals when dynamic renderers (itinerary-render.js, bookings-
// render.js) replace their containers.
const ORIGINAL_TEXTS = new WeakMap();

function initLanguage() {
    // Store original English texts on first load
    document.querySelectorAll('[data-i18n]').forEach(el => {
        ORIGINAL_TEXTS.set(el, el.innerHTML);
    });

    // Apply saved language preference
    const savedLang = localStorage.getItem(LANG_STORAGE_KEY) || 'en';
    if (savedLang === 'zh') {
        applyTranslations('zh');
    }
    updateToggleButtons(savedLang);
}

function toggleLanguage() {
    const currentLang = localStorage.getItem(LANG_STORAGE_KEY) || 'en';
    const newLang = currentLang === 'en' ? 'zh' : 'en';
    localStorage.setItem(LANG_STORAGE_KEY, newLang);
    applyTranslations(newLang);
    updateToggleButtons(newLang);

    // Re-run countdown to update its text
    initCountdown();

    // Notify dynamically-rendered content (e.g. itinerary-render.js) to re-render.
    window.dispatchEvent(new CustomEvent('app-lang-change', { detail: { lang: newLang } }));
}

function applyTranslations(lang) {
    if (typeof TRANSLATIONS === 'undefined') return;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (lang === 'zh' && TRANSLATIONS[key]) {
            // Capture per-element original lazily on first switch to ZH.
            if (!ORIGINAL_TEXTS.has(el)) {
                ORIGINAL_TEXTS.set(el, el.innerHTML);
            }
            el.innerHTML = TRANSLATIONS[key];
        } else if (lang === 'en') {
            const original = ORIGINAL_TEXTS.get(el);
            if (original !== undefined) {
                el.innerHTML = original;
            }
        }
    });
}

function updateToggleButtons(lang) {
    // Legacy single-button toggle (still used in mobile drawer)
    document.querySelectorAll('.lang-toggle').forEach(btn => {
        btn.textContent = lang === 'en' ? '中文' : 'EN';
    });
    // New two-button switcher (.lang-btn-en / .lang-btn-zh) — mark active
    document.querySelectorAll('.lang-btn').forEach(btn => {
        const isEnBtn = btn.classList.contains('lang-btn-en');
        const isZhBtn = btn.classList.contains('lang-btn-zh');
        const isActive = (lang === 'en' && isEnBtn) || (lang === 'zh' && isZhBtn);
        btn.classList.toggle('active', isActive);
    });
}

// Set language to a specific value (no-op if already set). Used by the
// two-button switcher in the new site-header. Re-routes through
// toggleLanguage() so all the side-effects (translations, countdown,
// app-lang-change event) fire consistently.
function setLanguage(lang) {
    if (lang !== 'en' && lang !== 'zh') return;
    const current = localStorage.getItem(LANG_STORAGE_KEY) || 'en';
    if (current === lang) return;
    toggleLanguage();
}

// Theme toggle is decorative for now — wired up so the button isn't dead,
// but the only effect is a brief tooltip flash. When dark mode lands later
// this function will swap stylesheets.
function handleThemeToggle(btn) {
    if (!btn) return;
    btn.classList.add('theme-toggle-bumped');
    setTimeout(() => btn.classList.remove('theme-toggle-bumped'), 600);
}

// Make toggleLanguage globally available
window.toggleLanguage = toggleLanguage;
window.setLanguage = setLanguage;
window.handleThemeToggle = handleThemeToggle;

// Helper: get current language
function getCurrentLang() {
    return localStorage.getItem(LANG_STORAGE_KEY) || 'en';
}

// ================================
// FX Rate (EUR -> HKD)
// frankfurter.app for live rate, 24h localStorage cache, 9.16 fallback.
// TODO: support more currencies (KRW, JPY, etc.) when needed.
// ================================
const FX_FALLBACK_EUR_HKD = 9.16;
const FX_CACHE_KEY = 'italy-trip-fx-eur-hkd';
const FX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function getFxEurToHkd({ forceRefresh = false } = {}) {
    if (!forceRefresh) {
        try {
            const cached = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || 'null');
            if (cached && (Date.now() - cached.fetchedAt) < FX_CACHE_TTL_MS && cached.rate > 0) {
                return { rate: cached.rate, source: 'cache', fetchedAt: cached.fetchedAt };
            }
        } catch (e) { /* fall through */ }
    }
    try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=HKD', { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
            const j = await res.json();
            const rate = j.rates && j.rates.HKD;
            if (typeof rate === 'number' && rate > 0) {
                const entry = { rate, fetchedAt: Date.now() };
                try { localStorage.setItem(FX_CACHE_KEY, JSON.stringify(entry)); } catch (e) {}
                return { rate, source: 'live', fetchedAt: entry.fetchedAt };
            }
        }
    } catch (e) {
        console.warn('[fx] live fetch failed, using fallback:', e.message);
    }
    return { rate: FX_FALLBACK_EUR_HKD, source: 'fallback', fetchedAt: null };
}

// Convert any supported currency to HKD using a known EUR->HKD rate.
function toHkd(amount, currency, eurHkdRate) {
    if (amount == null) return null;
    if (currency === 'HKD') return amount;
    if (currency === 'EUR') return amount * eurHkdRate;
    return amount;
}

// Convert HKD to any supported currency using a known EUR->HKD rate.
function fromHkd(amount, currency, eurHkdRate) {
    if (amount == null) return null;
    if (currency === 'HKD') return amount;
    if (currency === 'EUR') return amount / eurHkdRate;
    return amount;
}

// Format a number into a currency-prefixed display string.
function formatMoney(amount, currency) {
    if (amount == null || isNaN(amount)) return '';
    const sym = currency === 'HKD' ? 'HK$' : currency === 'EUR' ? '€' : (currency + ' ');
    const rounded = Math.round(amount);
    return sym + rounded.toLocaleString('en-US');
}

window.getFxEurToHkd = getFxEurToHkd;
window.toHkd = toHkd;
window.fromHkd = fromHkd;
window.formatMoney = formatMoney;

// ================================
// Firebase Auth (REST, no SDK) — used for PDF upload admin
// Sign-in lives on settings.html. Token + refreshToken in localStorage.
// ================================
const FB_PROJECT_ID = 'trip-webapp-de677';
const FB_STORAGE_BUCKET = 'trip-webapp-de677.firebasestorage.app';
// Public Web API key from Firebase Console → Project Settings → General → Your
// apps (Web). Not a secret — it's a client identifier; the actual auth happens
// server-side and is gated by Firebase Auth users + Storage rules.
const FB_WEB_API_KEY = 'AIzaSyDlfOTF9IRp81k7NJqPc89Om7y9i-wGR1g';
const FB_AUTH_KEY = 'italy-trip-fb-auth';

const FB_AUTH_EVT = 'app-fb-auth-change';

function fbAuthState() {
    try {
        const raw = localStorage.getItem(FB_AUTH_KEY);
        if (!raw) return { signedIn: false };
        const j = JSON.parse(raw);
        if (!j || !j.idToken) return { signedIn: false };
        return { signedIn: true, email: j.email, uid: j.uid };
    } catch (e) { return { signedIn: false }; }
}

async function fbSignIn(email, password) {
    if (!FB_WEB_API_KEY) {
        throw new Error('Firebase Web API Key not configured. Paste it in script.js (FB_WEB_API_KEY).');
    }
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_WEB_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
        }
    );
    const j = await res.json();
    if (!res.ok) {
        const msg = (j && j.error && j.error.message) || `HTTP ${res.status}`;
        throw new Error(msg);
    }
    const entry = {
        idToken: j.idToken,
        refreshToken: j.refreshToken,
        // expiresIn is seconds-as-string from Firebase
        expiresAt: Date.now() + (Number(j.expiresIn) * 1000),
        uid: j.localId,
        email: j.email
    };
    localStorage.setItem(FB_AUTH_KEY, JSON.stringify(entry));
    window.dispatchEvent(new CustomEvent(FB_AUTH_EVT, { detail: { signedIn: true, email: j.email } }));
    return entry;
}

function fbSignOut() {
    localStorage.removeItem(FB_AUTH_KEY);
    window.dispatchEvent(new CustomEvent(FB_AUTH_EVT, { detail: { signedIn: false } }));
}

async function fbGetIdToken() {
    let entry;
    try { entry = JSON.parse(localStorage.getItem(FB_AUTH_KEY) || 'null'); } catch (e) { entry = null; }
    if (!entry || !entry.idToken) throw new Error('Not signed in');
    // Refresh if within 5 min of expiry
    if (Date.now() > (entry.expiresAt - 5 * 60 * 1000)) {
        const res = await fetch(
            `https://securetoken.googleapis.com/v1/token?key=${FB_WEB_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(entry.refreshToken)}`
            }
        );
        const j = await res.json();
        if (!res.ok) {
            // Refresh failed — sign out and rethrow
            fbSignOut();
            throw new Error('Session expired, please sign in again');
        }
        entry.idToken = j.id_token || j.access_token;
        entry.refreshToken = j.refresh_token || entry.refreshToken;
        entry.expiresAt = Date.now() + (Number(j.expires_in) * 1000);
        entry.uid = j.user_id || entry.uid;
        localStorage.setItem(FB_AUTH_KEY, JSON.stringify(entry));
    }
    return entry.idToken;
}

window.fbAuthState = fbAuthState;
window.fbSignIn = fbSignIn;
window.fbSignOut = fbSignOut;
window.fbGetIdToken = fbGetIdToken;
window.FB_AUTH_EVT = FB_AUTH_EVT;
window.FB_PROJECT_ID = FB_PROJECT_ID;
window.FB_STORAGE_BUCKET = FB_STORAGE_BUCKET;

// ================================
// Firebase Storage (REST) — upload + delete PDFs
// ================================

// Upload a File/Blob to Firebase Storage at the given path. Returns
// { url, storagePath, name, contentType, size, downloadToken }.
// Reports progress via onProgress(percent).
function uploadFileToStorage(file, storagePath, onProgress) {
    return new Promise(async (resolve, reject) => {
        let idToken;
        try { idToken = await fbGetIdToken(); }
        catch (e) { return reject(e); }

        const url = `https://firebasestorage.googleapis.com/v0/b/${FB_STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(storagePath)}`;
        // Verbose debug logs — visible in DevTools / Safari Web Inspector to
        // diagnose iPhone uploads. Strip the token before logging.
        const dbg = (...args) => console.log('[fb-upload]', ...args);
        dbg('POST', url);
        dbg('file', { name: file.name, size: file.size, type: file.type });

        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
        xhr.setRequestHeader('Content-Type', file.type || 'application/pdf');
        if (onProgress) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
            };
        }
        xhr.onload = () => {
            dbg('onload', { status: xhr.status, statusText: xhr.statusText, responseLen: (xhr.responseText || '').length });
            if (xhr.status >= 200 && xhr.status < 300) {
                let meta;
                try { meta = JSON.parse(xhr.responseText); }
                catch (e) { return reject(new Error('Bad upload response (not JSON): ' + (xhr.responseText || '').slice(0, 120))); }
                const token = (meta.downloadTokens || '').split(',')[0];
                if (!token) return reject(new Error('No download token in response: ' + JSON.stringify(meta).slice(0, 200)));
                const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${FB_STORAGE_BUCKET}/o/${encodeURIComponent(meta.name)}?alt=media&token=${token}`;
                resolve({
                    url: downloadUrl,
                    storagePath: meta.name,
                    name: meta.name,
                    contentType: meta.contentType,
                    size: Number(meta.size),
                    downloadToken: token
                });
            } else {
                // Surface the full server error in the rejection so it's visible in the modal
                let msg = `HTTP ${xhr.status}`;
                if (xhr.statusText) msg += ` ${xhr.statusText}`;
                try {
                    const j = JSON.parse(xhr.responseText);
                    if (j.error) msg += ` — ${j.error.message || j.error.code || JSON.stringify(j.error)}`;
                } catch (e) {
                    // Non-JSON body — include first 200 chars
                    if (xhr.responseText) msg += ` — ${xhr.responseText.slice(0, 200)}`;
                }
                reject(new Error(msg));
            }
        };
        xhr.onerror = () => {
            // XHR error: preflight rejection / DNS / offline / cert / etc. The
            // browser deliberately doesn't expose the cause to JS for security
            // reasons, but we can at least show the readyState + URL in the
            // message so the user can paste it back for diagnosis.
            dbg('onerror', { readyState: xhr.readyState, status: xhr.status });
            reject(new Error(`Network error (XHR status=${xhr.status}, readyState=${xhr.readyState}). Check DevTools Network tab for the actual response — common causes: token expired, CORS preflight blocked, or bucket name wrong (current: ${FB_STORAGE_BUCKET}).`));
        };
        xhr.ontimeout = () => reject(new Error('Upload timed out'));
        xhr.onabort   = () => reject(new Error('Upload aborted'));
        xhr.send(file);
    });
}

// Quick connectivity probe — call from DevTools console:
//   await debugFirebaseStorage()
// Verifies the bucket is reachable by GETting an empty list.
async function debugFirebaseStorage() {
    const url = `https://firebasestorage.googleapis.com/v0/b/${FB_STORAGE_BUCKET}/o?prefix=pdfs%2F&maxResults=1`;
    console.log('[fb-debug] GET', url);
    try {
        const res = await fetch(url);
        const text = await res.text();
        console.log('[fb-debug] status', res.status, res.statusText);
        console.log('[fb-debug] body', text.slice(0, 500));
        return { status: res.status, body: text.slice(0, 500) };
    } catch (e) {
        console.error('[fb-debug] fetch failed:', e);
        return { error: e.message };
    }
}
window.debugFirebaseStorage = debugFirebaseStorage;

async function deleteFileFromStorage(storagePath) {
    const idToken = await fbGetIdToken();
    const url = `https://firebasestorage.googleapis.com/v0/b/${FB_STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}`;
    const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` }
    });
    if (!res.ok && res.status !== 404) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j.error) msg = j.error.message || msg; } catch (e) {}
        throw new Error(msg);
    }
}

window.uploadFileToStorage = uploadFileToStorage;
window.deleteFileFromStorage = deleteFileFromStorage;

// Slug a string into [a-z0-9-]+ for filenames (max 40 chars)
function slugifyForFilename(s) {
    return String(s || 'file')
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/i, '')   // strip extension
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'file';
}
window.slugifyForFilename = slugifyForFilename;

// ================================
// Console Greeting
// ================================
console.log('%c🇮🇹 Italia Avventura 2026', 'font-size: 24px; font-weight: bold; color: #C65D3B;');
console.log('%cBuon viaggio! Have an amazing trip to Italy!', 'font-size: 14px; color: #1E3A5F;');
console.log('%cTrip dates: June 3-13, 2026 | 6 travelers | Mountains to Sea', 'font-size: 12px; color: #6B6B6B;');
