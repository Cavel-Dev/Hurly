// Sidebar JavaScript - Enhanced Version

if (window.jQuery) {
$(document).ready(function() {
    // Toggle sidebar collapse
    $('#toggleBtn').on('click', function() {
        $('#sidebar').toggleClass('collapsed');
    }).attr('data-toggle-bound', 'true');

    // Handle active state on menu items
    $('.menu ul li a').on('click', function(e) {
        var href = $(this).attr('href');
        
        // Don't change active state for logout button
        if ($(this).attr('id') !== 'logoutBtn') {
            // Remove active class from all items
            $('.menu ul li').removeClass('active');
            
            // Reset all items to default styling
            $('.menu ul li a').css({
                'background': '',
                'color': ''
            });
            
            // Add active class to clicked item
            $(this).parent().addClass('active');
            
            // Apply active styling to clicked item
            $(this).css({
                'background': '#000',
                'color': '#fff'
            });
        }
    });

    // Black hover effect on mouse enter (only if not active)
    $('.menu ul li a').on('mouseenter', function() {
        if (!$(this).parent().hasClass('active')) {
            $(this).css({
                'background': '#000',
                'color': '#fff'
            });
        }
    });

    // Remove hover effect on mouse leave (only if not active)
    $('.menu ul li a').on('mouseleave', function() {
        if (!$(this).parent().hasClass('active')) {
            $(this).css({
                'background': '',
                'color': ''
            });
        }
    });

    // Role guard temporarily disabled to stop forced redirects

    function loadSupabaseClient() {
        return new Promise((resolve) => {
            if (window.__supabaseClient) {
                resolve(window.__supabaseClient);
                return;
            }
            if (window.supabase && window.supabase.createClient) {
                const SUPABASE_URL = "https://ncqfvcymhvjcchrwelfg.supabase.co";
                const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jcWZ2Y3ltaHZqY2NocndlbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTg2NjksImV4cCI6MjA4NTk5NDY2OX0.93kN-rWGI8q5kd3YSdwJZfsCpACuaI2m38JU-Sxnp8I";
                window.__supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                resolve(window.__supabaseClient);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js';
            script.onload = () => {
                if (window.supabase && window.supabase.createClient) {
                    const SUPABASE_URL = "https://ncqfvcymhvjcchrwelfg.supabase.co";
                    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jcWZ2Y3ltaHZqY2NocndlbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTg2NjksImV4cCI6MjA4NTk5NDY2OX0.93kN-rWGI8q5kd3YSdwJZfsCpACuaI2m38JU-Sxnp8I";
                    window.__supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                    resolve(window.__supabaseClient);
                } else {
                    resolve(null);
                }
            };
            script.onerror = () => resolve(null);
            document.head.appendChild(script);
        });
    }

    $('#logoutBtn').on('click', async function(e) {
        e.preventDefault();
        const existing = document.getElementById('logoutToast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'logoutToast';
        toast.textContent = 'You have logged out successfully';
        toast.style.cssText = [
            'position: fixed',
            'top: 20px',
            'left: 50%',
            'transform: translateX(-50%)',
            'background: #000',
            'color: #fff',
            'padding: 12px 20px',
            'border-radius: 10px',
            'box-shadow: none',
            'font-size: 14px',
            'font-weight: 600',
            'letter-spacing: 0.2px',
            'z-index: 10000',
            'opacity: 0',
            'transition: opacity 200ms ease'
        ].join('; ');

        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
        });

        setTimeout(async () => {
            try {
                const supabase = await loadSupabaseClient();
                if (supabase) {
                    const { error } = await supabase.auth.signOut();
                    if (error) console.warn('Supabase signOut error:', error);
                }
                const auditRaw = localStorage.getItem('huly_audit');
                const audit = auditRaw ? JSON.parse(auditRaw) : [];
                const session = JSON.parse(localStorage.getItem('huly_session') || 'null');
                audit.push({
                    id: Date.now().toString(36),
                    ts: new Date().toISOString(),
                    actor: session ? { id: session.id, email: session.email, role: session.role } : null,
                    action: 'logout',
                    details: {}
                });
                const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
                const pruned = audit.filter(item => new Date(item.ts).getTime() >= cutoff);
                localStorage.setItem('huly_audit', JSON.stringify(pruned));
            } catch (e) {}
            localStorage.removeItem('huly_session');
            window.location.href = 'login.html';
        }, 800);
    });

    // Close sidebar on mobile when clicking outside
    $(document).on('click', function(e) {
        if ($(window).width() <= 768) {
            if (!$(e.target).closest('.sidebar').length && !$(e.target).closest('.toggle-btn').length) {
                $('#sidebar').removeClass('mobile-open');
            }
        }
    });

    // Smooth scroll effect for anchor links
    $('a[href^="#"]').on('click', function(e) {
        const target = $(this).attr('href');
        if (target !== '#' && $(target).length) {
            e.preventDefault();
            $('html, body').animate({
                scrollTop: $(target).offset().top - 80
            }, 500);
        }
    });

    // Set active menu item based on current page on load
    function setActiveMenuItem() {
        const currentPath = window.location.pathname;
        $('.menu ul li a').each(function() {
            const href = $(this).attr('href');
            if (href && currentPath.includes(href)) {
                $(this).parent().addClass('active');
                $(this).css({
                    'background': '#000',
                    'color': '#fff'
                });
            }
        });
    }

    function ensureLogo() {
        const head = document.querySelector('.head');
        if (!head) return;
        const userImg = head.querySelector('.user-img img');
        if (userImg) {
            userImg.src = 'Assets/38289049-9B95-4A34-A18A-E69D09B8D668-removebg-preview.png';
            userImg.alt = 'Logo';
        }
    }

    // Initialize active menu item
    setActiveMenuItem();
    ensureLogo();
});
} else {
    document.addEventListener('DOMContentLoaded', () => {
        const toggle = document.getElementById('toggleBtn');
        const sidebar = document.getElementById('sidebar');
        if (toggle && sidebar) {
            toggle.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
            });
        }
        const head = document.querySelector('.head');
        const userImg = head ? head.querySelector('.user-img img') : null;
        if (userImg) {
            userImg.src = 'Assets/38289049-9B95-4A34-A18A-E69D09B8D668-removebg-preview.png';
            userImg.alt = 'Logo';
        }
    });
}

