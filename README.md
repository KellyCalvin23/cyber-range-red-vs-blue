# 🛡️ Cyber Range: Red vs Blue

A turn-based cyber security simulation for students who are completely new to the subject.
Play as the **red team** breaking into a fictional school network, or as the **blue team**
defending it from the SOC desk.

It runs entirely in the browser. No installation, no build step, no server, no dependencies.

> **Everything in this simulator is fictional** — the school, the staff, the software and the
> CVE numbers are all invented. It teaches the *shape* of a real attack and the defences that
> break it. It contains no exploit code and nothing in it works on a real computer.

---

## Why this exists

Most beginner material makes hacking look like one dramatic click. Real intrusions are a
**chain** of ordinary-looking steps — research, break in, dig in, spread out, steal — and the
defender does not have to stop every step. They only have to break the chain once, in time.

This simulator makes that chain visible and playable:

- Every red action is labelled with its real **MITRE ATT&CK** technique ID and tactic.
- Every blue action is labelled with its **NIST Cybersecurity Framework** function
  (Identify / Protect / Detect / Respond / Recover).
- Every card has an **ⓘ** button explaining what the technique actually is, how it is used in
  the real world, and what stops it.
- The end-of-game debrief shows how far the attack got, which tactics were used, which defences
  were built, and what to take away from it.

---

## Playing it

### Online

If GitHub Pages is enabled for this repository, the game is live at:

```
https://<your-username>.github.io/<repo-name>/
```

### Locally

Clone or download the repository and open `index.html` in any modern browser. That is it —
double-clicking the file works, because there are no modules, imports or fetches.

If you prefer serving it:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## The scenario

**Operation Glass Hallway** — Riverbend Academy, 900 students.

The school keeps names, home addresses, grades and medical notes on a single database server.
The red team wants a copy. The blue team has to stop them **without shutting the school down
in the process**.

The network has 11 machines. The database is not reachable from the internet, so the attacker
has to hop machine to machine to get to it:

```
                        Internet
                           │
                       Firewall
              ┌────────────┼────────────┐
          Web Server   Email Server    VPN
              │         ┌───┴───┐       │
              │   Teacher PC  Office PC │
              └────────┬──┴───┬─┴───────┘
                 File Server  Domain Controller   Backups
                            └──┬──┘
                      Student Records Database  ← the objective
```

### Two meters, and why both matter

| Meter | Falls when |
| --- | --- |
| **Data Safety** | The attacker reaches, ruins or steals sensitive data |
| **School Uptime** | Machines are offline, encrypted, or pulled off the network by the defender |

If **either** hits zero, the red team wins. That second one is deliberate: a defender who
isolates half the school to be safe has not won anything. Security is always a trade-off
against keeping the organisation running, and the game refuses to let students forget it.

### Win conditions

| Side | Wins by |
| --- | --- |
| 🔴 Red | Exfiltrating the Student Records Database, or driving either meter to zero |
| 🔵 Blue | Surviving the incident window, or evicting the attacker **and** closing every way in |

That last detail matters: evicting an attacker is not enough if the hole they came through is
still open. Blue's early win requires no footholds, no backdoors, no stolen credentials,
every internet-facing weakness patched, **and** MFA enabled.

---

## What each side actually does

### 🔴 Red team — 15 techniques across the kill chain

| Phase | Techniques |
| --- | --- |
| Recon | OSINT Sweep (T1589), Port & Vulnerability Scan (T1595) |
| Break In | Spear-Phishing (T1566.001), Exploit Web Application (T1190), Password Spraying (T1110.003), Malicious USB Drop (T1091) |
| Dig In | Install Persistent Backdoor (T1543), Privilege Escalation (T1068), Dump Credentials (T1003) |
| Spread | Lateral Movement (T1021), Hunt for Sensitive Files (T1083) |
| Hide | Clear Event Logs (T1070.001) |
| Payday | Exfiltrate Data (T1041), Deploy Ransomware (T1486), Destroy Backups (T1490) |

Every action has a **noise** rating from 0 to 5. Noisy actions on well-monitored machines raise
alerts. Red also cannot see a machine's patch level or EDR agent until they scan it — so
attacking blind really does waste turns.

### 🔵 Blue team — 14 controls across the NIST functions

| Function | Controls |
| --- | --- |
| Detect | Investigate Alert, Threat Hunt, Central Logging (SIEM), Deploy EDR |
| Protect | Patch & Update, Enable MFA, Security Awareness Training, Network Segmentation |
| Respond | Isolate Host, Reset All Passwords, Block Command & Control |
| Recover | Rebuild Host, Restore From Backup, Return Host To Service |

**Blue cannot see the attacker.** The map only shows what blue has proved, by confirming an
alert or by threat hunting. The alert queue deliberately fills with **false positives** —
harmless events that look alarming — so students have to practise triage. Alerts left
uninvestigated for two turns **expire**, which is alert fatigue made mechanical.

A few traps are built in on purpose, because they are the mistakes real teams make:

- Reconnecting an isolated host you never **rebuilt** hands the attacker's backdoor straight back.
- Isolating a clean machine costs uptime for nothing — investigate first.
- Resetting passwords before you have evicted the attacker just lets them steal the new ones.
- Clearing logs is useless against a defender who turned on central logging.

---

## Difficulty

| Level | Turns | Red AP | Blue AP | Notes |
| --- | --- | --- | --- | --- |
| 🌱 Rookie | 14 | 2 | 3 | Generous resources, few false alarms |
| 🛡️ Analyst | 12 | 2 | 2 | A fair fight — the intended way to play |
| 🔥 Elite | 10 | 3 | 2 | Quieter attacker, noisy alert queue, less time |

Whichever side you do not pick is played by a heuristic AI that **narrates its reasoning** into
the live feed before every move, so the opponent is a teaching tool rather than a black box.

---

## For teachers

See **[docs/TEACHER-GUIDE.md](docs/TEACHER-GUIDE.md)** for lesson plans, a 50-minute session
outline, discussion questions, the full curriculum mapping and the answer to "what should they
have learned by the end".

---

## Project structure

```
.
├── index.html              # all markup, three screens: start / game / debrief
├── assets/
│   ├── css/style.css       # the whole theme, responsive down to ~360px
│   └── js/
│       ├── data.js         # content: network, actions, teaching text, glossary
│       ├── engine.js       # all game rules; never touches the DOM
│       ├── ai.js           # the opponent for whichever side you are not
│       ├── ui.js           # rendering; enforces what each side can see
│       └── main.js         # input handling and turn flow
└── docs/TEACHER-GUIDE.md
```

The split is deliberate and worth pointing out to students who are also learning to code:
`engine.js` contains the rules and no rendering, `ui.js` contains rendering and no rules.
You can run the engine headlessly in Node to simulate thousands of games without a browser.

### Extending it

Adding a technique takes two edits:

1. Add an entry to `RED_ACTIONS` or `BLUE_ACTIONS` in `data.js`, with its `teach` text.
2. Add a `case` for its id in `redTargetOk` / `redChance` / `applyRedSuccess`
   (or `blueTargetOk` / `applyBlue`) in `engine.js`.

Adding a machine takes one: a new entry in `NODES` plus its `LINKS`. The map positions itself
from the `x` / `y` percentages.

---

## Accessibility

Keyboard playable (Tab to move, Enter/Space to activate, `Escape` to cancel a targeting mode,
`e` to end a turn), `aria-live` on the live feed, visible focus rings, and
`prefers-reduced-motion` honoured.

---

## Licence

MIT — see [LICENSE](LICENSE). Use it in your classroom, fork it, rename the school, add your
own techniques.
