/* ============================================================
   CYBER RANGE: RED vs BLUE
   main.js — wiring: input, turn flow, and running the opponent.
   ============================================================ */
(function (global) {
  'use strict';

  var CG = global.CG;
  var D = CG.DATA, E = CG.Engine, AI = CG.AI, UI = CG.UI;
  var el = UI.el;

  var app = {
    state: null,
    armed: null,      // {action, option} while picking a target
    busy: false,      // true while the computer opponent is moving
    role: null,
    difficulty: 'analyst',
    timer: null
  };

  var AI_DELAY = 1250;

  /* ============================================================
     START SCREEN
     ============================================================ */
  function buildStartScreen() {
    var wrap = el('difficulty-pills');
    wrap.innerHTML = Object.keys(D.DIFFICULTY).map(function (k) {
      var d = D.DIFFICULTY[k];
      return '<button class="pill" data-diff="' + k + '" aria-pressed="' +
        (k === app.difficulty) + '"><span>' + d.emoji + '</span>' + d.name + '</button>';
    }).join('');
    noteDifficulty();

    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('[data-diff]');
      if (!b) return;
      app.difficulty = b.dataset.diff;
      Array.prototype.forEach.call(wrap.children, function (c) {
        c.setAttribute('aria-pressed', String(c.dataset.diff === app.difficulty));
      });
      noteDifficulty();
    });

    document.querySelectorAll('.role-card').forEach(function (card) {
      card.addEventListener('click', function () {
        app.role = card.dataset.role;
        document.querySelectorAll('.role-card').forEach(function (c) {
          c.setAttribute('aria-pressed', String(c.dataset.role === app.role));
        });
        el('btn-start').disabled = false;
        el('btn-start').textContent = app.role === 'red'
          ? 'Begin the attack' : 'Take the SOC desk';
        el('scenario-blurb').textContent = app.role === 'red'
          ? D.SCENARIO.redBrief : D.SCENARIO.blueBrief;
      });
    });

    el('btn-start').addEventListener('click', function () {
      if (app.role) startGame(app.role, app.difficulty);
    });
    el('btn-howto').addEventListener('click', function () { UI.howToModal(app.role || 'red'); });
    el('btn-gloss-start').addEventListener('click', UI.glossaryModal);
  }

  function noteDifficulty() {
    var d = D.DIFFICULTY[app.difficulty];
    el('difficulty-note').textContent = d.desc + '  (' + d.maxTurns + ' turns · red ' +
      d.redAp + ' AP · blue ' + d.blueAp + ' AP per turn)';
  }

  /* ============================================================
     GAME LIFECYCLE
     ============================================================ */
  function startGame(role, difficulty) {
    clearTimeout(app.timer);
    app.role = role;
    app.difficulty = difficulty;
    app.armed = null;
    app.busy = false;
    app.state = E.createGame({ role: role, difficulty: difficulty });

    UI.clearCoach();
    UI.closeInspector();
    UI.closeModal();
    UI.showScreen('game');
    render();

    UI.coach({
      emoji: role === 'red' ? '🎯' : '🛡️',
      tone: 'info',
      title: role === 'red' ? 'You are the red team' : 'You are the blue team',
      body: role === 'red'
        ? 'You cannot reach the database from outside. Start with <strong>OSINT Sweep</strong>, ' +
          'then <strong>scan</strong> a public server to find a way in. Press <strong>ⓘ</strong> ' +
          'on any card to learn what the technique really is.'
        : 'You cannot see the attacker until you prove they are there. Watch the ' +
          '<strong>alert queue</strong>, and remember that building <strong>MFA</strong> and ' +
          '<strong>central logging</strong> early is worth more than chasing every alarm.',
      ms: 14000
    });

    /* if the player is blue, the red team moves first */
    maybeRunOpponent();
  }

  function render() {
    UI.renderAll(app.state, app.armed, app.busy);
  }

  function finish() {
    if (!app.state) return;
    app.busy = false;
    app.armed = null;
    render();
    UI.clearCoach();
    app.timer = setTimeout(function () {
      UI.renderDebrief(app.state);
      UI.showScreen('debrief');
    }, 1100);
  }

  /* ============================================================
     PLAYER ACTIONS
     ============================================================ */
  function myTurn() {
    return app.state && app.state.phase === app.state.playerRole && !app.busy &&
           app.state.phase !== 'over';
  }

  function armAction(actionId) {
    if (!myTurn()) return;
    var isRed = app.state.playerRole === 'red';
    var opts = isRed ? E.redOptions(app.state) : E.blueOptions(app.state);
    var opt = null;
    opts.forEach(function (o) { if (o.action.id === actionId) opt = o; });
    if (!opt) return;

    if (!opt.available) {
      UI.coach({
        emoji: '🔒', tone: 'bad', title: opt.action.name + ' is not available',
        body: UI.esc(opt.reason) + '.', ms: 5000
      });
      return;
    }

    /* clicking the armed card again cancels it */
    if (app.armed && app.armed.action.id === actionId) { app.armed = null; render(); return; }

    if (opt.action.target === 'none' || (opt.action.id === 'restore')) {
      execute(actionId, null);
      return;
    }
    app.armed = { action: opt.action, option: opt };
    render();
  }

  function execute(actionId, targetId) {
    if (!myTurn()) return;
    var isRed = app.state.playerRole === 'red';
    var res = isRed ? E.doRed(app.state, actionId, targetId)
                    : E.doBlue(app.state, actionId, targetId);
    app.armed = null;

    if (!res.ok) {
      UI.coach({ emoji: '⚠️', tone: 'bad', title: 'Cannot do that', body: UI.esc(res.msg), ms: 5000 });
      render();
      return;
    }

    coachForResult(res, isRed ? 'red' : 'blue');
    render();

    if (app.state.outcome) { finish(); return; }

    /* out of action points: move the clock on by itself — unless there is
       still a free action (such as returning an isolated host to service) */
    var r = isRed ? app.state.red : app.state.blue;
    var later = isRed ? E.redOptions(app.state) : E.blueOptions(app.state);
    var hasFree = later.some(function (o) { return o.available && o.action.cost === 0; });
    if (r.ap <= 0 && !hasFree) {
      app.busy = true;
      render();
      app.timer = setTimeout(function () { app.busy = false; endTurn(); }, 1000);
    }
  }

  function coachForResult(res, side) {
    var a = res.action;

    if (side === 'blue' && a.target === 'alert' && res.alert) {
      UI.coach({
        emoji: res.alert.real ? '🚨' : '😌',
        tone: res.alert.real ? 'bad' : 'good',
        title: res.alert.real ? 'True positive — the attacker is real' : 'False alarm',
        body: UI.esc(res.notes[0] || '')
      });
      return;
    }

    if (side === 'blue') {
      UI.coach({
        emoji: '🛡️', tone: 'good', title: a.name + ' complete',
        body: UI.esc(res.notes.length ? res.notes.join(' ') : a.teach.defend)
      });
      return;
    }

    /* red */
    var body = UI.esc(res.notes.join(' '));
    if (res.detected) {
      body += (body ? ' ' : '') + '<strong>You were detected.</strong> That machine had enough ' +
        'monitoring to notice. Quieter actions, or wiping logs, keep you hidden longer.';
    }
    UI.coach({
      emoji: res.success ? '✅' : '❌',
      tone: res.success ? 'good' : 'bad',
      title: a.name + (res.success ? ' succeeded' : ' failed')
             + ' (' + Math.round(res.chance * 100) + '% chance)',
      body: body || (res.success ? 'It worked.' : 'No luck this time.')
    });
  }

  function endTurn() {
    if (!app.state || app.state.phase === 'over' || app.busy) return;
    if (app.state.phase !== app.state.playerRole) return;
    app.armed = null;
    E.endPhase(app.state);
    render();
    if (app.state.outcome) { finish(); return; }
    maybeRunOpponent();
  }

  /* ============================================================
     THE COMPUTER OPPONENT
     ============================================================ */
  function maybeRunOpponent() {
    if (!app.state || app.state.phase === 'over') return;
    if (app.state.phase === app.state.playerRole) {
      /* back to the player */
      app.busy = false;
      render();
      return;
    }
    app.busy = true;
    render();
    app.timer = setTimeout(opponentStep, AI_DELAY);
  }

  function opponentStep() {
    var s = app.state;
    if (!s) return;                           // the run was abandoned mid-think
    if (s.outcome) { finish(); return; }

    var side = s.phase;                       // the side the computer is playing
    var move = side === 'red' ? AI.redMove(s) : AI.blueMove(s);

    if (!move) {
      /* the opponent has nothing left worth doing */
      E.endPhase(s);
      render();
      if (s.outcome) { finish(); return; }
      maybeRunOpponent();
      return;
    }

    E.log(s, 'ai', (side === 'red' ? 'RED' : 'BLUE') + ' THINKS: ' + move.why);
    var res = side === 'red' ? E.doRed(s, move.actionId, move.targetId)
                             : E.doBlue(s, move.actionId, move.targetId);

    if (!res.ok) {
      /* should not happen, but never let the AI spin */
      E.log(s, 'system', 'The ' + side + ' team had no legal move left and ended its turn.');
      E.endPhase(s);
      render();
      if (s.outcome) { finish(); return; }
      maybeRunOpponent();
      return;
    }

    render();
    if (s.outcome) { finish(); return; }

    var r = side === 'red' ? s.red : s.blue;
    if (r.ap <= 0) {
      app.timer = setTimeout(function () {
        E.endPhase(s);
        render();
        if (s.outcome) { finish(); return; }
        maybeRunOpponent();
      }, AI_DELAY);
    } else {
      app.timer = setTimeout(opponentStep, AI_DELAY);
    }
  }

  /* ============================================================
     INPUT
     ============================================================ */
  function bindGlobalInput() {
    el('btn-end').addEventListener('click', endTurn);
    el('btn-help').addEventListener('click', function () {
      UI.howToModal(app.state ? app.state.playerRole : 'red');
    });
    el('btn-gloss').addEventListener('click', UI.glossaryModal);
    el('insp-close').addEventListener('click', UI.closeInspector);

    el('btn-quit').addEventListener('click', function () {
      UI.showModal('Abandon this run?',
        '<p>Your progress in this simulation will be lost. You can pick a different side or ' +
        'difficulty from the start screen.</p>' +
        '<div class="start-actions">' +
        '<button class="btn btn-danger" data-confirm-quit>Yes, abandon</button>' +
        '<button class="btn" data-close-modal>Keep playing</button></div>');
    });

    document.addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;

      /* close modal — `matches`, not `closest`, or every click inside the
         modal would bubble up to the backdrop and shut it. */
      if (e.target.matches('[data-close-modal]')) { UI.closeModal(); return; }
      if (e.target.matches('[data-confirm-quit]')) {
        clearTimeout(app.timer);
        app.state = null; app.armed = null; app.busy = false;
        UI.closeModal(); UI.clearCoach(); UI.closeInspector();
        UI.showScreen('start');
        return;
      }
      if (e.target.closest('[data-close-coach]')) { UI.clearCoach(); return; }

      /* teaching popup — must come before the action card handler */
      var teach = e.target.closest('[data-teach]');
      if (teach) {
        e.stopPropagation();
        UI.teachModal(app.state ? app.state.playerRole : 'red', teach.dataset.teach);
        return;
      }

      /* an action card */
      var card = e.target.closest('[data-action]');
      if (card) { armAction(card.dataset.action); return; }

      /* an alert in the queue (while triage is armed) */
      var alert = e.target.closest('[data-alert]');
      if (alert && app.armed && app.armed.action.target === 'alert') {
        execute(app.armed.action.id, 'alert:' + alert.dataset.alert);
        return;
      }

      /* a machine on the map */
      var node = e.target.closest('[data-node]');
      if (node) {
        var id = node.dataset.node;
        if (app.armed && app.armed.option.targets.indexOf(id) >= 0) execute(app.armed.action.id, id);
        else if (app.state) UI.openInspector(app.state, id);
        return;
      }

      /* debrief buttons */
      if (e.target.id === 'btn-again') { startGame(app.state.playerRole, app.difficulty); return; }
      if (e.target.id === 'btn-swap') {
        startGame(app.state.playerRole === 'red' ? 'blue' : 'red', app.difficulty);
        return;
      }
      if (e.target.id === 'btn-gloss-end') { UI.glossaryModal(); return; }
    });

    /* keyboard: activate cards and alerts, cancel with Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (el('modal-mount').innerHTML) { UI.closeModal(); return; }
        if (el('inspector').classList.contains('is-open')) { UI.closeInspector(); return; }
        if (app.armed) { app.armed = null; render(); }
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        var t = document.activeElement;
        if (!t) return;
        if (t.matches('[data-action]') || t.matches('[data-alert]')) {
          e.preventDefault();
          t.click();
        }
      }
      /* quick end-turn */
      if (e.key === 'e' && myTurn() && !el('modal-mount').innerHTML) endTurn();
    });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    if (!CG.DATA || !CG.Engine || !CG.AI || !CG.UI) {
      document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">' +
        'Could not load the simulation scripts. If you opened this file directly, try serving ' +
        'the folder instead (for example: <code>python3 -m http.server</code>).</p>';
      return;
    }
    buildStartScreen();
    bindGlobalInput();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
