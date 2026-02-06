// Sidebar JavaScript - Enhanced Version

$(document).ready(function() {
    // Toggle sidebar collapse
    $('#toggleBtn').on('click', function() {
        $('#sidebar').toggleClass('collapsed');
    });

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

    // Enhanced logout functionality with Supabase
    $('#logoutBtn').on('click', async function(e) {
        e.preventDefault();
        
        try {
            // Check if Supabase is available
            if (window.supabase) {
                // Sign out from Supabase
                const { error } = await window.supabase.auth.signOut();
                
                if (error) {
                    console.error('Supabase logout error:', error);
                    alert('Logout failed. Please try again.');
                    return;
                }
            }
            
            // Clear any stored user data
            localStorage.removeItem('userToken');
            localStorage.clear();
            sessionStorage.clear();
            
            // Display logout message
            console.log('User logged out successfully');
            
            // Redirect to login page
            window.location.href = 'login.html';
            
        } catch (error) {
            console.error('Logout error:', error);
            alert('An error occurred during logout. Redirecting to login page...');
            window.location.href = 'login.html';
        }
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

    // Initialize active menu item
    setActiveMenuItem();
});

// Enhanced App class with Supabase integration
class App {
    constructor() {
        this.currentPage = 'dashboard';
        this.pages = {
            dashboard: 'dashboard.html',
            attendance: 'attendance.html',
            payroll: 'payroll.html',
            employees: 'employees.html',
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
                    const SUPABASE_URL = "https://fyqsjyceeebarjuxztqg.supabase.co";
                    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5cXNqeWNlZWViYXJqdXh6dHFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MzQ4MTAsImV4cCI6MjA4MTUxMDgxMH0.LhOoDWcVwU_ht8SKuILFXPU9Gw8CHolAhO8Qgj3BMdI";
                    this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                    resolve();
                };
                script.onerror = reject;
                document.head.appendChild(script);
            });
        } else {
            const SUPABASE_URL = "https://fyqsjyceeebarjuxztqg.supabase.co";
            const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5cXNqeWNlZWViYXJqdXh6dHFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MzQ4MTAsImV4cCI6MjA4MTUxMDgxMH0.LhOoDWcVwU_ht8SKuILFXPU9Gw8CHolAhO8Qgj3BMdI";
            this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
        try {
            if (this.supabase) {
                const { data: { session }, error } = await this.supabase.auth.getSession();
                
                if (error || !session) {
                    console.log('No active session found');
                    window.location.href = 'login.html';
                    return;
                }
                
                this.user = session.user;
                console.log('User authenticated:', this.user.email);
            }
            
            // Load dashboard
            this.loadPage('dashboard');
        } catch (error) {
            console.error('Auth check error:', error);
            window.location.href = 'login.html';
        }
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

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new App();
    });
} else {
    window.app = new App();
}