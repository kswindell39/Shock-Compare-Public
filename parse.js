/* Turns OCR words from a Maxwell-style dyno sheet into a compression / rebound grid.
   Works in the browser (window.ShockParse) and in Node (module.exports) for testing. */
(function (root) {
  var V = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];

  function clean(t) {
    return String(t).replace(/[−–—]/g, '-').replace(/[Oo]/g, '0').replace(/[lI|]/g, '1')
      .replace(/[Ss]/g, '5').replace(/[,]/g, '.').replace(/\s+/g, '').replace(/^\.+|\.+$/g, '');
  }
  function speedOf(t) {
    var m = /^(\d)\.(\d)(\d)?$/.exec(t);
    if (!m) return null;
    var v = +(m[1] + '.' + m[2]);
    if (m[3] && m[3] !== '0') return null;
    return V.indexOf(v) >= 0 ? v : null;
  }
  function intOf(t) { return /^-?\d{1,3}$/.test(t) ? parseInt(t, 10) : null; }
  function median(a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; }

  // words: [{text, conf, x0, y0, x1, y1}]
  function parseWords(words, opts) {
    opts = opts || {};
    var toks = [];
    words.forEach(function (w) {
      var t = clean(w.text); if (!t) return;
      toks.push({ t: t, conf: w.conf == null ? 90 : w.conf, x: (w.x0 + w.x1) / 2, y: (w.y0 + w.y1) / 2, x0: w.x0, h: Math.max(4, w.y1 - w.y0) });
    });
    if (!toks.length) return null;
    var H = median(toks.map(function (k) { return k.h; }));

    // 1) estimate skew from tokens sharing a line
    var byY = toks.slice().sort(function (a, b) { return a.y - b.y; }), lines = [];
    byY.forEach(function (k) { var L = lines.find(function (l) { return Math.abs(l.y - k.y) < H * 0.45; }); if (!L) { L = { y: k.y, ks: [] }; lines.push(L); } L.ks.push(k); });
    var slopes = [];
    lines.forEach(function (L) {
      if (L.ks.length < 4) return;
      var n = L.ks.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
      L.ks.forEach(function (k) { sx += k.x; sy += k.y; sxx += k.x * k.x; sxy += k.x * k.y; });
      var d = n * sxx - sx * sx; if (d) slopes.push((n * sxy - sx * sy) / d);
    });
    var slope = slopes.length ? median(slopes) : 0;
    toks.forEach(function (k) { k.yd = k.y - slope * k.x; });

    // 2) speed labels on the left edge define the rows
    // the speed labels form a column: find the x position shared by the most speed-looking tokens
    var cand = toks.filter(function (k) { return speedOf(k.t) !== null; });
    if (!cand.length) return null;
    var bestX = cand[0].x0, bestN = 0;
    cand.forEach(function (k) { var nn = cand.filter(function (o) { return Math.abs(o.x0 - k.x0) < H * 2.5; }).length; if (nn > bestN || (nn === bestN && k.x0 < bestX)) { bestN = nn; bestX = k.x0; } });
    var minX = bestX;
    var labels = cand.filter(function (k) { return Math.abs(k.x0 - bestX) < H * 2.5; })
      .sort(function (a, b) { return a.yd - b.yd; });
    // split into compression block then rebound block (speed restarts)
    var blocks = [[]], last = -1;
    labels.forEach(function (k) {
      var v = speedOf(k.t);
      if (v <= last - 1 && blocks[blocks.length - 1].length > 2) blocks.push([]);
      var b = blocks[blocks.length - 1];
      if (b.length && Math.abs(b[b.length - 1].yd - k.yd) < H * 0.5) return; // duplicate
      b.push(k); last = v;
    });
    blocks = blocks.filter(function (b) { return b.length >= 2; }).slice(0, 2);
    if (!blocks.length) return null;
    var rows = [];
    blocks.forEach(function (b, bi) {
      // fit speed -> y to fill in rows whose label was misread
      var n = b.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
      b.forEach(function (k) { var v = speedOf(k.t); sx += v; sy += k.yd; sxx += v * v; sxy += v * k.yd; });
      var d = n * sxx - sx * sx, a1 = d ? (n * sxy - sx * sy) / d : H * 2.2, a0 = (sy - a1 * sx) / n;
      if (!(a1 > 0)) a1 = H * 2.2;
      var vmin = Math.min.apply(null, b.map(function (k) { return speedOf(k.t); }));
      V.forEach(function (v, vi) {
        if (v < vmin - 1e-9) return; // rows above the first visible label are not on the photo
        var lab = b.find(function (k) { return speedOf(k.t) === v; });
        var y = lab ? lab.yd : a0 + a1 * v;
        if (bi === 0 && blocks[1]) { var by = blocks[1][0].yd; if (y > by - a1 * 0.25) return; }
        rows.push({ part: bi === 0 ? 'C' : 'R', vi: vi, y: y, sp: a1 * 0.5, guessed: !lab, labelX: lab ? lab.x : minX });
      });
    });
    if (blocks.length === 1) rows.forEach(function (r) { r.part = 'C'; });

    // 3) assign number tokens to the nearest row
    var labelSet = new Set(labels);
    var cells = [];
    toks.forEach(function (k) {
      if (labelSet.has(k)) return;
      var best = null, bd = 1e9;
      rows.forEach(function (r) { var dd = Math.abs(k.yd - r.y); if (dd < bd) { bd = dd; best = r; } });
      if (!best || bd > Math.max(best.sp * 0.75, H * 0.7)) return;
      if (k.x < best.labelX + H) return;
      cells.push({ k: k, row: best, val: intOf(k.t) });
    });

    // 4) columns: cluster x positions
    var counts = {};
    rows.forEach(function (r) { r.cs = cells.filter(function (c) { return c.row === r; }).sort(function (a, b) { return a.k.x - b.k.x; }); });
    var nCols = opts.runs || 0;
    if (!nCols) {
      var cnt = rows.map(function (r) { return r.cs.filter(function (c) { return c.val !== null; }).length; }).filter(function (x) { return x > 0; });
      cnt.forEach(function (c) { counts[c] = (counts[c] || 0) + 1; });
      var bestC = 0, bestN = 0; Object.keys(counts).forEach(function (c) { if (counts[c] > bestN || (counts[c] === bestN && +c > bestC)) { bestN = counts[c]; bestC = +c; } });
      nCols = Math.min(12, Math.max(1, bestC));
    }
    var ref = rows.filter(function (r) { return r.cs.length === nCols && r.cs.every(function (c) { return c.val !== null; }); });
    var centers = [];
    for (var j = 0; j < nCols; j++) centers.push(median(ref.map(function (r) { return r.cs[j].k.x - slope * 0; })));
    if (!ref.length) {
      // use quantiles of all number positions, ignoring stray marks far to the right (legend/notes)
      var xs = cells.filter(function (c) { return c.val !== null; }).map(function (c) { return c.k.x; }).sort(function (a, b) { return a - b; });
      var lo = xs[Math.floor(xs.length * 0.02)], hi = xs[Math.floor(xs.length * 0.98)];
      var rowsN = rows.filter(function (r) { return r.cs.length; });
      var perRowMax = rowsN.map(function (r) { var v = r.cs.filter(function (c) { return c.val !== null; }); return v.length ? v[v.length - 1].k.x : null; }).filter(function (x) { return x !== null; });
      hi = Math.min(hi, median(perRowMax) + H);
      centers = []; for (j = 0; j < nCols; j++) centers.push(lo + (hi - lo) * (nCols === 1 ? 0 : j / (nCols - 1)));
    }
    for (var it = 0; it < 5; it++) {
      var acc = centers.map(function () { return []; });
      cells.forEach(function (c) { var bj = 0, bd = 1e9; centers.forEach(function (cx, jj) { var d = Math.abs(c.k.x - cx); if (d < bd) { bd = d; bj = jj; } }); c.col = bj; c.cd = bd; acc[bj].push(c.k.x); });
      centers = centers.map(function (cx, jj) { return acc[jj].length ? median(acc[jj]) : cx; });
    }
    var colW = nCols > 1 ? median(centers.slice(1).map(function (c, jj) { return c - centers[jj]; })) : H * 4;
    // photos are rarely square-on, so columns drift row to row: fit a small shift/stretch per row
    rows.forEach(function (r) {
      var A = 1, B = 0, pts = r.cs.filter(function (c) { return c.val !== null; });
      if (!pts.length) return;
      for (var it2 = 0; it2 < 6; it2++) {
        var pr = [];
        pts.forEach(function (c) {
          var xx = A * c.k.x + B, bj = 0, bd = 1e9;
          centers.forEach(function (cx, jj) { var d = Math.abs(xx - cx); if (d < bd) { bd = d; bj = jj; } });
          if (bd < colW * 0.6) pr.push([c.k.x, centers[bj]]);
        });
        if (!pr.length) break;
        if (pr.length >= 4) {
          var m = pr.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
          pr.forEach(function (p) { sx += p[0]; sy += p[1]; sxx += p[0] * p[0]; sxy += p[0] * p[1]; });
          var dd = m * sxx - sx * sx, na = dd ? (m * sxy - sx * sy) / dd : 1;
          if (na > 0.85 && na < 1.15) { A = na; B = (sy - A * sx) / m; } else { A = 1; B = median(pr.map(function (p) { return p[1] - p[0]; })); }
        } else { A = 1; B = median(pr.map(function (p) { return p[1] - p[0]; })); }
      }
      r.cs.forEach(function (c) {
        var xx = A * c.k.x + B, bj = 0, bd = 1e9;
        centers.forEach(function (cx, jj) { var d = Math.abs(xx - cx); if (d < bd) { bd = d; bj = jj; } });
        c.col = bj; c.cd = bd;
      });
    });

    // 5) build grid
    function blank() { return V.map(function () { var a = []; for (var q = 0; q < nCols; q++) a.push(null); return a; }); }
    var C = blank(), R = blank(), FC = blank(), FR = blank();
    rows.forEach(function (r) {
      var G = r.part === 'C' ? C : R, F = r.part === 'C' ? FC : FR;
      for (var q = 0; q < nCols; q++) F[r.vi][q] = true; // flagged until a good value lands
      var used = {};
      r.cs.forEach(function (c) {
        if (c.cd > colW * 0.45) return;
        if (used[c.col]) { F[r.vi][c.col] = true; return; }
        used[c.col] = 1;
        if (c.val === null) return;
        G[r.vi][c.col] = c.val;
        F[r.vi][c.col] = c.k.conf < 60 || r.guessed;
      });
    });
    var res = { n: nCols, C: C, R: R, FC: FC, FR: FR };
    check(res);
    return res;
  }

  // sanity checks: sign, rising with speed, smooth across speeds
  function check(res) {
    var n = res.n;
    // the 0.00 row is shared: fill each side from the other
    for (var q = 0; q < n; q++) {
      var a = res.C[0][q], b = res.R[0][q];
      if (a == null && b != null) { res.C[0][q] = b; res.FC[0][q] = res.FR[0][q]; }
      if (b == null && a != null) { res.R[0][q] = a; res.FR[0][q] = res.FC[0][q]; }
    }
    ['C', 'R'].forEach(function (p) {
      var G = res[p], F = res['F' + p], sgn = p === 'C' ? 1 : -1;
      for (q = 0; q < n; q++) {
        for (var i = 1; i < V.length; i++) {
          var v = G[i][q]; if (v == null) continue;
          if (p === 'R' && v > 0) { G[i][q] = -v; F[i][q] = true; v = -v; }
          var prev = null, next = null;
          for (var k = i - 1; k >= 1; k--) if (G[k][q] != null) { prev = G[k][q]; break; }
          for (k = i + 1; k < V.length; k++) if (G[k][q] != null) { next = G[k][q]; break; }
          if (prev != null && sgn * (v - prev) < -Math.max(3, Math.abs(prev) * 0.08)) F[i][q] = true;
          if (next != null && sgn * (next - v) < -Math.max(3, Math.abs(v) * 0.08)) F[i][q] = true;
          if (prev != null && next != null) {
            var mid = (prev + next) / 2, span = Math.abs(next - prev) + 6;
            if (Math.abs(v - mid) > span) F[i][q] = true;
          }
        }
      }
    });
    // across clicks each row should change smoothly; flag a value that jumps away from both neighbours
    ['C', 'R'].forEach(function (p) {
      var G = res[p], F = res['F' + p];
      for (var i = 0; i < V.length; i++) for (var q = 0; q < n; q++) {
        var v = G[i][q]; if (v == null) continue;
        var l = q > 0 ? G[i][q - 1] : null, r = q < n - 1 ? G[i][q + 1] : null;
        var tol = Math.max(6, Math.abs(v) * 0.15);
        if (l != null && r != null) { if (Math.abs(v - (l + r) / 2) > tol + Math.abs(r - l) / 2) F[i][q] = true; }
        else if (l != null || r != null) {
          var nb = l != null ? l : r, nb2 = l != null ? (q > 1 ? G[i][q - 2] : null) : (q < n - 2 ? G[i][q + 2] : null);
          var ex = nb2 != null ? 2 * nb - nb2 : nb;
          if (Math.abs(v - ex) > tol * 1.5) F[i][q] = true;
        }
      }
    });
    return res;
  }

  // plain text (e.g. iPhone Live Text): lines that start with a speed label
  function parseText(txt, opts) {
    var words = [], y = 0;
    String(txt).split(/\r?\n/).forEach(function (line) {
      var parts = line.replace(/[−–—]/g, '-').trim().split(/\s+/).filter(Boolean);
      var x = 0;
      parts.forEach(function (p) { words.push({ text: p, conf: 95, x0: x, x1: x + 10, y0: y, y1: y + 10 }); x += 20; });
      y += 30;
    });
    // In pasted text the columns are evenly spaced tokens, so pin columns by order.
    var rows = [], cur = null, blockStart = [], lastSpeed = -1;
    String(txt).split(/\r?\n/).forEach(function (line) {
      var parts = line.replace(/[−–—]/g, '-').trim().split(/\s+/).map(clean).filter(Boolean);
      if (!parts.length) return;
      var sp = speedOf(parts[0]);
      if (sp !== null) {
        if (sp <= lastSpeed - 1) blockStart.push(rows.length);
        lastSpeed = sp; cur = { v: sp, nums: [] }; rows.push(cur); parts = parts.slice(1);
      }
      if (!cur) return;
      parts.forEach(function (p) { var iv = intOf(p); if (iv !== null) cur.nums.push(iv); });
    });
    if (!rows.length) return null;
    var cuts = blockStart.length ? blockStart[0] : rows.length;
    var counts = {}; rows.forEach(function (r) { if (r.nums.length) counts[r.nums.length] = (counts[r.nums.length] || 0) + 1; });
    var n = (opts && opts.runs) || +Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || b - a; })[0] || 12;
    n = Math.min(12, n);
    function blank(f) { return V.map(function () { var a = []; for (var q = 0; q < n; q++) a.push(f); return a; }); }
    var res = { n: n, C: blank(null), R: blank(null), FC: blank(false), FR: blank(false) };
    var seen = { C: {}, R: {} };
    rows.forEach(function (r, ri) {
      var p = ri < cuts ? 'C' : 'R'; if (!blockStart.length && seen.C[V.indexOf(r.v)]) p = 'R';
      var vi = V.indexOf(r.v); seen[p][vi] = 1;
      for (var q = 0; q < n; q++) { res[p][vi][q] = q < r.nums.length ? r.nums[q] : null; res['F' + p][vi][q] = r.nums.length !== n; }
    });
    return check(res);
  }

  // combine two readings of the same photo: agreement = confident, disagreement = flagged
  function score(r) {
    if (!r) return -1; var s = 0;
    ['C', 'R'].forEach(function (p) { for (var i = 1; i < V.length; i++) for (var q = 0; q < r.n; q++) if (r[p][i][q] != null) s += r['F' + p][i][q] ? 0.3 : 1; });
    return s;
  }
  // combine two readings of the same photo: the better one leads, the other fills gaps and confirms
  function merge(a, b) {
    if (!a) return b; if (!b) return a;
    if (score(b) > score(a)) { var t = a; a = b; b = t; }
    var n = a.n;
    var out = { n: n, C: [], R: [], FC: [], FR: [] };
    ['C', 'R'].forEach(function (p) {
      for (var i = 0; i < V.length; i++) {
        out[p].push([]); out['F' + p].push([]);
        for (var q = 0; q < n; q++) {
          var va = a[p][i][q], fa = a['F' + p][i][q], vb = q < b.n ? b[p][i][q] : null;
          var v = va, f = fa;
          if (va == null && vb != null) { v = vb; f = true; }
          else if (va != null && vb != null) { if (va === vb) f = false; else f = true; }
          out[p][i].push(v); out['F' + p][i].push(f);
        }
      }
    });
    return check(out);
  }

  var api = { V: V, parseWords: parseWords, parseText: parseText, check: check, merge: merge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ShockParse = api;
})(this);