// Safety net: ensure collapse toggle is always bound (event delegation)
document.addEventListener('click', (event) => {
    const toggle = event.target.closest('#toggleBtn');
    if (!toggle) return;
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed');
});

// Client error reporting (to Supabase Edge Function)
if (!window.__hurlyErrorReporting) {
    window.__hurlyErrorReporting = true;
    const getFunctionsBase = () => {
        try {
            const url = window.SUPABASE_URL || 'https://ncqfvcymhvjcchrwelfg.supabase.co';
            const host = new URL(url).host;
            const ref = host.split('.')[0];
            return `https://${ref}.functions.supabase.co`;
        } catch (e) {
            return null;
        }
    };

    const sendClientError = async (payload) => {
        const base = getFunctionsBase();
        if (!base) return;
        const now = Date.now();
        if (window.__hurlyLastError && now - window.__hurlyLastError < 30000) return;
        window.__hurlyLastError = now;
        try {
            await fetch(`${base}/notify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.SUPABASE_ANON_KEY || ''}`
                },
                body: JSON.stringify({
                    event: 'client_error',
                    message: payload.message || 'Unknown error',
                    stack: payload.stack || '',
                    url: payload.url || window.location.href
                })
            });
        } catch (e) {}
    };

    window.addEventListener('error', (event) => {
        sendClientError({
            message: event.message,
            stack: event.error?.stack || '',
            url: window.location.href
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        sendClientError({
            message: event.reason?.message || String(event.reason || 'Unhandled rejection'),
            stack: event.reason?.stack || '',
            url: window.location.href
        });
    });
}

// Global toast helper
if (!window.app) window.app = {};
if (!window.app.showToast) {
    window.app.showToast = (message, type = 'info') => {
        const existing = document.querySelector('.toast-container');
        const container = existing || (() => {
            const c = document.createElement('div');
            c.className = 'toast-container';
            document.body.appendChild(c);
            return c;
        })();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 200);
        }, 2500);
    };
}

