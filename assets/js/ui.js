/* ============================================================
   CYBER RANGE: RED vs BLUE
   ui.js — everything that draws on the screen.
   Each side only ever sees what that side could really know.
   ============================================================ */
(function (global) {
  'use strict';

  var CG = global.CG || (global.CG = {});
  var D = CG.DATA;
  var E = CG.Engine;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function pct(n) { return Math.round(n * 100); }

  /* ------------------------------------------------------------
     WHAT CAN THIS PLAYER SEE?
     The red team cannot see defences on machines it has not
     scanned. The blue team cannot see the attacker until it has
     confirmed an alert or found them by hunting. This is the
     whole point of the game, so the UI enforces it.
  ------------------------------------------------------------ */
  function seeAttacker(state, id) {
    if (state.phase === 'over') return true;
    if (state.playerRole === 'red') return true;
    return !!state.nodes[id].knownCompromised;
  }
  function seeDefences(state, id) {
    if (state.phase === 'over') return true;
    if (state.playerRole === 'blue') return true;
    return !!state.red.scanned[id] || state.nodes[id].access !== 'none';
  }

  /* ============================================================
     HUD
     ============================================================ */
  function renderHud(state) {
    el('hud-turn').textContent = 'Turn ' + state.turn + ' / ' + state.maxTurns;
    var ph = el('hud-phase');
    var isRed = state.phase === 'red';
    ph.className = 'hud-phase ' + (isRed ? 'is-red' : 'is-blue');
    ph.textContent = state.phase === 'over' ? 'COMPLETE' : (isRed ? 'RED PHASE' : 'BLUE PHASE');

    function meter(fillId, valId, v) {
      var f = el(fillId);
      f.style.width = v + '%';
      f.className = 'meter-fill ' + (v > 60 ? 'safe' : v > 30 ? 'warn' : 'danger');
      el(valId).textContent = v;
    }
    meter('m-data', 'm-data-v', state.meters.dataSafety);
    meter('m-up', 'm-up-v', state.meters.uptime);
  }

  /* ============================================================
     TURN BANNER + ACTION POINTS
     ============================================================ */
  function renderBanner(state, armed, busy) {
    var mine = state.phase === state.playerRole;
    var b = el('turn-banner');
    b.className = 'turn-banner ' + (state.phase === 'red' ? 'is-red' : 'is-blue');

    var who = el('banner-who'), sub = el('banner-sub');
    if (state.phase === 'over') {
      who.textContent = 'Simulation complete';
      sub.textContent = 'Opening your debrief…';
    } else if (busy || !mine) {
      who.textContent = (state.phase === 'red' ? 'Red team' : 'Blue team') + ' is thinking…';
      sub.textContent = 'Watch the live feed — it explains every decision.';
    } else if (armed) {
      who.textContent = 'Choose a target';
      sub.textContent = armed.action.name + ' — click a highlighted machine on the map. ' +
        'Press Escape to cancel.';
    } else {
      who.textContent = 'Your move';
      sub.textContent = state.playerRole === 'red'
        ? 'Spend action points on your playbook below.'
        : 'Triage alerts, respond, and build defences.';
    }

    var r = state.phase === 'red' ? state.red : state.blue;
    var pips = '';
    for (var i = 0; i < r.apMax; i++) {
      pips += '<i class="ap-pip ' + (i < r.ap ? 'on ' + state.phase : '') + '"></i>';
    }
    el('ap-pips').innerHTML = pips;

    var end = el('btn-end');
    end.disabled = !mine || state.phase === 'over' || busy;
    end.textContent = r.ap > 0 && mine ? 'End turn (' + r.ap + ' AP left)' : 'End turn';
  }

  /* ============================================================
     NETWORK MAP
     ============================================================ */
  function renderMap(state, armed) {
    var map = el('map');
    var svg = el('map-svg');

    /* links */
    var lines = '';
    D.LINKS.forEach(function (l) {
      var a = E.nodeDef(l[0]), b = E.nodeDef(l[1]);
      var hot = seeAttacker(state, l[0]) && seeAttacker(state, l[1]) &&
                state.nodes[l[0]].access !== 'none' && state.nodes[l[1]].access !== 'none';
      lines += '<line class="map-link' + (hot ? ' is-hot' : '') + '" x1="' + a.x + '" y1="' + a.y +
               '" x2="' + b.x + '" y2="' + b.y + '" vector-effect="non-scaling-stroke"/>';
    });
    svg.innerHTML = lines;

    /* nodes */
    Array.prototype.slice.call(map.querySelectorAll('.node')).forEach(function (n) { n.remove(); });

    var targetable = {};
    if (armed && armed.action.target !== 'none' && armed.action.target !== 'alert') {
      armed.option.targets.forEach(function (t) { targetable[t] = true; });
    }
    map.classList.toggle('is-targeting', !!Object.keys(targetable).length);

    D.NODES.forEach(function (def) {
      var n = state.nodes[def.id];
      var btn = document.createElement('button');
      var cls = ['node'];
      if (def.crown) cls.push('is-crown');
      if (def.objective) cls.push('is-objective');

      var showAtk = seeAttacker(state, def.id);
      var showDef = seeDefences(state, def.id);

      if (showAtk && n.access === 'admin' && def.id !== 'internet') cls.push('owned-admin');
      else if (showAtk && n.access === 'user') cls.push('owned-user');
      if (def.id === 'internet' && state.playerRole === 'red') cls.push('owned-admin');
      if (state.playerRole === 'blue' && n.knownCompromised) cls.push('is-known');
      if (n.isolated) cls.push('is-isolated');
      if (n.encrypted) cls.push('is-encrypted');
      if (targetable[def.id]) cls.push('is-targetable');

      btn.className = cls.join(' ');
      btn.style.left = def.x + '%';
      btn.style.top = def.y + '%';
      btn.dataset.node = def.id;

      /* defence chips */
      var chips = '';
      if (showDef) {
        if (n.edr) chips += '<span class="node-chip edr">EDR</span>';
        if (n.segmented) chips += '<span class="node-chip seg">SEG</span>';
        if (n.patch > 0) chips += '<span class="node-chip pat">P' + n.patch + '</span>';
      }

      /* status badge */
      var badge = '';
      if (n.isolated) badge = '<span class="node-badge" style="background:var(--violet);color:#120a22">ISOLATED</span>';
      else if (n.encrypted) badge = '<span class="node-badge" style="background:var(--violet);color:#120a22">ENCRYPTED</span>';
      else if (showAtk && n.persistence) badge = '<span class="node-badge" style="background:var(--red);color:#fff">BACKDOOR</span>';
      else if (showAtk && n.access === 'admin' && def.id !== 'internet') badge = '<span class="node-badge" style="background:var(--red);color:#fff">ADMIN</span>';
      else if (showAtk && n.access === 'user') badge = '<span class="node-badge" style="background:var(--red);color:#fff">USER</span>';
      else if (state.playerRole === 'blue' && n.knownCompromised) badge = '<span class="node-badge" style="background:var(--amber);color:#1a1000">SUSPECT</span>';
      else if (def.objective) badge = '<span class="node-badge" style="background:var(--amber);color:#1a1000">TARGET</span>';

      /* odds, shown while picking a target */
      var odds = '';
      if (targetable[def.id] && state.playerRole === 'red') {
        var p = E.redChance(state, armed.action, def.id);
        odds = '<span class="node-odds ' + (p >= 0.66 ? '' : p >= 0.4 ? 'mid' : 'low') + '">' +
               pct(p) + '%</span>';
      }

      btn.innerHTML =
        '<span class="node-chips">' + chips + '</span>' +
        '<span class="node-icon">' + def.icon + '</span>' +
        '<span class="node-name">' + esc(def.short) + '</span>' +
        badge + odds;
      btn.setAttribute('aria-label', def.name);
      btn.title = def.name;
      map.appendChild(btn);
    });

    el('map-hint').textContent = Object.keys(targetable).length
      ? 'Click a glowing machine to act on it'
      : 'Click any machine to inspect it';
  }

  /* ============================================================
     PLAYBOOK (action cards)
     ============================================================ */
  function costPips(n) {
    var s = '';
    for (var i = 0; i < Math.max(1, n); i++) s += '<i></i>';
    return n === 0 ? '<i style="background:var(--green)"></i>' : s;
  }
  function noiseBar(n) {
    var s = '';
    for (var i = 0; i < 5; i++) s += '<i class="' + (i < n ? 'on' : '') + '"></i>';
    return s;
  }

  function renderActions(state, armed, busy) {
    var body = el('actions-body');
    var isRed = state.playerRole === 'red';
    el('actions-title').textContent = isRed ? 'Attack Playbook' : 'Defence Playbook';

    var mine = state.phase === state.playerRole && !busy && state.phase !== 'over';
    var opts = isRed ? E.redOptions(state) : E.blueOptions(state);

    var groups = [], seen = {};
    opts.forEach(function (o) {
      var g = o.action.phase;
      if (!seen[g]) { seen[g] = []; groups.push(g); }
      seen[g].push(o);
    });

    var html = '';
    groups.forEach(function (g) {
      html += '<div class="phase-group">' + esc(g) + '</div>';
      seen[g].forEach(function (o) {
        var a = o.action;
        var locked = !o.available || !mine;
        var isArmed = armed && armed.action.id === a.id;
        html += '<div class="card ' + (locked ? 'is-locked' : '') + (isArmed ? ' is-armed' : '') +
                '" data-action="' + a.id + '" role="button" tabindex="' + (locked ? -1 : 0) + '">' +
          '<div class="card-top">' +
            '<span class="card-name">' + esc(a.name) + '</span>' +
            (a.mitre ? '<span class="card-mitre">' + esc(a.mitre) + '</span>'
                     : '<span class="card-mitre">' + esc(a.nist) + '</span>') +
            '<span class="card-cost" title="Action point cost">' + costPips(a.cost) + '</span>' +
          '</div>' +
          '<div class="card-blurb">' + esc(a.blurb) + '</div>' +
          (isRed ? '<span class="card-noise">NOISE <span class="noise-bar">' +
                   noiseBar(a.noise) + '</span></span>' : '') +
          (o.reason ? '<div class="card-why">' + esc(o.reason) + '</div>' : '') +
          '<button class="info-btn" data-teach="' + a.id + '" title="What is this really?" ' +
          'aria-label="Explain ' + esc(a.name) + '">i</button>' +
        '</div>';
      });
    });
    body.innerHTML = html;
  }

  /* ============================================================
     RIGHT-HAND QUEUE PANEL
     red  -> intel + kill chain
     blue -> alert queue + posture
     ============================================================ */
  function renderQueue(state, armed, busy) {
    var isRed = state.playerRole === 'red';
    el('queue-title').textContent = isRed ? 'Mission Status' : 'Alert Queue';
    var body = el('queue-body');

    if (isRed) { el('queue-hint').textContent = 'What you know so far'; body.innerHTML = redIntel(state); }
    else { body.innerHTML = blueQueue(state, armed, busy); }
  }

  function redIntel(state) {
    var holds = E.footholds(state);
    var path = E.pathToTarget(state, 'db');
    var pers = Object.keys(state.nodes).filter(function (k) { return state.nodes[k].persistence; });

    function row(k, v, off) {
      return '<div class="intel-row"><span class="intel-k">' + k + '</span>' +
             '<span class="intel-v' + (off ? ' off' : '') + '">' + v + '</span></div>';
    }
    var html = '<div class="intel-grid">';
    html += row('Recon', state.red.osintDone ? 'Target profiled' : 'Not started', !state.red.osintDone);
    html += row('Footholds', holds.length
      ? holds.map(function (id) {
          return esc(E.nodeDef(id).short) + ' (' + state.nodes[id].access + ')';
        }).join(', ')
      : 'None — you are still outside', !holds.length);
    html += row('Backdoors', pers.length
      ? pers.map(function (id) { return esc(E.nodeDef(id).short); }).join(', ')
      : 'None — one reboot could end your access', !pers.length);
    html += row('Stolen keys', state.red.stolenCreds.length
      ? state.red.stolenCreds.map(function (id) { return esc(E.nodeDef(id).short); }).join(', ') +
        (state.red.credsFromDc ? ' — DOMAIN ADMIN' : '')
      : 'None — you cannot move sideways yet', !state.red.stolenCreds.length);
    html += row('Route to target', path
      ? path.filter(function (p) { return p !== 'internet'; })
            .map(function (p) { return esc(E.nodeDef(p).short); }).join(' → ')
      : 'Blocked — no path to the database', !path);
    html += row('Alarms tripped', state.stats.detected + ' detected / ' +
      state.stats.undetected + ' slipped through', false);
    html += '</div>';

    var sc = E.score(state);
    html += '<div class="phase-group" style="margin-top:14px">Kill chain</div><div class="steps">';
    sc.stages.forEach(function (st) {
      html += '<div class="step ' + (st.done ? 'done' : '') + '">' +
              '<span class="box">' + (st.done ? '✓' : '') + '</span>' + esc(st.k) + '</div>';
    });
    html += '</div>';
    return html;
  }

  function blueQueue(state, armed, busy) {
    var b = state.blue;
    var edrCount = Object.keys(state.nodes).filter(function (k) { return state.nodes[k].edr; }).length;
    var segCount = Object.keys(state.nodes).filter(function (k) { return state.nodes[k].segmented; }).length;

    var html = '<div class="chips" style="margin-bottom:12px">' +
      '<span class="chip ' + (b.mfa ? 'on' : 'bad') + '">MFA ' + (b.mfa ? 'ON' : 'OFF') + '</span>' +
      '<span class="chip ' + (b.siem ? 'on' : 'bad') + '">SIEM ' + (b.siem ? 'ON' : 'OFF') + '</span>' +
      '<span class="chip ' + (b.training ? 'on' : 'bad') + '">Training ' + b.training + '/2</span>' +
      '<span class="chip ' + (edrCount ? 'on' : 'bad') + '">EDR ×' + edrCount + '</span>' +
      '<span class="chip ' + (segCount ? 'on' : '') + '">Segments ×' + segCount + '</span>' +
      '<span class="chip ' + (b.backupsIntact ? 'on' : 'bad') + '">Backups ' +
        (b.backupsIntact ? 'OK' : 'DESTROYED') + '</span>' +
      (b.c2BlockedUntil >= state.turn
        ? '<span class="chip warn">C2 blocked ' + (b.c2BlockedUntil - state.turn + 1) + 't</span>' : '') +
      '</div>';

    var picking = armed && armed.action.target === 'alert' && !busy;
    el('queue-hint').textContent = picking ? 'Click an alert to investigate it'
                                           : 'Not every alarm is a fire';

    var open = state.alerts.filter(function (a) { return a.status === 'new'; });
    var closed = state.alerts.filter(function (a) { return a.status !== 'new'; }).slice(-5);

    if (!state.alerts.length) {
      html += '<p class="empty">No alerts yet. Quiet is not the same as safe — try a threat hunt.</p>';
    }
    if (open.length) {
      html += open.slice().reverse().map(function (a) { return alertRow(a, picking); }).join('');
    } else if (state.alerts.length) {
      html += '<p class="empty">No new alerts. Queue is clear.</p>';
    }
    if (closed.length) {
      html += '<div class="phase-group" style="margin-top:12px">Recently closed</div>';
      html += closed.slice().reverse().map(function (a) { return alertRow(a, false); }).join('');
    }
    return html;
  }

  function alertRow(a, picking) {
    var st = {
      confirmed: '<span class="tag high">TRUE POSITIVE</span>',
      dismissed: '<span class="tag ok">FALSE ALARM</span>',
      stale: '<span class="tag low">EXPIRED — never checked</span>',
      erased: '<span class="tag low">LOG DELETED</span>',
      'new': '<span class="tag ' + a.confidence + '">' + a.confidence.toUpperCase() + ' CONFIDENCE</span>'
    }[a.status] || '';

    var tech = '';
    if (a.status === 'confirmed' && a.actionId) {
      var ra = E.redAction(a.actionId);
      if (ra) tech = '<div class="alert-text" style="color:var(--red)">→ ' + esc(ra.name) +
                     ' [' + esc(ra.mitre) + ' · ' + esc(ra.tactic) + ']</div>';
    }

    return '<div class="alert-row conf-' + a.confidence + ' st-' + a.status +
      (picking && a.status === 'new' ? ' is-pickable' : '') + '"' +
      (picking && a.status === 'new' ? ' data-alert="' + a.id + '" role="button" tabindex="0"' : '') + '>' +
      '<div class="alert-top"><span>#' + a.id + '</span><span>T' + a.turn + '</span>' + st + '</div>' +
      '<div class="alert-where">' + esc(a.where) + '</div>' +
      '<div class="alert-text">' + esc(a.text) + '</div>' + tech +
      '</div>';
  }

  /* ============================================================
     LIVE FEED
     ============================================================ */
  function renderLog(state) {
    var box = el('log');
    box.innerHTML = state.log.map(function (l) {
      return '<p class="l-' + l.kind + '">' + esc(l.text) + '</p>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  /* ============================================================
     NODE INSPECTOR
     ============================================================ */
  function openInspector(state, id) {
    var def = E.nodeDef(id), n = state.nodes[id];
    el('insp-icon').textContent = def.icon;
    el('insp-name').textContent = def.name;
    el('insp-kind').textContent = (def.kind || 'host').toUpperCase() +
      (def.crown ? ' · CRITICAL' : '') + (def.objective ? ' · OBJECTIVE' : '');

    var showAtk = seeAttacker(state, id), showDef = seeDefences(state, id);
    var html = '';

    html += '<div class="kv"><h4>What it is</h4><p>' + esc(def.desc) + '</p></div>';

    /* status chips */
    var chips = [];
    if (showAtk) {
      chips.push(n.access === 'none'
        ? '<span class="chip on">No attacker access</span>'
        : '<span class="chip bad">Attacker: ' + n.access.toUpperCase() + '</span>');
      if (n.persistence) chips.push('<span class="chip bad">Backdoor installed</span>');
      if (n.dataFound) chips.push('<span class="chip warn">Sensitive data located</span>');
    } else {
      chips.push(n.knownCompromised
        ? '<span class="chip bad">Confirmed threat here</span>'
        : '<span class="chip">Attacker status unknown</span>');
    }
    if (n.isolated) chips.push('<span class="chip warn">Isolated from network</span>');
    if (n.encrypted) chips.push('<span class="chip bad">Encrypted by ransomware</span>');
    if (showDef) {
      chips.push('<span class="chip ' + (n.patch ? 'on' : '') + '">Patch level ' + n.patch +
                 '/' + E.MAX_PATCH + '</span>');
      chips.push('<span class="chip ' + (n.edr ? 'on' : '') + '">EDR ' + (n.edr ? 'on' : 'off') + '</span>');
      chips.push('<span class="chip ' + (n.segmented ? 'on' : '') + '">' +
                 (n.segmented ? 'Segmented' : 'Flat network') + '</span>');
      if (state.playerRole === 'blue') {
        chips.push('<span class="chip">Visibility ' + E.visibility(state, id) + '/5</span>');
      }
    } else {
      chips.push('<span class="chip">Defences unknown — scan it</span>');
    }
    html += '<div class="kv"><h4>Status</h4><div class="chips">' + chips.join('') + '</div></div>';

    if (showDef && def.services) {
      html += '<div class="kv"><h4>Services running</h4><ul><li>' +
              def.services.map(esc).join('</li><li>') + '</li></ul></div>';
    }

    if (showDef) {
      var vs = E.unpatchedVulns(state, id);
      if (vs.length) {
        html += '<div class="kv"><h4>Known weaknesses</h4><ul>' + vs.map(function (v) {
          return '<li><strong style="color:var(--red)">' + esc(v.name) + '</strong> — ' +
                 esc(v.ref) + ' (' + esc(v.severity) + ')</li>';
        }).join('') + '</ul></div>';
      } else if (def.vulns && def.vulns.length) {
        html += '<div class="kv"><h4>Known weaknesses</h4><p style="color:var(--green)">' +
                'Patched — nothing known left to exploit.</p></div>';
      }
    }

    html += '<div class="kv"><h4>Neighbours (where an attacker could hop next)</h4><p>' +
      E.adjacency[id].map(function (k) { return esc(E.nodeDef(k).short); }).join(' · ') +
      '</p></div>';

    html += '<div class="teach-block real"><h5>Why this matters in the real world</h5><p>' +
      esc(def.realWorld) + '</p></div>';

    el('insp-body').innerHTML = html;
    el('inspector').classList.add('is-open');
    el('inspector').setAttribute('aria-hidden', 'false');
  }
  function closeInspector() {
    el('inspector').classList.remove('is-open');
    el('inspector').setAttribute('aria-hidden', 'true');
  }

  /* ============================================================
     MODAL
     ============================================================ */
  function showModal(title, bodyHtml) {
    el('modal-mount').innerHTML =
      '<div class="modal-back" data-close-modal><div class="modal" role="dialog" ' +
      'aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="modal-head"><h3>' + esc(title) + '</h3>' +
        '<button class="drawer-close" data-close-modal aria-label="Close">&times;</button></div>' +
        '<div class="modal-body">' + bodyHtml + '</div>' +
      '</div></div>';
  }
  function closeModal() { el('modal-mount').innerHTML = ''; }

  function teachModal(side, actionId) {
    var a = side === 'red' ? E.redAction(actionId) : E.blueAction(actionId);
    if (!a) return;
    var head = side === 'red'
      ? 'MITRE ATT&CK ' + esc(a.mitre) + ' · ' + esc(a.tactic)
      : 'NIST Cybersecurity Framework · ' + esc(a.nist);
    showModal(a.name,
      '<p style="font-family:var(--mono);font-size:12px;color:var(--dim);letter-spacing:.1em;' +
      'text-transform:uppercase">' + head + '</p>' +
      '<div class="teach-block"><h5>What it actually is</h5><p>' + esc(a.teach.what) + '</p></div>' +
      '<div class="teach-block real"><h5>In the real world</h5><p>' + esc(a.teach.real) + '</p></div>' +
      '<div class="teach-block defend"><h5>' +
        (side === 'red' ? 'How defenders stop it' : 'What it buys you') +
      '</h5><p>' + esc(a.teach.defend) + '</p></div>' +
      '<p style="margin-top:14px;font-size:13px;color:var(--dim)">Cost: ' + a.cost +
      ' action point' + (a.cost === 1 ? '' : 's') +
      (side === 'red' ? ' · Noise: ' + a.noise + '/5' : '') + '</p>');
  }

  function glossaryModal() {
    showModal('Glossary', '<p>The words professionals actually use. Every one of these appears ' +
      'somewhere in the game.</p><dl class="gloss">' +
      D.GLOSSARY.map(function (g) {
        return '<div class="gloss-row"><dt>' + esc(g[0]) + '</dt><dd>' + esc(g[1]) + '</dd></div>';
      }).join('') + '</dl>');
  }

  function howToModal(role) {
    var common =
      '<h4>The idea</h4>' +
      '<p>Attacks are a <strong>chain</strong>: research, break in, dig in, spread out, steal. ' +
      'The defender does not need to stop every step — just break the chain once, in time.</p>' +
      '<h4>Taking a turn</h4>' +
      '<ol>' +
        '<li>Each turn you get <strong>action points</strong>. Every move costs one or two.</li>' +
        '<li>Click an action in your playbook, then click a glowing machine on the map.</li>' +
        '<li>Press the <strong>ⓘ</strong> on any card to learn what the technique really is.</li>' +
        '<li>Click <strong>End turn</strong> when you are done. The other side then moves.</li>' +
      '</ol>' +
      '<h4>The two meters</h4>' +
      '<p><strong>Data Safety</strong> falls as the attacker reaches, ruins or steals data. ' +
      '<strong>School Uptime</strong> falls when machines are offline, encrypted, or taken off ' +
      'the network by the defender. If either hits zero, the red team wins — because security ' +
      'that stops the school working is not a win either.</p>';

    var red =
      '<h4>Playing red</h4>' +
      '<p>Your goal: find the Student Records Database, confirm the data, and exfiltrate it ' +
      'before the clock runs out.</p>' +
      '<ul>' +
        '<li>Start with <strong>OSINT</strong> and a <strong>scan</strong>. Attacking blind wastes turns.</li>' +
        '<li>You cannot reach the database from the internet. You have to hop machine to machine.</li>' +
        '<li>Every action has a <strong>noise</strong> rating. Noisy actions on well-monitored ' +
            'machines raise alerts.</li>' +
        '<li>Install a <strong>backdoor</strong> early. Without it, one isolation ends your game.</li>' +
        '<li>You cannot see the defender\'s EDR or patches on a machine until you scan it.</li>' +
      '</ul>';

    var blue =
      '<h4>Playing blue</h4>' +
      '<p>Your goal: survive the incident window with the database still inside — or evict the ' +
      'attacker completely and close the door behind them.</p>' +
      '<ul>' +
        '<li>You <strong>cannot see the attacker</strong> until you confirm an alert or find them ' +
            'by hunting. The map only shows what you have proved.</li>' +
        '<li>Many alerts are <strong>false alarms</strong>. Investigating costs a point, and not ' +
            'investigating costs you the game.</li>' +
        '<li><strong>Isolate</strong> stops them instantly but drains uptime every turn.</li>' +
        '<li><strong>Rebuild</strong> is the only thing that removes a hidden backdoor. ' +
            'Reconnecting a machine you never rebuilt hands their access straight back.</li>' +
        '<li>Alerts you ignore for two turns <strong>expire</strong> — that is alert fatigue.</li>' +
      '</ul>';

    showModal('How to play', common + (role === 'blue' ? blue : red) +
      '<h4>Everything here is fictional</h4>' +
      '<p>The school, the staff, the software and the CVE numbers are invented. This simulator ' +
      'teaches the <em>shape</em> of an attack and the defences that break it. It contains no ' +
      'real exploit code.</p>');
  }

  /* ============================================================
     COACH BUBBLE
     ============================================================ */
  var coachTimer = null;
  function coach(opts) {
    var m = el('coach-mount');
    m.innerHTML = '<div class="coach tone-' + (opts.tone || 'info') + '">' +
      '<span class="coach-emoji">' + (opts.emoji || '💡') + '</span>' +
      '<div><div class="coach-title">' + esc(opts.title) + '</div>' +
      '<div class="coach-body">' + opts.body + '</div></div>' +
      '<button class="coach-close" data-close-coach aria-label="Dismiss">&times;</button></div>';
    clearTimeout(coachTimer);
    coachTimer = setTimeout(function () { m.innerHTML = ''; }, opts.ms || 9000);
  }
  function clearCoach() { clearTimeout(coachTimer); el('coach-mount').innerHTML = ''; }

  /* ============================================================
     DEBRIEF
     ============================================================ */
  function lessons(state) {
    var out = [], b = state.blue, s = state.stats;
    var usedSpray = state.alerts.some(function (a) { return a.actionId === 'spray'; });

    if (!b.mfa) {
      out.push(['Multi-factor authentication was never switched on',
        'MFA is the single cheapest defence on this board. It blocks password spraying almost ' +
        'completely and makes a stolen password far less useful. In the real world it is the ' +
        'first thing most organisations should fix.']);
    }
    if (!b.siem) {
      out.push(['Logs were never centralised',
        'Without central logging you investigate blind, and an attacker with admin rights can ' +
        'delete the evidence. Shipping logs off the machine as they are written means they can ' +
        'no longer be erased.']);
    }
    if (s.missedAlerts > 0) {
      out.push([s.missedAlerts + ' real alert' + (s.missedAlerts === 1 ? '' : 's') +
        ' expired without being investigated',
        'This is alert fatigue, and it is how real breaches go unnoticed for months. The skill ' +
        'is not reading every alert — it is picking the right one first.']);
    }
    if (s.falsePositivesInvestigated > 0) {
      out.push([s.falsePositivesInvestigated + ' false alarm' +
        (s.falsePositivesInvestigated === 1 ? ' was' : 's were') + ' investigated',
        'That is not wasted work. A defender who never checks also never notices. Real SOC ' +
        'teams measure how fast they can tell a fire from a burnt toast.']);
    }
    if (E.anyPersistence(state)) {
      out.push(['The attacker left a backdoor that was never removed',
        'Persistence survives reboots and survives isolation. Only wiping and rebuilding the ' +
        'machine removes it — which is exactly why professionals rebuild rather than clean.']);
    }
    if (!b.backupsIntact) {
      out.push(['The backups were destroyed',
        'Attackers hunt backups before they do damage, because it removes your only cheap way ' +
        'out. A backup copy kept offline, on separate credentials, is what survives this.']);
    }
    if (state.meters.uptime < 55) {
      out.push(['The response itself caused serious disruption',
        'Isolating and rebuilding machines protects data but stops people working. Security is ' +
        'always a trade-off against availability, and over-reacting to a false alarm is a real cost.']);
    }
    if (usedSpray && !b.mfa) {
      out.push(['A password-guessing attack was attempted against an internet-facing login',
        'Every login page exposed to the internet gets this automatically, all day, forever. ' +
        'MFA, lockout policies and banned-password lists are the standard answers.']);
    }
    if (b.mfa && b.siem && b.training > 0) {
      out.push(['Several layers of defence were built',
        'This is defence in depth: MFA, central logging and trained staff each catch different ' +
        'attacks. No single control is enough, and that is the point.']);
    }
    if (s.tactics.length >= 5) {
      out.push(['The attack used ' + s.tactics.length + ' different MITRE ATT&CK tactics',
        'Real intrusions look exactly like this — a sequence of ordinary-looking steps. Defenders ' +
        'map their detections to ATT&CK so they can see which stages they would miss.']);
    }
    return out.slice(0, 6);
  }

  function renderDebrief(state) {
    var sc = E.score(state);
    var o = state.outcome || { winner: 'blue', title: 'Session ended', reason: '' };
    var playerWon = o.winner === state.playerRole;

    var html = '';
    html += '<div class="verdict ' + o.winner + '">' +
      '<div class="who">' + (o.winner === 'red' ? 'Red team objective achieved'
                                                : 'Blue team held the line') + '</div>' +
      '<h2 class="' + (o.winner === 'red' ? 't-red' : 't-blue') + '">' + esc(o.title) + '</h2>' +
      '<p>' + esc(o.reason) + '</p>' +
      '<div class="grade" style="border-color:' + (playerWon ? 'var(--green)' : 'var(--amber)') +
      '">' + sc.grade + '</div>' +
      '<div class="score-line">' + sc.points + ' points &middot; you played ' +
      (state.playerRole === 'red' ? 'RED' : 'BLUE') + ' on ' + esc(state.difficulty.name) +
      ' &middot; ' + (playerWon ? 'YOU WON' : 'YOU LOST') + '</div>' +
      '</div>';

    html += '<div class="stat-grid">' +
      stat(state.turn, 'Turns played') +
      stat(state.stats.redActions, 'Red actions') +
      stat(state.stats.blueActions, 'Blue actions') +
      stat(state.stats.detected + '/' + (state.stats.detected + state.stats.undetected),
           'Red moves detected') +
      stat(state.meters.dataSafety, 'Data safety left') +
      stat(state.meters.uptime, 'Uptime left') +
      '</div>';

    html += '<div class="section-label">How far the attack got</div><div class="chain">';
    sc.stages.forEach(function (st, i) {
      html += '<div class="chain-row ' + (st.done ? 'hit' : '') + '">' +
        '<span class="n">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="k">' + esc(st.k) + '</span>' +
        '<span class="s">' + (st.done ? 'REACHED' : 'blocked') + '</span></div>';
    });
    html += '</div>';

    if (state.stats.tactics.length) {
      html += '<div class="section-label">MITRE ATT&amp;CK tactics used by the attacker</div>' +
        '<div class="chips">' + state.stats.tactics.map(function (t) {
          return '<span class="chip bad">' + esc(t) + '</span>';
        }).join('') + '</div>';
    }
    if (state.stats.mitigations.length) {
      html += '<div class="section-label">Defences the blue team put in place</div>' +
        '<div class="chips">' + state.stats.mitigations.map(function (t) {
          return '<span class="chip on">' + esc(t) + '</span>';
        }).join('') + '</div>';
    }

    html += '<div class="section-label">What to take away</div>';
    lessons(state).forEach(function (l) {
      html += '<div class="lesson"><h4>' + esc(l[0]) + '</h4><p>' + esc(l[1]) + '</p></div>';
    });

    html += '<div class="section-label">Incident timeline</div><div class="timeline">' +
      state.log.filter(function (l) {
        return ['red', 'blue', 'good', 'alert', 'fail'].indexOf(l.kind) >= 0;
      }).map(function (l) {
        return '<div>T' + l.t + '  ' + esc(l.text) + '</div>';
      }).join('') + '</div>';

    html += '<div class="start-actions">' +
      '<button class="btn btn-primary btn-lg" id="btn-again">Play again</button>' +
      '<button class="btn" id="btn-swap">Try the other side</button>' +
      '<button class="btn btn-ghost" id="btn-gloss-end">Glossary</button>' +
      '</div>';

    el('debrief-body').innerHTML = html;
  }
  function stat(n, l) {
    return '<div class="stat"><div class="n">' + esc(n) + '</div><div class="l">' + esc(l) + '</div></div>';
  }

  /* ============================================================
     SCREENS
     ============================================================ */
  function showScreen(name) {
    ['start', 'game', 'debrief'].forEach(function (s) {
      el('screen-' + s).classList.toggle('is-active', s === name);
    });
    window.scrollTo(0, 0);
  }

  function renderAll(state, armed, busy) {
    renderHud(state);
    renderBanner(state, armed, busy);
    renderMap(state, armed);
    renderQueue(state, armed, busy);
    renderActions(state, armed, busy);
    renderLog(state);
  }

  CG.UI = {
    el: el, esc: esc,
    renderAll: renderAll,
    renderLog: renderLog,
    openInspector: openInspector,
    closeInspector: closeInspector,
    showModal: showModal,
    closeModal: closeModal,
    teachModal: teachModal,
    glossaryModal: glossaryModal,
    howToModal: howToModal,
    coach: coach,
    clearCoach: clearCoach,
    renderDebrief: renderDebrief,
    showScreen: showScreen
  };
})(window);
