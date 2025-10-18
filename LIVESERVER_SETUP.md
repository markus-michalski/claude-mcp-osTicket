# 🖥️ Liveserver Setup - SSH-User & MariaDB

**Ziel:** Dedizierter SSH-User `claude` + MariaDB readonly-User für MCP Server

---

## Teil 1: SSH-User "claude" erstellen

### 1.1 Als root/sudo auf Liveserver einloggen

```bash
# Von deinem Entwicklungsrechner aus
ssh dein-aktueller-user@liveserver

# Zu root wechseln (falls nicht schon root)
sudo -i
```

### 1.2 User "claude" anlegen

```bash
# User erstellen (mit Home-Verzeichnis)
useradd -m -s /bin/bash claude

# Optional: Passwort setzen (für Notfall-Login)
passwd claude
# Passwort eingeben und bestätigen
```

### 1.3 SSH-Verzeichnis vorbereiten

```bash
# SSH-Verzeichnis für claude erstellen
mkdir -p /home/claude/.ssh
chmod 700 /home/claude/.ssh

# authorized_keys-Datei anlegen
touch /home/claude/.ssh/authorized_keys
chmod 600 /home/claude/.ssh/authorized_keys

# Besitzer setzen
chown -R claude:claude /home/claude/.ssh
```

---

## Teil 2: SSH-Key generieren und deployen

### 2.1 SSH-Key auf Entwicklungsrechner erstellen

```bash
# Auf deinem Entwicklungsrechner (NICHT auf dem Liveserver!)
ssh-keygen -t ed25519 -C "claude-mcp-server" -f ~/.ssh/claude_osticket

# Das erstellt:
# - ~/.ssh/claude_osticket (Private Key - GEHEIM!)
# - ~/.ssh/claude_osticket.pub (Public Key - kann geteilt werden)
```

**Wichtig:**
- Passwort-Schutz für Key optional (leer lassen für automatischen Login)
- Private Key NIEMALS teilen oder committen!

### 2.2 Public Key auf Liveserver deployen

```bash
# Public Key anzeigen (kopiere die komplette Zeile!)
cat ~/.ssh/claude_osticket.pub

# Ausgabe sieht aus wie:
# ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAbC... claude-mcp-server
```

**Auf Liveserver (als root):**

```bash
# Public Key zu authorized_keys hinzufügen
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAbC... claude-mcp-server" >> /home/claude/.ssh/authorized_keys

# Alternativ mit nano/vi editieren:
nano /home/claude/.ssh/authorized_keys
# Public Key einfügen, speichern, schließen
```

### 2.3 SSH-Zugriff testen

```bash
# Von Entwicklungsrechner aus testen
ssh -i ~/.ssh/claude_osticket claude@liveserver

# Sollte OHNE Passwort-Abfrage funktionieren!
# Wenn's klappt: mit 'exit' wieder raus
```

**Bei Problemen:**

```bash
# SSH-Debugging aktivieren
ssh -vvv -i ~/.ssh/claude_osticket claude@liveserver

# Auf Liveserver: Berechtigungen nochmal prüfen
chmod 700 /home/claude/.ssh
chmod 600 /home/claude/.ssh/authorized_keys
chown -R claude:claude /home/claude/.ssh
```

---

## Teil 3: MariaDB readonly-User erstellen

### 3.1 Als root in MariaDB einloggen

```bash
# Auf Liveserver (als root)
mysql -u root -p
# Root-Passwort eingeben
```

### 3.2 User erstellen und Rechte vergeben

```sql
-- User für osTicket-Zugriff erstellen (localhost-only!)
CREATE USER 'osticket_readonly'@'localhost'
IDENTIFIED BY 'DEIN_SICHERES_PASSWORT_HIER';

-- Nur SELECT-Rechte auf osTicket-DB geben
GRANT SELECT ON mm_tickets.*
TO 'osticket_readonly'@'localhost';

-- Rechte aktivieren
FLUSH PRIVILEGES;

-- Prüfen ob User angelegt wurde
SELECT User, Host FROM mysql.user WHERE User = 'osticket_readonly';

-- Sollte ausgeben:
-- +-------------------+-----------+
-- | User              | Host      |
-- +-------------------+-----------+
-- | osticket_readonly | localhost |
-- +-------------------+-----------+
```

**Warum `@'localhost'`?**
- SSH-Tunnel leitet alles über localhost um
- Kein Remote-Zugriff nötig = sicherer!
- User kann NUR vom Server selbst auf DB zugreifen

### 3.3 User testen

```sql
-- Verlasse root-Session
exit;
```

