/* ============================================================
   CYBER RANGE: RED vs BLUE
   engine.js — all the rules of the game.
   The engine never touches the screen. It only changes state.
   ============================================================ */
(function (global) {
  'use strict';

  var CG = global.CG || (global.CG = {});
  var D = CG.DATA;

  var MAX_PATCH = 2;

  /* ---------- small helpers ---------- */
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function rnd() { return Math.random(); }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function nodeDef(id) {
    for (var i = 0; i < D.NODES.length; i++) if (D.NODES[i].id === id) return D.NODES[i];
    return null;
  }
  function actionDef(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function redAction(id) { return actionDef(D.RED_ACTIONS, id); }
  function blueAction(id) { return actionDef(D.BLUE_ACTIONS, id); }

  /* adjacency built once from the LINKS table */
  var ADJ = (function () {
    var m = {};
    D.NODES.forEach(function (n) { m[n.id] = []; });
    D.LINKS.forEach(function (l) {
      if (m[l[0]].indexOf(l[1]) < 0) m[l[0]].push(l[1]);
      if (m[l[1]].indexOf(l[0]) < 0) m[l[1]].push(l[0]);
    });
    return m;
  })();

  /* ---------- state ---------- */
  function createGame(opts) {
    opts = opts || {};
    var diff = D.DIFFICULTY[opts.difficulty || 'analyst'];
    var state = {
      playerRole: opts.role || 'red',       // 'red' | 'blue'
      difficulty: diff,
      turn: 1,
      maxTurns: diff.maxTurns,
      phase: 'red',                          // 'red' | 'blue' | 'over'
      red: {
        ap: diff.redAp, apMax: diff.redAp,
        osintDone: false,
        knows: { internet: true, firewall: true, web: true, mail: true, vpn: true },
        scanned: {},
        stolenCreds: [],                     // node ids creds were taken from
        credsFromDc: false
      },
      blue: {
        ap: diff.blueAp, apMax: diff.blueAp,
        mfa: false, training: 0, siem: false,
        c2BlockedUntil: 0,
        backupsIntact: true
      },
      nodes: {},
      alerts: [],
      alertSeq: 1,
      log: [],
      meters: { dataSafety: 100, uptime: 100 },
      outcome: null,                         // {winner, reason, title}
      stats: {
        redActions: 0, blueActions: 0,
        detected: 0, undetected: 0,
        tactics: [], mitigations: [],
        redEverFoothold: false,
        falsePositivesInvestigated: 0,
        truePositivesInvestigated: 0,
        missedAlerts: 0
      }
    };

    D.NODES.forEach(function (def) {
      state.nodes[def.id] = {
        id: def.id,
        access: 'none',        // none | user | admin   (red's level of control)
        persistence: false,
        dataFound: false,
        isolated: false,
        encrypted: false,
        patch: 0,
        edr: false,
        segmented: false,
        knownCompromised: false,   // blue has CONFIRMED something here
        blueSeenAccess: null,      // what blue last observed
        logBlindUntil: 0,
        vulns: (def.vulns || []).map(function (v) { return v.id; })
      };
    });
    /* the attacker's own machine is always theirs */
    state.nodes.internet.access = 'admin';

    log(state, 'system', 'Scenario loaded: ' + D.SCENARIO.title + ' @ ' + D.SCENARIO.org);
    log(state, 'system', 'Difficulty: ' + diff.name + ' — ' + diff.maxTurns + ' turns. ' +
      'You are the ' + (state.playerRole === 'red' ? 'RED TEAM.' : 'BLUE TEAM.'));
    log(state, 'turn', '-- TURN 1 . RED TEAM --');
    return state;
  }

  function log(state, kind, text) {
    state.log.push({ t: state.turn, kind: kind, text: text });
    if (state.log.length > 400) state.log.shift();
  }

  /* ---------- derived info ---------- */
  function footholds(state) {
    return Object.keys(state.nodes).filter(function (id) {
      return id !== 'internet' && state.nodes[id].access !== 'none' && !state.nodes[id].isolated;
    });
  }
  function anyPersistence(state) {
    return Object.keys(state.nodes).some(function (id) {
      return id !== 'internet' && state.nodes[id].persistence;
    });
  }
  function reachableFrom(state) {
    /* every node next to something red controls (including the internet edge) */
    var out = {};
    var owned = ['internet'].concat(footholds(state));
    owned.forEach(function (id) {
      ADJ[id].forEach(function (nb) { out[nb] = true; });
    });
    return out;
  }
  function pathToTarget(state, targetId) {
    /* breadth-first search from red's holdings to the objective */
    var owned = ['internet'].concat(footholds(state));
    var seen = {}, queue = [];
    owned.forEach(function (id) { seen[id] = null; queue.push(id); });
    while (queue.length) {
      var cur = queue.shift();
      if (cur === targetId) {
        var chain = [], c = cur;
        while (c) { chain.unshift(c); c = seen[c]; }
        return chain;
      }
      ADJ[cur].forEach(function (nb) {
        if (!(nb in seen) && !state.nodes[nb].isolated) { seen[nb] = cur; queue.push(nb); }
      });
    }
    return null;
  }
  function visibility(state, nodeId) {
    var n = state.nodes[nodeId], def = nodeDef(nodeId);
    var v = 1;
    if (n.edr) v += 2;
    if (state.blue.siem) v += 1;
    if (def.crown) v += 1;
    if (n.logBlindUntil >= state.turn) v -= 2;
    return Math.max(0, v);
  }

  /* ---------- red: what can I do? ---------- */
  function unpatchedVulns(state, nodeId) {
    var def = nodeDef(nodeId), n = state.nodes[nodeId];
    return (def.vulns || []).filter(function (v) { return n.vulns.indexOf(v.id) >= 0; });
  }

  function redTargetOk(state, act, nodeId) {
    var n = state.nodes[nodeId], def = nodeDef(nodeId), r = state.red;
    if (nodeId === 'internet') return false;
    switch (act.id) {
      case 'scan':
        return !!r.knows[nodeId] && !n.isolated && !r.scanned[nodeId];
      case 'phish':
        return !!def.human && !!r.knows[nodeId] && !n.isolated && n.access === 'none' && r.osintDone;
      case 'usb':
        return !!def.human && !!r.knows[nodeId] && !n.isolated && n.access === 'none';
      case 'webexploit':
        return !!r.scanned[nodeId] && !n.isolated && n.access === 'none' &&
               unpatchedVulns(state, nodeId).length > 0 &&
               (!!def.publicFacing || !!reachableFrom(state)[nodeId]);
      case 'spray':
        return !!def.hasAccounts && !!def.publicFacing && !!r.knows[nodeId] &&
               !n.isolated && n.access === 'none' && r.osintDone;
      case 'backdoor':
        return n.access !== 'none' && !n.isolated && !n.persistence;
      case 'privesc':
        return n.access === 'user' && !n.isolated;
      case 'creddump':
        return n.access === 'admin' && !n.isolated && r.stolenCreds.indexOf(nodeId) < 0;
      case 'lateral':
        return r.stolenCreds.length > 0 && n.access === 'none' && !n.isolated &&
               !!reachableFrom(state)[nodeId];
      case 'discoverdata':
        return n.access !== 'none' && !n.isolated && !!def.hasData && !n.dataFound;
      case 'clearlogs':
        return n.access === 'admin' && !n.isolated && n.logBlindUntil < state.turn;
      case 'exfil':
        return n.access !== 'none' && !n.isolated && n.dataFound;
      case 'ransom':
        return n.access === 'admin' && !n.isolated && !n.encrypted && def.kind !== 'workstation';
      case 'wipebackup':
        return nodeId === 'backup' && n.access === 'admin' && !n.isolated && state.blue.backupsIntact;
      default:
        return false;
    }
  }

  function redChance(state, act, nodeId) {
    var n = nodeId ? state.nodes[nodeId] : null;
    var b = state.blue, mod = state.difficulty.redSuccessMod, p;
    switch (act.id) {
      case 'osint': p = 1; break;
      case 'scan': p = 1; break;
      case 'phish': p = 0.75 - b.training * 0.22 - (n.edr ? 0.10 : 0); break;
      case 'webexploit': p = 0.85 - n.patch * 0.40; break;
      case 'spray': p = b.mfa ? 0.04 : (0.65 - n.patch * 0.25); break;
      case 'usb': p = 0.55 - b.training * 0.18 - (n.edr ? 0.20 : 0); break;
      case 'backdoor': p = 0.90 - (n.edr ? 0.45 : 0); break;
      case 'privesc': p = 0.80 - n.patch * 0.35 - (n.edr ? 0.10 : 0); break;
      case 'creddump': p = 0.85 - (n.edr ? 0.50 : 0); break;
      case 'lateral': p = 0.80 - (n.segmented ? 0.50 : 0) - (n.edr ? 0.10 : 0) +
                          (state.red.credsFromDc ? 0.10 : 0); break;
      case 'discoverdata': p = 0.95; break;
      case 'clearlogs': p = b.siem ? 0.30 : 0.90; break;
      case 'exfil': p = (b.c2BlockedUntil >= state.turn) ? 0.15 : 0.85; break;
      case 'ransom': p = 0.90 - (n.edr ? 0.35 : 0); break;
      case 'wipebackup': p = 0.85 - (n.edr ? 0.30 : 0); break;
      default: p = 0.5;
    }
    if (act.id !== 'osint' && act.id !== 'scan') p += mod;
    return clamp(p, 0.04, 0.98);
  }

  function redOptions(state) {
    return D.RED_ACTIONS.map(function (act) {
      var o = { action: act, targets: [], reason: '' };
      if (act.cost > state.red.ap) o.reason = 'Not enough action points';
      if (act.id === 'osint') {
        if (state.red.osintDone) o.reason = 'Already completed';
        else if (!o.reason) o.targets = ['none'];
      } else if (!o.reason && act.id === 'lateral' && state.red.stolenCreds.length === 0) {
        o.reason = 'Needs stolen credentials (dump them first)';
      } else if (!o.reason && (act.id === 'phish' || act.id === 'spray') && !state.red.osintDone) {
        o.reason = 'Needs an OSINT sweep first';
      } else if (!o.reason) {
        o.targets = Object.keys(state.nodes).filter(function (id) {
          return redTargetOk(state, act, id);
        });
        if (!o.targets.length) o.reason = 'No valid target yet';
      }
      o.available = !o.reason;
      return o;
    });
  }

  /* ---------- alerts ---------- */
  var ALERT_TEXT = {
    scan: 'Hundreds of connection attempts to different ports',
    phish: 'Email attachment opened, then an unusual child process',
    usb: 'A new USB device registered itself as a keyboard',
    webexploit: 'Web server wrote a file it should not be able to write',
    spray: 'A burst of failed logins across many accounts',
    backdoor: 'A new auto-start service appeared with an odd name',
    privesc: 'A normal user process suddenly gained admin rights',
    creddump: 'Something read protected memory from the login process',
    lateral: 'Remote login using an admin account at an unusual hour',
    discoverdata: 'One account opened hundreds of files in two minutes',
    clearlogs: 'The security event log was cleared',
    exfil: 'A large encrypted upload to an unknown external server',
    ransom: 'Thousands of files renamed and rewritten in seconds',
    wipebackup: 'Backup jobs and archives deleted'
  };

  function raiseAlert(state, nodeId, act, confidence, real) {
    var def = nodeDef(nodeId);
    var a = {
      id: state.alertSeq++,
      turn: state.turn,
      nodeId: nodeId,
      actionId: act ? act.id : null,
      real: real,
      confidence: confidence,
      status: 'new',
      text: act ? ALERT_TEXT[act.id] : 'Anomalous behaviour',
      where: def ? def.name : 'Unknown host'
    };
    state.alerts.push(a);
    return a;
  }

  function rollDetection(state, nodeId, act) {
    var vis = visibility(state, nodeId);
    var p = clamp(act.noise * 0.09 + vis * 0.07 + state.difficulty.detectMod, 0.02, 0.95);
    if (rnd() < p) {
      state.stats.detected++;
      raiseAlert(state, nodeId, act, vis >= 3 ? 'high' : 'medium', true);
      return true;
    }
    state.stats.undetected++;
    /* even an undetected action sometimes leaves a faint trace */
    if (act.noise > 0 && rnd() < 0.30) raiseAlert(state, nodeId, act, 'low', true);
    return false;
  }

  /* ---------- meters ---------- */
  function hitDataSafety(state, amount, why) {
    state.meters.dataSafety = clamp(state.meters.dataSafety - amount, 0, 100);
    if (why) log(state, 'meter', 'Data Safety -' + amount + ' (' + why + ')');
  }
  function hitUptime(state, amount, why) {
    state.meters.uptime = clamp(state.meters.uptime - amount, 0, 100);
    if (why) log(state, 'meter', 'Uptime ' + (amount >= 0 ? '-' : '+') + Math.abs(amount) +
      ' (' + why + ')');
  }

  /* ---------- red: do it ---------- */
  function doRed(state, actionId, targetId) {
    if (state.phase !== 'red' || state.outcome) return { ok: false, msg: 'Not the red phase.' };
    var act = redAction(actionId);
    if (!act) return { ok: false, msg: 'Unknown action.' };
    if (act.cost > state.red.ap) return { ok: false, msg: 'Not enough action points.' };
    if (act.target !== 'none' && !redTargetOk(state, act, targetId))
      return { ok: false, msg: 'That is not a valid target for ' + act.name + '.' };

    state.red.ap -= act.cost;
    state.stats.redActions++;
    if (state.stats.tactics.indexOf(act.tactic) < 0) state.stats.tactics.push(act.tactic);

    var def = targetId ? nodeDef(targetId) : null;
    var chance = redChance(state, act, targetId);
    var success = rnd() < chance;
    var res = { ok: true, success: success, chance: chance, action: act, nodeId: targetId, notes: [] };

    log(state, 'red', '> ' + act.name + (def ? ' -> ' + def.name : '') +
      '  [' + act.mitre + ' ' + act.tactic + ']  ' + Math.round(chance * 100) + '% chance');

    if (!success) {
      var why = failureReason(state, act, targetId);
      log(state, 'fail', '  x Failed. ' + why);
      res.notes.push(why);
    } else {
      applyRedSuccess(state, act, targetId, res);
    }

    /* noisy things get noticed whether or not they worked */
    if (act.noise > 0 && targetId) {
      var seen = rollDetection(state, targetId, act);
      res.detected = seen;
      if (seen) log(state, 'alert', '  ! Alert raised on ' + def.name + ' - the SOC noticed.');
    }

    checkOutcome(state);
    return res;
  }

  function failureReason(state, act, nodeId) {
    var b = state.blue, n = nodeId ? state.nodes[nodeId] : null;
    switch (act.id) {
      case 'phish': return b.training > 0
        ? 'The target had training - they reported the email instead of opening it.'
        : 'The target never opened the attachment.';
      case 'usb': return 'Nobody plugged it in, or the machine blocked the device.';
      case 'spray': return b.mfa
        ? 'The password was right, but MFA asked for a code you do not have.'
        : 'No account used that password.';
      case 'webexploit': return n && n.patch > 0
        ? 'The server is patched - the exploit no longer works.'
        : 'The exploit crashed the service instead of giving you a shell.';
      case 'privesc': return 'The escalation attempt was blocked.';
      case 'creddump': return n && n.edr
        ? 'EDR killed the process the moment it touched protected memory.'
        : 'The memory read returned garbage.';
      case 'lateral': return n && n.segmented
        ? 'Network segmentation blocked the connection entirely.'
        : 'The login was refused.';
      case 'backdoor': return n && n.edr
        ? 'EDR quarantined the new service immediately.'
        : 'The service failed to install.';
      case 'exfil': return b.c2BlockedUntil >= state.turn
        ? 'Your command-and-control server is blocked at the firewall. The upload died.'
        : 'The transfer broke halfway and had to be abandoned.';
      case 'ransom': return 'The encryptor was stopped before it got going.';
      case 'wipebackup': return 'The delete was refused - the backup account is separate.';
      default: return 'It did not work.';
    }
  }

  function applyRedSuccess(state, act, nodeId, res) {
    var r = state.red, b = state.blue;
    var n = nodeId ? state.nodes[nodeId] : null;
    var def = nodeId ? nodeDef(nodeId) : null;

    function gainAccess(level) {
      var had = n.access;
      if (level === 'admin' || had === 'none') n.access = level;
      state.stats.redEverFoothold = true;
      log(state, 'good', '  + ' + (had === 'none' ? 'Foothold gained' : 'Access upgraded') +
        ' on ' + def.name + ' as ' + level.toUpperCase() + '.');
      if (def.crown && level === 'admin') hitDataSafety(state, 10, 'admin on a critical system');
    }

    switch (act.id) {
      case 'osint':
        r.osintDone = true;
        D.NODES.forEach(function (d) { if (d.publicFacing || d.human) r.knows[d.id] = true; });
        log(state, 'good', '  + Staff list, email format (first.last@riverbend.example) and ' +
          'software versions collected. Phishing and password spraying are now possible.');
        res.notes.push('You now know who works here and what software they run.');
        break;

      case 'scan':
        r.scanned[nodeId] = true;
        var vs = unpatchedVulns(state, nodeId);
        ADJ[nodeId].forEach(function (nb) { if (nb !== 'internet') r.knows[nb] = true; });
        log(state, 'good', '  + ' + def.name + ' mapped: ' +
          ((def.services || []).join(', ') || 'no open services') + '.');
        if (vs.length) {
          log(state, 'good', '  + VULNERABLE: ' + vs.map(function (v) {
            return v.name + ' (' + v.ref + ')';
          }).join('; '));
          res.notes.push('Found an unpatched weakness you can exploit.');
        } else {
          log(state, 'info', '  . No known vulnerabilities left on this host.');
          res.notes.push('This host looks patched. Try people instead of software.');
        }
        break;

      case 'phish': gainAccess('user');
        log(state, 'info', '  . They opened "Timetable_Change_Term2.docx". Your code ran as them.');
        break;
      case 'usb': gainAccess('user');
        log(state, 'info', '  . The stick was plugged in and typed your commands in 400ms.');
        break;
      case 'spray': gainAccess('user');
        log(state, 'info', '  . One account used the password "Riverbend2024!". No MFA to stop you.');
        break;
      case 'webexploit': gainAccess('user');
        log(state, 'info', '  . File-upload flaw abused to drop a web shell.');
        break;

      case 'backdoor':
        n.persistence = true;
        log(state, 'good', '  + Persistence installed. Rebooting will not remove you.');
        break;

      case 'privesc':
        gainAccess('admin');
        break;

      case 'creddump':
        r.stolenCreds.push(nodeId);
        if (nodeId === 'dc') r.credsFromDc = true;
        log(state, 'good', '  + ' + (nodeId === 'dc'
          ? 'DOMAIN ADMIN hashes captured. You now hold the master keys.'
          : 'Credential hashes captured. You can reuse these on other machines.'));
        res.notes.push('Lateral Movement is now unlocked.');
        break;

      case 'lateral':
        gainAccess(r.credsFromDc ? 'admin' : 'user');
        log(state, 'info', '  . Logged in with stolen credentials. To the logs this looks like ' +
          'ordinary IT work.');
        break;

      case 'discoverdata':
        n.dataFound = true;
        log(state, 'good', '  + Sensitive data located on ' + def.name + '.');
        if (def.objective) {
          hitDataSafety(state, 10, 'the student database has been located');
          res.notes.push('You have found the objective. Exfiltrate it to win.');
        }
        break;

      case 'clearlogs':
        n.logBlindUntil = state.turn + 2;
        var cleared = 0;
        state.alerts.forEach(function (a) {
          if (a.nodeId === nodeId && a.status === 'new' && cleared < 1) {
            a.status = 'erased'; cleared++;
          }
        });
        log(state, 'good', '  + Logs wiped. ' + def.name + ' is partially blind for 2 turns' +
          (cleared ? ' and one pending alert was destroyed.' : '.'));
        break;

      case 'exfil':
        if (def.objective) {
          log(state, 'good', '  ++ 900 student records uploaded to your server. Mission complete.');
          state.outcome = {
            winner: 'red',
            title: 'Data Breach',
            reason: 'The Student Records Database was copied out of the network.'
          };
        } else {
          hitDataSafety(state, 25, 'files stolen from ' + def.name);
          n.dataFound = false;
          log(state, 'good', '  + Files stolen from ' + def.name + ' - valuable, but not the ' +
            'objective. The student database is still inside.');
        }
        break;

      case 'ransom':
        n.encrypted = true;
        hitUptime(state, 25, 'ransomware on ' + def.name);
        hitDataSafety(state, 15, 'ransomware destroyed working data');
        log(state, 'good', '  + ' + def.name + ' encrypted. A ransom note is on every desktop.');
        break;

      case 'wipebackup':
        b.backupsIntact = false;
        hitDataSafety(state, 10, 'backups destroyed');
        log(state, 'good', '  + Backups destroyed. The defenders can no longer restore.');
        break;
    }
  }

  /* ---------- blue: what can I do? ---------- */
  function blueTargetOk(state, act, nodeId) {
    var n = state.nodes[nodeId], def = nodeDef(nodeId);
    if (nodeId === 'internet') return false;
    switch (act.id) {
      case 'hunt': return !n.isolated;
      case 'edr': return !n.edr && def.kind !== 'edge';
      case 'patch': return n.patch < MAX_PATCH;
      case 'segment': return !n.segmented && def.kind !== 'edge';
      case 'isolate': return !n.isolated && def.kind !== 'edge';
      case 'remediate': return !!(n.knownCompromised || n.isolated || n.encrypted);
      case 'unisolate': return n.isolated;
      default: return false;
    }
  }

  function blueOptions(state) {
    return D.BLUE_ACTIONS.map(function (act) {
      var o = { action: act, targets: [], reason: '' };
      if (act.cost > state.blue.ap) o.reason = 'Not enough action points';
      else if (act.id === 'siem' && state.blue.siem) o.reason = 'Already enabled';
      else if (act.id === 'mfa' && state.blue.mfa) o.reason = 'Already enabled';
      else if (act.id === 'training' && state.blue.training >= 2) o.reason = 'Staff fully trained';
      else if (act.id === 'blockc2' && state.blue.c2BlockedUntil >= state.turn)
        o.reason = 'Already blocking (' + (state.blue.c2BlockedUntil - state.turn + 1) + ' turns left)';
      else if (act.id === 'restore') {
        if (!state.blue.backupsIntact) o.reason = 'Backups have been destroyed';
        else if (!Object.keys(state.nodes).some(function (k) { return state.nodes[k].encrypted; }))
          o.reason = 'Nothing is damaged yet';
        else o.targets = ['none'];
      } else if (act.target === 'none') o.targets = ['none'];
      else if (act.target === 'alert') {
        o.targets = state.alerts.filter(function (a) { return a.status === 'new'; })
          .map(function (a) { return 'alert:' + a.id; });
        if (!o.targets.length) o.reason = 'No new alerts in the queue';
      } else {
        o.targets = Object.keys(state.nodes).filter(function (id) {
          return blueTargetOk(state, act, id);
        });
        if (!o.targets.length) o.reason = 'No valid target';
      }
      o.available = !o.reason;
      return o;
    });
  }

  function doBlue(state, actionId, targetId) {
    if (state.phase !== 'blue' || state.outcome) return { ok: false, msg: 'Not the blue phase.' };
    var act = blueAction(actionId);
    if (!act) return { ok: false, msg: 'Unknown action.' };
    if (act.cost > state.blue.ap) return { ok: false, msg: 'Not enough action points.' };

    var res = { ok: true, success: true, action: act, nodeId: null, notes: [] };

    if (act.target === 'alert') {
      var id = parseInt(String(targetId).replace('alert:', ''), 10);
      var alert = null;
      state.alerts.forEach(function (a) { if (a.id === id) alert = a; });
      if (!alert || alert.status !== 'new') return { ok: false, msg: 'That alert is not open.' };
      state.blue.ap -= act.cost;
      state.stats.blueActions++;
      resolveTriage(state, alert, res);
      checkOutcome(state);
      return res;
    }

    if (act.target === 'node' && !blueTargetOk(state, act, targetId))
      return { ok: false, msg: 'That is not a valid target for ' + act.name + '.' };

    state.blue.ap -= act.cost;
    state.stats.blueActions++;
    if (state.stats.mitigations.indexOf(act.name) < 0) state.stats.mitigations.push(act.name);
    res.nodeId = (act.target === 'node') ? targetId : null;
    applyBlue(state, act, targetId, res);
    checkOutcome(state);
    return res;
  }

  function resolveTriage(state, alert, res) {
    alert.status = alert.real ? 'confirmed' : 'dismissed';
    res.alert = alert;
    var def = nodeDef(alert.nodeId);
    if (alert.real) {
      var n = state.nodes[alert.nodeId];
      var ra = alert.actionId ? redAction(alert.actionId) : null;
      n.knownCompromised = true;
      n.blueSeenAccess = n.access;
      state.stats.truePositivesInvestigated++;
      log(state, 'blue', '> Investigate Alert #' + alert.id + ' -> ' + def.name);
      log(state, 'good', '  + TRUE POSITIVE. Technique identified: ' +
        (ra ? ra.name + ' [' + ra.mitre + ' . ' + ra.tactic + ']' : 'unknown') + '.');
      log(state, 'info', '  . Attacker access level on this host: ' +
        (n.access === 'none' ? 'none (attempt failed)' : n.access.toUpperCase()) +
        (n.persistence ? ' . PERSISTENCE FOUND' : ''));
      res.notes.push(ra ? ra.teach.defend : 'Contain, then rebuild.');
    } else {
      state.stats.falsePositivesInvestigated++;
      log(state, 'blue', '> Investigate Alert #' + alert.id + ' -> ' + def.name);
      log(state, 'info', '  . FALSE POSITIVE. ' + alert.text + ' - nothing malicious. ' +
        'An action point spent, but that is the job.');
      res.notes.push('Most alerts are false alarms. Checking is still correct.');
    }
  }

  function applyBlue(state, act, nodeId, res) {
    var b = state.blue;
    var n = nodeId ? state.nodes[nodeId] : null;
    var def = nodeId ? nodeDef(nodeId) : null;
    log(state, 'blue', '> ' + act.name + (def ? ' -> ' + def.name : '') + '  [' + act.nist + ']');

    switch (act.id) {
      case 'siem':
        b.siem = true;
        log(state, 'good', '  + Central logging on. Detection improved everywhere, and log ' +
          'wiping no longer hides much.');
        break;

      case 'mfa':
        b.mfa = true;
        log(state, 'good', '  + MFA enforced on every account. Password attacks are now ' +
          'almost useless.');
        break;

      case 'training':
        b.training++;
        log(state, 'good', '  + Awareness training round ' + b.training + ' complete. Staff are ' +
          'harder to trick.');
        break;

      case 'edr':
        n.edr = true;
        log(state, 'good', '  + EDR agent live on ' + def.name + '.');
        if ((n.persistence || n.access !== 'none') && rnd() < 0.65) {
          n.knownCompromised = true;
          n.blueSeenAccess = n.access;
          log(state, 'alert', '  ! EDR immediately flagged existing attacker activity here.');
          res.notes.push('The new agent found something that was already inside.');
        }
        break;

      case 'patch':
        n.patch++;
        n.vulns = n.vulns.filter(function (vid) {
          var v = (def.vulns || []).filter(function (x) { return x.id === vid; })[0];
          return !(v && v.fixedAtPatch <= n.patch);
        });
        hitUptime(state, 3, 'reboot for updates');
        log(state, 'good', '  + ' + def.name + ' patched to level ' + n.patch + '. ' +
          (n.vulns.length ? n.vulns.length + ' known issue(s) remain.'
                          : 'No known vulnerabilities left.'));
        break;

      case 'segment':
        n.segmented = true;
        log(state, 'good', '  + ' + def.name + ' moved into its own network zone. Hopping into ' +
          'it is now much harder.');
        break;

      case 'isolate':
        n.isolated = true;
        if (n.access !== 'none') {
          log(state, 'good', '  + CONTAINED. The attacker just lost live access to ' + def.name + '.');
          res.notes.push('Good call - they were really in there.');
        } else {
          log(state, 'info', '  . ' + def.name + ' pulled off the network. No attacker was ' +
            'active on it.');
          res.notes.push('Isolating a clean machine costs uptime for nothing. Investigate first.');
        }
        n.access = 'none';
        log(state, 'meter', '  . Uptime will drop every turn this host stays offline.');
        break;

      case 'unisolate':
        n.isolated = false;
        log(state, 'info', '  . ' + def.name + ' is back in service.');
        if (n.persistence) {
          n.access = 'user';
          log(state, 'alert', '  ! A hidden backdoor woke up - the attacker is back on this host. ' +
            'It needed rebuilding, not reconnecting.');
          res.notes.push('Reconnecting without rebuilding handed the access straight back.');
        }
        break;

      case 'remediate':
        var had = (n.access !== 'none' || n.persistence);
        n.access = 'none'; n.persistence = false; n.encrypted = false;
        n.knownCompromised = false; n.blueSeenAccess = 'none';
        n.vulns = []; n.patch = Math.max(n.patch, 1);
        hitUptime(state, 5, 'rebuild downtime');
        log(state, 'good', '  + ' + def.name + ' wiped and rebuilt from a known-good image' +
          (had ? ' - attacker removed, backdoors and all.' : ' (it was already clean).'));
        if (!had) res.notes.push('Rebuilding a clean host costs you time and uptime.');
        break;

      case 'resetcreds':
        var had2 = state.red.stolenCreds.length;
        state.red.stolenCreds = []; state.red.credsFromDc = false;
        hitUptime(state, 4, 'everyone locked out while passwords reset');
        log(state, 'good', '  + Domain-wide password reset. ' + (had2
          ? had2 + ' stolen credential set(s) are now worthless.'
          : 'No credentials had been stolen yet.'));
        if (!had2) res.notes.push('Nothing was stolen yet, so this mostly annoyed the staff.');
        break;

      case 'blockc2':
        b.c2BlockedUntil = state.turn + 2;
        log(state, 'good', '  + Attacker infrastructure blocklisted at the firewall for 3 turns. ' +
          'Stealing data out is now very hard.');
        break;

      case 'restore':
        var fixed = 0;
        Object.keys(state.nodes).forEach(function (k) {
          if (state.nodes[k].encrypted) { state.nodes[k].encrypted = false; fixed++; }
        });
        hitUptime(state, -30, 'systems restored from last night\'s backup');
        log(state, 'good', '  + ' + fixed + ' system(s) restored from backup. This is exactly why ' +
          'backups exist.');
        break;

      case 'hunt':
        var found = (n.access !== 'none') || n.persistence;
        if (found) {
          n.knownCompromised = true;
          n.blueSeenAccess = n.access;
          log(state, 'alert', '  ! THREAT FOUND on ' + def.name + ': access level ' +
            (n.access === 'none' ? 'none' : n.access.toUpperCase()) +
            (n.persistence ? ' + hidden persistence' : '') + '.');
          res.notes.push('Hunting found an attacker that no alert had reported.');
        } else {
          log(state, 'info', '  . ' + def.name + ' is clean. No sign of the attacker here.');
          res.notes.push('A clean result is still useful - it narrows the search.');
        }
        res.found = found;
        break;
    }
  }

  /* ---------- phase changes ---------- */
  function endRedPhase(state) {
    if (state.outcome) return;
    state.phase = 'blue';
    state.blue.ap = state.blue.apMax;
    /* the alert queue also fills with harmless noise */
    if (rnd() < state.difficulty.falsePositiveChance) {
      var ids = Object.keys(state.nodes).filter(function (k) { return k !== 'internet'; });
      var a = raiseAlert(state, pick(ids), null, rnd() < 0.5 ? 'medium' : 'low', false);
      a.text = pick(D.FALSE_POSITIVES);
    }
    log(state, 'turn', '-- TURN ' + state.turn + ' . BLUE TEAM --');
    checkOutcome(state);
  }

  function endBluePhase(state) {
    if (state.outcome) return;

    /* alerts nobody looked at go stale */
    state.alerts.forEach(function (a) {
      if (a.status === 'new' && state.turn - a.turn >= 2) {
        a.status = 'stale';
        if (a.real) state.stats.missedAlerts++;
      }
    });

    /* upkeep: the cost of being broken or switched off */
    var offline = 0, crypted = 0;
    Object.keys(state.nodes).forEach(function (k) {
      if (state.nodes[k].isolated) offline++;
      if (state.nodes[k].encrypted) crypted++;
    });
    if (offline) hitUptime(state, offline * 6, offline + ' host(s) isolated');
    if (crypted) hitUptime(state, crypted * 6, crypted + ' host(s) still encrypted');

    /* persistence keeps paying the attacker */
    Object.keys(state.nodes).forEach(function (k) {
      var n = state.nodes[k];
      if (n.persistence && n.access === 'none' && !n.isolated) {
        n.access = 'user';
        log(state, 'alert', '! A backdoor on ' + nodeDef(k).name + ' called home. The attacker ' +
          'has access again - that host needs rebuilding.');
      }
    });

    checkOutcome(state);
    if (state.outcome) return;

    if (state.turn >= state.maxTurns) {
      state.outcome = {
        winner: 'blue',
        title: 'Attack Survived',
        reason: 'The incident window closed with the student database still inside the network.'
      };
      state.phase = 'over';
      return;
    }

    state.turn++;
    state.phase = 'red';
    state.red.ap = state.red.apMax;
    log(state, 'turn', '-- TURN ' + state.turn + ' . RED TEAM --');
  }

  function endPhase(state) {
    if (state.phase === 'red') endRedPhase(state);
    else if (state.phase === 'blue') endBluePhase(state);
  }

  /* ---------- win / lose ---------- */
  function checkOutcome(state) {
    if (state.outcome) { state.phase = 'over'; return; }

    if (state.meters.dataSafety <= 0) {
      state.outcome = {
        winner: 'red', title: 'Catastrophic Data Loss',
        reason: 'Data Safety hit zero. Enough sensitive data was reached, ruined or taken that ' +
                'the breach is total.'
      };
    } else if (state.meters.uptime <= 0) {
      state.outcome = {
        winner: 'red', title: 'Operations Collapsed',
        reason: 'Uptime hit zero. Between the attack and the response, nothing at Riverbend ' +
                'Academy works any more. Security that stops the organisation functioning is ' +
                'not a win.'
      };
    } else {
      /* blue can win early by closing the door, not just evicting */
      var clean = footholds(state).length === 0 && !anyPersistence(state) &&
                  state.red.stolenCreds.length === 0;
      var doorsShut = D.NODES.every(function (d) {
        if (!d.publicFacing && !d.human) return true;
        return state.nodes[d.id].vulns.length === 0;
      });
      if (state.stats.redEverFoothold && clean && doorsShut && state.blue.mfa) {
        state.outcome = {
          winner: 'blue', title: 'Threat Eradicated',
          reason: 'The attacker was evicted, their credentials were burned, and every way in ' +
                  'was closed behind them. That is a complete response.'
        };
      }
    }
    if (state.outcome) state.phase = 'over';
  }

  /* ---------- scoring & debrief ---------- */
  function score(state) {
    var s = state.stats, m = state.meters;
    var has = function (t) { return s.tactics.indexOf(t) >= 0; };
    var stages = [
      { k: 'Recon', done: s.redEverFoothold || s.tactics.indexOf('Reconnaissance') >= 0 },
      { k: 'Initial Access', done: s.redEverFoothold },
      { k: 'Persistence', done: anyPersistence(state) || has('Persistence') },
      { k: 'Privilege Escalation', done: has('Privilege Escalation') },
      { k: 'Credential Access', done: has('Credential Access') },
      { k: 'Lateral Movement', done: has('Lateral Movement') },
      { k: 'Collection', done: state.nodes.db.dataFound },
      {
        k: 'Exfiltration', done: !!(state.outcome && state.outcome.winner === 'red' &&
          state.outcome.title === 'Data Breach')
      }
    ];
    var redProgress = 0;
    stages.forEach(function (st) { if (st.done) redProgress++; });

    var pts;
    if (state.playerRole === 'red') {
      pts = redProgress * 100 + (100 - m.dataSafety) * 3 + (100 - m.uptime) * 1 +
            s.undetected * 15 - s.detected * 8;
    } else {
      pts = m.dataSafety * 4 + m.uptime * 2 + s.truePositivesInvestigated * 25 +
            s.mitigations.length * 20 - s.missedAlerts * 20 - redProgress * 25;
    }
    pts = Math.max(0, Math.round(pts));
    var grade = pts > 900 ? 'S' : pts > 700 ? 'A' : pts > 500 ? 'B' : pts > 320 ? 'C' : 'D';
    return { points: pts, grade: grade, stages: stages, redProgress: redProgress };
  }

  CG.Engine = {
    createGame: createGame,
    redOptions: redOptions,
    blueOptions: blueOptions,
    doRed: doRed,
    doBlue: doBlue,
    endPhase: endPhase,
    redChance: redChance,
    redTargetOk: redTargetOk,
    blueTargetOk: blueTargetOk,
    footholds: footholds,
    anyPersistence: anyPersistence,
    reachableFrom: reachableFrom,
    pathToTarget: pathToTarget,
    visibility: visibility,
    unpatchedVulns: unpatchedVulns,
    nodeDef: nodeDef,
    redAction: redAction,
    blueAction: blueAction,
    adjacency: ADJ,
    score: score,
    log: log,
    MAX_PATCH: MAX_PATCH
  };
})(window);
