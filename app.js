/* Home screen for a 2018 Samsung (Tizen 4). Plain ES5 on purpose: the TV's browser engine is old. */
(function () {
  'use strict';

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27, BACKSPACE: 8,
              RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406, IME_DONE: 65376, IME_CANCEL: 65385 };
  var SELF_ID = 'AaronHome1.Home';
  var MAX_DOCK = 7;
  // v2: the catalog keys changed (tizentube dropped, ids verified against the TV), so the saved
  // shelf is rebuilt once rather than silently losing the entries whose keys no longer exist.
  var LS_DOCK = 'home.dock.v2';
  var LS_WIFI = 'home.wifi.v1';
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var HIDE_PREFIX = /^(org\.tizen\.|com\.samsung\.|samsung\.)/i;
  var HIDE_NAME = /^(settings|source|sources|smart ?hub|web browser|internet|universal guide|gallery|samsung health|bixby|ambient|e-manual|help|apps)$/i;

  var tizenApi = (window.tizen && window.tizen.application) ? window.tizen : null;

  var state = {
    zone: 'dock',        // 'dock' | 'top'
    dockIndex: 0,
    topIndex: 0,
    overlay: null,       // null | 'wifi' | 'wifiForm' | 'apps'
    sheetIndex: 0,
    moving: false,
    appsKnown: false,    // true once the TV told us which apps are installed
    apps: [],            // every launchable entry we know about
    byKey: {},
    dock: []             // keys
  };

  var $ = function (id) { return document.getElementById(id); };

  // ---------- storage ----------
  function load(key, fallback) {
    try { var v = window.localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  // ---------- clock ----------
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function tick() {
    var d = new Date();
    var h = d.getHours();
    var part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    $('greeting').textContent = window.HOME_NAME ? part + ', ' + window.HOME_NAME : part;
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    $('clock').textContent = h12 + ':' + pad(d.getMinutes());
    $('date').textContent = DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
  }

  // ---------- toast ----------
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast hidden'; }, 2600);
  }

  // ---------- apps ----------
  // The TV reports each installed app's own icon file; turn its path into something <img> can load.
  function iconUrl(info) {
    var p = info && info.iconPath;
    if (!p || typeof p !== 'string') return '';
    if (/^[a-z]+:/i.test(p)) return p;
    return 'file://' + (p.charAt(0) === '/' ? '' : '/') + p;
  }

  function catalogEntry(c, installed, info) {
    var id = info ? info.id : null;
    // `logo` is our own artwork for apps whose TV icon is dated. It wins over the TV's icon;
    // if it ever fails to load we fall straight back to what the TV gave us.
    return { key: c.key, name: c.name, sub: c.sub || '', accent: c.accent, icon: iconUrl(info),
             logo: c.logo || '', shelf: c.shelf !== false,
             ids: (id ? [id] : []).concat(c.ids || []), installed: installed };
  }

  function buildApps(infos) {
    var catalog = window.HOME_CATALOG || [];
    var apps = [];
    var used = {};
    var i, j;
    if (!infos) {
      for (i = 0; i < catalog.length; i++) apps.push(catalogEntry(catalog[i], false, null));
      return apps;
    }
    // Two passes, ids before names. Matching on the name first is what let "Disney+" lose its
    // slot to "DisneyNOW": `^disney` hit whichever the TV happened to list first. An id is exact,
    // so every catalog entry gets the chance to claim its own id before any name guessing starts.
    var hits = [];
    for (i = 0; i < catalog.length; i++) {
      var ids = catalog[i].ids || [];
      var hit = null;
      for (j = 0; j < infos.length && !hit; j++) {
        if (!used[infos[j].id] && ids.indexOf(infos[j].id) !== -1) hit = infos[j];
      }
      if (hit) used[hit.id] = true;
      hits[i] = hit;
    }
    for (i = 0; i < catalog.length; i++) {
      if (hits[i]) continue;
      var re = new RegExp(catalog[i].match, 'i');
      for (j = 0; j < infos.length && !hits[i]; j++) {
        if (!used[infos[j].id] && re.test(infos[j].name || '')) { hits[i] = infos[j]; used[infos[j].id] = true; }
      }
    }
    for (i = 0; i < catalog.length; i++) {
      if (hits[i]) apps.push(catalogEntry(catalog[i], true, hits[i]));
    }
    var others = [];
    for (j = 0; j < infos.length; j++) {
      var o = infos[j];
      if (used[o.id] || o.id === SELF_ID || !o.name || o.show === false) continue;
      if (HIDE_PREFIX.test(o.id) || HIDE_NAME.test(o.name)) continue;
      others.push({ key: 'id:' + o.id, name: o.name, sub: '', accent: '#c9a27a', icon: iconUrl(o), ids: [o.id], installed: true });
    }
    others.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    return apps.concat(others);
  }

  function setApps(apps, known) {
    state.apps = apps;
    state.appsKnown = known;
    state.byKey = {};
    for (var i = 0; i < apps.length; i++) state.byKey[apps[i].key] = apps[i];

    var saved = load(LS_DOCK, null);
    var dock = [];
    if (saved && saved.length) {
      for (i = 0; i < saved.length; i++) if (state.byKey[saved[i]]) dock.push(saved[i]);
    } else {
      for (i = 0; i < apps.length && dock.length < MAX_DOCK; i++) {
        if (apps[i].shelf === false) continue;                  // streaming only by default
        if (apps[i].key.indexOf('id:') === 0) continue;         // not one of ours
        if (apps[i].installed || !known) dock.push(apps[i].key);
      }
    }
    state.dock = dock;
    if (state.dockIndex >= dock.length) state.dockIndex = Math.max(0, dock.length - 1);
    renderDock();
    if (state.overlay === 'apps') renderApps();
  }

  function discover() {
    if (!tizenApi) { setApps(buildApps(window.__MOCK_APPS || null), !!window.__MOCK_APPS); return; }
    try {
      tizenApi.application.getAppsInfo(function (infos) {
        setApps(buildApps(infos || []), true);
      }, function () {
        setApps(buildApps(null), false);
      });
    } catch (e) {
      setApps(buildApps(null), false);
    }
  }

  function launch(app) {
    if (!app) return;
    if (!tizenApi) { toast('Would open ' + app.name); return; }
    var ids = app.ids.slice();
    (function next() {
      if (!ids.length) { toast(app.name + " isn't installed on this TV"); return; }
      var id = ids.shift();
      try {
        tizenApi.application.launch(id, function () { /* opened */ }, function () { next(); });
      } catch (e) { next(); }
    })();
  }

  // ---------- rendering ----------
  var brokenIcons = {};   // icon URLs that failed to load; those apps keep the name tile

  // A colour -> 'rgba(r,g,b,a)', so a tile can be washed in its own app's colour. Accepts the
  // '#rrggbb' from the catalog and the 'rgb(r, g, b)' the browser hands back from a style property.
  function tint(colour, alpha) {
    var s = String(colour || '');
    var m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + alpha + ')';
    var h = s.replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return 'rgba(201,162,122,' + alpha + ')';
    return 'rgba(' + parseInt(h.substr(0, 2), 16) + ',' + parseInt(h.substr(2, 2), 16) + ',' +
           parseInt(h.substr(4, 2), 16) + ',' + alpha + ')';
  }

  // The wash is a separate layer rather than the tile's own background, so the focused state can
  // simply hide it instead of fighting an inline style.
  function washHtml(app) {
    return '<span class="tile-wash" style="background-image:linear-gradient(158deg,' +
      tint(app.accent, 0.42) + ' 0%,' + tint(app.accent, 0.13) + ' 55%,rgba(0,0,0,0) 100%)"></span>';
  }

  // Three ways a tile can look, in order of preference: our own logo on the app's colour, the
  // TV's own icon, or the washed name tile.
  function tileHtml(app, extra) {
    var logo = app.logo && !brokenIcons[app.logo] ? app.logo : '';
    var icon = app.icon && !brokenIcons[app.icon] ? app.icon : '';
    var kind = logo ? ' has-logo' : (icon ? ' has-icon' : '');
    var art;
    if (logo) art = washHtml(app) + '<img class="tile-logo" alt="" src="' + escapeHtml(logo) + '">';
    else if (icon) art = '<img class="tile-icon" alt="" src="' + escapeHtml(icon) + '">';
    else art = washHtml(app);
    return '<div class="tile' + kind + (extra || '') + '">' + art +
      '<span class="arrow l">&#8249;</span><span class="arrow r">&#8250;</span>' +
      '<span class="tile-accent" style="background:' + app.accent + '"></span>' +
      '<div class="tile-name">' + escapeHtml(app.name) + '</div>' +
      (app.sub ? '<div class="tile-sub">' + escapeHtml(app.sub) + '</div>' : '') +
      '</div>';
  }

  // If an icon can't be loaded, drop it and fall back to the washed name tile.
  function watchIcons(container) {
    var imgs = container.querySelectorAll('img.tile-icon');
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].onerror = function () {
        brokenIcons[this.getAttribute('src')] = true;
        var tile = this.parentNode;
        if (!tile) return;
        tile.className = tile.className.replace(/\s*has-icon/, '');
        tile.removeChild(this);
        // Put the wash back, otherwise the tile drops to a bare dark box.
        var accent = tile.querySelector('.tile-accent');
        var wash = document.createElement('span');
        wash.className = 'tile-wash';
        wash.style.backgroundImage = 'linear-gradient(158deg,' +
          tint(accent ? accent.style.backgroundColor : '', 0.42) + ' 0%,' +
          tint(accent ? accent.style.backgroundColor : '', 0.13) + ' 55%,rgba(0,0,0,0) 100%)';
        tile.insertBefore(wash, tile.firstChild);
      };
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderDock() {
    var html = '';
    for (var i = 0; i < state.dock.length; i++) {
      var app = state.byKey[state.dock[i]];
      var cls = '';
      if (!state.overlay && state.zone === 'dock' && i === state.dockIndex) cls += ' focused' + (state.moving ? ' moving' : '');
      html += tileHtml(app, cls);
    }
    if (!state.dock.length) {
      html = '<div class="tile' + (state.zone === 'dock' && !state.overlay ? ' focused' : '') + '" style="width:520px"><div class="tile-name">Add apps</div><div class="tile-sub">Press OK</div></div>';
    }
    $('dock').innerHTML = html;
    watchIcons($('dock'));
    renderLabel();
    renderPills();
    renderHint();
  }

  function renderLabel() {
    var name = ' ', sub = ' ';
    if (state.zone === 'dock' && state.dock.length) {
      var app = state.byKey[state.dock[state.dockIndex]];
      if (app) { name = app.name; sub = app.sub || ' '; }
    } else if (state.zone === 'top') {
      name = state.topIndex === 0 ? 'Guest Wi-Fi' : 'All apps';
      sub = state.topIndex === 0 ? 'Show the QR code for guests' : 'Open anything, add it to the shelf';
    }
    $('focusName').textContent = name;
    $('focusSub').textContent = sub;
  }

  function renderPills() {
    var pills = $('pills').children;
    for (var i = 0; i < pills.length; i++) {
      pills[i].className = 'pill' + (!state.overlay && state.zone === 'top' && state.topIndex === i ? ' focused' : '');
    }
  }

  function renderHint() {
    var h = $('hint');
    if (state.moving) h.innerHTML = '&#9664; &#9654; move &nbsp;·&nbsp; Red remove from shelf &nbsp;·&nbsp; OK done';
    else h.innerHTML = 'OK open &nbsp;·&nbsp; Yellow rearrange &nbsp;·&nbsp; Up for Wi-Fi and all apps';
  }

  // ---------- overlays ----------
  function openOverlay(kind) {
    state.overlay = kind;
    state.sheetIndex = 0;
    $('overlay').className = 'overlay';
    $('sheet').className = kind === 'apps' ? 'sheet apps-sheet' : 'sheet';
    if (kind === 'apps') renderApps();
    else if (kind === 'wifi') renderWifi();
    else if (kind === 'wifiForm') renderWifiForm();
    renderDock();
  }

  function closeOverlay() {
    var active = document.activeElement;
    if (active && active.blur) active.blur();
    state.overlay = null;
    $('overlay').className = 'overlay hidden';
    $('sheet').innerHTML = '';
    renderDock();
  }

  // Wi-Fi QR
  function wifiString(w) {
    var esc = function (s) { return String(s).replace(/([\\;,:"])/g, '\\$1'); };
    var type = w.password ? 'WPA' : 'nopass';
    return 'WIFI:T:' + type + ';S:' + esc(w.ssid) + ';' + (w.password ? 'P:' + esc(w.password) + ';' : '') + ';';
  }

  function drawQr(canvas, text) {
    if (window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs['UTF-8']) {
      window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
    }
    var qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount();
    var cell = Math.floor(760 / n);
    var size = cell * n;
    canvas.width = size; canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f6efe3';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#1a120d';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }

  function renderWifi() {
    var w = load(LS_WIFI, null);
    if (!w || !w.ssid) { state.overlay = 'wifiForm'; renderWifiForm(); return; }
    $('sheet').innerHTML =
      '<div class="wifi">' +
        '<div class="qr-box"><canvas id="qr" style="image-rendering:pixelated"></canvas></div>' +
        '<div class="wifi-info">' +
          '<h2>Join the Wi-Fi</h2>' +
          '<div class="sub">Point your phone camera at the code</div>' +
          '<div class="kv"><div class="k">Network</div><div class="v">' + escapeHtml(w.ssid) + '</div></div>' +
          (w.password ? '<div class="kv"><div class="k">Password</div><div class="v">' + escapeHtml(w.password) + '</div></div>' : '') +
          '<div class="buttons"><div class="btn" data-i="0">Done</div><div class="btn" data-i="1">Change network</div></div>' +
        '</div>' +
      '</div>';
    drawQr($('qr'), wifiString(w));
    focusSheetButtons();
  }

  function renderWifiForm() {
    var w = load(LS_WIFI, { ssid: '', password: '' });
    $('sheet').innerHTML =
      '<h2>Set up guest Wi-Fi</h2>' +
      '<div class="sub">Press OK on a box to type with the remote or your phone keyboard</div>' +
      '<div class="field" data-i="0"><label>Network name</label><input id="ssid" type="text" autocomplete="off" value="' + escapeHtml(w.ssid || '') + '"></div>' +
      '<div class="field" data-i="1"><label>Password (leave empty if none)</label><input id="pass" type="text" autocomplete="off" value="' + escapeHtml(w.password || '') + '"></div>' +
      '<div class="buttons"><div class="btn" data-i="2">Save</div><div class="btn" data-i="3">Cancel</div></div>';
    focusSheetButtons();
  }

  function focusSheetButtons() {
    var els = $('sheet').querySelectorAll('[data-i]');
    for (var i = 0; i < els.length; i++) {
      var base = els[i].className.replace(/\s*focused/g, '');
      els[i].className = base + (+els[i].getAttribute('data-i') === state.sheetIndex ? ' focused' : '');
    }
  }

  function saveWifiForm() {
    var ssid = $('ssid').value.replace(/^\s+|\s+$/g, '');
    if (!ssid) { toast('Type the network name first'); return; }
    save(LS_WIFI, { ssid: ssid, password: $('pass').value });
    state.sheetIndex = 0;
    state.overlay = 'wifi';
    renderWifi();
  }

  // All apps
  function renderApps() {
    var list = state.apps;
    var html = '<h2>All apps</h2><div class="sub">OK open &nbsp;·&nbsp; Yellow add to or remove from the shelf' +
      (state.appsKnown ? '' : ' &nbsp;·&nbsp; showing common apps (the TV did not share its list)') + '</div><div id="grid" class="grid">';
    for (var i = 0; i < list.length; i++) {
      var inDock = state.dock.indexOf(list[i].key) !== -1;
      html += tileHtml(list[i], i === state.sheetIndex ? ' focused' : '').replace('</div>', '</div>' + (inDock ? '<span class="badge">&#10003; Shelf</span>' : ''));
    }
    html += '</div>';
    $('sheet').className = 'sheet apps-sheet';
    $('sheet').innerHTML = html;
    watchIcons($('sheet'));
    var grid = $('grid');
    var row = Math.floor(state.sheetIndex / 6);
    grid.scrollTop = Math.max(0, (row - 2) * 156);
  }

  function toggleDock(app) {
    var at = state.dock.indexOf(app.key);
    if (at !== -1) {
      state.dock.splice(at, 1);
      toast(app.name + ' removed from the shelf');
    } else {
      if (state.dock.length >= MAX_DOCK) { toast('The shelf holds ' + MAX_DOCK + ' apps. Remove one first.'); return; }
      state.dock.push(app.key);
      toast(app.name + ' added to the shelf');
    }
    save(LS_DOCK, state.dock);
    if (state.dockIndex >= state.dock.length) state.dockIndex = Math.max(0, state.dock.length - 1);
    renderApps();
    renderDock();
  }

  // ---------- keys ----------
  function isBack(k) { return k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE; }

  function onKey(e) {
    var k = e.keyCode;
    // Desktop preview: letters stand in for the colour buttons.
    if (!tizenApi) {
      if (e.key === 'y') k = KEY.YELLOW;
      else if (e.key === 'r') k = KEY.RED;
    }
    var active = document.activeElement;
    if (active && active.tagName === 'INPUT') {
      if (k === KEY.ENTER || k === KEY.IME_DONE || k === KEY.IME_CANCEL || k === KEY.BACK || k === KEY.ESC) {
        active.blur();
        if (k === KEY.ENTER || k === KEY.IME_DONE) { state.sheetIndex = Math.min(state.sheetIndex + 1, 2); focusSheetButtons(); }
        e.preventDefault();
      }
      return;   // let the keyboard type
    }
    e.preventDefault();

    if (state.overlay) return overlayKey(k);
    if (state.moving) return moveKey(k);

    if (isBack(k)) {
      if (state.zone === 'top') { state.zone = 'dock'; renderDock(); return; }
      if (tizenApi) { try { tizenApi.application.getCurrentApplication().hide(); } catch (err) { /* ignore */ } }
      return;
    }

    if (state.zone === 'top') {
      if (k === KEY.LEFT) state.topIndex = Math.max(0, state.topIndex - 1);
      else if (k === KEY.RIGHT) state.topIndex = Math.min(1, state.topIndex + 1);
      else if (k === KEY.DOWN) state.zone = 'dock';
      else if (k === KEY.ENTER) { openOverlay(state.topIndex === 0 ? 'wifi' : 'apps'); return; }
      renderDock();
      return;
    }

    // dock
    if (k === KEY.LEFT) state.dockIndex = Math.max(0, state.dockIndex - 1);
    else if (k === KEY.RIGHT) state.dockIndex = Math.min(state.dock.length - 1, state.dockIndex + 1);
    else if (k === KEY.UP) state.zone = 'top';
    else if (k === KEY.ENTER) {
      if (!state.dock.length) { openOverlay('apps'); return; }
      launch(state.byKey[state.dock[state.dockIndex]]);
    } else if (k === KEY.YELLOW && state.dock.length) state.moving = true;
    if (state.dockIndex < 0) state.dockIndex = 0;
    renderDock();
  }

  function moveKey(k) {
    var i = state.dockIndex, d = state.dock, tmp;
    if (k === KEY.LEFT && i > 0) { tmp = d[i - 1]; d[i - 1] = d[i]; d[i] = tmp; state.dockIndex--; }
    else if (k === KEY.RIGHT && i < d.length - 1) { tmp = d[i + 1]; d[i + 1] = d[i]; d[i] = tmp; state.dockIndex++; }
    else if (k === KEY.RED) {
      var gone = state.byKey[d[i]];
      d.splice(i, 1);
      if (state.dockIndex >= d.length) state.dockIndex = Math.max(0, d.length - 1);
      state.moving = false;
      if (gone) toast(gone.name + ' removed. Add it back from All apps.');
    } else if (k === KEY.ENTER || k === KEY.YELLOW || isBack(k)) state.moving = false;
    save(LS_DOCK, state.dock);
    renderDock();
  }

  function overlayKey(k) {
    if (state.overlay === 'apps') {
      var n = state.apps.length, i = state.sheetIndex;
      if (isBack(k)) { $('sheet').className = 'sheet'; closeOverlay(); return; }
      if (k === KEY.LEFT && i % 6 > 0) i--;
      else if (k === KEY.RIGHT && i % 6 < 5 && i < n - 1) i++;
      else if (k === KEY.UP && i >= 6) i -= 6;
      else if (k === KEY.DOWN && i + 6 < n) i += 6;
      else if (k === KEY.DOWN && Math.floor(i / 6) < Math.floor((n - 1) / 6)) i = n - 1;
      else if (k === KEY.ENTER) { launch(state.apps[i]); return; }
      else if (k === KEY.YELLOW && state.apps[i]) { toggleDock(state.apps[i]); return; }
      state.sheetIndex = i;
      renderApps();
      return;
    }
    if (state.overlay === 'wifi') {
      if (isBack(k)) { closeOverlay(); return; }
      if (k === KEY.LEFT) state.sheetIndex = 0;
      else if (k === KEY.RIGHT) state.sheetIndex = 1;
      else if (k === KEY.ENTER) {
        if (state.sheetIndex === 0) { closeOverlay(); return; }
        state.overlay = 'wifiForm'; state.sheetIndex = 0; renderWifiForm(); return;
      }
      focusSheetButtons();
      return;
    }
    if (state.overlay === 'wifiForm') {
      var s = state.sheetIndex;
      if (isBack(k)) { closeOverlay(); return; }
      if (k === KEY.UP) s = s >= 2 ? 1 : Math.max(0, s - 1);
      else if (k === KEY.DOWN) s = s < 2 ? s + 1 : s;
      else if (k === KEY.LEFT && s === 3) s = 2;
      else if (k === KEY.RIGHT && s === 2) s = 3;
      else if (k === KEY.ENTER) {
        if (s === 0) { $('ssid').focus(); return; }
        if (s === 1) { $('pass').focus(); return; }
        if (s === 2) { saveWifiForm(); return; }
        closeOverlay(); return;
      }
      state.sheetIndex = s;
      focusSheetButtons();
    }
  }

  // ---------- start ----------
  function registerKeys() {
    if (!window.tizen || !window.tizen.tvinputdevice) return;
    var keys = ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'];
    for (var i = 0; i < keys.length; i++) {
      try { window.tizen.tvinputdevice.registerKey(keys[i]); } catch (e) { /* ignore */ }
    }
  }

  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { tick(); discover(); }
  });
  registerKeys();
  tick();
  setInterval(tick, 10000);
  discover();
})();
