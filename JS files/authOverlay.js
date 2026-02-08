(function () {
    const overlay = document.getElementById('authOverlay');
    if (!overlay) return;

    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const SESSION_KEY = 'huly_session';

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

        showAuth('Authenticating', 'Verifying secure session with Supabase. Please wait.');
        const hasSession = !!localStorage.getItem(SESSION_KEY);
        const delay = hasSession ? 900 : 1200;
        setTimeout(() => {
            hideAuth();
        }, delay);
    });
})();
