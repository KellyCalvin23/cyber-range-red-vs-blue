/* ============================================================
   CYBER RANGE: RED vs BLUE
   data.js — the content layer (network, actions, teaching text)
   Nothing in this file "does" anything. It only describes the world.
   ============================================================ */
(function (global) {
  'use strict';

  var CG = global.CG || (global.CG = {});

  /* ----------------------------------------------------------
     THE SCENARIO
     A fictional school network. Everything here is made up so
     students can attack it safely.
  ---------------------------------------------------------- */
  var SCENARIO = {
    org: 'Riverbend Academy',
    title: 'Operation Glass Hallway',
    redBrief:
      'You are a RED TEAMER — a paid, authorised attacker. Riverbend Academy hired your ' +
      'team to break in on purpose, so the school can find its weak spots before a real ' +
      'criminal does. Your mission: steal a copy of the Student Records Database and get ' +
      'it out of the network before the defenders throw you out.',
    blueBrief:
      'You are a BLUE TEAMER — a defender in the Security Operations Centre (SOC). An ' +
      'attacker is probing Riverbend Academy right now. Your mission: spot them, kick them ' +
      'out, and close the hole they came through — all while keeping the school\'s computers ' +
      'actually working for staff and students.',
    crownJewel: 'db'
  };

  /* ----------------------------------------------------------
     NETWORK NODES
     x / y are percentages used to place the node on the map.
  ---------------------------------------------------------- */
  var NODES = [
    {
      id: 'internet', name: 'The Internet', short: 'Internet', icon: '🌐', kind: 'cloud',
      x: 50, y: 7, publicFacing: true, attackerHome: true,
      desc: 'The outside world. This is where the red teamer sits.',
      realWorld: 'Every attack from outside your organisation arrives through here.'
    },
    {
      id: 'firewall', name: 'Perimeter Firewall', short: 'Firewall', icon: '🧱', kind: 'edge',
      x: 50, y: 21, publicFacing: true,
      services: ['Inbound 80/443 allowed', 'Inbound 443 VPN allowed'],
      desc: 'The front gate. It decides which traffic from the internet is allowed in.',
      realWorld: 'A firewall is like a bouncer on a door: it checks where traffic is going ' +
        'and turns away anything that is not on the guest list.'
    },
    {
      id: 'web', name: 'School Website Server', short: 'Web Server', icon: '🖥️', kind: 'server',
      x: 14, y: 38, publicFacing: true, hasAccounts: true,
      services: ['HTTP 80', 'HTTPS 443', 'SchoolPress CMS v4.1'],
      vulns: [
        { id: 'cms-upload', name: 'SchoolPress file-upload flaw', ref: 'CVE-2024-0001 (fictional)', severity: 'critical', fixedAtPatch: 1 }
      ],
      desc: 'Runs riverbend.example — news, term dates and the parents\' portal.',
      realWorld: 'Public web servers are the most common way attackers get their first ' +
        'foothold, because anyone on the planet can reach them.'
    },
    {
      id: 'mail', name: 'Email Server', short: 'Email', icon: '📧', kind: 'server',
      x: 50, y: 38, publicFacing: true, hasAccounts: true,
      services: ['SMTP 25', 'IMAP 993', 'Webmail portal'],
      vulns: [
        { id: 'mail-nospf', name: 'No anti-spoofing records (SPF/DMARC)', ref: 'Misconfiguration', severity: 'medium', fixedAtPatch: 1 }
      ],
      desc: 'Handles mail for every teacher, parent and student account.',
      realWorld: 'Email is the number one delivery route for phishing attacks.'
    },
    {
      id: 'vpn', name: 'Remote Access Portal', short: 'VPN', icon: '🔑', kind: 'server',
      x: 86, y: 38, publicFacing: true, hasAccounts: true,
      services: ['HTTPS 443 login page'],
      vulns: [
        { id: 'vpn-nolockout', name: 'No account-lockout policy', ref: 'Misconfiguration', severity: 'high', fixedAtPatch: 1 }
      ],
      desc: 'Lets staff log in from home. One password gets you inside the network.',
      realWorld: 'Login portals exposed to the internet get hammered by automated ' +
        'password-guessing every single day.'
    },
    {
      id: 'wks-teacher', name: "Teacher's Laptop", short: 'Teacher PC', icon: '💻', kind: 'workstation',
      x: 28, y: 57, hasAccounts: true, human: true,
      services: ['Windows 11', 'Office suite', 'Marking software'],
      vulns: [
        { id: 'wks-oldpatch', name: 'Missing operating-system updates', ref: 'CVE-2024-0007 (fictional)', severity: 'high', fixedAtPatch: 1 }
      ],
      desc: 'Ms Achieng\'s laptop. She reads a lot of email and clicks quickly.',
      realWorld: 'People are not the "weakest link" — they are the biggest target. ' +
        'Training and good tools protect them.'
    },
    {
      id: 'wks-office', name: 'Front Office PC', short: 'Office PC', icon: '🖨️', kind: 'workstation',
      x: 64, y: 57, hasAccounts: true, human: true,
      services: ['Windows 11', 'Student records client', 'Printer share'],
      vulns: [
        { id: 'office-localadmin', name: 'Everyday user has admin rights', ref: 'Misconfiguration', severity: 'high', fixedAtPatch: 1 }
      ],
      desc: 'The reception computer. It can open the Student Records Database.',
      realWorld: 'If an ordinary account has admin rights, an attacker who steals that ' +
        'account instantly gets admin rights too.'
    },
    {
      id: 'fileserver', name: 'Shared File Server', short: 'File Server', icon: '🗄️', kind: 'server',
      x: 14, y: 75, hasData: true,
      services: ['SMB 445', 'Staff + department shares'],
      desc: 'Lesson plans, exam drafts, photos, staff documents.',
      realWorld: 'File servers are a favourite target for ransomware because one machine ' +
        'holds everybody\'s work.'
    },
    {
      id: 'dc', name: 'Domain Controller', short: 'Domain Ctrl', icon: '👑', kind: 'server',
      x: 50, y: 75, crown: true,
      services: ['Active Directory', 'Kerberos 88', 'LDAP 389'],
      desc: 'The master key cabinet. It holds every username and password hash in the school.',
      realWorld: 'Own the domain controller and you own every computer in the organisation. ' +
        'Defenders call this "game over".'
    },
    {
      id: 'backup', name: 'Backup Vault', short: 'Backups', icon: '📦', kind: 'server',
      x: 86, y: 75,
      services: ['Nightly backup jobs'],
      desc: 'Last night\'s copy of everything. The defender\'s undo button.',
      realWorld: 'Attackers delete backups first, so that paying the ransom becomes the ' +
        'only option. Good backups are kept offline.'
    },
    {
      id: 'db', name: 'Student Records Database', short: 'Records DB', icon: '🎯', kind: 'database',
      x: 32, y: 92, crown: true, hasData: true, objective: true,
      services: ['SQL 1433', 'Grades, addresses, medical notes'],
      desc: 'THE TARGET. Names, home addresses, grades and medical notes for 900 students.',
      realWorld: 'This is real personal data about children. In the UK/EU this is protected ' +
        'by law (GDPR) and a leak can cost a school a huge fine — and a lot of trust.'
    }
  ];

  /* Which machines can talk to which. Red can only move along these lines. */
  var LINKS = [
    ['internet', 'firewall'],
    ['firewall', 'web'], ['firewall', 'mail'], ['firewall', 'vpn'],
    ['web', 'fileserver'],
    ['mail', 'wks-teacher'], ['mail', 'wks-office'],
    ['vpn', 'wks-teacher'], ['vpn', 'dc'],
    ['wks-teacher', 'fileserver'], ['wks-teacher', 'dc'],
    ['wks-office', 'fileserver'], ['wks-office', 'dc'],
    ['fileserver', 'db'], ['fileserver', 'backup'],
    ['dc', 'db'], ['dc', 'backup'], ['dc', 'fileserver']
  ];

  /* ----------------------------------------------------------
     RED TEAM PLAYBOOK
     target: 'none'      -> no target needed
             'known'     -> any machine red has discovered
             'foothold'  -> a machine red already controls
             'adjacent'  -> a machine next to one red controls
             'alert'     -> n/a for red
     tactic / mitre follow the real MITRE ATT&CK framework so
     students learn vocabulary professionals actually use.
  ---------------------------------------------------------- */
  var RED_ACTIONS = [
    {
      id: 'osint', name: 'OSINT Sweep', phase: 'Recon', tactic: 'Reconnaissance',
      mitre: 'T1589', cost: 1, noise: 0, target: 'none',
      blurb: 'Read the school website, social media and job adverts.',
      teach: {
        what: 'OSINT means Open Source Intelligence — information anyone can look up for free.',
        real: 'Attackers collect staff names, email patterns (first.last@school.com), software ' +
              'names and even photos of ID badges, all before touching the network.',
        defend: 'You cannot patch the internet. Instead, limit what you publish and train staff ' +
              'to expect convincing, personalised messages.'
      }
    },
    {
      id: 'scan', name: 'Port & Vulnerability Scan', phase: 'Recon', tactic: 'Reconnaissance',
      mitre: 'T1595', cost: 1, noise: 2, target: 'known',
      blurb: 'Knock on every door of a machine and note which ones open.',
      teach: {
        what: 'A scanner tries thousands of "ports" to work out what software is running, then ' +
              'checks that software against a list of known bugs.',
        real: 'Tools like Nmap and Nessus do this. Scanning is loud — it leaves a trail in logs.',
        defend: 'Close ports you do not need, and watch for one address touching hundreds of ports.'
      }
    },
    {
      id: 'phish', name: 'Spear-Phishing Email', phase: 'Break In', tactic: 'Initial Access',
      mitre: 'T1566.001', cost: 1, noise: 1, target: 'human', needs: ['osint'],
      blurb: 'Send one person a believable email with a booby-trapped attachment.',
      teach: {
        what: 'Phishing tricks a person into opening something. "Spear" phishing targets one ' +
              'named individual using details from your OSINT.',
        real: 'The most successful emails are boring: "Your timetable has changed, see attached."',
        defend: 'Training, email filtering, blocking macros, and making it easy to report ' +
              'suspicious mail without feeling silly.'
      }
    },
    {
      id: 'webexploit', name: 'Exploit Web Application', phase: 'Break In', tactic: 'Initial Access',
      mitre: 'T1190', cost: 2, noise: 3, target: 'known', needsScan: true,
      blurb: 'Abuse a known bug in public software to run your own code.',
      teach: {
        what: 'An exploit is a piece of code that abuses a programming mistake to make software ' +
              'do something it was never meant to do.',
        real: 'Most breaches use bugs that were fixed months earlier — the victim just had not ' +
              'installed the update yet.',
        defend: 'Patch quickly, and put a Web Application Firewall in front of public apps.'
      }
    },
    {
      id: 'spray', name: 'Password Spraying', phase: 'Break In', tactic: 'Credential Access',
      mitre: 'T1110.003', cost: 1, noise: 3, target: 'known', needs: ['osint'],
      blurb: 'Try one very common password against hundreds of usernames.',
      teach: {
        what: 'Instead of guessing many passwords for one user (which locks the account), you ' +
              'guess one password — like Riverbend2024! — against every user.',
        real: 'In a group of 500 staff, somebody almost always used the obvious password.',
        defend: 'Multi-Factor Authentication stops this almost completely. Lockout policies and ' +
              'banned-password lists help too.'
      }
    },
    {
      id: 'usb', name: 'Malicious USB Drop', phase: 'Break In', tactic: 'Initial Access',
      mitre: 'T1091', cost: 1, noise: 1, target: 'human',
      blurb: 'Leave a USB stick labelled "EXAM ANSWERS" in the car park.',
      teach: {
        what: 'A prepared USB stick can pretend to be a keyboard and type commands the instant ' +
              'it is plugged in.',
        real: 'Studies have dropped USB sticks on campuses and found around half get plugged in.',
        defend: 'Block unknown USB devices in policy, and tell people to hand found devices to IT.'
      }
    },
    {
      id: 'backdoor', name: 'Install Persistent Backdoor', phase: 'Dig In', tactic: 'Persistence',
      mitre: 'T1543', cost: 1, noise: 2, target: 'foothold',
      blurb: 'Hide a service that calls you back every time the machine starts.',
      teach: {
        what: 'Persistence means surviving a reboot. Without it, one restart ends your access.',
        real: 'Attackers hide in scheduled tasks, start-up folders and system services with ' +
              'innocent names like "WindowsUpdateHelper".',
        defend: 'EDR software watches for new services and start-up entries. Threat hunting finds them.'
      }
    },
    {
      id: 'privesc', name: 'Privilege Escalation', phase: 'Dig In', tactic: 'Privilege Escalation',
      mitre: 'T1068', cost: 1, noise: 2, target: 'foothold',
      blurb: 'Go from ordinary user to full administrator on this machine.',
      teach: {
        what: 'You usually land as a normal user who cannot do much. Escalation upgrades you to ' +
              'administrator — the account that can change anything.',
        real: 'Often achieved with an unpatched operating-system bug or a badly configured service.',
        defend: 'Patch, and follow least privilege: nobody runs as admin for everyday work.'
      }
    },
    {
      id: 'creddump', name: 'Dump Credentials', phase: 'Dig In', tactic: 'Credential Access',
      mitre: 'T1003', cost: 1, noise: 3, target: 'foothold',
      blurb: 'Pull usernames and password hashes out of the machine\'s memory.',
      teach: {
        what: 'Windows keeps proof-of-login in memory. With admin rights you can read it and ' +
              'reuse it elsewhere — you never need the real password.',
        real: 'The classic tool is Mimikatz. Stolen hashes are the key to moving across a network.',
        defend: 'EDR blocks memory dumping, and resetting passwords makes stolen hashes useless.'
      }
    },
    {
      id: 'lateral', name: 'Lateral Movement', phase: 'Spread', tactic: 'Lateral Movement',
      mitre: 'T1021', cost: 1, noise: 2, target: 'adjacent', needsCreds: true,
      blurb: 'Use stolen credentials to log in to a neighbouring machine.',
      teach: {
        what: 'Moving sideways from one machine to the next, getting closer to the real target.',
        real: 'This is where most of an intrusion happens. Attackers use normal admin tools ' +
              '(RDP, PsExec, WinRM) so they blend in with real IT work.',
        defend: 'Network segmentation: if the office PC simply cannot reach the database, the ' +
              'attacker is stuck.'
      }
    },
    {
      id: 'discoverdata', name: 'Hunt for Sensitive Files', phase: 'Spread', tactic: 'Collection',
      mitre: 'T1083', cost: 1, noise: 1, target: 'foothold',
      blurb: 'Search the machine for the data worth stealing.',
      teach: {
        what: 'Before you can steal data you have to find it, and confirm it is the real thing.',
        real: 'Attackers grep for words like "password", "passport", "medical", "payroll".',
        defend: 'Data classification and Data Loss Prevention tools flag unusual bulk access.'
      }
    },
    {
      id: 'clearlogs', name: 'Clear Event Logs', phase: 'Hide', tactic: 'Defense Evasion',
      mitre: 'T1070.001', cost: 1, noise: 2, target: 'foothold',
      blurb: 'Wipe the machine\'s records of what you have been doing.',
      teach: {
        what: 'Logs are the defender\'s memory. Deleting them makes you temporarily invisible on ' +
              'that machine — and cancels an alert that had not been investigated yet.',
        real: 'Deleting a log is itself suspicious, so careful attackers edit rather than wipe.',
        defend: 'Ship logs off the machine to a central SIEM the moment they are written. You ' +
              'cannot delete what has already left the building.'
      }
    },
    {
      id: 'exfil', name: 'Exfiltrate Data', phase: 'Payday', tactic: 'Exfiltration',
      mitre: 'T1041', cost: 2, noise: 4, target: 'foothold',
      blurb: 'Copy the stolen database out of the network. THIS WINS THE GAME.',
      teach: {
        what: 'Exfiltration is getting the data out. Until data leaves, nothing has been stolen.',
        real: 'Data is sent out slowly, disguised as normal web traffic or hidden in DNS requests.',
        defend: 'Watch outbound traffic, not just inbound. Block known command-and-control servers.'
      }
    },
    {
      id: 'ransom', name: 'Deploy Ransomware', phase: 'Payday', tactic: 'Impact',
      mitre: 'T1486', cost: 2, noise: 5, target: 'foothold',
      blurb: 'Encrypt everything and demand payment. Very loud, very damaging.',
      teach: {
        what: 'Ransomware scrambles files so nobody can open them, then sells you the key.',
        real: 'Real schools and hospitals have been shut down for weeks by this.',
        defend: 'Offline backups you have actually tested restoring. That is the whole answer.'
      }
    },
    {
      id: 'wipebackup', name: 'Destroy Backups', phase: 'Payday', tactic: 'Impact',
      mitre: 'T1490', cost: 1, noise: 3, target: 'foothold',
      blurb: 'Delete the defender\'s undo button before you strike.',
      teach: {
        what: 'Removing the ability to recover, so that recovery is impossible without you.',
        real: 'Attackers now routinely hunt backup servers before deploying ransomware.',
        defend: 'Keep one backup copy offline or write-once, on separate credentials.'
      }
    }
  ];

  /* ----------------------------------------------------------
     BLUE TEAM PLAYBOOK
     Grouped by the NIST Cybersecurity Framework functions.
  ---------------------------------------------------------- */
  var BLUE_ACTIONS = [
    {
      id: 'triage', name: 'Investigate Alert', phase: 'Detect', nist: 'Detect',
      cost: 1, target: 'alert',
      blurb: 'Dig into one alert and find out whether it is real.',
      teach: {
        what: 'Triage means deciding fast whether an alert is a true threat or a false alarm.',
        real: 'A real SOC sees thousands of alerts a day and most are harmless. Missing the one ' +
              'that matters is called alert fatigue.',
        defend: 'Confirming an alert tells you exactly which machine is compromised, so your ' +
              'response does not hurt innocent systems.'
      }
    },
    {
      id: 'hunt', name: 'Threat Hunt', phase: 'Detect', nist: 'Detect',
      cost: 1, target: 'node',
      blurb: 'Go looking for an attacker on a machine without waiting for an alert.',
      teach: {
        what: 'Hunting assumes the attacker is already inside and quietly looks for their traces.',
        real: 'Hunters search for odd scheduled tasks, strange outbound connections and logins ' +
              'at 3am.',
        defend: 'This is how you catch the quiet attackers who never set off an alarm.'
      }
    },
    {
      id: 'siem', name: 'Turn On Central Logging', phase: 'Detect', nist: 'Detect',
      cost: 1, target: 'none', once: true,
      blurb: 'Send every machine\'s logs to one safe place. Improves detection everywhere.',
      teach: {
        what: 'A SIEM collects logs from everything into one searchable system.',
        real: 'Splunk, Sentinel and Elastic do this. Without it you are investigating blind.',
        defend: 'Also stops "Clear Event Logs" from working — the logs already left the machine.'
      }
    },
    {
      id: 'edr', name: 'Deploy EDR Agent', phase: 'Detect', nist: 'Detect',
      cost: 1, target: 'node',
      blurb: 'Install a watchdog on one machine. Sees more, and blocks malware tricks.',
      teach: {
        what: 'EDR = Endpoint Detection and Response. It watches program behaviour, not just ' +
              'known virus signatures.',
        real: 'EDR is what catches credential dumping and new backdoor services in the real world.',
        defend: 'Strong detection AND strong prevention on the machine you install it on.'
      }
    },
    {
      id: 'patch', name: 'Patch & Update', phase: 'Protect', nist: 'Protect',
      cost: 1, target: 'node',
      blurb: 'Install updates on a machine, removing its known bugs. Brief downtime.',
      teach: {
        what: 'A patch is the fix the software maker already wrote for a known bug.',
        real: 'Patching is the single most effective thing most organisations are not doing fast ' +
              'enough. It is unglamorous and it works.',
        defend: 'Removes the vulnerability an exploit relies on. Costs a little uptime to reboot.'
      }
    },
    {
      id: 'mfa', name: 'Enable Multi-Factor Auth', phase: 'Protect', nist: 'Protect',
      cost: 1, target: 'none', once: true,
      blurb: 'Require a second proof of identity everywhere. Shuts down password attacks.',
      teach: {
        what: 'MFA asks for something you know (password) plus something you have (phone, key).',
        real: 'Microsoft has reported MFA blocks the overwhelming majority of account-takeover ' +
              'attempts.',
        defend: 'Makes password spraying and stolen passwords nearly useless. Best value on this board.'
      }
    },
    {
      id: 'training', name: 'Security Awareness Training', phase: 'Protect', nist: 'Protect',
      cost: 1, target: 'none', maxLevel: 2,
      blurb: 'Teach staff to spot phishing and odd USB sticks. Can be done twice.',
      teach: {
        what: 'Short, frequent, blame-free practice at spotting tricks — not a once-a-year lecture.',
        real: 'The goal is not zero clicks. It is fast reporting, so the SOC hears about it in ' +
              'minutes rather than weeks.',
        defend: 'Directly lowers the chance phishing and USB attacks succeed.'
      }
    },
    {
      id: 'segment', name: 'Network Segmentation', phase: 'Protect', nist: 'Protect',
      cost: 2, target: 'node',
      blurb: 'Wall off one machine so attackers cannot hop into it. Expensive but strong.',
      teach: {
        what: 'Splitting a network into zones that can only talk to each other in approved ways.',
        real: 'A flat network means one infected laptop can reach the payroll server. ' +
              'Segmentation is why that should be impossible.',
        defend: 'Makes lateral movement into this machine much harder to pull off.'
      }
    },
    {
      id: 'isolate', name: 'Isolate Host', phase: 'Respond', nist: 'Respond',
      cost: 1, target: 'node',
      blurb: 'Yank a machine off the network right now. Cuts the attacker off — and the user.',
      teach: {
        what: 'Containment. Stop the bleeding first, investigate second.',
        real: 'One click in modern EDR. The hard part is deciding fast enough, and being right.',
        defend: 'Instantly removes the attacker\'s live access, but the machine is useless to ' +
              'its owner while isolated, so your uptime score falls every turn.'
      }
    },
    {
      id: 'remediate', name: 'Rebuild Host', phase: 'Respond', nist: 'Recover',
      cost: 2, target: 'node',
      blurb: 'Wipe and reinstall a machine. Removes hidden backdoors for good.',
      teach: {
        what: 'When you cannot be sure a machine is clean, you flatten it and rebuild from scratch.',
        real: 'Professionals rarely "clean" a compromised server. They rebuild it, because you ' +
              'can never prove you found everything.',
        defend: 'The only reliable way to remove persistence.'
      }
    },
    {
      id: 'resetcreds', name: 'Reset All Passwords', phase: 'Respond', nist: 'Respond',
      cost: 1, target: 'none',
      blurb: 'Force a password change everywhere. Makes stolen credentials worthless.',
      teach: {
        what: 'If an attacker has stolen password hashes, changing the passwords breaks them.',
        real: 'Timing matters enormously: reset too early and the attacker still has a foothold ' +
              'to steal the new ones.',
        defend: 'Clears the attacker\'s stolen credential stash, blocking lateral movement.'
      }
    },
    {
      id: 'blockc2', name: 'Block Command & Control', phase: 'Respond', nist: 'Respond',
      cost: 1, target: 'none',
      blurb: 'Blocklist the attacker\'s servers at the firewall. Chokes data theft for 3 turns.',
      teach: {
        what: 'C2 is the server the attacker\'s malware phones home to for orders.',
        real: 'Defenders share C2 addresses with each other as "threat intelligence" so everyone ' +
              'can block them at once.',
        defend: 'Stolen data cannot leave if it has nowhere to go. Attackers rotate servers, so ' +
              'this buys time rather than winning outright.'
      }
    },
    {
      id: 'restore', name: 'Restore From Backup', phase: 'Recover', nist: 'Recover',
      cost: 2, target: 'none',
      blurb: 'Undo ransomware damage — but only if your backups still exist.',
      teach: {
        what: 'Recovery: getting the organisation working again after damage.',
        real: 'Backups you have never tested restoring are not backups. They are hope.',
        defend: 'Repairs encrypted machines and restores most of your uptime score.'
      }
    },
    {
      id: 'unisolate', name: 'Return Host To Service', phase: 'Recover', nist: 'Recover',
      cost: 0, target: 'node',
      blurb: 'Reconnect an isolated machine. Free — but only safe once it is clean.',
      teach: {
        what: 'Putting a contained machine back to work.',
        real: 'Reconnecting a machine you never actually cleaned is how intrusions come back.',
        defend: 'Stops the uptime drain. If the attacker still has a backdoor, they get their ' +
              'access back.'
      }
    }
  ];

  /* ----------------------------------------------------------
     FALSE POSITIVES — harmless events that look scary.
     These teach triage: not every alarm is a fire.
  ---------------------------------------------------------- */
  var FALSE_POSITIVES = [
    'Large file transfer at 02:14 — later found to be the nightly backup job.',
    'Repeated failed logins from Mr Odhiambo, who had caps lock on.',
    'New scheduled task created — the IT team\'s own printer-driver rollout.',
    'Unusual outbound traffic — a Windows update downloading in the background.',
    'PowerShell script executed — the IT department\'s inventory script.',
    'Port scan from inside the network — the asset-management tool doing its weekly sweep.',
    'Login from an unusual country — a teacher on a school trip to Spain.',
    'Antivirus flagged a file — a false detection on a maths revision spreadsheet.'
  ];

  /* ----------------------------------------------------------
     DIFFICULTY
  ---------------------------------------------------------- */
  var DIFFICULTY = {
    rookie: {
      key: 'rookie', name: 'Rookie', emoji: '🌱',
      desc: 'Learning the ropes. Generous resources, fewer false alarms.',
      redAp: 2, blueAp: 3, maxTurns: 14,
      redSuccessMod: 0.00, detectMod: 0.12, falsePositiveChance: 0.15
    },
    analyst: {
      key: 'analyst', name: 'Analyst', emoji: '🛡️',
      desc: 'A fair fight. The intended way to play.',
      redAp: 2, blueAp: 2, maxTurns: 12,
      redSuccessMod: 0.00, detectMod: 0.00, falsePositiveChance: 0.35
    },
    elite: {
      key: 'elite', name: 'Elite', emoji: '🔥',
      desc: 'Advanced threat. Quieter attacker, noisy alert queue, less time.',
      redAp: 3, blueAp: 2, maxTurns: 10,
      redSuccessMod: 0.08, detectMod: -0.10, falsePositiveChance: 0.5
    }
  };

  /* ----------------------------------------------------------
     GLOSSARY
  ---------------------------------------------------------- */
  var GLOSSARY = [
    ['Red Team', 'Authorised attackers. They break in on purpose to find weaknesses before criminals do.'],
    ['Blue Team', 'Defenders. They monitor, detect, respond and recover.'],
    ['Purple Team', 'Red and blue working together, sharing findings as they go.'],
    ['Vulnerability', 'A mistake or weakness in software or setup that could be abused.'],
    ['Exploit', 'The actual code or trick that abuses a vulnerability.'],
    ['Patch', 'An update that fixes a vulnerability.'],
    ['Zero-day', 'A vulnerability with no patch available yet, because nobody has fixed it.'],
    ['Phishing', 'A message designed to trick you into clicking, opening or revealing something.'],
    ['Social Engineering', 'Hacking people instead of computers — using trust, urgency or authority.'],
    ['Foothold', 'The attacker\'s first point of control inside the network.'],
    ['Persistence', 'A hidden way back in that survives reboots.'],
    ['Privilege Escalation', 'Upgrading from a limited account to an administrator account.'],
    ['Lateral Movement', 'Hopping from one machine to another inside the network.'],
    ['Credential', 'Proof of who you are — a password, hash, token or key.'],
    ['Hash', 'A scrambled fingerprint of a password. Sometimes enough to log in with.'],
    ['Exfiltration', 'Copying stolen data out of the network. Until this happens, nothing is stolen.'],
    ['Ransomware', 'Malware that encrypts your files and demands payment for the key.'],
    ['C2 (Command & Control)', 'The attacker\'s server that their malware takes orders from.'],
    ['SOC', 'Security Operations Centre — the team and room where defenders watch for attacks.'],
    ['SIEM', 'A system that collects logs from everywhere so defenders can search them.'],
    ['EDR', 'Endpoint Detection & Response — a watchdog program on each computer.'],
    ['Firewall', 'A filter that decides which network traffic is allowed through.'],
    ['Segmentation', 'Splitting a network into zones so a problem in one cannot spread.'],
    ['MFA', 'Multi-Factor Authentication — password plus a second proof like a phone code.'],
    ['Least Privilege', 'Give every account the minimum rights it needs, and nothing more.'],
    ['Triage', 'Quickly sorting alerts into real threats and false alarms.'],
    ['False Positive', 'An alert about something that turned out to be harmless.'],
    ['Alert Fatigue', 'Being so flooded with alarms that you stop noticing the real one.'],
    ['Threat Hunting', 'Searching for an attacker proactively, without waiting for an alert.'],
    ['Containment', 'Cutting off a compromised machine to stop the attack spreading.'],
    ['Indicator of Compromise', 'A clue that an attack happened — a file, address or odd behaviour.'],
    ['MITRE ATT&CK', 'A free public catalogue of real attacker techniques, each with a code like T1566.'],
    ['Kill Chain', 'The ordered stages of an attack: recon, access, persistence, movement, impact.'],
    ['Defence in Depth', 'Many layers of protection, so one failure does not lose the game.'],
    ['Blast Radius', 'How much damage one compromised account or machine could cause.'],
    ['OSINT', 'Open Source Intelligence — research using only publicly available information.']
  ];

  CG.DATA = {
    SCENARIO: SCENARIO,
    NODES: NODES,
    LINKS: LINKS,
    RED_ACTIONS: RED_ACTIONS,
    BLUE_ACTIONS: BLUE_ACTIONS,
    FALSE_POSITIVES: FALSE_POSITIVES,
    DIFFICULTY: DIFFICULTY,
    GLOSSARY: GLOSSARY
  };
})(window);
