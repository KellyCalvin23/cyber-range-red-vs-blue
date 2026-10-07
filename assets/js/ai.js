/* ============================================================
   CYBER RANGE: RED vs BLUE
   ai.js — the computer opponent for whichever side you are not.
   Each move comes with a "why", so students can read the
   opponent's reasoning and learn from it.
   ============================================================ */
(function (global) {
  'use strict';

  var CG = global.CG || (global.CG = {});
  var E = CG.Engine;
  var D = CG.DATA;

  function byId(list) {
    var m = {};
    list.forEach(function (o) { m[o.action.id] = o; });
    return m;
  }
  function can(opts, id) {
    var o = opts[id];
    return (o && o.available && o.targets.length) ? o : null;
  }
  function firstOf(opt, prefer) {
    /* choose a target from opt.targets, preferring ids in `prefer` order */
    if (!opt) return null;
    for (var i = 0; i < (prefer || []).length; i++) {
      if (opt.targets.indexOf(prefer[i]) >= 0) return prefer[i];
    }
    return opt.targets[0];
  }

  /* ================= RED BRAIN ================= */

  /* the next machine red needs to take in order to reach the database */
  function nextHop(state) {
    var path = E.pathToTarget(state, 'db');
    if (!path) return null;
    for (var i = 0; i < path.length; i++) {
      if (path[i] === 'internet') continue;
      if (state.nodes[path[i]].access === 'none') return path[i];
    }
    return null;
  }

  function redMove(state) {
    var opts = byId(E.redOptions(state));
    var n = state.nodes;
    var holds = E.footholds(state);
    var hop = nextHop(state);
    var o;

    /* 1 — take the win if it is there */
    if ((o = can(opts, 'exfil')) && o.targets.indexOf('db') >= 0) {
      return { actionId: 'exfil', targetId: 'db',
        why: 'The database is located and I have access. Time to steal it and leave.' };
    }

    /* 2 — standing on the objective: confirm the data */
    if ((o = can(opts, 'discoverdata')) && o.targets.indexOf('db') >= 0) {
      return { actionId: 'discoverdata', targetId: 'db',
        why: 'I am on the records database. I need to confirm the data before stealing it.' };
    }

    /* 3 — homework before anything else */
    if (!state.red.osintDone && (o = can(opts, 'osint'))) {
      return { actionId: 'osint', targetId: null,
        why: 'Never attack blind. First I learn who works here and what software they run.' };
    }

    /* 4 — no way in yet: open a door */
    if (!holds.length) {
      if ((o = can(opts, 'webexploit'))) {
        var t = firstOf(o, ['web', 'mail', 'vpn']);
        return { actionId: 'webexploit', targetId: t,
          why: 'The scan found an unpatched bug on ' + E.nodeDef(t).name + '. ' +
               'An unpatched public server is the cheapest way in.' };
      }
      if ((o = can(opts, 'scan'))) {
        var st = firstOf(o, ['web', 'vpn', 'mail']);
        return { actionId: 'scan', targetId: st,
          why: 'I am scanning ' + E.nodeDef(st).name + ' to see what software it runs and ' +
               'whether it is missing updates.' };
      }
      if ((o = can(opts, 'spray')) && !state.blue.mfa) {
        var pt = firstOf(o, ['vpn', 'mail']);
        return { actionId: 'spray', targetId: pt,
          why: 'No MFA is in place, so one weak password out of hundreds of accounts will ' +
               'let me log straight in.' };
      }
      if ((o = can(opts, 'phish'))) {
        var ht = firstOf(o, ['wks-teacher', 'wks-office']);
        return { actionId: 'phish', targetId: ht,
          why: 'Software is patched, so I will target a person instead. ' +
               E.nodeDef(ht).name + ' receives a lot of email.' };
      }
      if ((o = can(opts, 'usb'))) {
        return { actionId: 'usb', targetId: firstOf(o, ['wks-office', 'wks-teacher']),
          why: 'Email is not working for me. A USB stick in the car park is my next best bet.' };
      }
    }

    /* 5 — lock in what I have before the defenders react */
    if ((o = can(opts, 'backdoor'))) {
      var bt = firstOf(o, holds);
      return { actionId: 'backdoor', targetId: bt,
        why: 'If this machine reboots, or gets isolated, I lose everything. A hidden ' +
             'start-up service means I always have a way back in.' };
    }

    /* 6 — climb to administrator, preferring machines on the route to the database */
    if ((o = can(opts, 'privesc'))) {
      var pe = firstOf(o, [hop, 'dc', 'wks-office', 'wks-teacher'].filter(Boolean));
      return { actionId: 'privesc', targetId: pe,
        why: 'As an ordinary user I cannot steal passwords. I need administrator rights on ' +
             E.nodeDef(pe).name + ' first.' };
    }

    /* 7 — steal keys so I can travel */
    if (!state.red.stolenCreds.length && (o = can(opts, 'creddump'))) {
      var cd = firstOf(o, ['dc', 'wks-office', 'wks-teacher']);
      return { actionId: 'creddump', targetId: cd,
        why: 'Admin rights let me read password hashes out of memory. Those hashes are my ' +
             'ticket to every other machine.' };
    }

    /* 8 — walk towards the objective */
    if (hop && (o = can(opts, 'lateral')) && o.targets.indexOf(hop) >= 0) {
      return { actionId: 'lateral', targetId: hop,
        why: 'The route to the records database runs through ' + E.nodeDef(hop).name +
             '. Stolen credentials make this look like normal IT work.' };
    }
    if ((o = can(opts, 'lateral'))) {
      var lt = firstOf(o, ['dc', 'fileserver', 'db', 'wks-office']);
      return { actionId: 'lateral', targetId: lt,
        why: 'Moving sideways to ' + E.nodeDef(lt).name + ' to get closer to the data.' };
    }

    /* 9 — grab whatever else is valuable */
    if ((o = can(opts, 'discoverdata'))) {
      var dt = firstOf(o, ['db', 'fileserver']);
      return { actionId: 'discoverdata', targetId: dt,
        why: 'Searching ' + E.nodeDef(dt).name + ' for anything worth stealing.' };
    }

    /* 10 — cover my tracks when the SOC is clearly watching */
    if (state.stats.detected >= 2 && (o = can(opts, 'clearlogs'))) {
      var ct = firstOf(o, holds);
      return { actionId: 'clearlogs', targetId: ct,
        why: 'I have set off alarms. Wiping the event log buys me a couple of quiet turns.' };
    }

    /* 11 — scan something new to open up options */
    if ((o = can(opts, 'scan'))) {
      var s2 = firstOf(o, ['dc', 'fileserver', 'db', 'wks-office', 'wks-teacher']);
      return { actionId: 'scan', targetId: s2,
        why: 'Mapping ' + E.nodeDef(s2).name + ' to find my next move.' };
    }

    /* 12 — the quiet route is closed, so be loud */
    if ((o = can(opts, 'wipebackup'))) {
      return { actionId: 'wipebackup', targetId: 'backup',
        why: 'Before I do real damage I will remove the defenders\' ability to undo it.' };
    }
    if ((o = can(opts, 'ransom'))) {
      var rt = firstOf(o, ['fileserver', 'dc', 'db', 'mail']);
      return { actionId: 'ransom', targetId: rt,
        why: 'I cannot reach the database quietly, so I will cause as much damage as I can ' +
             'on ' + E.nodeDef(rt).name + ' instead.' };
    }
    if ((o = can(opts, 'exfil'))) {
      var et = o.targets[0];
      return { actionId: 'exfil', targetId: et,
        why: 'Not the main prize, but data from ' + E.nodeDef(et).name + ' is still worth taking.' };
    }
    if ((o = can(opts, 'phish'))) {
      return { actionId: 'phish', targetId: o.targets[0],
        why: 'Opening a second door, in case the defenders close the first one.' };
    }

    return null; /* nothing useful left: end the phase */
  }

  /* ================= BLUE BRAIN =================
     The blue AI plays fair: it only acts on things a real
     defender could actually see (alerts it has confirmed,
     visible damage, and its own configuration).
  ================================================= */

  function confirmedTactic(state, actionIds) {
    return state.alerts.some(function (a) {
      return a.status === 'confirmed' && actionIds.indexOf(a.actionId) >= 0;
    });
  }

  function blueMove(state) {
    var opts = byId(E.blueOptions(state));
    var o, i;

    /* 1 — work the alert queue, most convincing alert first */
    if ((o = can(opts, 'triage'))) {
      var rank = { high: 3, medium: 2, low: 1 };
      var best = null;
      state.alerts.forEach(function (a) {
        if (a.status !== 'new') return;
        if (!best || rank[a.confidence] > rank[best.confidence] ||
           (rank[a.confidence] === rank[best.confidence] && a.turn > best.turn)) best = a;
      });
      if (best) {
        return { actionId: 'triage', targetId: 'alert:' + best.id,
          why: 'Alert #' + best.id + ' on ' + best.where + ' is my most convincing lead. ' +
               'I cannot respond properly until I know whether it is real.' };
      }
    }

    /* 2 — ransomware in progress: recover first, it is bleeding uptime */
    if ((o = can(opts, 'restore'))) {
      return { actionId: 'restore', targetId: null,
        why: 'Machines are encrypted and my backups are intact. Restoring is faster and ' +
             'cheaper than any negotiation.' };
    }

    /* 3 — a confirmed compromise: contain it, then rebuild it */
    var known = Object.keys(state.nodes).filter(function (k) {
      return k !== 'internet' && state.nodes[k].knownCompromised;
    });
    if (known.length) {
      var target = known.sort(function (a, b) {
        var da = E.nodeDef(a), db = E.nodeDef(b);
        return (db.crown ? 1 : 0) - (da.crown ? 1 : 0);
      })[0];
      if ((o = can(opts, 'remediate')) && o.targets.indexOf(target) >= 0 && state.blue.ap >= 2) {
        return { actionId: 'remediate', targetId: target,
          why: 'I have confirmed the attacker on ' + E.nodeDef(target).name + '. Cleaning is ' +
               'guesswork, so I am wiping and rebuilding it. That removes hidden backdoors too.' };
      }
      if ((o = can(opts, 'isolate')) && o.targets.indexOf(target) >= 0) {
        return { actionId: 'isolate', targetId: target,
          why: 'Containment first: pulling ' + E.nodeDef(target).name + ' off the network stops ' +
               'the attacker spreading while I prepare a rebuild.' };
      }
    }

    /* 4 — they have stolen credentials and I have proof: burn them */
    if (confirmedTactic(state, ['creddump', 'lateral']) && state.red.stolenCreds.length &&
        (o = can(opts, 'resetcreds'))) {
      return { actionId: 'resetcreds', targetId: null,
        why: 'I have confirmed credential theft. A domain-wide password reset makes every ' +
             'stolen hash worthless, even the ones I have not found.' };
    }

    /* 5 — data is walking out of the door */
    if (confirmedTactic(state, ['exfil', 'discoverdata']) && (o = can(opts, 'blockc2'))) {
      return { actionId: 'blockc2', targetId: null,
        why: 'Confirmed data collection. Blocking the attacker\'s servers at the firewall ' +
             'means stolen data has nowhere to go.' };
    }

    /* 6 — build the foundations, cheapest-highest-value first */
    if ((o = can(opts, 'siem'))) {
      return { actionId: 'siem', targetId: null,
        why: 'I am investigating blind. Central logging improves what I can see on every ' +
             'machine at once, and it stops the attacker deleting evidence.' };
    }
    if ((o = can(opts, 'mfa'))) {
      return { actionId: 'mfa', targetId: null,
        why: 'MFA is the best value on this board: it shuts down password guessing and makes ' +
             'stolen passwords far less useful.' };
    }
    if ((o = can(opts, 'patch'))) {
      /* patch whatever is both exposed and known to be vulnerable */
      var exposed = ['web', 'vpn', 'mail', 'wks-office', 'wks-teacher'].filter(function (id) {
        return o.targets.indexOf(id) >= 0 && state.nodes[id].vulns.length > 0;
      });
      if (exposed.length) {
        return { actionId: 'patch', targetId: exposed[0],
          why: E.nodeDef(exposed[0]).name + ' is reachable from the internet and missing ' +
               'updates. That is the door I would come through, so I am closing it.' };
      }
    }
    if (state.blue.training < 1 && (o = can(opts, 'training'))) {
      return { actionId: 'training', targetId: null,
        why: 'My people are the ones being targeted. Training makes phishing and USB tricks ' +
             'much less likely to work.' };
    }
    if ((o = can(opts, 'edr'))) {
      var et2 = firstOf(o, ['dc', 'db', 'wks-office', 'wks-teacher', 'fileserver', 'web']);
      return { actionId: 'edr', targetId: et2,
        why: 'EDR on ' + E.nodeDef(et2).name + ' gives me real visibility there, and blocks ' +
             'credential dumping and backdoor installs outright.' };
    }
    if ((o = can(opts, 'segment')) && state.blue.ap >= 2) {
      var sg = firstOf(o, ['db', 'dc', 'backup']);
      return { actionId: 'segment', targetId: sg,
        why: 'Segmenting ' + E.nodeDef(sg).name + ' means a compromised laptop simply cannot ' +
             'reach it. That breaks the attacker\'s route instead of chasing them.' };
    }
    if (state.blue.training < 2 && (o = can(opts, 'training'))) {
      return { actionId: 'training', targetId: null,
        why: 'A second round of training. Frequent short practice beats one annual lecture.' };
    }

    /* 7 — nothing obvious to do: go looking */
    if ((o = can(opts, 'hunt'))) {
      var hs = firstOf(o, ['dc', 'db', 'fileserver', 'wks-office', 'wks-teacher', 'web', 'vpn']);
      return { actionId: 'hunt', targetId: hs,
        why: 'No alerts worth chasing, so I will assume they are already inside and go hunting ' +
             'on ' + E.nodeDef(hs).name + '.' };
    }

    /* 8 — bring contained machines back once they have been rebuilt */
    if ((o = can(opts, 'unisolate'))) {
      var clean = o.targets.filter(function (id) {
        return !state.nodes[id].persistence && !state.nodes[id].knownCompromised;
      });
      if (clean.length) {
        return { actionId: 'unisolate', targetId: clean[0],
          why: E.nodeDef(clean[0]).name + ' has been rebuilt and is clean. Leaving it offline ' +
               'only hurts the school, so it goes back into service.' };
      }
    }

    return null;
  }

  CG.AI = {
    redMove: redMove,
    blueMove: blueMove,
    nextHop: nextHop
  };
})(window);
