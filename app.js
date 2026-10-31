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
  var LS_WX = 'home.weather.v1';
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
  // Ticks every second so the minute never lags, but each piece is only written when its text
  // actually changes — rewriting the clock 60 times a minute makes it shimmer on a TV panel.
  var lastClock = '', lastDate = '';

  function tick() {
    var d = new Date();
    var h = d.getHours();
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    var face = h12 + ':' + pad(d.getMinutes());
    var mer = h < 12 ? 'AM' : 'PM';
    if (face + mer !== lastClock) {
      $('clock').innerHTML = escapeHtml(face) + '<span class="meridiem">' + mer + '</span>';
      lastClock = face + mer;
    }

    var ds = DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
    if (ds !== lastDate) { $('date').textContent = ds; lastDate = ds; }

    stageClass('is-night', h < 6 || h >= 18);
  }

  // The backdrop carries mood classes: night, and whatever the sky is doing.
  function stageClass(name, on) {
    var stage = $('stage');
    if (!stage) return;
    var padded = ' ' + stage.className + ' ';
    var has = padded.indexOf(' ' + name + ' ') !== -1;
    if (on && !has) stage.className = (stage.className + ' ' + name).replace(/^\s+/, '');
    else if (!on && has) stage.className = padded.replace(' ' + name + ' ', ' ').replace(/^\s+|\s+$/g, '');
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
             logo: (c.logo && window.HOME_LOGOS) ? (window.HOME_LOGOS[c.logo] || '') : '',
             light: c.light === true,   // a dark single-colour mark: show the brand's white variant
             shelf: c.shelf !== false,
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
    if (state.dockIndex >= dockCount()) state.dockIndex = Math.max(0, dockCount() - 1);
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
    if (logo) {
      // The brand's own colour, lit from inside the glass. Set inline because it is per-app.
      art = '<span class="tile-glass" style="background-image:linear-gradient(180deg,' +
            tint(app.accent, 0.34) + ' 0%,' + tint(app.accent, 0.10) + ' 58%,' +
            tint(app.accent, 0.20) + ' 100%)"></span>' +
            '<span class="tile-sheen"></span>' +
            '<img class="tile-logo' + (app.light ? ' lit' : '') + '" alt="" src="' + escapeHtml(logo) + '">';
    }
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

  // Brass plaques on the end of the board. Guest Wi-Fi had no way in once its pill was removed;
  // this puts it back somewhere you can actually find it, without adding chrome to the screen.
  // Wi-Fi and All Apps are not tiles on the home screen any more. They live in a small menu
  // that Up opens, so the dock stays nothing but the apps you actually watch.
  var MENU = [
    { key: 'wifi', name: 'Guest Wi-Fi', note: 'Show the QR code for guests',
      icon: '<path d="M3 9.5a16 16 0 0 1 22 0"/><path d="M7 14a10.5 10.5 0 0 1 14 0"/>' +
            '<path d="M10.8 18.4a5 5 0 0 1 6.4 0"/><circle cx="14" cy="22.6" r="1.7" class="sld"/>' },
    { key: 'apps', name: 'All Apps', note: 'Everything installed on this TV',
      icon: '<rect x="3" y="3" width="9" height="9" rx="2.4"/><rect x="16" y="3" width="9" height="9" rx="2.4"/>' +
            '<rect x="3" y="16" width="9" height="9" rx="2.4"/><rect x="16" y="16" width="9" height="9" rx="2.4"/>' }
  ];

  function dockCount() { return state.dock.length; }

  function renderDock() {
    var html = '', i;
    for (i = 0; i < state.dock.length; i++) {
      var app = state.byKey[state.dock[i]];
      var cls = '';
      if (!state.overlay && i === state.dockIndex) cls += ' focused' + (state.moving ? ' moving' : '');
      html += tileHtml(app, cls);
    }
    $('dock').innerHTML = html;
    watchIcons($('dock'));
    renderPills();
    renderHint();
  }

  // index.html ships inside the .wgt, so the pills' markup can't change without a reinstall.
  // Their contents get rebuilt here instead: a real icon in place of the old grey dot.
  var PILL_ICONS = [
    '<svg class="pill-ico" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M2 8.5a15 15 0 0 1 20 0" /><path d="M5.5 12.5a10 10 0 0 1 13 0" />' +
      '<path d="M9 16.5a5 5 0 0 1 6 0" /><circle cx="12" cy="20" r="1.6" class="sld" /></svg>',
    '<svg class="pill-ico" viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect x="3" y="3" width="7.2" height="7.2" rx="2" /><rect x="13.8" y="3" width="7.2" height="7.2" rx="2" />' +
      '<rect x="3" y="13.8" width="7.2" height="7.2" rx="2" /><rect x="13.8" y="13.8" width="7.2" height="7.2" rx="2" /></svg>'
  ];
  var pillsBuilt = false;

  function buildPills() {
    if (pillsBuilt) return;
    var pills = $('pills').children, i;
    for (i = 0; i < pills.length; i++) {
      var label = (pills[i].textContent || '').replace(/^\s+|\s+$/g, '');
      pills[i].innerHTML = (PILL_ICONS[i] || '') + '<span class="pill-label">' + escapeHtml(label) + '</span>';
    }
    pillsBuilt = true;
  }

  // The pills are off the home screen. Both are still reachable: Up opens All apps, Green opens
  // the guest Wi-Fi code. Nothing was removed, only the clutter that announced it.
  function renderPills() {
    var p = $('pills');
    if (p) p.className = 'pills hidden';
  }

  // The hint line is gone from the home screen. It still says something while you are actually
  // rearranging, because that mode has no other affordance; the rest of the time it is empty.
  function renderHint() {
    var h = $('hint');
    if (!h) return;
    h.innerHTML = state.moving ? '&#9664; &#9654; move &nbsp;·&nbsp; Red removes &nbsp;·&nbsp; OK done' : '';
    h.className = state.moving ? 'hint showing' : 'hint';
  }

  // ---------- overlays ----------
  // HOME | menu | apps | wifi | wifiForm. Only one is ever on screen.
  function setScreen(name) {
    var h = document.documentElement;
    var cls = h.className.replace(/\s*screen-[a-zA-Z]+/g, '').replace(/^\s+|\s+$/g, '');
    h.className = name === 'home' ? cls : (cls + ' screen-' + name).replace(/^\s+/, '');
  }

  function openOverlay(kind) {
    state.overlay = kind;
    state.sheetIndex = 0;
    setScreen(kind);
    $('overlay').className = 'overlay';
    $('sheet').className = kind === 'apps' ? 'sheet apps-sheet' : 'sheet';
    if (kind === 'apps') renderApps();
    else if (kind === 'menu') renderMenu();
    else if (kind === 'wifi') renderWifi();
    else if (kind === 'wifiForm') renderWifiForm();
    renderDock();
  }

  function closeOverlay() {
    var active = document.activeElement;
    if (active && active.blur) active.blur();
    state.overlay = null;
    setScreen('home');
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
    if (!w || !w.ssid) { state.overlay = 'wifiForm'; setScreen('wifiForm'); renderWifiForm(); return; }
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
    setScreen('wifi');
    renderWifi();
  }

  // The small secondary menu. Deliberately two rows and nothing else.
  function renderMenu() {
    var html = '<h2>Menu</h2><div class="menu-list">', i, m;
    for (i = 0; i < MENU.length; i++) {
      m = MENU[i];
      html += '<div class="menu-row' + (i === state.sheetIndex ? ' focused' : '') + '">' +
        '<svg class="menu-ico" viewBox="0 0 28 28" aria-hidden="true">' + m.icon + '</svg>' +
        '<div class="menu-text"><div class="menu-name">' + escapeHtml(m.name) + '</div>' +
        '<div class="menu-note">' + escapeHtml(m.note) + '</div></div></div>';
    }
    $('sheet').className = 'sheet menu-sheet';
    $('sheet').innerHTML = html + '</div>';
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
    if (wokeFromAmbient) { wokeFromAmbient = false; e.preventDefault(); return; }
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
      if (state.moving) { state.moving = false; renderDock(); return; }
      if (tizenApi) { try { tizenApi.application.getCurrentApplication().hide(); } catch (err) { /* ignore */ } }
      return;
    }

    // dock
    if (k === KEY.LEFT) state.dockIndex = Math.max(0, state.dockIndex - 1);
    else if (k === KEY.RIGHT) state.dockIndex = Math.min(dockCount() - 1, state.dockIndex + 1);
    else if (k === KEY.UP) { openOverlay('menu'); return; }
    else if (k === KEY.GREEN) { openOverlay('wifi'); return; }
    else if (k === KEY.ENTER) {
      if (!state.dock.length) { openOverlay('apps'); return; }
      launch(state.byKey[state.dock[state.dockIndex]]);
    } else if (k === KEY.YELLOW && state.dock.length && state.dockIndex < state.dock.length) {
      state.moving = true;   // only real apps reorder; the plaques stay put
    }
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
    if (state.overlay === 'menu') {
      if (isBack(k)) { closeOverlay(); return; }
      if (k === KEY.UP) state.sheetIndex = Math.max(0, state.sheetIndex - 1);
      else if (k === KEY.DOWN) state.sheetIndex = Math.min(MENU.length - 1, state.sheetIndex + 1);
      else if (k === KEY.ENTER) { openOverlay(MENU[state.sheetIndex].key); return; }
      renderMenu();
      return;
    }
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
        state.overlay = 'wifiForm'; setScreen('wifiForm'); state.sheetIndex = 0; renderWifiForm(); return;
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

  // ---------- weather ----------
  // Open-Meteo: no account, no API key, CORS open. The TV's CSP allows any connect-src, so this
  // works from the packaged file:// page. The element is built here rather than in index.html,
  // because index.html ships inside the .wgt and changing it would mean reinstalling.
  var WX_API = 'https://api.open-meteo.com/v1/forecast';
  var WX_GEO = 'https://geocoding-api.open-meteo.com/v1/search';
  var WX_EVERY = 15 * 60 * 1000;

  // WMO weather codes, grouped into the handful of states worth drawing.
  function wxKind(code) {
    if (code === 0) return 'clear';
    if (code === 1 || code === 2) return 'partly';
    if (code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if (code >= 61 && code <= 67) return 'rain';
    if (code >= 80 && code <= 82) return 'rain';
    if (code >= 71 && code <= 77) return 'snow';
    if (code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'cloud';
  }

  // Kept short on purpose: this chip lives between the clock and the pills, and a long word
  // widens it in both directions until it collides with them.
  var WX_WORD = { clear: 'Clear', partly: 'Partly Sun', cloud: 'Cloudy', fog: 'Fog',
                  drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', storm: 'Storms' };

  // Dimensional weather parts. Each is built from gradients rather than flat fills so they
  // read as little sculpted objects, which is what the Ratropolis signage calls for.
  var WX_DEFS =
    '<defs>' +
      '<radialGradient id="gSun" cx="36%" cy="30%">' +
        '<stop offset="0" stop-color="#fff3c0"/><stop offset="55%" stop-color="#ffc83d"/>' +
        '<stop offset="100%" stop-color="#e8870f"/></radialGradient>' +
      '<linearGradient id="gCloud" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#f4fbff"/><stop offset="55%" stop-color="#cdddea"/>' +
        '<stop offset="100%" stop-color="#9fb6c9"/></linearGradient>' +
      '<linearGradient id="gCloudDark" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#bcc9d8"/><stop offset="100%" stop-color="#6d8197"/></linearGradient>' +
      '<linearGradient id="gMoon" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#fffaf0"/><stop offset="100%" stop-color="#d9c89c"/></linearGradient>' +
    '</defs>';

  // A sun with rays, built in a loop so the spokes stay evenly spaced. The rays are their own
  // group so CSS can turn them slowly without moving the disc.
  function sunHtml(cx, cy, r) {
    var rays = '', i, a, x1, y1, x2, y2;
    for (i = 0; i < 12; i++) {
      a = i * Math.PI / 6;
      x1 = cx + Math.cos(a) * (r + 4.5); y1 = cy + Math.sin(a) * (r + 4.5);
      x2 = cx + Math.cos(a) * (r + (i % 2 ? 8 : 11));
      y2 = cy + Math.sin(a) * (r + (i % 2 ? 8 : 11));
      rays += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) +
              '" y2="' + y2.toFixed(1) + '" stroke="#ffc83d" stroke-width="2.8" stroke-linecap="round"/>';
    }
    return '<g class="wx-sun-rays" style="-webkit-transform-origin:' + cx + 'px ' + cy + 'px;' +
           'transform-origin:' + cx + 'px ' + cy + 'px">' + rays + '</g>' +
           '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + 3) + '" fill="#ffc83d" opacity=".18"/>' +
           '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="url(#gSun)"/>' +
           '<ellipse cx="' + (cx - r * 0.3) + '" cy="' + (cy - r * 0.38) + '" rx="' + (r * 0.34) +
           '" ry="' + (r * 0.24) + '" fill="#fff8d8" opacity=".55"/>';
  }

  function wxIcon(kind, isDay) {
    var s = '<svg class="wx-svg" viewBox="0 0 48 48" aria-hidden="true">' + WX_DEFS;
    var moon = '<path d="M27 7a13 13 0 1 0 11.6 11.6A9.6 9.6 0 0 1 27 7z" fill="url(#gMoon)"/>' +
               '<circle cx="31" cy="26" r="2.2" fill="#cdb98c" opacity=".55"/>' +
               '<circle cx="21" cy="17" r="1.5" fill="#cdb98c" opacity=".45"/>';
    var cloud = '<path d="M13 37h21a7.5 7.5 0 0 0 .7-15A10.5 10.5 0 0 0 14 23.5 6.4 6.4 0 0 0 13 37z" fill="url(#gCloud)"/>' +
                '<path d="M13 37h21a7.5 7.5 0 0 0 3.6-1.2H14.2z" fill="#8ea6ba" opacity=".5"/>';
    var dark  = '<path d="M13 37h21a7.5 7.5 0 0 0 .7-15A10.5 10.5 0 0 0 14 23.5 6.4 6.4 0 0 0 13 37z" fill="url(#gCloudDark)"/>';
    if (kind === 'clear') return s + (isDay ? sunHtml(24, 23, 11) : moon) + '</svg>';
    if (kind === 'partly') return s + (isDay ? sunHtml(16, 14, 7.5) : moon) + cloud + '</svg>';
    if (kind === 'fog') return s + cloud +
      '<g stroke="#b9c7c9" stroke-width="2.8" stroke-linecap="round" opacity=".8">' +
      '<path d="M11 42h26"/><path d="M16 46.5h17"/></g></svg>';
    if (kind === 'drizzle' || kind === 'rain') {
      var n = kind === 'rain' ? 3 : 2, d = '', i;
      for (i = 0; i < n; i++) {
        d += '<path class="wx-drop" d="M' + (17 + i * 7) + ' 40c1.6 2.2 2.4 3.4 2.4 4.3a2.4 2.4 0 0 1-4.8 0c0-.9.8-2.1 2.4-4.3z" fill="#6fc4ff"/>';
      }
      return s + cloud + d + '</svg>';
    }
    if (kind === 'snow') {
      var f = '', j;
      for (j = 0; j < 3; j++) {
        f += '<g class="wx-flake" transform="translate(' + (16 + j * 8) + ',43)">' +
             '<path d="M0 -3.4V3.4M-3 -1.7L3 1.7M-3 1.7L3 -1.7" stroke="#eaf6ff" stroke-width="1.7" stroke-linecap="round"/></g>';
      }
      return s + cloud + f + '</svg>';
    }
    if (kind === 'storm') return s + dark +
      '<path class="wx-bolt" d="M25 37l-7 9h5.2l-2.2 8 9.5-11h-5.6l3.1-6z" fill="#ffd34d" stroke="#e8870f" stroke-width="1"/></svg>';
    return s + cloud + '</svg>';
  }

  function wxNode() {
    var el = $('weather');
    if (el) return el;
    var stage = $('stage');
    if (!stage) return null;
    el = document.createElement('div');
    el.id = 'weather';
    el.className = 'weather';
    stage.appendChild(el);
    return el;
  }

  function renderWeather(w) {
    var el = wxNode();
    if (!el || !w) return;
    var kind = wxKind(w.code);
    var day = w.isDay !== 0;
    var hilo = '';
    if (typeof w.hi === 'number' && typeof w.lo === 'number') {
      hilo = '<div class="wx-hilo">H: ' + Math.round(w.hi) + '&deg;' +
             '<span class="sep"></span>L: ' + Math.round(w.lo) + '&deg;</div>';
    }
    el.className = 'weather wx-' + kind + (day ? ' is-day' : ' is-dark');
    el.innerHTML =
      '<span class="chain l"></span><span class="chain r"></span>' +
      '<div class="wx-sign">' +
        '<div class="wx-city">' + escapeHtml(wxConfig().label || w.place || 'New York City') + '</div>' +
        '<div class="wx-main">' +
          '<span class="wx-icon">' + wxIcon(kind, day) + '</span>' +
          '<span class="wx-temp">' + Math.round(w.temp) + '<span class="deg">&deg;</span></span>' +
        '</div>' +
        '<div class="wx-word">' + escapeHtml(WX_WORD[kind] || '') + '</div>' +
        hilo +
      '</div>';
    stageWeather(kind);
  }

  // Before the first reading lands.
  function renderWeatherLoading() {
    var el = wxNode();
    if (!el || el.innerHTML) return;
    el.className = 'weather wx-wait';
    el.innerHTML = '<span class="chain l"></span><span class="chain r"></span>' +
      '<div class="wx-sign"><div class="wx-city">New York City</div>' +
      '<div class="wx-word">Checking the sky</div></div>';
  }

  // Shown only when there is no reading at all. Never a made-up temperature.
  function renderWeatherUnavailable() {
    var el = wxNode();
    if (!el) return;
    el.className = 'weather wx-off';
    el.innerHTML = '<span class="chain l"></span><span class="chain r"></span>' +
      '<div class="wx-sign"><div class="wx-city">New York City</div>' +
      '<div class="wx-word">Weather unavailable</div></div>';
  }

  // The backdrop takes a mood from the sky. Kept to one class so there is nothing to clean up.
  var stageMood = '';
  function stageWeather(kind) {
    var mood = (kind === 'rain' || kind === 'drizzle') ? 'sky-rain'
             : (kind === 'snow') ? 'sky-snow'
             : (kind === 'storm') ? 'sky-storm'
             : (kind === 'cloud' || kind === 'fog') ? 'sky-cloud'
             : 'sky-clear';
    if (mood === stageMood) return;
    if (stageMood) stageClass(stageMood, false);
    stageClass(mood, true);
    stageMood = mood;
  }

  function getJson(url, cb) {
    var xhr, done = false, guard;
    function finish(err, data) { if (done) return; done = true; window.clearTimeout(guard); cb(err, data); }
    try { xhr = new XMLHttpRequest(); } catch (e) { return finish('no XHR'); }
    guard = window.setTimeout(function () { try { xhr.abort(); } catch (e) {} finish('timeout'); }, 8000);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status < 200 || xhr.status >= 300) return finish('http ' + xhr.status);
      try { finish(null, JSON.parse(xhr.responseText)); } catch (e) { finish('bad json'); }
    };
    try { xhr.open('GET', url, true); xhr.send(null); } catch (e) { finish('open failed'); }
  }

  function wxConfig() {
    var c = window.HOME_WEATHER || {};
    return { place: c.place || '', label: c.label || '', lat: c.lat, lon: c.lon,
             units: c.units === 'celsius' ? 'celsius' : 'fahrenheit' };
  }

  function withCoords(cb) {
    var c = wxConfig(), cached = load(LS_WX, null);
    if (typeof c.lat === 'number' && typeof c.lon === 'number') return cb(c.lat, c.lon, c.place);
    if (cached && cached.lat && cached.place === c.place) return cb(cached.lat, cached.lon, cached.label || c.place);
    if (!c.place) return;
    getJson(WX_GEO + '?name=' + encodeURIComponent(c.place) + '&count=1&language=en&format=json',
      function (err, data) {
        if (err || !data || !data.results || !data.results.length) return;
        var r = data.results[0];
        cb(r.latitude, r.longitude, r.name);
      });
  }

  function refreshWeather() {
    var c = wxConfig();
    withCoords(function (lat, lon, label) {
      getJson(WX_API + '?latitude=' + lat + '&longitude=' + lon +
              '&current=temperature_2m,weather_code,is_day' +
              '&daily=temperature_2m_max,temperature_2m_min&forecast_days=1' +
              '&temperature_unit=' + c.units + '&timezone=auto', function (err, data) {
        if (err || !data || !data.current) {
          // Never invent a reading: keep the last good one, or say so plainly.
          if (!load(LS_WX, null)) renderWeatherUnavailable();
          return;
        }
        var daily = data.daily || {};
        var w = { temp: data.current.temperature_2m, code: data.current.weather_code,
                  isDay: data.current.is_day, place: label, lat: lat, lon: lon, label: label,
                  hi: (daily.temperature_2m_max || [])[0],
                  lo: (daily.temperature_2m_min || [])[0],
                  at: (new Date()).getTime() };
        save(LS_WX, w);
        renderWeather(w);
      });
    });
  }

  function startWeather() {
    if (!wxConfig().place && typeof wxConfig().lat !== 'number') return;
    var cached = load(LS_WX, null);
    if (cached) renderWeather(cached);          // show the last reading straight away
    else renderWeatherLoading();
    refreshWeather();
    setInterval(refreshWeather, WX_EVERY);
  }

  // ---------- ambient mode ----------
  // After half a minute untouched the dock fades out and the city is left alone. Any key brings
  // it straight back, with the same app still selected.
  var AMBIENT_AFTER = 30000;
  var ambientTimer = null;
  var ambient = false;

  function setAmbient(on) {
    if (ambient === on) return;
    ambient = on;
    var h = document.documentElement;
    if (on) h.className = (h.className + ' ambient').replace(/^\s+/, '');
    else h.className = (' ' + h.className + ' ').replace(' ambient ', ' ').replace(/^\s+|\s+$/g, '');
  }

  var wokeFromAmbient = false;

  function nudgeAmbient() {
    if (ambient) wokeFromAmbient = true;
    setAmbient(false);
    window.clearTimeout(ambientTimer);
    ambientTimer = window.setTimeout(function () {
      if (state.overlay) return;    // never fade things out from under a menu
      setAmbient(true);
    }, AMBIENT_AFTER);
  }

  // ---------- start ----------
  function registerKeys() {
    if (!window.tizen || !window.tizen.tvinputdevice) return;
    var keys = ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'];
    for (var i = 0; i < keys.length; i++) {
      try { window.tizen.tvinputdevice.registerKey(keys[i]); } catch (e) { /* ignore */ }
    }
  }

  // Gradient-filled text needs -webkit-background-clip, and the fallback when it is missing is
  // invisible text, so the clock only opts in once the engine confirms support.
  function detectGradientText() {
    var ok = false;
    try {
      ok = !!(window.CSS && window.CSS.supports &&
              (window.CSS.supports('-webkit-background-clip', 'text') ||
               window.CSS.supports('background-clip', 'text')));
    } catch (e) { ok = false; }
    if (ok) {
      var h = document.documentElement;
      h.className = h.className ? h.className + ' gradient-text' : 'gradient-text';
    }
  }

  // The clock's face comes from fonts.js as a data URI, for the same CSP reason as the backdrop.
  function applyFont() {
    var f = window.HOME_FONT;
    if (!f || !f.clock) return;
    var el = document.createElement('style');
    el.type = 'text/css';
    el.appendChild(document.createTextNode(
      "@font-face{font-family:'ClockFace';font-style:normal;font-weight:400;" +
      "src:url(" + f.clock + ") format('woff2');}"));
    document.getElementsByTagName('head')[0].appendChild(el);
    var h = document.documentElement;
    h.className = h.className ? h.className + ' has-clockface' : 'has-clockface';
  }

  // index.html keeps the date inside the clock block, and it ships in the .wgt. Moving it out
  // here lets the clock and the date be two separate brass plaques instead of one tall box.
  function splitDatePlaque() {
    var date = $('date'), top = document.querySelector('.top'), block = document.querySelector('.time-block');
    if (!date || !top || !block || date.parentNode !== block) return;
    block.parentNode.insertBefore(date, block.nextSibling);
  }

  // Atmosphere sits between the artwork and the interface: a canal sheen that always breathes,
  // plus rain/snow/warmth layers that fade in with the real forecast. Built here because
  // index.html ships inside the .wgt.
  function buildAtmosphere() {
    var stage = $('stage');
    if (!stage || $('sky')) return;
    var names = ['canal', 'warm', 'cool', 'rain', 'snow'], i, d;
    for (i = 0; i < names.length; i++) {
      d = document.createElement('div');
      d.className = 'sky-layer ' + names[i];
      if (i === 0) d.id = 'sky';
      stage.insertBefore(d, stage.firstChild);
    }
  }

  // The backdrop is a data URI from theme.js; the TV's CSP will not load one over https.
  function applyTheme() {
    var t = window.HOME_THEME;
    if (!t || !t.background) return;
    var stage = $('stage');
    if (!stage) return;
    // Decode first, then paint: setting it straight on the element shows a half-drawn image.
    var img = new Image();
    img.onload = function () {
      stage.style.backgroundImage = 'url("' + t.background + '")';
      stageClass('art-ready', true);
    };
    img.onerror = function () { stageClass('art-ready', true); };
    img.src = t.background;
  }

  document.addEventListener('keydown', nudgeAmbient, true);   // before onKey, so the first
  document.addEventListener('keydown', onKey);                // press only wakes the dock
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { tick(); discover(); refreshWeather(); }
  });
  registerKeys();
  nudgeAmbient();
  splitDatePlaque();
  buildAtmosphere();
  applyFont();
  applyTheme();
  startWeather();
  tick();
  setInterval(tick, 1000);
  discover();
})();
