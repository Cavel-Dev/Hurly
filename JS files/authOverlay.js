(function () {
    const overlay = document.getElementById('authOverlay');
    if (!overlay) return;

    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const SESSION_KEY = 'huly_session';
    const SUPABASE_URL = "https://ncqfvcymhvjcchrwelfg.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jcWZ2Y3ltaHZqY2NocndlbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTg2NjksImV4cCI6MjA4NTk5NDY2OX0.93kN-rWGI8q5kd3YSdwJZfsCpACuaI2m38JU-Sxnp8I";

    function loadSupabase() {
        return new Promise((resolve) => {
            if (window.__supabaseClient) {
                resolve(window.__supabaseClient);
                return;
            }
            if (window.supabase && window.supabase.createClient) {
                window.__supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                resolve(window.__supabaseClient);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/dist/umd/supabase.min.js';
            script.onload = () => {
                if (window.supabase && window.supabase.createClient) {
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

    function showAuth(messageTitle, messageSubtitle) {
        if (messageTitle && title) title.textContent = messageTitle;
        if (messageSubtitle && subtitle) subtitle.textContent = messageSubtitle;
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
    }

    function hideAuth() {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }

    window.AuthOverlay = {
        show: showAuth,
        hide: hideAuth
    };

    window.addEventListener('auth:loading', (event) => {
        if (event.detail && event.detail.state === 'start') {
            showAuth('Authenticating', 'Verifying secure session with Supabase. Please wait.');
        }
        if (event.detail && event.detail.state === 'end') {
            hideAuth();
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        const autoCheck = document.body && document.body.dataset && document.body.dataset.authCheck;
        if (autoCheck === 'off') return;
        const path = window.location.pathname.toLowerCase();
        const isSettings = path.endsWith('/settings.html') || path.endsWith('settings.html');
        if (isSettings && localStorage.getItem('huly_mfa_setup_pending')) {
            hideAuth();
            return;
        }

        showAuth('Authenticating', 'Verifying secure session with Supabase. Please wait.');
        let timedOut = false;
        const guardTimer = setTimeout(() => {
            timedOut = true;
            localStorage.removeItem(SESSION_KEY);
            hideAuth();
            if (window.app && typeof window.app.showToast === 'function') {
                window.app.showToast('Session check timed out. Please log in again.', 'warn');
            }
        }, 7000);
        (async () => {
            try {
                const supabase = await loadSupabase();
                if (!supabase) {
                    clearTimeout(guardTimer);
                    hideAuth();
                    if (window.app && typeof window.app.showToast === 'function') {
                        window.app.showToast('Supabase failed to load. Refresh or log in again.', 'error');
                    } else {
                        window.location.href = 'login.html';
                    }
                    return;
                }
                const { data } = await supabase.auth.getSession();
                if (!data || !data.session) {
                    localStorage.removeItem(SESSION_KEY);
                    clearTimeout(guardTimer);
                    hideAuth();
                    if (window.app && typeof window.app.showToast === 'function') {
                        window.app.showToast('No active session. Please log in again.', 'warn');
                    } else {
                        window.location.href = 'login.html';
                    }
                    return;
                }
                const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
                const path = window.location.pathname.toLowerCase();
                const isSettings = path.endsWith('/settings.html') || path.endsWith('settings.html');
                if (!aal || aal.currentLevel !== 'aal2') {
                    if (isSettings) {
                        localStorage.setItem('huly_mfa_setup_pending', 'true');
                        clearTimeout(guardTimer);
                        hideAuth();
                        return;
                    }
                    localStorage.removeItem(SESSION_KEY);
                    await supabase.auth.signOut();
                    clearTimeout(guardTimer);
                    hideAuth();
                    if (window.app && typeof window.app.showToast === 'function') {
                        window.app.showToast('MFA required. Please log in again.', 'warn');
                    } else {
                        window.location.href = 'login.html';
                    }
                    return;
                }
                clearTimeout(guardTimer);
                if (timedOut) return;
                hideAuth();
            } catch (e) {
                clearTimeout(guardTimer);
                hideAuth();
                if (window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast('Authentication failed. Please log in again.', 'error');
                } else {
                    window.location.href = 'login.html';
                }
            }
        })();
    });
})();
