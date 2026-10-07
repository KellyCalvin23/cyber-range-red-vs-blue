# Teacher's Guide — Cyber Range: Red vs Blue

For students with **no prior cyber security knowledge**, roughly ages 11–14 (just out of
primary school). No technical setup is needed beyond a browser.

---

## The one idea you want them to leave with

> An attack is a **chain** of ordinary-looking steps. The defender does not have to stop every
> step — they only have to break the chain once, in time.

Everything else in the simulator serves that sentence. If a student can explain it in their own
words at the end of the lesson, the session worked.

---

## Before you start

**Set the frame honestly.** The red team in this game is a *paid, authorised* attacker — a
profession called penetration testing or red teaming. Organisations hire people to break in on
purpose so that weaknesses get found by someone friendly first.

Worth saying out loud, because students will ask:

- Doing any of this to a computer you do not own and do not have **written permission** to test
  is a crime in most countries, including under the UK Computer Misuse Act 1990.
- This simulator contains **no real exploit code**. The CVE numbers, the software and the school
  are invented. Nothing here transfers to a real machine.
- Both sides of this game are real, well-paid jobs. Blue team roles (SOC analyst, incident
  responder, threat hunter) outnumber red team roles by a wide margin.

---

## A 50-minute session

| Time | Activity |
| --- | --- |
| 0–5 | Set the frame (above). Ask: *how do you think hackers actually get in?* Collect answers on the board — you will come back to them. |
| 5–10 | Project the game. Walk through the network map. Ask students to guess which machine is the most valuable, and which is the easiest to attack. They are not the same machine — that is the lesson of the map. |
| 10–25 | **Everyone plays RED on Rookie.** Goal: reach the database. Most will fail the first time. That is fine and useful. |
| 25–40 | **Everyone plays BLUE on Rookie.** Goal: survive. They now know what the attacker is trying to do, which changes how they defend. |
| 40–50 | Read a debrief screen together. Run the discussion questions below. |

**If you only have 25 minutes:** play red only, on Rookie, then discuss. Red is the more
immediately engaging side; blue lands much better *after* they have attacked.

### Why red first

Students who defend first are guessing. Students who have attacked first already know what
"privilege escalation" and "lateral movement" feel like, so the blue playbook reads as a set of
answers to problems they have personally had. Do not swap the order.

---

## What they will discover by playing (so you do not have to lecture it)

| They try to… | And learn that… |
| --- | --- |
| Attack straight away | Attacking blind wastes turns. Recon comes first. |
| Exploit the web server | Patching it removes the vulnerability completely. Patching is boring and it works. |
| Guess passwords | MFA shuts the attack down almost entirely. |
| Phish a teacher | Training makes it fail — and the person *reports* it instead. |
| Reach the database from the internet | You cannot. You have to hop machine to machine. Segmentation breaks those hops. |
| Act loudly | Monitoring notices. EDR notices much more. |
| Skip the backdoor | One isolation ends the whole run. |
| **(blue)** Ignore the alert queue | Real alerts expire. That is alert fatigue. |
| **(blue)** Isolate everything | Uptime hits zero and red wins. Over-reacting is also losing. |
| **(blue)** Reconnect a host without rebuilding it | The attacker's backdoor hands their access straight back. |

---

## Discussion questions

**After playing red:**

1. Which step of your attack was the easiest? Which was the hardest? Why?
2. You never touched the database until the very end. What were all the earlier steps *for*?
3. If you were defending the school, which **one** change would have stopped your attack
   soonest? (Push for "earliest in the chain", not "biggest".)
4. Two of your moves set off alerts and three did not. What made the difference?

**After playing blue:**

5. How did it feel not being able to see the attacker? What did you have to do to find them?
6. You spent action points on alerts that turned out to be nothing. Was that wasted? *(No — a
   defender who never checks never notices. But it is a real cost, which is why the job is
   about prioritising, not reading everything.)*
7. Your uptime meter fell every time you isolated a machine. Who complains in real life when
   that happens?
8. Which defence gave you the most for one action point? *(MFA, almost always. Then central
   logging, because without it you investigate blind.)*

**Big picture:**

9. The game gives red 15 techniques and blue 14. Does that mean it is a fair fight? What does
   the attacker need to get right, versus the defender?
10. Why is it called *defence in depth* rather than *the best defence*?

---

## Curriculum mapping

| Framework | Covered |
| --- | --- |
| **MITRE ATT&CK** | 15 techniques across 9 tactics: Reconnaissance, Initial Access, Execution, Persistence, Privilege Escalation, Credential Access, Defense Evasion, Lateral Movement, Collection, Exfiltration, Impact |
| **NIST CSF** | All five functions: Identify, Protect, Detect, Respond, Recover |
| **Cyber kill chain** | All seven stages, shown as a progress checklist in the red team's Mission Status panel |
| **CIA triad** | Confidentiality (exfiltration), Integrity (ransomware), **Availability** (the uptime meter — the leg usually left out of beginner material) |
| **GDPR / data protection** | The objective is real children's personal data; the Student Records Database inspector panel explains why that is legally protected |
| **Key concepts** | Least privilege, defence in depth, blast radius, social engineering, alert fatigue, false positives, threat hunting, containment vs. availability, incident response lifecycle |

---

## Extension activities

**No computer needed:**

- **Make the map real.** Have students draw their own school's network from what they can
  observe: where are the public services? Where would the valuable data be? What would an
  attacker's route look like?
- **Write the phishing email.** Give them the OSINT (staff names, email format, term dates) and
  have them write the most convincing email they can. Then have the class spot each other's.
  This teaches detection better than any slide about checking the sender address.
- **Argue the trade-off.** Half the class is the SOC wanting to isolate the file server; half is
  the head teacher who needs it for tomorrow's exams. Make them negotiate.

**With a computer:**

- **Change the balance.** Open `assets/js/data.js`. Make the staff untrainable, or MFA
  unavailable, and replay. Ask students to predict the outcome before they run it.
- **Design a technique.** Add a new red action and its teaching text. They have to decide its
  cost, its noise rating, and what defence should counter it — which is a genuine threat-modelling
  exercise in disguise.
- **Add a machine.** A CCTV system, a payment portal, a staff Wi-Fi network. One entry in `NODES`
  plus its `LINKS`. Ask them where it should sit and what it should be able to reach.

---

## Running it in a classroom

- Works offline once the folder is on the machine — open `index.html` directly.
- No accounts, no data collection, no network calls, no localStorage. Nothing to configure and
  nothing to clean up.
- Each run is short (10–14 turns, roughly 6–10 minutes), so students can replay several times in
  one lesson. Replaying is where the learning is — the first run is just orientation.
- Phone and tablet friendly down to about 360px wide.

---

## Common questions from students

**"Can I do this for real?"**
Yes — as a job. Look up penetration tester, SOC analyst and CTF (Capture The Flag) competitions.
Legal practice ranges exist specifically for this: TryHackMe, Hack The Box, picoCTF. The rule is
always the same: only ever test systems you own or have written permission to test.

**"Why does the blue team lose if uptime hits zero? They stopped the attack!"**
Because a school where nothing works has still been shut down, and the attacker still got what
they wanted. Security exists to let an organisation operate safely, not instead of operating.
This is the single most adult idea in the game — it is worth dwelling on.

**"The attacker got in even though I did everything right."**
Sometimes, yes. Defence is probabilistic. The goal is not a perfect wall, it is making the
attacker slow, loud and detectable — so that you find them before they reach anything important.
Point them at their debrief: how far down the kill chain did the attack actually get?
