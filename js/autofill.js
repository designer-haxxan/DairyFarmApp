// Auto-fill login form from link credentials: #u=<username>&p=<password>
// Must run before the module router (loaded as a plain script before js/app.js).
(function () {
  var params = new URLSearchParams(location.hash.replace(/^#/, ''));
  var u = params.get('u');
  var p = params.get('p');
  if (u === null || p === null) return;

  // Strip credentials from address bar immediately — never kept in URL
  history.replaceState(null, '', location.pathname + location.search);

  var tries = 0;
  (function fill() {
    // Already signed in — app view visible, nothing to do
    var appView = document.getElementById('view-app');
    if (appView && !appView.classList.contains('d-none')) return;

    // Wait until login view is visible and both inputs exist
    var loginView = document.getElementById('view-login');
    var userEl   = document.getElementById('login-username');
    var passEl   = document.getElementById('login-password');
    if (!loginView || loginView.classList.contains('d-none') || !userEl || !passEl) {
      if (++tries < 100) setTimeout(fill, 100);
      return;
    }

    // Fill and notify frameworks/validation
    userEl.value = u;
    passEl.value = p;
    userEl.dispatchEvent(new Event('input', { bubbles: true }));
    passEl.dispatchEvent(new Event('input', { bubbles: true }));
    u = p = null; // clear from memory

    // Show Urdu hint in existing notice container
    var notice = document.getElementById('login-notice');
    if (notice) {
      notice.textContent = 'یوزر نیم اور پاس ورڈ خود بخود بھر دیے گئے ہیں۔ بس لاگ ان دبائیں';
      notice.setAttribute('dir', 'rtl');
      notice.setAttribute('lang', 'ur');
      notice.classList.remove('d-none', 'alert-warning');
      notice.classList.add('alert-success', 'autofill-hint');
    }

    // Pulse the login button so uneducated users know to tap it
    var btn = document.getElementById('login-btn');
    if (btn) btn.classList.add('autofill-pulse');
  })();
})();