// Enhanced App class with Supabase integration
class App {
    constructor() {
        this.currentPage = 'dashboard';
        this.pages = {
            dashboard: 'dashboard.html',
            attendance: 'attendance.html',
            payroll: 'payroll.html',
            employees: 'Employees.html',
            reports: 'reports.html',
            settings: 'settings.html'
        };
        
        this.supabase = null;
        this.user = null;
        this.init();
    }
    
    async init() {
        await this.initSupabase();
        this.setupEventListeners();
        this.updateDate();
        await this.checkAuth();
        setInterval(() => this.updateDate(), 60000);
    }
    
    async initSupabase() {
        // Load Supabase if not already loaded
        if (!window.supabase) {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js';
                script.onload = () => {
                    const SUPABASE_URL = "https://ncqfvcymhvjcchrwelfg.supabase.co";
                    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jcWZ2Y3ltaHZqY2NocndlbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTg2NjksImV4cCI6MjA4NTk5NDY2OX0.93kN-rWGI8q5kd3YSdwJZfsCpACuaI2m38JU-Sxnp8I";
                    this.supabase = window.__supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                    window.__supabaseClient = this.supabase;
                    resolve();
                };
                script.onerror = reject;
                document.head.appendChild(script);
            });
        } else {
            const SUPABASE_URL = "https://ncqfvcymhvjcchrwelfg.supabase.co";
            const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jcWZ2Y3ltaHZqY2NocndlbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTg2NjksImV4cCI6MjA4NTk5NDY2OX0.93kN-rWGI8q5kd3YSdwJZfsCpACuaI2m38JU-Sxnp8I";
            this.supabase = window.__supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            window.__supabaseClient = this.supabase;
        }
    }
    
    setupEventListeners() {
        // Navigation links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.getAttribute('data-page');
                this.loadPage(page);
            });
        });
        
        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }
    
    async loadPage(pageName) {
        // Update active nav
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        const activeLink = document.querySelector(`[data-page="${pageName}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
        
        this.currentPage = pageName;
        
        try {
            const response = await fetch(this.pages[pageName]);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const html = await response.text();
            const pageContainer = document.getElementById('pageContainer');
            if (pageContainer) {
                pageContainer.innerHTML = html;
            }
            
            // Remove old page scripts
            const oldScripts = document.querySelectorAll('script[data-page-script]');
            oldScripts.forEach(script => script.remove());
            
            // Load page-specific script
            const scriptName = pageName.charAt(0).toUpperCase() + pageName.slice(1);
            const script = document.createElement('script');
            script.setAttribute('data-page-script', pageName);
            script.src = `js/pages/${pageName}.js`;
            script.onload = () => {
                if (window[scriptName]) {
                    new window[scriptName]();
                }
            };
            script.onerror = () => {
                console.warn(`Page script not found for ${pageName}`);
            };
            document.head.appendChild(script);
        } catch (error) {
            console.error('Error loading page:', error);
            const pageContainer = document.getElementById('pageContainer');
            if (pageContainer) {
                pageContainer.innerHTML = '<div class="error-message"><p>Error loading page. Please try again.</p></div>';
            }
        }
    }
    
    async checkAuth() {
        // Disabled Supabase auth check (local auth only)
        return;
    }
    
    async logout() {
        try {
            if (this.supabase) {
                const { error } = await this.supabase.auth.signOut();
                if (error) {
                    console.error('Supabase logout error:', error);
                }
            }
            
            // Clear local storage
            localStorage.removeItem('userToken');
            localStorage.clear();
            sessionStorage.clear();
            
            // Redirect to login
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Logout error:', error);
            window.location.href = 'login.html';
        }
    }
    
    updateDate() {
        const now = new Date();
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        const dateStr = now.toLocaleDateString('en-US', options);
        const dateDisplay = document.getElementById('dateDisplay');
        if (dateDisplay) {
            dateDisplay.textContent = dateStr;
        }
    }
}

// App initialization disabled (local auth only)
