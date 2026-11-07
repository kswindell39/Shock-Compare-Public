/* Shock Compare – everything is stored on this device only (localStorage). */
(function () {
  'use strict';
  var V = ShockParse.V;
  var CORNERS = ['LF', 'RF', 'LR', 'RR'];
  var KEY = 'shockcompare.v1';
  var COLS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var uid = function () { return Math.random().toString(36).slice(2, 9); };

  // ---------- storage ----------
  var S;
  function load() {
    try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
    if (!S || !S.groups) S = { groups: [], shocks: {}, settings: { clickStyle: 'closed' } };
    if (!S.settings) S.settings = { clickStyle: 'closed' };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); return true; }
    catch (e) { toast('Could not save on this device. Storage may be full.'); return false; }
  }
  load();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  function shock(gid, c) { return (S.shocks[gid] || {})[c] || null; }
  function clickName(r) { return S.settings.clickStyle === 'run' ? 'Run ' + (r + 1) : (r === 0 ? 'Closed' : r + ' out'); }
  function clickHead(r) { return S.settings.clickStyle === 'run' ? 'R' + (r + 1) : (r === 0 ? 'Cl' : String(r)); }

  // ---------- small UI helpers ----------
  function toast(msg) {
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 14px;border-radius:10px;z-index:99;font-weight:600;max-width:90vw;text-align:center';
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2600);
  }
  function ask(title, text, okLabel, danger) {
    return new Promise(function (res) {
      var m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = '<div class="card"><h3 style="margin:0 0 6px">' + esc(title) + '</h3><div class="sub">' + esc(text) + '</div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-a="0">Cancel</button><button class="btn ' + (danger ? 'bad' : 'pri') + '" data-a="1">' + esc(okLabel) + '</button></div></div>';
      m.onclick = function (e) { var a = e.target.getAttribute('data-a'); if (a != null || e.target === m) { m.remove(); res(a === '1'); } };
      document.body.appendChild(m);
    });
  }
  function prompt2(title, val, okLabel) {
    return new Promise(function (res) {
      var m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = '<form class="card"><h3 style="margin:0 0 8px">' + esc(title) + '</h3><input class="f" maxlength="24" value="' + esc(val || '') + '"><div class="row" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn" data-a="0">Cancel</button><button class="btn pri">' + esc(okLabel || 'Save') + '</button></div></form>';
      var f = m.querySelector('form'), inp = m.querySelector('input');
      f.onsubmit = function (e) { e.preventDefault(); var v = inp.value.trim(); m.remove(); res(v || null); };
      m.querySelector('[data-a="0"]').onclick = function () { m.remove(); res(null); };
      document.body.appendChild(m); setTimeout(function () { inp.focus(); inp.select(); }, 30);
    });
  }
  function setNavH() { document.documentElement.style.setProperty('--navh', $('nav').offsetHeight + 'px'); }
  addEventListener('resize', setNavH);

  // ---------- routing ----------
  var route = { view: 'home', gid: null };
  function go(h) { if (location.hash !== h) location.hash = h; else render(); }
  function parseHash() {
    var h = location.hash.replace('#', '');
    if (h === 'compare') route = { view: 'compare' };
    else if (h === 'menu') route = { view: 'menu' };
    else if (h.indexOf('g-') === 0 && S.groups.some(function (g) { return g.id === h.slice(2); })) route = { view: 'group', gid: h.slice(2) };
    else route = S.groups.length ? { view: 'group', gid: S.groups[0].id } : { view: 'home' };
  }
  addEventListener('hashchange', function () { render(); scrollTo(0, 0); });

  function renderTabs() {
    var t = $('#tabs'), h = '';
    S.groups.forEach(function (g) { h += '<a href="#g-' + g.id + '" class="' + (route.view === 'group' && route.gid === g.id ? 'on' : '') + '">' + esc(g.name) + '</a>'; });
    h += '<a href="#compare" class="' + (route.view === 'compare' ? 'on' : '') + '">Compare</a>';
    t.innerHTML = h;
    var on = t.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }
  $('#menuBtn').onclick = function () { go('#menu'); };

  function hasSample() { return S.groups.some(function (g) { return g.sample; }); }
  function loadSample(cb) {
    fetch('sample.json').then(function (r) { return r.json(); }).then(function (j) {
      j.groups.forEach(function (g) { if (!S.groups.some(function (x) { return x.id === g.id; })) { S.groups.push(g); S.shocks[g.id] = j.shocks[g.id] || {}; } });
      S.settings.sampleSeen = true; save(); if (cb) cb();
    }).catch(function () {});
  }
  function clearSample() {
    S.groups.filter(function (g) { return g.sample; }).forEach(function (g) { delete S.shocks[g.id]; });
    S.groups = S.groups.filter(function (g) { return !g.sample; }); save();
    go(S.groups.length ? '#g-' + S.groups[0].id : '#');
  }
  function banner(m) {
    if (!hasSample() || route.view === 'menu') return;
    var d = document.createElement('div'); d.className = 'card';
    d.style.cssText = 'display:flex;gap:10px;align-items:center;border-color:var(--flagb);background:var(--flag)';
    d.innerHTML = '<div style="flex:1;font-size:13px"><b>Sample data.</b> Made-up drivers and numbers so you can try the app.</div><button class="btn sm" id="clrS">Clear &amp; start mine</button>';
    m.insertBefore(d, m.firstChild);
    $('#clrS').onclick = async function () { if (await ask('Clear the sample data?', 'Removes the sample drivers. Anything you added yourself stays.', 'Clear')) clearSample(); };
  }

  function render() {
    parseHash(); renderTabs(); setNavH();
    var m = $('#main');
    if (route.view === 'home') renderHome(m);
    else if (route.view === 'group') renderGroup(m);
    else if (route.view === 'compare') renderCompare(m);
    else if (route.view === 'menu') renderMenu(m);
    banner(m);
  }

  // ---------- home / first run ----------
  function renderHome(m) {
    m.innerHTML = '<div class="card empty"><h2 style="justify-content:center">Shock Compare</h2>' +
      '<div class="sub">Add a car or driver, then add each corner’s dyno sheet by scanning a photo, pasting text, or typing it in. Everything stays on this phone.</div>' +
      '<div class="row"><button class="btn pri" id="addG">+ Add car / driver</button><button class="btn" id="sample0">See sample data</button><button class="btn" id="restore0">Restore a backup</button></div></div>';
    $('#addG').onclick = addGroup;
    $('#restore0').onclick = function () { $('#fileBak').click(); };
    $('#sample0').onclick = function () { loadSample(function () { go('#g-' + S.groups[0].id); }); };
  }
  async function addGroup() {
    var n = await prompt2('Name this car or driver', '', 'Add'); if (!n) return;
    var g = { id: uid(), name: n }; S.groups.push(g); S.shocks[g.id] = {}; save(); go('#g-' + g.id);
  }

  // ---------- group page ----------
  var cornerSel = {};
  function renderGroup(m) { setTimeout(function () { if (!m.querySelector('#clrS')) banner(m); }, 0);
    var g = S.groups.find(function (x) { return x.id === route.gid; });
    var cur = cornerSel[g.id] || 'LF';
    var h = '<h2>' + esc(g.name) + '<span class="sp"></span><button class="btn sm" id="ren">Rename</button><button class="btn sm bad" id="delg">Delete</button></h2>';
    h += '<div class="stick"><div class="segc" id="gc">' + CORNERS.concat(['All']).map(function (c) { return '<button class="' + (c === cur ? 'on' : '') + '" data-c="' + c + '">' + c + '</button>'; }).join('') + '</div></div>';
    h += '<div class="grid2">';
    CORNERS.forEach(function (c) {
      var hidden = cur !== 'All' && cur !== c ? ' hide' : '';
      var s = shock(g.id, c);
      if (!s) {
        h += '<div class="card empty' + hidden + '" data-cc="' + c + '"><div class="corner">' + c + '</div><div class="sub" style="margin-top:4px">No shock added yet</div>' +
          '<div class="row"><button class="btn pri" data-act="scan" data-c="' + c + '">Scan photo</button><button class="btn" data-act="paste" data-c="' + c + '">Paste text</button><button class="btn" data-act="type" data-c="' + c + '">Type in</button></div></div>';
      } else {
        h += '<div class="card' + hidden + '" data-cc="' + c + '">' + sheetHTML(s, c) +
          '<div class="row" style="margin-top:10px"><button class="btn sm" data-act="edit" data-c="' + c + '">Edit numbers</button><button class="btn sm" data-act="scan" data-c="' + c + '">Re-scan</button><button class="btn sm bad" data-act="del" data-c="' + c + '">Remove</button></div></div>';
      }
    });
    h += '</div>';
    m.innerHTML = h;
    $('#gc').onclick = function (e) { var c = e.target.getAttribute('data-c'); if (!c) return; cornerSel[g.id] = c; renderGroup(m); };
    $('#ren').onclick = async function () { var n = await prompt2('Rename', g.name); if (n) { g.name = n; save(); render(); } };
    $('#delg').onclick = async function () { if (await ask('Delete ' + g.name + '?', 'This removes all four corners for ' + g.name + ' from this phone.', 'Delete', true)) { S.groups = S.groups.filter(function (x) { return x !== g; }); delete S.shocks[g.id]; save(); go(S.groups.length ? '#g-' + S.groups[0].id : '#'); } };
    m.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = async function () {
        var c = b.getAttribute('data-c'), a = b.getAttribute('data-act');
        if (a === 'scan') startScan(g.id, c);
        else if (a === 'paste') startPaste(g.id, c);
        else if (a === 'type') openEditor(g.id, c, null);
        else if (a === 'edit') openEditor(g.id, c, shock(g.id, c));
        else if (a === 'del' && await ask('Remove ' + c + ' shock?', 'Removes this corner’s numbers for ' + g.name + '.', 'Remove', true)) { delete S.shocks[g.id][c]; save(); render(); }
      };
    });
  }
  function sheetHTML(s, c) {
    var n = s.n, meta = [];
    if (s.temp) meta.push('Temp ' + esc(s.temp) + '°F'); if (s.date) meta.push(esc(s.date));
    if (s.dbl) meta.push('separate comp / reb adjusters');
    var h = '<div class="ch"><span class="corner">' + c + '</span><span class="ser">' + esc(s.serial || '') + '</span></div>';
    if (meta.length) h += '<div class="meta">' + meta.join(' · ') + '</div>';
    if (s.note) h += '<div class="meta" style="font-style:italic">' + esc(s.note) + '</div>';
    h += '<div class="tw"><table class="t"><thead><tr><th>in/s</th>';
    for (var q = 0; q < n; q++) h += '<th>' + clickHead(q) + '</th>';
    h += '</tr></thead><tbody>';
    ['C', 'R'].forEach(function (p) {
      h += '<tr class="sec"><th colspan="' + (n + 1) + '">' + (p === 'C' ? 'Compression' : 'Rebound') + ' (lbs)</th></tr>';
      V.forEach(function (v, i) {
        h += '<tr' + (v === 3 ? ' class="hl"' : i % 2 ? ' class="alt"' : '') + '><th>' + v.toFixed(2) + '</th>';
        for (var q = 0; q < n; q++) { var x = s[p][i][q]; h += '<td' + (i === 0 ? ' class="zero"' : '') + '>' + (x == null ? '<span style="color:var(--mut)">–</span>' : x) + '</td>'; }
        h += '</tr>';
      });
    });
    return h + '</tbody></table></div>';
  }

  // ---------- editor ----------
  function blankGrid(n) { return V.map(function () { var a = []; for (var q = 0; q < n; q++) a.push(null); return a; }); }
  function resize(G, n) { return G.map(function (row) { var a = row.slice(0, n); while (a.length < n) a.push(null); return a; }); }

  function openEditor(gid, c, s, flags) {
    var g = S.groups.find(function (x) { return x.id === gid; });
    var d = s ? JSON.parse(JSON.stringify(s)) : { serial: '', temp: '', date: new Date().toLocaleDateString(), note: '', n: 12, dbl: c === 'RR', C: blankGrid(12), R: blankGrid(12) };
    var F = flags || { C: blankGrid(d.n).map(function (r) { return r.map(function () { return false; }); }), R: blankGrid(d.n).map(function (r) { return r.map(function () { return false; }); }) };
    var ov = document.createElement('div'); ov.className = 'ov';
    function draw() {
      var n = d.n;
      var h = '<div class="ovh"><button class="btn sm" id="eCancel">Cancel</button><h3>' + esc(g.name) + ' · ' + c + '</h3><button class="btn sm pri" id="eSave">Save</button></div>';
      h += '<div class="two"><div><label class="f">Serial #</label><input class="f" id="eSer" value="' + esc(d.serial) + '"></div><div><label class="f">Temp °F</label><input class="f" id="eTemp" inputmode="decimal" value="' + esc(d.temp) + '"></div></div>';
      h += '<div class="two"><div><label class="f">Date</label><input class="f" id="eDate" value="' + esc(d.date) + '"></div><div><label class="f">Clicks tested</label><select class="f" id="eN">';
      for (var k = 1; k <= 12; k++) h += '<option' + (k === n ? ' selected' : '') + '>' + k + '</option>';
      h += '</select></div></div>';
      h += '<label class="f">Notes</label><input class="f" id="eNote" value="' + esc(d.note) + '" placeholder="e.g. valving, gas pressure">';
      h += '<label class="row" style="margin:10px 0 2px;font-size:13.5px"><input type="checkbox" id="eDbl"' + (d.dbl ? ' checked' : '') + '> Separate compression &amp; rebound adjusters</label>';
      h += '<div class="sub" style="margin:8px 0">Type rebound numbers without the minus sign — they’re saved as rebound. Leave a box empty if that speed wasn’t tested.</div>';
      h += '<div class="tw"><table class="eg"><thead><tr><th>in/s</th>';
      for (var q = 0; q < n; q++) h += '<th style="text-align:center">' + clickHead(q) + '</th>';
      h += '</tr></thead><tbody>';
      ['C', 'R'].forEach(function (p) {
        h += '<tr class="sec"><th colspan="' + (n + 1) + '">' + (p === 'C' ? 'Compression' : 'Rebound') + '</th></tr>';
        V.forEach(function (v, i) {
          if (p === 'R' && i === 0) return; // 0.00 row is shared, shown once under compression
          h += '<tr' + (v === 3 ? ' class="hl"' : '') + '><th>' + (i === 0 ? '0.00 · gas' : v.toFixed(2)) + '</th>';
          for (var q = 0; q < n; q++) {
            var x = d[p][i][q];
            h += '<td><input data-p="' + p + '" data-i="' + i + '" data-q="' + q + '" class="' + (F[p][i][q] ? 'flag' : '') + '" inputmode="' + (i === 0 ? 'text' : 'numeric') + '" value="' + (x == null ? '' : x) + '"></td>';
          }
          h += '</tr>';
        });
      });
      h += '</tbody></table></div>';
      h += '<div class="flagbar" id="fb"><span class="sp" id="fbt"></span><button class="btn sm" id="fbClear">All look right</button><button class="btn sm pri" id="fbNext">Next →</button></div>';
      ov.innerHTML = h;
      bind(); countFlags();
    }
    function collectMeta() { d.serial = $('#eSer', ov).value.trim(); d.temp = $('#eTemp', ov).value.trim(); d.date = $('#eDate', ov).value.trim(); d.note = $('#eNote', ov).value.trim(); d.dbl = $('#eDbl', ov).checked; }
    function countFlags() {
      var k = ov.querySelectorAll('input.flag').length, fb = $('#fb', ov);
      fb.classList.toggle('hide', !k);
      $('#fbt', ov).textContent = k + ' highlighted number' + (k === 1 ? '' : 's') + ' to check';
    }
    function bind() {
      $('#eCancel', ov).onclick = function () { ov.remove(); };
      $('#eN', ov).onchange = function () {
        collectMeta(); var n = +this.value; d.n = n; d.C = resize(d.C, n); d.R = resize(d.R, n);
        F.C = resize(F.C, n).map(function (r) { return r.map(function (x) { return !!x; }); }); F.R = resize(F.R, n).map(function (r) { return r.map(function (x) { return !!x; }); });
        draw();
      };
      ov.querySelectorAll('.eg input').forEach(function (inp) {
        inp.addEventListener('input', function () { inp.classList.remove('flag'); F[inp.dataset.p][+inp.dataset.i][+inp.dataset.q] = false; countFlags(); });
        inp.addEventListener('focus', function () { setTimeout(function () { inp.select(); }, 0); });
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); var all = [].slice.call(ov.querySelectorAll('.eg input')), ix = all.indexOf(inp); if (all[ix + 1]) all[ix + 1].focus(); }
        });
      });
      $('#fbNext', ov).onclick = function () {
        var all = [].slice.call(ov.querySelectorAll('.eg input.flag')); if (!all.length) return;
        var act = document.activeElement, ix = all.indexOf(act), nx = all[(ix + 1) % all.length];
        nx.scrollIntoView({ block: 'center', inline: 'center' }); nx.focus();
      };
      $('#fbClear', ov).onclick = function () { ov.querySelectorAll('.eg input.flag').forEach(function (x) { x.classList.remove('flag'); }); F.C = F.C.map(function (r) { return r.map(function () { return false; }); }); F.R = F.R.map(function (r) { return r.map(function () { return false; }); }); countFlags(); };
      $('#eSave', ov).onclick = function () {
        collectMeta();
        var bad = 0;
        ov.querySelectorAll('.eg input').forEach(function (inp) {
          var p = inp.dataset.p, i = +inp.dataset.i, q = +inp.dataset.q, t = inp.value.trim().replace(/[−–]/g, '-');
          if (t === '') { d[p][i][q] = null; if (i === 0) d.R[0][q] = null; return; }
          var v = Math.round(parseFloat(t));
          if (isNaN(v)) { bad++; inp.classList.add('flag'); return; }
          if (p === 'R' && i > 0) v = -Math.abs(v);
          d[p][i][q] = v; if (i === 0) d.R[0][q] = v;
        });
        if (bad) { toast(bad + ' box' + (bad > 1 ? 'es have' : ' has') + ' something that isn’t a number'); return; }
        if (!S.shocks[gid]) S.shocks[gid] = {};
        S.shocks[gid][c] = d;
        if (save()) { ov.remove(); toast(c + ' saved'); render(); }
      };
    }
    draw(); document.body.appendChild(ov);
  }

  // ---------- scan a photo ----------
  var scanTarget = null;
  function startScan(gid, c) { scanTarget = { gid: gid, c: c }; var f = $('#fileImg'); f.value = ''; f.click(); }
  $('#fileImg').onchange = function () {
    var file = this.files && this.files[0]; if (!file || !scanTarget) return;
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () { openScan(img, url); };
    img.onerror = function () { toast('Could not open that picture'); };
    img.src = url;
  };
  function openScan(img, url) {
    var g = S.groups.find(function (x) { return x.id === scanTarget.gid; }), c = scanTarget.c, rot = 0;
    var ex = shock(scanTarget.gid, c);
    var ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = '<div class="ovh"><button class="btn sm" id="sCancel">Cancel</button><h3>Scan · ' + esc(g.name) + ' ' + c + '</h3></div>' +
      '<div class="sub">Turn the picture so the numbers read left to right, then tap Read numbers. Straight-on photos with no glare read best.</div>' +
      '<canvas id="sPrev" class="prev"></canvas>' +
      '<div class="row" style="justify-content:center"><button class="btn sm" id="sL">↺ Rotate</button><button class="btn sm" id="sR">Rotate ↻</button></div>' +
      '<div class="two" style="margin-top:6px"><div><label class="f">Clicks on the sheet</label><select class="f" id="sN">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (k) { return '<option' + (k === (ex ? ex.n : 12) ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select></div><div><label class="f">&nbsp;</label><button class="btn pri" id="sGo" style="width:100%">Read numbers</button></div></div>' +
      '<div id="sStat" class="hide"><div class="prog"><div id="sBar"></div></div><div class="sub" id="sMsg"></div></div>';
    document.body.appendChild(ov);
    var cv = $('#sPrev', ov);
    function drawPrev() {
      var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, 900 / Math.max(w, h));
      var rw = rot % 180 ? h : w, rh = rot % 180 ? w : h;
      cv.width = rw * s; cv.height = rh * s;
      var x = cv.getContext('2d'); x.save(); x.translate(cv.width / 2, cv.height / 2); x.rotate(rot * Math.PI / 180); x.drawImage(img, -w * s / 2, -h * s / 2, w * s, h * s); x.restore();
    }
    drawPrev();
    $('#sL', ov).onclick = function () { rot = (rot + 270) % 360; drawPrev(); };
    $('#sR', ov).onclick = function () { rot = (rot + 90) % 360; drawPrev(); };
    $('#sCancel', ov).onclick = function () { ov.remove(); URL.revokeObjectURL(url); };
    $('#sGo', ov).onclick = async function () {
      var btn = this; btn.disabled = true; $('#sStat', ov).classList.remove('hide');
      var n = +$('#sN', ov).value;
      try {
        var res = await ocr(img, rot, n, function (p, msg) { $('#sBar', ov).style.width = Math.round(p * 100) + '%'; $('#sMsg', ov).textContent = msg; });
        if (!res) { $('#sMsg', ov).textContent = 'Couldn’t find the speed column (0.00–6.00) in that picture. Try rotating it, a straighter photo, or Paste text / Type in.'; btn.disabled = false; return; }
        ov.remove(); URL.revokeObjectURL(url);
        var base = ex ? JSON.parse(JSON.stringify(ex)) : { serial: '', temp: '', date: new Date().toLocaleDateString(), note: '', dbl: c === 'RR' };
        base.n = n; base.C = resize(res.C, n); base.R = resize(res.R, n);
        openEditor(scanTarget.gid, c, base, { C: resize(res.FC, n).map(function (r) { return r.map(function (x) { return x === true; }); }), R: resize(res.FR, n).map(function (r) { return r.map(function (x) { return x === true; }); }) });
      } catch (e) {
        $('#sMsg', ov).textContent = navigator.onLine ? 'The reader hit a problem: ' + (e && e.message || e) : 'The photo reader downloads once the first time it’s used. Connect to the internet once, then scanning works offline.';
        btn.disabled = false;
      }
    };
  }
  var worker = null;
  async function getWorker(progress) {
    if (worker) return worker;
    if (typeof Tesseract === 'undefined') await new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = 'vendor/tesseract.min.js'; sc.onload = res; sc.onerror = function () { rej(new Error('reader not available offline yet')); }; document.head.appendChild(sc); });
    progress(0.02, 'Loading the photo reader (first time downloads about 7 MB)…');
    worker = await Tesseract.createWorker('eng', 1, {
      workerPath: 'vendor/worker.min.js', corePath: 'vendor/core/', langPath: 'vendor/lang',
      logger: function (m) { if (m.status === 'recognizing text') progress(null, null, m.progress); }
    });
    await worker.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '0123456789.-' });
    return worker;
  }
  function prepCanvas(img, rot, mode) {
    var w = img.naturalWidth, h = img.naturalHeight;
    var rw = rot % 180 ? h : w, rh = rot % 180 ? w : h, s = (mode === 'A' ? 2400 : 2800) / Math.max(rw, rh);
    if (mode === 'A' && s < 1) s = 1;
    var cw = Math.round(rw * s), ch = Math.round(rh * s);
    var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    var x = cv.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch);
    x.save(); x.translate(cw / 2, ch / 2); x.rotate(rot * Math.PI / 180); x.imageSmoothingQuality = 'high'; x.drawImage(img, -w * s / 2, -h * s / 2, w * s, h * s); x.restore();
    var d = x.getImageData(0, 0, cw, ch), p = d.data, N = cw * ch, g = new Float32Array(N), i;
    for (i = 0; i < N; i++) g[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
    var out = new Uint8ClampedArray(N);
    if (mode === 'A') {
      // local threshold: darker than the surrounding average = ink
      var I = new Float64Array((cw + 1) * (ch + 1)), r = 25, X, Y;
      for (Y = 0; Y < ch; Y++) { var rs = 0; for (X = 0; X < cw; X++) { rs += g[Y * cw + X]; I[(Y + 1) * (cw + 1) + X + 1] = I[Y * (cw + 1) + X + 1] + rs; } }
      for (Y = 0; Y < ch; Y++) for (X = 0; X < cw; X++) {
        var x0 = Math.max(0, X - r), x1 = Math.min(cw, X + r + 1), y0 = Math.max(0, Y - r), y1 = Math.min(ch, Y + r + 1);
        var sum = I[y1 * (cw + 1) + x1] - I[y0 * (cw + 1) + x1] - I[y1 * (cw + 1) + x0] + I[y0 * (cw + 1) + x0];
        var mean = sum / ((x1 - x0) * (y1 - y0));
        out[Y * cw + X] = g[Y * cw + X] > mean - 12 ? 255 : 0;
      }
    } else {
      // plain grey with stretched contrast
      var hist = new Uint32Array(256); for (i = 0; i < N; i++) hist[g[i] | 0]++;
      var lo = 0, hi = 255, acc = 0; for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > N * 0.01) { lo = i; break; } }
      acc = 0; for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc > N * 0.01) { hi = i; break; } }
      var sc = 255 / Math.max(1, hi - lo); for (i = 0; i < N; i++) out[i] = (g[i] - lo) * sc;
    }
    for (i = 0; i < N; i++) { p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = out[i]; p[i * 4 + 3] = 255; }
    x.putImageData(d, 0, 0);
    return cv;
  }
  async function ocr(img, rot, n, progress) {
    var step = 0;
    var w = await getWorker(function (p, msg, sub) { if (msg) progress(p, msg); else progress(0.1 + 0.45 * step + 0.45 * sub, 'Reading the numbers… (pass ' + (step + 1) + ' of 2)'); });
    var results = [];
    for (var m of ['A', 'B']) {
      progress(0.1 + 0.45 * step, 'Reading the numbers… (pass ' + (step + 1) + ' of 2)');
      await new Promise(function (r) { setTimeout(r, 30); });
      var cv = prepCanvas(img, rot, m);
      var out = await w.recognize(cv, {}, { blocks: true });
      var words = [];
      (out.data.blocks || []).forEach(function (b) { b.paragraphs.forEach(function (pp) { pp.lines.forEach(function (l) { l.words.forEach(function (x) { words.push({ text: x.text, conf: x.confidence, x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 }); }); }); }); });
      results.push(ShockParse.parseWords(words, { runs: n }));
      step++;
    }
    progress(1, 'Done');
    return ShockParse.merge(results[0], results[1]);
  }

  // ---------- paste text (iPhone Live Text) ----------
  function startPaste(gid, c) {
    var g = S.groups.find(function (x) { return x.id === gid; }), ex = shock(gid, c);
    var ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = '<div class="ovh"><button class="btn sm" id="pCancel">Cancel</button><h3>Paste · ' + esc(g.name) + ' ' + c + '</h3></div>' +
      '<div class="sub">On iPhone: open the dyno photo in Photos, press and hold on the numbers, tap <b>Select All</b> → <b>Copy</b>, then paste below. Text copied from the dyno software works too.</div>' +
      '<textarea class="f" id="pTxt" rows="10" style="margin-top:10px;font-family:ui-monospace,Menlo,monospace;font-size:13px" placeholder="Paste here"></textarea>' +
      '<div class="two"><div><label class="f">Clicks on the sheet</label><select class="f" id="pN">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (k) { return '<option' + (k === (ex ? ex.n : 12) ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select></div><div><label class="f">&nbsp;</label><button class="btn pri" id="pGo" style="width:100%">Read numbers</button></div></div>' +
      '<div class="sub" id="pMsg" style="margin-top:8px"></div>';
    document.body.appendChild(ov);
    $('#pCancel', ov).onclick = function () { ov.remove(); };
    $('#pGo', ov).onclick = function () {
      var n = +$('#pN', ov).value, res = ShockParse.parseText($('#pTxt', ov).value, { runs: n });
      if (!res) { $('#pMsg', ov).textContent = 'Couldn’t find rows starting with a speed like 0.50, 1.00 … 6.00. Check the paste or use Type in.'; return; }
      ov.remove();
      var base = ex ? JSON.parse(JSON.stringify(ex)) : { serial: '', temp: '', date: new Date().toLocaleDateString(), note: '', dbl: c === 'RR' };
      base.n = n; base.C = resize(res.C, n); base.R = resize(res.R, n);
      openEditor(gid, c, base, { C: resize(res.FC, n).map(function (r) { return r.map(function (x) { return !!x; }); }), R: resize(res.FR, n).map(function (r) { return r.map(function (x) { return !!x; }); }) });
    };
  }

  // ---------- compare ----------
  var CMP = { corner: 'LF', speeds: [6], zx: [0, 6], zp: 'both', clicks: {} };
  function cmpSeries(c) {
    return S.groups.map(function (g, i) { return { g: g, s: shock(g.id, c), col: COLS[i % COLS.length] }; }).filter(function (x) { return x.s; });
  }
  function clickState(gid, c, s) {
    var k = gid + c, st = CMP.clicks[k];
    if (!st) st = CMP.clicks[k] = { c: 0, r: 0 };
    if (st.c != null && st.c >= s.n) st.c = s.n - 1; if (st.r != null && st.r >= s.n) st.r = s.n - 1;
    return st;
  }
  function renderCompare(m) { setTimeout(function () { if (!m.querySelector('#clrS')) banner(m); }, 0);
    var h = '<div class="clab">Corner</div><div class="segc" id="cc">' + CORNERS.map(function (c) { return '<button class="' + (c === CMP.corner ? 'on' : '') + '" data-c="' + c + '">' + c + '</button>'; }).join('') + '</div>';
    h += '<div class="clab">Speeds <i>tap one or more</i></div><div class="segc" id="cs">' + [0, 2, 4, 6, 8, 10, 12].map(function (k) { return '<button class="' + (CMP.speeds.indexOf(k) >= 0 ? 'on' : '') + '" data-k="' + k + '">' + V[k] + '"</button>'; }).join('') + '</div>';
    h += '<div class="clab">Zoom</div><div class="zrow"><div class="segc" id="zx">' + [[0, 6], [0, 2], [1, 4], [3, 6]].map(function (z) { return '<button class="' + (z[0] === CMP.zx[0] && z[1] === CMP.zx[1] ? 'on' : '') + '" data-z="' + z + '">' + z[0] + '–' + z[1] + '"</button>'; }).join('') + '</div>' +
      '<div class="segc" id="zp">' + [['both', 'Both'], ['comp', 'Comp'], ['reb', 'Reb']].map(function (z) { return '<button class="' + (z[0] === CMP.zp ? 'on' : '') + '" data-p="' + z[0] + '">' + z[1] + '</button>'; }).join('') + '</div></div>';
    var ser = cmpSeries(CMP.corner);
    h += '<div class="card" style="margin-top:12px">';
    if (!ser.length) h += '<div class="empty sub">No ' + CMP.corner + ' shocks added yet. Add them from each car or driver tab.</div>';
    else h += '<div class="cw" id="cwf"><svg id="chf" viewBox="0 0 600 360"></svg><div class="tip" id="tipf"></div></div>' +
      '<div class="rbar"><span>Clicks</span><button class="btn sm" id="rst">Reset ' + CMP.corner + ' to ' + (S.settings.clickStyle === 'run' ? 'run 1' : 'closed') + '</button></div><div id="fsel"></div>' +
      '<div class="sub" style="margin-top:6px">' + (S.settings.clickStyle === 'run' ? 'Pick a run for each shock.' : 'Clicks are counted out from fully closed.') + ' Dashed lines join speeds with a gap between them. Hold your finger on the graph to read values.</div>';
    h += '</div>';
    m.innerHTML = h;
    $('#cc').onclick = function (e) { var c = e.target.getAttribute('data-c'); if (c) { CMP.corner = c; renderCompare(m); } };
    $('#cs').onclick = function (e) { var k = e.target.getAttribute('data-k'); if (k == null) return; k = +k; var i = CMP.speeds.indexOf(k); if (i >= 0) { if (CMP.speeds.length > 1) CMP.speeds.splice(i, 1); } else CMP.speeds.push(k); renderCompare(m); };
    $('#zx').onclick = function (e) { var z = e.target.getAttribute('data-z'); if (z) { CMP.zx = z.split(',').map(Number); renderCompare(m); } };
    $('#zp').onclick = function (e) { var p = e.target.getAttribute('data-p'); if (p) { CMP.zp = p; renderCompare(m); } };
    if (!ser.length) return;
    $('#rst').onclick = function () { ser.forEach(function (x) { CMP.clicks[x.g.id + CMP.corner] = { c: 0, r: 0 }; }); renderCompare(m); };
    drawRows(ser); drawChart(ser); wireChart(ser);
  }
  function selFor(x, part) { var st = clickState(x.g.id, CMP.corner, x.s); return x.s.dbl ? st[part] : st.c; }
  function drawRows(ser) {
    var box = $('#fsel'); box.innerHTML = '';
    ser.forEach(function (x) {
      var n = x.s.n, row = document.createElement('div'); row.className = 'frow';
      function ctl(part) {
        var o = '<option value="off">Hide</option><option value="all">All</option>';
        for (var r = 0; r < n; r++) o += '<option value="' + r + '">' + clickName(r) + '</option>';
        return '<span class="cw2" data-p="' + part + '"><span class="fl">' + (x.s.dbl ? part.toUpperCase() : '') + '</span><button class="st" data-d="1" aria-label="One click out">−</button><select>' + o + '</select><button class="st" data-d="-1" aria-label="One click in">+</button></span>';
      }
      row.innerHTML = '<span class="sw2" style="background:' + x.col + '"></span><span class="fn"><b>' + esc(x.g.name) + '</b> ' + esc(x.s.serial || '') + '</span><span class="dblc">' + (x.s.dbl ? ctl('c') + ctl('r') : ctl('c')) + '</span><span class="f3"></span>';
      var st = clickState(x.g.id, CMP.corner, x.s);
      row.querySelectorAll('.cw2').forEach(function (w) {
        var part = w.getAttribute('data-p'), sel = w.querySelector('select');
        function setUI() { var v = st[part]; sel.value = v == null ? 'off' : v < 0 ? 'all' : String(v); }
        setUI();
        function changed() { if (!x.s.dbl) st.r = st.c; drawChart(ser); upd(); }
        sel.onchange = function () { var v = sel.value; st[part] = v === 'off' ? null : v === 'all' ? -1 : +v; changed(); };
        w.querySelectorAll('.st').forEach(function (b) { b.onclick = function () { var r = st[part]; r = (r == null || r < 0) ? 0 : Math.max(0, Math.min(n - 1, r + +b.dataset.d)); st[part] = r; setUI(); changed(); }; });
      });
      var f3 = row.querySelector('.f3');
      function upd() {
        var rc = selFor(x, 'c'), rr = selFor(x, 'r'), okc = rc != null && rc >= 0, okr = rr != null && rr >= 0;
        if (!okc && !okr) { f3.innerHTML = ''; return; }
        var hh = '<div class="rt"><span>in/s</span><span>Comp</span><span>Reb</span>';
        CMP.speeds.slice().sort(function (a, b) { return a - b; }).forEach(function (k) {
          var a = okc ? x.s.C[k][rc] : null, b = okr ? x.s.R[k][rr] : null;
          hh += '<span>' + V[k].toFixed(1) + '"</span><span>' + (a == null ? '–' : a) + '</span><span>' + (b == null ? '–' : b) + '</span>';
        });
        f3.innerHTML = hh + '</div>';
      }
      upd(); box.appendChild(row);
    });
  }
  var W = 600, H = 360, ML = 44, MR = 26, MT = 12, MB = 30, chartX = null;
  function el(t, a) { var e = document.createElementNS('http://www.w3.org/2000/svg', t); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function nice(span) { var raw = span / 5, c = [5, 10, 20, 25, 50, 100]; for (var i = 0; i < c.length; i++) if (c[i] >= raw) return c[i]; return 100; }
  function runsOf(sel, n) { if (sel == null) return []; if (sel < 0) { var a = []; for (var k = 0; k < n; k++) a.push(k); return a; } return [sel]; }
  function drawChart(ser) {
    var svg = $('#chf'); if (!svg) return; while (svg.firstChild) svg.removeChild(svg.firstChild);
    var x0 = CMP.zx[0], x1 = CMP.zx[1], showC = CMP.zp !== 'reb', showR = CMP.zp !== 'comp';
    var lo = Infinity, hi = -Infinity, parts = [];
    if (showC) parts.push('C'); if (showR) parts.push('R');
    ser.forEach(function (x) { parts.forEach(function (p) { runsOf(selFor(x, p === 'C' ? 'c' : 'r'), x.s.n).forEach(function (r) { V.forEach(function (v, k) { if (v < x0 || v > x1) return; var y = x.s[p][k][r]; if (y == null) return; lo = Math.min(lo, y); hi = Math.max(hi, y); }); }); }); });
    if (lo === Infinity) { lo = -10; hi = 10; }
    if (CMP.zp === 'both') { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    var st = nice(Math.max(hi - lo, 10)); lo = Math.floor((lo - st * 0.15) / st) * st; hi = Math.ceil((hi + st * 0.15) / st) * st;
    var X = function (v) { return ML + (v - x0) / (x1 - x0) * (W - ML - MR); }, Y = function (f) { return MT + (hi - f) / (hi - lo) * (H - MT - MB); };
    chartX = X;
    for (var f = lo; f <= hi; f += st) { svg.appendChild(el('line', { x1: ML, x2: W - MR, y1: Y(f), y2: Y(f), stroke: f === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 })); var t = el('text', { x: ML - 6, y: Y(f) + 4, 'text-anchor': 'end' }); t.textContent = f; svg.appendChild(t); }
    var xs = (x1 - x0) <= 3 ? 0.5 : 1;
    for (var v = x0; v <= x1 + 1e-9; v += xs) { var tt = el('text', { x: X(v), y: H - 10, 'text-anchor': v === x1 ? 'end' : 'middle' }); tt.textContent = (xs < 1 ? v.toFixed(1) : v) + (v === x1 ? ' in/s' : ''); svg.appendChild(tt); }
    if (showC) { var tc = el('text', { x: ML + 6, y: MT + 12 }); tc.textContent = 'Compression'; svg.appendChild(tc); }
    if (showR) { var tr = el('text', { x: ML + 6, y: H - MB - 6 }); tr.textContent = 'Rebound'; svg.appendChild(tr); }
    var defs = el('defs', {}), cp = el('clipPath', { id: 'clipf' }); cp.appendChild(el('rect', { x: ML, y: MT, width: W - ML - MR, height: H - MT - MB })); defs.appendChild(cp); svg.appendChild(defs);
    var gg = el('g', { 'clip-path': 'url(#clipf)' }); svg.appendChild(gg);
    ser.forEach(function (x) {
      parts.forEach(function (p) {
        var sel = selFor(x, p === 'C' ? 'c' : 'r'), all = sel != null && sel < 0;
        runsOf(sel, x.s.n).forEach(function (r) {
          var pts = []; V.forEach(function (v, k) { var y = x.s[p][k][r]; if (y != null && v >= x0 - 0.5 && v <= x1 + 0.5) pts.push([v, y, k]); });
          var sol = '', das = '';
          for (var i = 1; i < pts.length; i++) {
            var seg = 'M' + X(pts[i - 1][0]).toFixed(1) + ' ' + Y(pts[i - 1][1]).toFixed(1) + 'L' + X(pts[i][0]).toFixed(1) + ' ' + Y(pts[i][1]).toFixed(1);
            if (pts[i][2] - pts[i - 1][2] > 1) das += seg; else sol += seg;
          }
          var o = all ? 0.4 : 1, w = all ? 1.25 : 2;
          if (sol) gg.appendChild(el('path', { d: sol, fill: 'none', stroke: x.col, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: o }));
          if (das) gg.appendChild(el('path', { d: das, fill: 'none', stroke: x.col, 'stroke-width': w, 'stroke-dasharray': '4 4', opacity: o }));
          if (!all && (x1 - x0) <= 3) pts.forEach(function (pt) { if (pt[0] >= x0 && pt[0] <= x1) gg.appendChild(el('circle', { cx: X(pt[0]), cy: Y(pt[1]), r: 3, fill: x.col, stroke: 'var(--card)', 'stroke-width': 1.5 })); });
        });
      });
    });
    CMP.speeds.forEach(function (k) {
      var v = V[k]; if (v < x0 || v > x1) return;
      svg.appendChild(el('line', { x1: X(v), x2: X(v), y1: MT, y2: H - MB, stroke: 'var(--ink)', 'stroke-width': 1.5, 'stroke-dasharray': '2 3', opacity: 0.6 }));
      var mt = el('text', { x: X(v) + (v > (x0 + x1) / 2 ? -4 : 4), y: MT + 26, 'text-anchor': v > (x0 + x1) / 2 ? 'end' : 'start' }); mt.textContent = v.toFixed(1) + '"'; mt.setAttribute('style', 'fill:var(--ink);font-weight:700'); svg.appendChild(mt);
    });
    var cross = el('line', { id: 'cross', y1: MT, y2: H - MB, stroke: 'var(--axis)', 'stroke-width': 1, opacity: 0 }); svg.appendChild(cross);
  }
  function wireChart(ser) {
    var cw = $('#cwf'), svg = $('#chf'), tip = $('#tipf'), down = false;
    function show(ev) {
      var b = svg.getBoundingClientRect(), x = (ev.clientX - b.left) / b.width * W;
      var v = Math.round(Math.max(CMP.zx[0], Math.min(CMP.zx[1], CMP.zx[0] + (x - ML) / (W - ML - MR) * (CMP.zx[1] - CMP.zx[0]))) * 2) / 2, k = V.indexOf(v);
      var cr = $('#cross'); cr.setAttribute('x1', chartX(v)); cr.setAttribute('x2', chartX(v)); cr.setAttribute('opacity', 1);
      var h = '<b>' + v.toFixed(2) + ' in/s</b>', any = false;
      ser.forEach(function (x) {
        var rc = selFor(x, 'c'), rr = selFor(x, 'r'), okc = rc != null && rc >= 0, okr = rr != null && rr >= 0; if (!okc && !okr) return; any = true;
        var a = okc ? x.s.C[k][rc] : null, bb = okr ? x.s.R[k][rr] : null;
        h += '<div><span class="k" style="background:' + x.col + '"></span>' + esc(x.g.name) + ': ' + (a == null ? '–' : a) + ' / ' + (bb == null ? '–' : bb) + '</div>';
      });
      if (!any) { tip.style.display = 'none'; return; }
      tip.innerHTML = h + '<div style="color:var(--mut);margin-top:2px">comp / reb lbs</div>'; tip.style.display = 'block';
      var px = (chartX(v) / W) * b.width; tip.style.left = (px > b.width / 2 ? px - tip.offsetWidth - 10 : px + 10) + 'px';
    }
    function hide() { down = false; tip.style.display = 'none'; var cr = $('#cross'); if (cr) cr.setAttribute('opacity', 0); }
    cw.addEventListener('pointerdown', function (e) { down = true; show(e); });
    cw.addEventListener('pointermove', function (e) { if (down || e.pointerType === 'mouse') show(e); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { cw.addEventListener(n, function (e) { if (n === 'pointerup' && e.pointerType === 'mouse') { down = false; return; } hide(); }); });
    cw.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  // ---------- menu: backup, restore, settings ----------
  function renderMenu(m) {
    var used = 0; try { used = (localStorage.getItem(KEY) || '').length; } catch (e) {}
    m.innerHTML = '<h2>Menu</h2>' +
      '<div class="card"><div class="ch"><b>Cars / drivers</b></div><div class="sub">' + (S.groups.length ? S.groups.map(function (g) { return esc(g.name); }).join(', ') : 'None yet') + '</div><div class="row" style="margin-top:10px"><button class="btn pri" id="mAdd">+ Add car / driver</button>' + (S.groups.length > 1 ? '<button class="btn" id="mOrder">Change order</button>' : '') + '</div></div>' +
      '<div class="card"><b>Your data stays on this phone</b><div class="sub" style="margin:4px 0 10px">Nothing is uploaded. If you delete the app or lose the phone, the data goes with it — so save a backup now and then. A backup file is also how you move data to another phone or share it with someone.</div>' +
      '<div class="row"><button class="btn pri" id="mBak">Save backup</button><button class="btn" id="mRes">Restore backup</button></div><div class="sub" style="margin-top:8px">' + (used / 1024).toFixed(0) + ' KB used</div></div>' +
      '<div class="card"><b>Click labels</b><div class="segc" id="mClk" style="margin-top:8px"><button data-v="closed" class="' + (S.settings.clickStyle !== 'run' ? 'on' : '') + '">Closed, 1 out, 2 out…</button><button data-v="run" class="' + (S.settings.clickStyle === 'run' ? 'on' : '') + '">Run 1, 2, 3…</button></div></div>' +
      '<div class="card"><b>Start over</b><div class="sub" style="margin:4px 0 10px">Erase every car, driver and shock from this phone.</div><button class="btn bad" id="mWipe">Erase all data</button></div>';
    $('#mAdd').onclick = addGroup;
    if ($('#mOrder')) $('#mOrder').onclick = reorder;
    $('#mBak').onclick = backup;
    $('#mRes').onclick = function () { $('#fileBak').click(); };
    $('#mClk').onclick = function (e) { var v = e.target.getAttribute('data-v'); if (v) { S.settings.clickStyle = v; save(); renderMenu(m); } };
    $('#mWipe').onclick = async function () { if (await ask('Erase everything?', 'This can’t be undone unless you have a backup file.', 'Erase', true)) { S = { groups: [], shocks: {}, settings: S.settings }; save(); go('#'); } };
  }
  function reorder() {
    var ov = document.createElement('div'); ov.className = 'ov';
    function draw() {
      ov.innerHTML = '<div class="ovh"><h3>Change order</h3><button class="btn sm pri" id="oDone">Done</button></div>' + S.groups.map(function (g, i) {
        return '<div class="card row" style="justify-content:space-between"><b>' + esc(g.name) + '</b><span class="row"><button class="btn sm" data-u="' + i + '"' + (i ? '' : ' disabled') + '>↑</button><button class="btn sm" data-d="' + i + '"' + (i < S.groups.length - 1 ? '' : ' disabled') + '>↓</button></span></div>';
      }).join('');
      $('#oDone', ov).onclick = function () { save(); ov.remove(); render(); };
      ov.querySelectorAll('[data-u],[data-d]').forEach(function (b) { b.onclick = function () { var i = +(b.dataset.u || b.dataset.d), j = b.dataset.u != null ? i - 1 : i + 1; var t = S.groups[i]; S.groups[i] = S.groups[j]; S.groups[j] = t; draw(); }; });
    }
    draw(); document.body.appendChild(ov);
  }
  async function backup() {
    var data = JSON.stringify({ app: 'shock-compare', version: 1, saved: new Date().toISOString(), data: S }, null, 1);
    var name = 'shock-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    try {
      var file = new File([data], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Shock Compare backup' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  $('#fileBak').onchange = function () {
    var f = this.files && this.files[0]; if (!f) return; this.value = '';
    var rd = new FileReader();
    rd.onload = async function () {
      var j; try { j = JSON.parse(rd.result); } catch (e) { toast('That file isn’t a Shock Compare backup'); return; }
      var d = j && j.data; if (!d || !Array.isArray(d.groups) || typeof d.shocks !== 'object') { toast('That file isn’t a Shock Compare backup'); return; }
      var names = d.groups.map(function (g) { return g.name; }).join(', ');
      if (S.groups.length) {
        var add = await ask('Restore backup', 'Add ' + d.groups.length + ' car(s) from the backup (' + names + ') to what’s already on this phone?', 'Add them');
        if (!add) return;
        d.groups.forEach(function (g) { var id = uid(); S.groups.push({ id: id, name: g.name }); S.shocks[id] = d.shocks[g.id] || {}; });
      } else { S = { groups: d.groups, shocks: d.shocks, settings: d.settings || S.settings }; }
      save(); toast('Backup restored'); go(S.groups.length ? '#g-' + S.groups[0].id : '#');
    };
    rd.readAsText(f);
  };

  if (!S.groups.length && !S.settings.sampleSeen) loadSample(function () { go('#g-' + S.groups[0].id); render(); });
  render();
})();

/* Tap a sheet table to highlight lines: a number highlights its column and row,
   a click number at the top highlights just the column, a speed on the left just the row.
   Tap the same spot again to clear. */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var cell = e.target.closest && e.target.closest('table.t td, table.t th');
    if (!cell) return;
    var tr = cell.parentNode, tbl = cell.closest('table.t');
    if (tr.classList.contains('sec')) return;
    var inHead = !!cell.closest('thead'), col = cell.cellIndex;
    var newCol = col >= 1 ? String(col) : '';
    var newRow = inHead ? '' : String(tr.rowIndex);
    if (inHead && !newCol) return; // the "in/s" label
    var same = (tbl.getAttribute('data-col') || '') === newCol && (tbl.getAttribute('data-row') || '') === newRow;
    tbl.querySelectorAll('.csel').forEach(function (c) { c.classList.remove('csel'); });
    tbl.querySelectorAll('.rsel').forEach(function (r) { r.classList.remove('rsel'); });
    tbl.removeAttribute('data-col'); tbl.removeAttribute('data-row');
    if (same) return;
    if (newCol) {
      tbl.setAttribute('data-col', newCol);
      Array.prototype.forEach.call(tbl.rows, function (r) {
        if (r.classList.contains('sec')) return;
        var c = r.cells[col]; if (c) c.classList.add('csel');
      });
    }
    if (newRow) { tbl.setAttribute('data-row', newRow); tr.classList.add('rsel'); }
  });
})();
