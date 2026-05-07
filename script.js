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
// Console Greeting
// ================================
console.log('%c🇮🇹 Italia Avventura 2026', 'font-size: 24px; font-weight: bold; color: #C65D3B;');
console.log('%cBuon viaggio! Have an amazing trip to Italy!', 'font-size: 14px; color: #1E3A5F;');
console.log('%cTrip dates: June 3-13, 2026 | 6 travelers | Mountains to Sea', 'font-size: 12px; color: #6B6B6B;');
