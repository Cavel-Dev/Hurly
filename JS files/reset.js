const statusEl = document.getElementById('resetStatus');
const newPasswordForm = document.getElementById('newPasswordForm');
const resetEmail = document.getElementById('resetEmail');
const resetPassword = document.getElementById('resetPassword');
const resetMfaCode = document.getElementById('resetMfaCode');
const newPassword = document.getElementById('newPassword');
const confirmPassword = document.getElementById('confirmPassword');

const SUPABASE_URL = window.SUPABASE_URL || "https://ncqfvcymhvjcchrwelfg.supabase.co";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jcWZ2Y3ltaHZqY2NocndlbGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MTg2NjksImV4cCI6MjA4NTk5NDY2OX0.93kN-rWGI8q5kd3YSdwJZfsCpACuaI2m38JU-Sxnp8I";

function showToast(message, type = 'info') {
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
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 200);
    }, 2600);
}

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

async function initResetPage() {
    const supabase = await loadSupabase();
    if (!supabase) {
        showToast('Supabase failed to load.', 'error');
        return;
    }
    if (statusEl) statusEl.textContent = 'Enter your email, password, and authenticator code to reset your password.';
}

newPasswordForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const supabase = await loadSupabase();
    if (!supabase) {
        showToast('Supabase failed to load.', 'error');
        return;
    }
    const email = (resetEmail?.value || '').trim();
    const password = (resetPassword?.value || '');
    const mfa = (resetMfaCode?.value || '').replace(/\s+/g, '');
    const pass = newPassword?.value || '';
    const confirm = confirmPassword?.value || '';
    if (!email) {
        showToast('Enter your email.', 'warn');
        return;
    }
    if (!password) {
        showToast('Enter your current password.', 'warn');
        return;
    }
    if (!mfa || mfa.length < 6) {
        showToast('Enter your authenticator code.', 'warn');
        return;
    }
    if (!pass || pass.length < 8) {
        showToast('Password must be at least 8 characters.', 'warn');
        return;
    }
    if (pass !== confirm) {
        showToast('Passwords do not match.', 'warn');
        return;
    }
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    if (signInError || !signInData?.session) {
        showToast(signInError?.message || 'Login failed.', 'error');
        return;
    }

    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
        showToast('MFA not available for this account.', 'error');
        return;
    }
    const verifiedTotp = (factorsData?.totp || []).filter((f) => f.status === 'verified');
    const factorId = verifiedTotp[0]?.id || null;
    if (!factorId) {
        showToast('No authenticator found. Set up MFA first.', 'error');
        return;
    }
    const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: mfa
    });
    if (mfaError) {
        showToast('Invalid authenticator code.', 'error');
        return;
    }

    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) {
        showToast(error.message || 'Could not update password.', 'error');
        return;
    }
    if (statusEl) statusEl.textContent = 'Reset successful. Redirecting to login…';
    showToast('Reset successful. Redirecting…', 'success');
    setTimeout(() => {
        window.location.assign('login.html');
    }, 1200);
});

initResetPage();
