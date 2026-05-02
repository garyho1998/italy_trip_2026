// ================================
// Italy Trip Planner - JavaScript
// Multi-page webapp support
// ================================

document.addEventListener('DOMContentLoaded', () => {
    initMobileNav();
    initScrollAnimations();
    initPackingListPersistence();
    initChecklistPersistence();
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
        const navToggle = document.querySelector('.nav-toggle');
        
        if (mobileNav && mobileNav.classList.contains('active')) {
            if (!mobileNav.contains(e.target) && !navToggle.contains(e.target)) {
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
// Pre-Book Checklist Persistence
// ================================
function initChecklistPersistence() {
    const checkboxes = document.querySelectorAll('.checklist-item input[type="checkbox"]');
    const storageKey = 'italy-trip-checklist';
    
    if (checkboxes.length === 0) return;
    
    // Load saved state
    const savedState = JSON.parse(localStorage.getItem(storageKey) || '{}');
    
    checkboxes.forEach((checkbox) => {
        const id = checkbox.id;
        
        // Restore saved state
        if (savedState[id]) {
            checkbox.checked = true;
            updateChecklistStyle(checkbox);
        }
        
        // Save on change
        checkbox.addEventListener('change', () => {
            savedState[id] = checkbox.checked;
            localStorage.setItem(storageKey, JSON.stringify(savedState));
            updateChecklistStyle(checkbox);
        });
    });
}

function updateChecklistStyle(checkbox) {
    const item = checkbox.closest('.checklist-item');
    if (checkbox.checked) {
        item.style.opacity = '0.6';
        item.style.background = '#f0f0f0';
    } else {
        item.style.opacity = '1';
        item.style.background = 'white';
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
const ORIGINAL_TEXTS = {};

function initLanguage() {
    // Store original English texts on first load
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        ORIGINAL_TEXTS[key] = el.innerHTML;
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
}

function applyTranslations(lang) {
    if (typeof TRANSLATIONS === 'undefined') return;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (lang === 'zh' && TRANSLATIONS[key]) {
            // Store original if not yet stored
            if (!ORIGINAL_TEXTS[key]) {
                ORIGINAL_TEXTS[key] = el.innerHTML;
            }
            el.innerHTML = TRANSLATIONS[key];
        } else if (lang === 'en' && ORIGINAL_TEXTS[key]) {
            el.innerHTML = ORIGINAL_TEXTS[key];
        }
    });
}

function updateToggleButtons(lang) {
    document.querySelectorAll('.lang-toggle').forEach(btn => {
        btn.textContent = lang === 'en' ? '中文' : 'EN';
    });
}

// Make toggleLanguage globally available
window.toggleLanguage = toggleLanguage;

// Helper: get current language
function getCurrentLang() {
    return localStorage.getItem(LANG_STORAGE_KEY) || 'en';
}

// ================================
// Console Greeting
// ================================
console.log('%c🇮🇹 Italia Avventura 2026', 'font-size: 24px; font-weight: bold; color: #C65D3B;');
console.log('%cBuon viaggio! Have an amazing trip to Italy!', 'font-size: 14px; color: #1E3A5F;');
console.log('%cTrip dates: June 3-13, 2026 | 6 travelers | Mountains to Sea', 'font-size: 12px; color: #6B6B6B;');