```bash
# Login als readonly-User testen
mysql -u osticket_readonly -p mm_tickets

# Passwort eingeben (das von oben)
```

```sql
-- In mysql: Tabellen anzeigen
SHOW TABLES;

-- Sollte alle ost_* Tabellen zeigen, z.B.:
-- ost_ticket
-- ost_thread
-- ost_thread_entry
-- ost_user
-- ...

-- Test-Query
SELECT COUNT(*) as ticket_count FROM ost_ticket;

-- Sollte Anzahl der Tickets ausgeben

-- Write-Test (sollte FEHLSCHLAGEN!)
INSERT INTO ost_ticket VALUES (...);
-- ERROR 1142: INSERT command denied to user 'osticket_readonly'@'localhost'
-- ✅ Perfekt! User ist readonly.

exit;
```

---

## Teil 4: Sicherheits-Härtung (Optional aber empfohlen)

### 4.1 SSH-Config für claude-User einschränken

```bash
# Als root auf Liveserver
nano /etc/ssh/sshd_config
```

**Am Ende der Datei hinzufügen:**

```
# claude-User Einschränkungen
Match User claude
    # Nur Port-Forwarding erlauben (kein Shell-Zugriff)
    ForceCommand /bin/echo "SSH Tunnel only - no shell access"
    AllowTcpForwarding yes
    X11Forwarding no
    AllowAgentForwarding no
    PermitTTY no
```

**SSH-Daemon neustarten:**

```bash
systemctl restart sshd

# Oder auf älteren Systemen:
service ssh restart
```

**Test:**

```bash
# Von Entwicklungsrechner aus
ssh -i ~/.ssh/claude_osticket claude@liveserver

# Sollte ausgeben:
# SSH Tunnel only - no shell access
# Connection to liveserver closed.

# ✅ Perfekt! Kein Shell-Zugriff, aber Tunnel funktionieren noch.
```

### 4.2 MariaDB-User auf spezifische Tabellen beschränken (Optional)

Falls du nur bestimmte Tabellen freigeben willst:

```sql
-- Als root in MySQL
mysql -u root -p

-- Statt GRANT SELECT ON mm_tickets.* nur spezifische Tabellen:
REVOKE SELECT ON mm_tickets.* FROM 'osticket_readonly'@'localhost';

GRANT SELECT ON mm_tickets.ost_ticket TO 'osticket_readonly'@'localhost';
GRANT SELECT ON mm_tickets.ost_thread TO 'osticket_readonly'@'localhost';
GRANT SELECT ON mm_tickets.ost_thread_entry TO 'osticket_readonly'@'localhost';
GRANT SELECT ON mm_tickets.ost_user TO 'osticket_readonly'@'localhost';
GRANT SELECT ON mm_tickets.ost_department TO 'osticket_readonly'@'localhost';
GRANT SELECT ON mm_tickets.ost_ticket_status TO 'osticket_readonly'@'localhost';
GRANT SELECT ON mm_tickets.ost_staff TO 'osticket_readonly'@'localhost';

FLUSH PRIVILEGES;
```

---

## ✅ Checkliste - Ist alles fertig?

- [ ] SSH-User `claude` erstellt
- [ ] SSH-Key generiert (`~/.ssh/claude_osticket`)
- [ ] Public Key auf Liveserver deployed
- [ ] SSH-Login ohne Passwort funktioniert
- [ ] MariaDB-User `osticket_readonly` erstellt
- [ ] SELECT-Rechte auf `mm_tickets.*` vergeben
- [ ] User-Login in MariaDB funktioniert
- [ ] Test-Query erfolgreich
- [ ] Write-Test schlägt fehl (readonly bestätigt)

**Optional:**
- [ ] SSH-Config gehärtet (ForceCommand)
- [ ] MariaDB-Rechte auf Tabellen-Ebene eingeschränkt

---

## 📝 Zugangsdaten für .env-Datei

Notiere dir die Zugangsdaten für später (werden in der `.env` gebraucht):

```bash
# SSH-Zugangsdaten
SSH_HOST=<dein-liveserver-hostname-oder-ip>
SSH_USER=claude
SSH_KEY_PATH=/home/markus/.ssh/claude_osticket

# MariaDB-Zugangsdaten (über SSH-Tunnel)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=mm_tickets
DB_USER=osticket_readonly
DB_PASS=<dein-passwort-von-oben>

# osTicket-Konfiguration
OSTICKET_TABLE_PREFIX=ost_
```

**Nächster Schritt:** Zurück zur Entwicklungsmaschine und MCP Server implementieren! 🚀
