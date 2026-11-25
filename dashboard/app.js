// Token Radar dashboard: renders window.RADAR, filters, sorts and shows a
// detail view with the farm steps. Farm steps live in board.json (one level
// up from this page); the page fetches them when served over HTTP and
// rebuilds the same six steps from the protocol's data when opened from disk.
(function () {
  'use strict';
  var DATA = window.RADAR || { rows: [] };
  var rows = DATA.rows || [];
  var boardBySlug = null;

  var $ = function (id) { return document.getElementById(id); };
  var qEl = $('q'), catEl = $('category'), chainEl = $('chain'), sortEl = $('sort'), wlEl = $('watchlist');

  function fmtUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + n;
  }
  function fmtPct(n) {
    if (n === null || n === undefined) return '—';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : '';
    var sign = n > 0 ? '+' : '';
    return '<span class="' + cls + '">' + sign + n.toFixed(1) + '%</span>';
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Fill the filter dropdowns from the data.
  var cats = {}, chains = {};
  rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    (r.chains || []).forEach(function (c) { chains[c] = 1; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    catEl.add(new Option(c, c));
  });
  Object.keys(chains).sort().forEach(function (c) {
    chainEl.add(new Option(c, c));
  });

  var totalImplied = rows.reduce(function (n, r) { return n + (r.implied_value_usd || 0); }, 0);
  $('meta').innerHTML =
    '<b>' + rows.length + '</b> protocols ranked<br>' +
    '<b>' + fmtUsd(totalImplied) + '</b> total implied value<br>' +
    'Snapshot ' + esc(DATA.as_of || '') + ' · DefiLlama';

  function currentFilters() {
    return {
      q: qEl.value.trim().toLowerCase(),
      category: catEl.value,
      chain: chainEl.value,
      sort: sortEl.value,
      watchlist: wlEl.checked,
    };
  }

  function filtered() {
    var f = currentFilters();
    var out = rows.filter(function (r) {
      if (f.q && (r.name + ' ' + r.slug).toLowerCase().indexOf(f.q) === -1) return false;
      if (f.category && r.category !== f.category) return false;
      if (f.chain && (r.chains || []).indexOf(f.chain) === -1) return false;
      return true;
    });
    if (f.watchlist) out = out.filter(function (r) { return WATCHLIST.has(r.slug); });
    var sorters = {
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return b.age_days - a.age_days; },
    };
    out.sort(sorters[f.sort] || sorters.implied);
    return out;
  }

  // The watchlist slugs are embedded by the build in a tiny lookup the page
  // carries, so "watchlist only" works without the snapshot.
  var WATCHLIST = new Set(window.RADAR_WATCHLIST || []);

  function render() {
    var list = filtered();
    $('count').textContent = list.length + ' of ' + rows.length + ' protocols shown';
    $('empty').hidden = list.length > 0;
    $('rows').innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' +
        (WATCHLIST.has(r.slug) ? '<span class="tag">watchlist</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="chains">' + esc((r.chains || []).slice(0, 3).join(', ')) + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td>' +
        '</tr>';
    }).join('');
  }

  function loadBoard() {
    if (boardBySlug) return Promise.resolve(boardBySlug);
    return fetch('../board.json').then(function (res) { return res.json(); }).then(function (b) {
      var map = {};
      (b.rows || []).forEach(function (r) { map[r.slug] = r; });
      boardBySlug = map;
      return map;
    }).catch(function () { return {}; });
  }

  // The same six-step farm plan the model writes into board.json, rebuilt
  // here so the detail view works even when the page is opened from disk
  // and the board.json fetch is unavailable.
  function depositVerb(category) {
    if (category === 'Dexs' || category === 'Basis Trading') return 'trade';
    if (category === 'CDP' || category === 'Collateral Markets') return 'borrow against collateral';
    if (category === 'RWA') return 'hold a tokenized position';
    return 'deposit';
  }
  function buildSteps(r) {
    var name = r.name;
    var chain = (r.chains && r.chains[0]) || 'its main chain';
    var verb = depositVerb(r.category);
    var open = verb === 'deposit' ? 'Deposit' : verb === 'trade' ? 'Trade' : verb === 'borrow against collateral' ? 'Borrow' : 'Open';
    return [
      'Open a fresh wallet that holds only the funds you plan to farm with ' + name + ', and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.',
      open + ' $150 into ' + name + ' on ' + chain + ' and keep the position open. Cost: $150 of capital and about $8 of gas. Time: 15 minutes to set up.',
      'Do one qualifying action each week on ' + name + ', such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.',
      'Hold the position for at least 30 days so the activity is counted in more than one snapshot. Cost: the $150 stays in the position. Time: 30 days.',
      'Before you withdraw, open ' + name + '\'s own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.',
      'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.'
    ];
  }

  function showDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    var box = $('detail');
    if (!r) { box.hidden = true; return; }
    document.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.classList.toggle('active', tr.getAttribute('data-slug') === slug);
    });
    box.hidden = false;
    box.innerHTML = '<button class="close" id="close-detail">Close</button>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<div class="stats">' +
      '<span>Implied value<b>' + fmtUsd(r.implied_value_usd) + '</b></span>' +
      '<span>TVL<b>' + fmtUsd(r.tvl_usd) + '</b></span>' +
      '<span>7-day change<b>' + (r.change_7d === null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</b></span>' +
      '<span>Age<b>' + r.age_days + ' days</b></span>' +
      '<span>Chains<b>' + esc((r.chains || []).join(', ')) + '</b></span>' +
      '</div><p>How to farm it:</p><ol id="steps"><li>Loading the farm plan…</li></ol>';
    $('close-detail').addEventListener('click', function () {
      box.hidden = true;
      history.replaceState(null, '', location.pathname + location.search);
    });
    loadBoard().then(function (map) {
      var full = map[slug];
      var steps = full && full.farm_steps ? full.farm_steps : buildSteps(r);
      var ol = $('steps');
      if (!ol) return;
      ol.innerHTML = steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    });
  }

  // Hash state, so the board, a detail view and a filtered view each have a
  // link: #/detail/<slug> and #/filter/category=<name> (or chain=<name>).
  function applyHash() {
    var h = location.hash || '';
    var m = h.match(/^#\/detail\/([A-Za-z0-9._-]+)$/);
    if (m) { showDetail(m[1]); return; }
    var f = h.match(/^#\/filter\/(category|chain)=(.+)$/);
    if (f) {
      var v = decodeURIComponent(f[2]);
      if (f[1] === 'category') catEl.value = v;
      if (f[1] === 'chain') chainEl.value = v;
    }
  }

  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (!tr) return;
    history.replaceState(null, '', '#/detail/' + tr.getAttribute('data-slug'));
    showDetail(tr.getAttribute('data-slug'));
    $('detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  [qEl, catEl, chainEl, sortEl, wlEl].forEach(function (el) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
  window.addEventListener('hashchange', function () { applyHash(); render(); });

  applyHash();
  render();
})();
