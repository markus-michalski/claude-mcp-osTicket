# 🚀 Deployment-Anleitung

**Nach der Entwicklung:** So deployest du den MCP Server nach `~/.claude/mcp-servers/osticket/`

> **⚠️ WICHTIG:** Diese Anleitung ist für **Claude Code CLI** (Terminal-Tool).
> Falls du **Claude Desktop** (Desktop-App) nutzt, siehe [Claude Desktop MCP Docs](https://docs.claude.com/en/docs/build-with-claude/mcp).

---

## Schritt 1: Liveserver vorbereiten

Falls noch nicht geschehen:

```bash
# Siehe LIVESERVER_SETUP.md für:
# - SSH-User "claude" anlegen
# - SSH-Key deployen
# - MariaDB readonly-User erstellen
```

✅ **Checklist:**
- [x] SSH-User `claude` existiert
- [x] SSH-Key `~/.ssh/claude_osticket` erstellt und deployed
- [x] MariaDB-User `osticket_readonly` existiert

---

## Schritt 2: .env-Datei erstellen

```bash
# Im Projekt-Verzeichnis
cd ~/projekte/claude/claude-mcp-osTicket

# .env aus Template erstellen
cp .env.example .env
nano .env
```

**Trage deine Zugangsdaten ein:**

```bash
# SSH Connection
SSH_HOST=dein-liveserver.example.com
SSH_PORT=22                              # ← Ändere wenn du einen anderen Port nutzt!
SSH_USER=claude
SSH_KEY_PATH=/home/markus/.ssh/claude_osticket

# Database (via SSH Tunnel = localhost!)
DB_HOST=127.0.0.1                        # ← NICHT den Liveserver hier!
DB_PORT=3306
DB_NAME=mm_tickets
DB_USER=osticket_readonly
DB_PASS=dein-sicheres-passwort           # ← Dein DB-Passwort

# osTicket Configuration
OSTICKET_TABLE_PREFIX=ost_

# Cache Settings (Default-Werte sind okay)
CACHE_TTL=300000
CACHE_MAX_SIZE=1000

# Connection Pool Settings (Default-Werte sind okay)
DB_CONNECTION_LIMIT=10
DB_QUEUE_LIMIT=50
SSH_POOL_SIZE=2
SSH_IDLE_TIMEOUT=300000

# Monitoring
LOG_LEVEL=info
METRICS_ENABLED=true

# Development
NODE_ENV=production
```

**WICHTIG:**
- `DB_HOST` muss `127.0.0.1` sein (SSH-Tunnel!)
- `SSH_PORT` anpassen falls dein Server nicht Port 22 nutzt

---

## Schritt 3: Build erstellen

```bash
# Im Projekt-Verzeichnis
npm run build

# Prüfen ob dist/ erstellt wurde
ls -la dist/
```

---

## Schritt 4: Nach ~/.claude/mcp-servers deployen

```bash
# Zielverzeichnis erstellen
mkdir -p ~/.claude/mcp-servers/osticket

# Build-Files, Dependencies und Config kopieren
cp -r dist node_modules package.json .env ~/.claude/mcp-servers/osticket/

# Prüfen
ls -la ~/.claude/mcp-servers/osticket/
```

**Was kopiert wird:**
- `dist/` - Kompilierter TypeScript-Code
- `node_modules/` - Dependencies
- `package.json` - Package-Konfiguration
- `.env` - Deine Zugangsdaten (NICHT im Git!)

---

## Schritt 5: MCP-Server in Claude Code registrieren

**WICHTIG:** Claude Code CLI nutzt `claude mcp add` Befehl, NICHT `mcp-servers.json`!

```bash
# MCP-Server registrieren
claude mcp add --transport stdio osticket -- node /home/markus/.claude/mcp-servers/osticket/dist/index.js
```

**Output:**
```
Added stdio MCP server osticket with command: node /home/markus/.claude/mcp-servers/osticket/dist/index.js to local config
```

**Prüfen ob registriert:**

```bash
claude mcp list
```

**Sollte zeigen:**
```
osticket: node /home/markus/.claude/mcp-servers/osticket/dist/index.js - ✓ Connected
```

**WICHTIG:**
- Passe `/home/markus` an deinen Username an
- Der Server wird nun **automatisch beim Start** von Claude Code geladen
- Umgebungsvariablen kommen aus der `.env` Datei im MCP-Server-Verzeichnis

---

## Schritt 6: SSH-Verbindung testen

**Bevor du Claude Code startest**, teste die SSH-Verbindung:

```bash
# SSH-Test mit deinem Custom-Port
ssh -i ~/.ssh/claude_osticket -p DEIN_PORT claude@dein-liveserver.example.com

# Sollte OHNE Passwort funktionieren!
# Output: "SSH Tunnel only - no shell access"
# ✅ Perfekt!

exit
```

**Falls Fehler:**

```bash
# SSH-Debugging
ssh -vvv -i ~/.ssh/claude_osticket -p DEIN_PORT claude@dein-liveserver.example.com

# Berechtigungen prüfen
chmod 600 ~/.ssh/claude_osticket
ls -la ~/.ssh/claude_osticket
```

---

## Schritt 7: MCP-Server testen

**Der Server ist jetzt registriert!** Er wird automatisch geladen wenn du Claude Code startest.

**Status prüfen:**

```bash
# In Claude Code
/doctor

# Oder im Terminal:
claude mcp list
```

**Erwartete Ausgabe:**
```
osticket: node /home/markus/.claude/mcp-servers/osticket/dist/index.js - ✓ Connected
```

**Server-Logs checken:**

Da MCP über stdio läuft, sind `console.log` Ausgaben **nicht sichtbar**. Alle Logs werden in eine Datei geschrieben:

```bash
# Logs live anschauen
tail -f ~/.claude/mcp-servers/osticket/logs/server.log

# Letzte 50 Zeilen
tail -50 ~/.claude/mcp-servers/osticket/logs/server.log
```

**Erfolgreicher Start sieht so aus:**

```
[2025-10-18T12:36:55.047Z] [INFO ] Starting osTicket MCP Server...
[Config] Loaded configuration:
  SSH: claude@dein-server:DEIN_PORT
  DB: osticket_readonly@127.0.0.1:3306/mm_tickets
[2025-10-18T12:36:55.607Z] [INFO ] [DB] SSH tunnel established: localhost:36793 -> 127.0.0.1:3306
[2025-10-18T12:36:56.069Z] [INFO ] ✓ Database connected
[2025-10-18T12:36:56.117Z] [INFO ] ✓ Health check passed
[2025-10-18T12:36:56.118Z] [INFO ] ✓ Server running and ready
```

---

## Schritt 8: Testen in Claude Code

Öffne Claude Code und teste:

```
User: "Zeig mir die osTicket-Statistiken"
```

Claude sollte automatisch das MCP-Tool `get_ticket_stats` nutzen.

**Weitere Tests:**

```
"Zeig mir Ticket #123456"
"Liste alle offenen Tickets"
"Suche nach 'Dashboard Widget'"
```

---

## 🔄 Updates deployen

Wenn du Code geändert hast:

```bash
# Im Projekt-Verzeichnis
cd ~/projekte/claude/claude-mcp-osTicket

# Pull latest changes (falls Git)
git pull

# Dependencies aktualisieren (falls package.json geändert)
npm install

# Rebuild
npm run build

# Neu deployen
cp -r dist ~/.claude/mcp-servers/osticket/

# Falls node_modules geändert:
cp -r node_modules ~/.claude/mcp-servers/osticket/

# MCP-Server neu laden (Claude Code erkennt Änderungen automatisch beim nächsten Request)
# Optional: Server manuell neustarten
claude mcp list  # Prüft Verbindung und startet neu falls nötig
```

---

## 🐛 Troubleshooting

### Problem: "No MCP servers configured"

```bash
# Prüfe ob Server registriert ist
claude mcp list

# Falls leer: Server neu registrieren
claude mcp add --transport stdio osticket -- node /home/markus/.claude/mcp-servers/osticket/dist/index.js

# In Claude Code prüfen
/doctor
```

### Problem: Server zeigt "❌ Not connected"

```bash
# Logs prüfen
tail -50 ~/.claude/mcp-servers/osticket/logs/server.log

# Server manuell testen
cd ~/.claude/mcp-servers/osticket
node dist/index.js

# Sollte Config ausgeben und "✓ Server running and ready" zeigen
```

### Problem: MCP-Tools nicht verfügbar in Claude Code

```bash
# Server entfernen und neu hinzufügen
claude mcp remove osticket
claude mcp add --transport stdio osticket -- node /home/markus/.claude/mcp-servers/osticket/dist/index.js

# Claude Code komplett neu starten
```

### Problem: "SSH key file not found"

```bash
# Prüfe ob Key existiert
ls -la ~/.ssh/claude_osticket

# Prüfe Pfad in .env
cat ~/.claude/mcp-servers/osticket/.env | grep SSH_KEY_PATH
```

### Problem: "Connection refused"

```bash
# Prüfe SSH_HOST und SSH_PORT in .env
cat ~/.claude/mcp-servers/osticket/.env | grep SSH_

# Test SSH manuell
ssh -i ~/.ssh/claude_osticket -p DEIN_PORT claude@dein-server
```

### Problem: "Access denied for user 'osticket_readonly'"

```bash
# Prüfe DB-Credentials
cat ~/.claude/mcp-servers/osticket/.env | grep DB_

# Test DB-Zugriff auf Liveserver
ssh claude@liveserver "mysql -u osticket_readonly -p mm_tickets -e 'SELECT COUNT(*) FROM ost_ticket;'"
```

### Problem: "Circuit breaker is OPEN"

Der Circuit Breaker hat die Verbindung wegen zu vieler Fehler unterbrochen.

```bash
# MCP Server neustarten (Claude Code neustarten)

# Logs prüfen in Claude Code Terminal
```

### Problem: MCP Server startet nicht

```bash
# Manueller Test
cd ~/.claude/mcp-servers/osticket
node dist/index.js

# Sollte Config und Connection-Status ausgeben
# Ctrl+C zum Beenden
```

---

## 📊 Monitoring & Logs

Der MCP Server schreibt **alle Logs in eine Datei**, da `console.log` nicht sichtbar ist (MCP kommuniziert über stdio).

**Log-Dateien:**

```bash
# Server-Logs anschauen
tail -f ~/.claude/mcp-servers/osticket/logs/server.log

# Letzte 50 Zeilen
tail -50 ~/.claude/mcp-servers/osticket/logs/server.log

# Debug-Logs aktivieren
echo "LOG_LEVEL=debug" >> ~/.claude/mcp-servers/osticket/.env
# Claude Code neustarten
```

**Was wird geloggt:**

- ✅ SSH-Tunnel-Verbindungen (localhost:PORT -> remote:3306)
- ✅ DB-Connection-Status
- ✅ Query-Performance (langsame Queries > 1s)
- ✅ Fehler und Warnings
- ✅ Health-Checks
- ✅ Server-Startup/Shutdown

**Debug-Modus:**

```bash
# Ausführliches Logging aktivieren
MCP_DEBUG=true node ~/.claude/mcp-servers/osticket/dist/index.js

# Oder in .env:
echo "MCP_DEBUG=true" >> ~/.claude/mcp-servers/osticket/.env
```

**Log-Levels:**

- `debug` - Sehr ausführlich (nur für Entwicklung)
- `info` - Normal (empfohlen)
- `warn` - Nur Warnungen
- `error` - Nur Fehler

---

## 🔒 Sicherheit

**Best Practices:**

✅ `.env` ist in `.gitignore` (wird nicht committed)
✅ SSH-Key ist passwortgeschützt (optional)
✅ SSH-User `claude` hat keine Shell-Rechte
✅ DB-User ist readonly (`SELECT` only)
✅ DB-User ist `@'localhost'` (kein Remote-Zugriff)

**Checklist:**

- [ ] `.env` niemals committen!
- [ ] SSH-Private-Key niemals teilen!
- [ ] DB-Passwort sicher aufbewahren
- [ ] SSH-Port nicht öffentlich machen (Firewall)

---

## ✅ Deployment erfolgreich!

Wenn alles funktioniert, kannst du jetzt in **jedem** Claude Code Projekt auf osTicket-Daten zugreifen! 🎉

**Next Steps:**

- Nutze die 4 MCP-Tools in deinen Projekten
- Erweitere den Code nach Bedarf (mehr Tools, Features)
- Teile den MCP Server mit deinem Team (Git-Repo)
