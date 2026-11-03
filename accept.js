// Accepts a staff invitation or a password-reset link.
// Tokens come in the URL hash from Supabase. They are used from memory only and never stored.
(function () {
  'use strict';
  var SB = 'https://bvqspkbjdnblxmikkvar.supabase.co';
  var KEY = 'sb_publishable_ClpBYDbYC6H5ZlrerQPJ6Q_WtvRWm3j'; // public (publishable) key, safe in the browser
  var $ = function (id) { return document.getElementById(id); };

  function show(id) { ['set', 'req', 'done'].forEach(function (s) { $(s).hidden = s !== id; }); }
  function say(text, ok) {
    var m = $('msg'); m.textContent = text; m.className = 'msg ' + (ok ? 'ok' : 'err'); m.hidden = false;
  }

  var h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  var token = h.get('access_token');
  var type = h.get('type');            // invite | recovery | signup ...
  var linkError = h.get('error_description') || h.get('error');
  // remove the token from the address bar and history as soon as we have read it
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);

  if (linkError) {
    say('This link is not valid any more (' + linkError.replace(/\+/g, ' ') + '). Ask for a new invitation or request a reset link below.', false);
    show('req');
  } else if (token) {
    if (type === 'recovery') $('setIntro').textContent = 'Choose a new password for your account.';
    show('set');
  } else {
    show('req');
  }

  $('save').addEventListener('click', function () {
    var a = $('pw').value, b = $('pw2').value, btn = $('save');
    if (a.length < 12) return say('Use at least 12 characters.', false);
    if (a !== b) return say('The two passwords do not match.', false);
    btn.disabled = true;
    fetch(SB + '/auth/v1/user', {
      method: 'PUT',
      headers: { apikey: KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: a })
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (res) {
      if (!res.ok) {
        btn.disabled = false;
        return say((res.j && (res.j.msg || res.j.message || res.j.error_description)) || 'Could not save the password. The link may have expired.', false);
      }
      // confirm the staff record (no-op for password resets or non-staff accounts)
      return fetch(SB + '/rest/v1/rpc/activate_my_staff_profile', {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: '{}'
      }).then(function () { token = null; $('msg').hidden = true; show('done'); });
    }).catch(function () { btn.disabled = false; say('Network problem. Check your connection and try again.', false); });
  });

  $('send').addEventListener('click', function () {
    var email = $('em').value.trim(), btn = $('send');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say('Enter a valid email address.', false);
    btn.disabled = true;
    var redirect = encodeURIComponent(location.origin + location.pathname);
    fetch(SB + '/auth/v1/recover?redirect_to=' + redirect, {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email })
    }).then(function (r) {
      btn.disabled = false;
      // same message whether or not the account exists, so the form cannot be used to discover accounts
      if (r.status === 429) return say('Too many requests. Please wait a few minutes and try again.', false);
      say('If that email has an account, a reset link has been requested. Delivery is not guaranteed; if nothing arrives, contact an administrator.', true);
    }).catch(function () { btn.disabled = false; say('Network problem. Try again.', false); });
  });
})();
