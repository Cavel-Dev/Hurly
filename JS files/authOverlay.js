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

    function isDemoMode() {
        try {
            return localStorage.getItem('huly_demo_mode') === 'true';
        } catch (e) {
            return false;
        }
    }

    function isDemoQueryEnabled() {
        try {
            const params = new URLSearchParams(window.location.search);
            return params.get('demo') === '1';
        } catch (e) {
            return false;
        }
    }

    function enableDemoSession() {
        localStorage.setItem('huly_demo_mode', 'true');
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            id: 'demo-user',
            email: 'demo@hurly.local',
            role: 'demo',
            name: 'Demo Guest',
            loginAt: new Date().toISOString()
        }));
    }

    function getFunctionsBase() {
        try {
            const url = window.SUPABASE_URL || SUPABASE_URL;
            const origin = new URL(url).origin;
            return `${origin}/functions/v1`;
        } catch (e) {
            return null;
        }
    }

    function promptDemoCode() {
        return new Promise((resolve) => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:7000;padding:16px;';
            wrapper.innerHTML = `
                <div style="width:min(420px,95vw);background:#101010;border:1px solid #262626;border-radius:14px;padding:18px;">
                    <div style="font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:8px;">Demo Access</div>
                    <div style="color:#b5b5b5;font-size:0.92rem;margin-bottom:12px;">Enter your MFA/admin code to open guest demo mode.</div>
                    <input id="demoCodeInput" type="password" placeholder="Enter code" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid #2a2a2a;background:#0b0b0b;color:#fff;">
                    <div style="display:flex;gap:10px;margin-top:14px;">
                        <button id="demoCodeCancel" style="flex:1;padding:10px;border-radius:10px;border:1px solid #2a2a2a;background:#121212;color:#fff;cursor:pointer;">Cancel</button>
                        <button id="demoCodeVerify" style="flex:1;padding:10px;border-radius:10px;border:none;background:#fff;color:#000;font-weight:700;cursor:pointer;">Verify</button>
                    </div>
                </div>
            `;
            document.body.appendChild(wrapper);
            const input = wrapper.querySelector('#demoCodeInput');
            const cancelBtn = wrapper.querySelector('#demoCodeCancel');
            const verifyBtn = wrapper.querySelector('#demoCodeVerify');
            const cleanup = (value) => {
                wrapper.remove();
                resolve(value);
            };
            cancelBtn?.addEventListener('click', () => cleanup(null));
            verifyBtn?.addEventListener('click', () => cleanup(String(input?.value || '').trim()));
            input?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') cleanup(String(input?.value || '').trim());
            });
            input?.focus();
        });
    }

    async function validateDemoCode(code) {
        const base = getFunctionsBase();
        if (!base || !code) return false;
        try {
            const res = await fetch(`${base}/mfa-setup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    action: 'check_admin',
                    email: 'demo@hurly.local',
                    code
                })
            });
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    function applyDemoBanner() {
        if (!isDemoMode()) return;
        if (document.getElementById('demoModeBanner')) return;
        const banner = document.createElement('div');
        banner.id = 'demoModeBanner';
        banner.style.cssText = 'position:fixed;bottom:14px;left:14px;z-index:9999;background:#111;border:1px solid #333;color:#fff;padding:8px 12px;border-radius:999px;font-size:12px;font-weight:600;';
        banner.textContent = 'Demo Mode: Read-only';
        document.body.appendChild(banner);
    }

    window.isDemoMode = isDemoMode;

    window.addEventListener('auth:loading', (event) => {
        if (event.detail && event.detail.state === 'start') {
            showAuth('Authenticating', 'Verifying secure session with Supabase. Please wait.');
        }
        if (event.detail && event.detail.state === 'end') {
            hideAuth();
        }
    });


    function showDefaultSiteOverlay(sites, supabase) {
        if (!Array.isArray(sites) || sites.length === 0) return;
        const existing = document.getElementById('defaultSiteOverlay');
        if (existing) existing.remove();

        const overlayEl = document.createElement('div');
        overlayEl.id = 'defaultSiteOverlay';
        overlayEl.style.cssText = 'position:fixed;inset:0;background:rgba(4,4,4,0.86);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;z-index:6000;padding:24px;';
        overlayEl.innerHTML = `
            <div style="width:min(620px,94vw);background:#0f0f0f;border:1px solid #1f1f1f;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,0.45);padding:24px;display:grid;gap:16px;">
                <div style="font-size:1.3rem;font-weight:700;color:#fff;">Choose Your Default Site</div>
                <div style="color:#b3b3b3;font-size:0.95rem;">All existing records will be moved into this site, and other sites will be removed.</div>
                <label style="color:#b3b3b3;font-size:0.9rem;font-weight:600;">Default Site</label>
                <select id="defaultSiteSelect" style="background:#141414;border:1px solid rgba(255,255,255,0.16);color:#fff;padding:10px 14px;border-radius:12px;font-size:0.95rem;">
                    ${sites.map((s) => `<option value="${s.id}">${s.name || 'Unnamed Site'}</option>`).join('')}
                </select>
                <div style="display:flex;gap:12px;justify-content:flex-end;">
                    <button id="defaultSiteConfirm" style="background:#fff;color:#000;border:none;padding:10px 18px;border-radius:999px;font-weight:700;cursor:pointer;">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlayEl);

        const confirmBtn = document.getElementById('defaultSiteConfirm');
        confirmBtn.addEventListener('click', async () => {
            const select = document.getElementById('defaultSiteSelect');
            const chosen = select ? select.value : '';
            if (!chosen) return;
            localStorage.setItem('huly_active_site', chosen);
            try {
                if (window.db && typeof window.db.consolidateToSite === 'function') {
                    await window.db.consolidateToSite(chosen);
                }
                localStorage.setItem('huly_site_backfill_done', 'true');
                localStorage.setItem('huly_default_site_confirmed', 'true');
            } catch (e) {
                console.warn('Default site consolidation failed', e);
            }
            overlayEl.remove();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        const wantsDemo = isDemoQueryEnabled();
        const autoCheck = document.body && document.body.dataset && document.body.dataset.authCheck;
        if (autoCheck === 'off') return;
        if (wantsDemo || isDemoMode()) {
            (async () => {
                if (isDemoMode()) {
                    hideAuth();
                    applyDemoBanner();
                    return;
                }
                showAuth('Demo Access', 'Verifying guest demo code.');
                const code = await promptDemoCode();
                if (!code) {
                    localStorage.removeItem('huly_demo_mode');
                    localStorage.removeItem(SESSION_KEY);
                    hideAuth();
                    window.location.href = 'index.html';
                    return;
                }
                const ok = await validateDemoCode(code);
                if (!ok) {
                    localStorage.removeItem('huly_demo_mode');
                    localStorage.removeItem(SESSION_KEY);
                    hideAuth();
                    if (window.app && typeof window.app.showToast === 'function') {
                        window.app.showToast('Invalid demo MFA code.', 'error');
                    } else {
                        alert('Invalid demo MFA code.');
                    }
                    window.location.href = 'index.html';
                    return;
                }
                enableDemoSession();
                hideAuth();
                applyDemoBanner();
            })();
            return;
        }
        const path = window.location.pathname.toLowerCase();
        const isSettings = path.endsWith('/settings.html') || path.endsWith('settings.html');
        if (isSettings && localStorage.getItem('huly_mfa_setup_pending')) {
            hideAuth();
            return;
        }
        const localSession = localStorage.getItem(SESSION_KEY);
        if (!localSession) {
            window.location.href = 'index.html';
            return;
        }

        const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;
        const INACTIVITY_WARN_MS = 55 * 60 * 1000;
        const LAST_ACTIVITY_KEY = 'huly_last_activity';

        function bumpActivity() {
            try {
                localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
            } catch (e) {}
        }

        function startInactivityWatch(supabase) {
            bumpActivity();
            const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
            const handler = () => bumpActivity();
            events.forEach((evt) => window.addEventListener(evt, handler, { passive: true }));

            let warned = false;
            const timer = setInterval(async () => {
                let last = 0;
                try {
                    last = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0', 10);
                } catch (e) {}
                if (!last) return;
                const idle = Date.now() - last;
                if (!warned && idle >= INACTIVITY_WARN_MS && idle < INACTIVITY_LIMIT_MS) {
                    warned = true;
                    if (window.app && typeof window.app.showToast === 'function') {
                        window.app.showToast('You will be logged out in 5 minutes due to inactivity.', 'warn');
                    }
                }
                if (idle < INACTIVITY_LIMIT_MS) return;

                clearInterval(timer);
                events.forEach((evt) => window.removeEventListener(evt, handler));
                localStorage.removeItem(SESSION_KEY);
                try {
                    if (supabase) await supabase.auth.signOut();
                } catch (e) {}
                if (window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast('You were logged out after 1 hour of inactivity.', 'warn');
                }
                window.location.href = 'index.html';
            }, 30000);
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
                        window.location.href = 'index.html';
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
                        window.location.href = 'index.html';
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
                        window.location.href = 'index.html';
                    }
                    return;
                }
                clearTimeout(guardTimer);
                if (timedOut) return;
                hideAuth();
                startInactivityWatch(supabase);
                try {
                    if (!localStorage.getItem('huly_default_site_confirmed') && window.db) {
                        const sites = await window.db.getSites();
                        if (Array.isArray(sites) && sites.length > 0) {
                            showDefaultSiteOverlay(sites, supabase);
                        }
                    }
                } catch (e) {
                    console.warn('Default site overlay failed', e);
                }
            } catch (e) {
                clearTimeout(guardTimer);
                hideAuth();
                if (window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast('Authentication failed. Please log in again.', 'error');
                } else {
                    window.location.href = 'index.html';
                }
            }
        })();
    });
})();

