// Minimal staff page: sign in, invite staff, list staff, suspend / reinstate / revoke.
// All permission decisions are made by the database; this page only calls the APIs.
// The session lives in memory only (refreshing the page signs you out) - deliberate, no token in localStorage.
(function () {
  'use strict';
  var SB = 'https://bvqspkbjdnblxmikkvar.supabase.co';
  var KEY = 'sb_publishable_ClpBYDbYC6H5ZlrerQPJ6Q_WtvRWm3j'; // public key
  var $ = function (id) { return document.getElementById(id); };
  var S = null;            // { token, uid, email }
  var ROLES = [], CAMPUSES = [];

  function say(t, kind) { var m = $('msg'); m.textContent = t; m.className = 'msg ' + (kind || 'ok'); m.hidden = false; }
  function clear() { $('msg').hidden = true; }
  function el(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) { if (k === 'text') n.textContent = props[k]; else if (k === 'cls') n.className = props[k]; else n[k] = props[k]; });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function api(path, opt) {
    opt = opt || {};
    var headers = { apikey: KEY, 'Content-Type': 'application/json' };
    if (S) headers.Authorization = 'Bearer ' + S.token;
    return fetch(SB + path, { method: opt.method || 'GET', headers: headers, body: opt.body ? JSON.stringify(opt.body) : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
          if (r.status === 401) { signOut('Your session expired. Please sign in again.'); throw new Error('session'); }
          return { ok: r.ok, status: r.status, j: j };
        });
      });
  }

  function signOut(note) {
    S = null; $('app').hidden = true; $('login').hidden = false; $('out').hidden = true; $('who').textContent = '';
    $('p').value = ''; if (note) say(note, 'warn'); else clear();
  }
  $('out').addEventListener('click', function () { signOut(); });

  $('go').addEventListener('click', function () {
    var email = $('e').value.trim(), pw = $('p').value, btn = $('go');
    if (!email || !pw) return say('Enter your email and password.', 'err');
    btn.disabled = true;
    fetch(SB + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: pw }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok || !res.j.access_token) return say('Sign-in failed. Check your email and password.', 'err');
        S = { token: res.j.access_token, uid: res.j.user.id, email: res.j.user.email };
        $('p').value = '';
        return start();
      }).catch(function () { btn.disabled = false; say('Network problem. Try again.', 'err'); });
  });

  function start() {
    return api('/rest/v1/rpc/staff_seen', { method: 'POST', body: {} }).then(function () {
      return api('/rest/v1/rpc/my_permissions', { method: 'POST', body: {} });
    }).then(function (r) {
      if (!r.ok || !r.j || !r.j.length) { signOut('This account has no active staff access.'); return; }
      clear(); $('login').hidden = true; $('app').hidden = false; $('out').hidden = false; $('who').textContent = S.email;
      return Promise.all([
        api('/rest/v1/roles?select=key,name,scope_type,rank&order=rank.desc'),
        api('/rest/v1/institutions?select=id,short_name&order=short_name')
      ]).then(function (a) {
        ROLES = a[0].j || []; CAMPUSES = a[1].j || [];
        fillForm(r.j.some(function (p) { return p.permission_key === 'admins.invite'; }));
        return loadList();
      });
    }).catch(function (e) { if (e.message !== 'session') say('Could not load the page.', 'err'); });
  }

  function fillForm(canInvite) {
    $('inviteCard').hidden = !canInvite;
    var rs = $('irole'); rs.textContent = '';
    ROLES.forEach(function (r) { var o = el('option', { value: r.key, text: r.name + (r.scope_type === 'campus' ? ' (campus)' : ' (global)') }); o.dataset.scope = r.scope_type; rs.appendChild(o); });
    var cs = $('icampus'); cs.textContent = '';
    CAMPUSES.forEach(function (c) { cs.appendChild(el('option', { value: c.id, text: c.short_name })); });
    rs.onchange = syncScope; syncScope();
  }
  function syncScope() { var o = $('irole').selectedOptions[0]; $('campusBox').hidden = !o || o.dataset.scope !== 'campus'; }

  $('invite').addEventListener('click', function () {
    var btn = $('invite'), role = $('irole').value, scope = $('irole').selectedOptions[0].dataset.scope;
    var body = { email: $('iemail').value.trim(), full_name: $('iname').value.trim(), role: role, institution_id: scope === 'campus' ? $('icampus').value : null, mode: $('imode').value };
    if (!body.email || !body.full_name) return say('Enter the name and email.', 'err');
    btn.disabled = true; clear(); $('result').hidden = true;
    api('/functions/v1/invite-staff', { method: 'POST', body: body }).then(function (r) {
      btn.disabled = false;
      if (!r.ok) return say('Not done: ' + ((r.j && (r.j.detail || r.j.error)) || 'unknown error'), 'err');
      say(r.j.message, r.j.delivery === 'email_requested' ? 'warn' : 'ok');
      var box = $('result'); box.textContent = ''; box.hidden = false;
      if (r.j.invite_link) {
        var f = el('input', { readOnly: true, value: r.j.invite_link });
        box.appendChild(el('p', { cls: 'mut', text: 'One-time invitation link. Shown once, so copy it now and send it only to the invitee (for example by WhatsApp).' }));
        box.appendChild(f);
        var c = el('button', { type: 'button', cls: 'sec', text: 'Copy link' });
        c.style.marginTop = '8px';
        c.onclick = function () { f.select(); (navigator.clipboard ? navigator.clipboard.writeText(f.value) : Promise.reject()).then(function () { c.textContent = 'Copied'; }, function () { c.textContent = 'Press and hold to copy'; }); };
        box.appendChild(c);
      }
      $('iname').value = ''; $('iemail').value = '';
      return loadList();
    }).catch(function (e) { btn.disabled = false; if (e.message !== 'session') say('Network problem. Try again.', 'err'); });
  });

  function roleLabel(key) { var r = ROLES.filter(function (x) { return x.key === key; })[0]; return r ? r.name : key; }
  function loadList() {
    return Promise.all([
      api('/rest/v1/staff_profiles?select=user_id,full_name,status,last_seen_at&order=created_at'),
      api('/rest/v1/user_roles?select=user_id,role_key,institution_id&revoked_at=is.null')
    ]).then(function (a) {
      var box = $('list'); box.textContent = '';
      var staff = a[0].j || [], roles = a[1].j || [];
      if (!staff.length) { box.textContent = 'No staff visible to you yet.'; return; }
      var t = el('table'); t.appendChild(el('tr', null, ['Name', 'Role', 'Status', ''].map(function (h) { return el('th', { text: h }); })));
      staff.forEach(function (s) {
        var mine = roles.filter(function (r) { return r.user_id === s.user_id; })
          .map(function (r) { return roleLabel(r.role_key) + (r.institution_id ? ' · ' + r.institution_id.toUpperCase() : ''); }).join(', ') || '—';
        var acts = el('div', { cls: 'acts' });
        if (s.user_id !== S.uid) {
          if (s.status === 'active' || s.status === 'invited') acts.appendChild(act('Suspend', s, 'suspend', false));
          if (s.status === 'suspended' || s.status === 'revoked') acts.appendChild(act('Reinstate', s, 'reinstate', false));
          if (s.status !== 'revoked') acts.appendChild(act('Revoke', s, 'revoke', true));
        }
        var nm = el('td', null, [el('div', { text: s.full_name }), el('div', { cls: 'mut', text: s.last_seen_at ? 'Last seen ' + new Date(s.last_seen_at).toLocaleString() : 'Never signed in' })]);
        t.appendChild(el('tr', null, [nm, el('td', { text: mine }), el('td', null, [el('span', { cls: 'pill st-' + s.status, text: s.status })]), el('td', null, [acts])]));
      });
      box.appendChild(t);
    }).catch(function (e) { if (e.message !== 'session') $('list').textContent = 'Could not load the staff list.'; });
  }
  function act(label, s, action, danger) {
    var b = el('button', { type: 'button', cls: danger ? 'bad' : 'sec', text: label });
    b.onclick = function () {
      var reason = '';
      if (action !== 'reinstate') { reason = window.prompt(label + ' ' + s.full_name + '? Add a short reason (optional):'); if (reason === null) return; }
      else if (!window.confirm('Reinstate ' + s.full_name + '?')) return;
      b.disabled = true; clear();
      api('/functions/v1/suspend-user', { method: 'POST', body: { user_id: s.user_id, action: action, reason: reason } }).then(function (r) {
        if (!r.ok) { b.disabled = false; return say('Not done: ' + ((r.j && (r.j.detail || r.j.error)) || 'unknown error'), 'err'); }
        say(r.j.message, 'ok'); return loadList();
      }).catch(function (e) { b.disabled = false; if (e.message !== 'session') say('Network problem. Try again.', 'err'); });
    };
    return b;
  }

  $('login').hidden = false;
})();
