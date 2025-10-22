# osTicket MCP Server

**Model Context Protocol Server** für projektübergreifende osTicket-Integration in Claude Code.

## 🎯 Features

- ✅ SSH-Tunnel-basierter Zugriff auf Remote-MariaDB
- ✅ Readonly-Access zu osTicket-Datenbank
- ✅ Connection Pooling & Circuit Breaker Pattern
- ✅ Intelligentes Multi-Layer-Caching
- ✅ 5 MCP Tools: get_ticket, list_tickets, search_tickets, get_ticket_stats, **create_ticket**
- ✅ osTicket API-Integration für Ticket-Erstellung
- ✅ Production-ready mit Monitoring & Health Checks

## 🏗️ Architektur

```
┌─────────────────────────────────────┐
│ Claude Code                         │
│  └─ MCP Protocol                    │
├─────────────────────────────────────┤
│ MCP Server (Node.js/TypeScript)     │
│  ├─ Application Layer               │
│  │   └─ MCP Tool Handlers           │
│  ├─ Core Layer (Domain Logic)       │
│  │   └─ osTicket Service            │
│  └─ Infrastructure Layer            │
│      ├─ SSH Tunnel Pool             │
│      ├─ MySQL Connection Pool       │
│      └─ Hybrid Cache Provider       │
├─────────────────────────────────────┤
│ SSH Tunnel (automatisch)            │
├─────────────────────────────────────┤
│ Liveserver                          │
│  └─ MariaDB (mm_tickets)            │
└─────────────────────────────────────┘
```

## 📋 Voraussetzungen

- Node.js 18+
- SSH-Zugang zum Liveserver mit Key-Auth
- MariaDB readonly-User auf Liveserver

## 🚀 Setup

### 1. Liveserver vorbereiten

Siehe [LIVESERVER_SETUP.md](./LIVESERVER_SETUP.md) für:
- SSH-User `claude` anlegen
- SSH-Key deployen
- MariaDB readonly-User erstellen

### 2. Lokale Installation

```bash
# Dependencies installieren
npm install

# .env-Datei erstellen
cp .env.example .env
nano .env  # Zugangsdaten eintragen

# TypeScript kompilieren
npm run build
```

### 3. Claude Code konfigurieren

```bash
# MCP Server nach ~/.claude kopieren
mkdir -p ~/.claude/mcp-servers/osticket
cp -r dist node_modules package.json .env ~/.claude/mcp-servers/osticket/
```

**~/.claude/mcp-servers.json** erstellen/erweitern:

```json
{
  "mcpServers": {
    "osticket": {
      "command": "node",
      "args": [
        "/home/markus/.claude/mcp-servers/osticket/dist/index.js"
      ],
      "env": {}
    }
  }
}
```

### 4. Claude Code neustarten

Der MCP Server wird automatisch beim Start geladen.

## 🔧 Development

```bash
# Development-Modus mit Auto-Reload
npm run dev

# Type-Check ohne Build
npm run type-check

# Watch-Modus
npm run watch

# Linting
npm run lint
```

## 📚 MCP Tools

### `get_ticket`

Lädt ein komplettes Ticket mit allen Messages.

```typescript
// Claude Code nutzt automatisch:
mcp__osticket__get_ticket({ id: 123 })
```

### `list_tickets`

Listet Tickets mit optionalen Filtern.

```typescript
mcp__osticket__list_tickets({
  status: 'open',
  limit: 20
})
```

### `search_tickets`

Volltextsuche in Subject und Number.

```typescript
mcp__osticket__search_tickets({
  query: 'Dashboard Widget',
  limit: 20
})
```

### `get_ticket_stats`

Aggregierte Statistiken über alle Tickets.

```typescript
mcp__osticket__get_ticket_stats({})
```

### `create_ticket` (NEU)

Erstellt ein neues osTicket-Ticket über die osTicket API.

**Voraussetzungen:**
- `OSTICKET_API_URL` und `OSTICKET_API_KEY` in `.env` konfiguriert
- API-Key in osTicket Admin Panel erstellt (Admin Panel → Manage → API Keys)

**Default-User konfigurieren (optional):**
```bash
# In .env:
OSTICKET_DEFAULT_NAME=MM - Standard
OSTICKET_DEFAULT_EMAIL=info@markus-michalski.net
OSTICKET_DEFAULT_TOPIC_ID=1  # Optional: Default Help Topic
```

Wenn konfiguriert, werden `name`, `email` und `topicId` automatisch aus der Config verwendet, falls nicht explizit übergeben.

**Markdown-Support:**
Das Tool unterstützt Markdown-Formatierung für Ticket-Nachrichten:
```typescript
// Mit Markdown-Formatierung (empfohlen)
mcp__osticket__create_ticket({
  subject: 'Bug Report',
  message: '# Bug Report\n\n- Issue 1\n- Issue 2\n\n**Priorität:** Hoch',
  format: 'markdown'
})

// Auto-Detection (osTicket erkennt Markdown automatisch)
mcp__osticket__create_ticket({
  subject: 'Test-Ticket via API',
  message: '# Überschrift\n\nDies ist **fett** und *kursiv*'
})

// Plain Text
mcp__osticket__create_ticket({
  subject: 'Simple Ticket',
  message: 'Einfache Nachricht ohne Formatierung',
  format: 'text'
})
```

**Format-Parameter:**
- `markdown` - Content wird als Markdown geparst
- `html` - Content wird als HTML behandelt
- `text` - Content wird als reiner Text behandelt
- Wenn nicht angegeben: osTicket erkennt Format automatisch basierend auf dem Content

```typescript
// Mit expliziten User-Daten
mcp__osticket__create_ticket({
  name: 'Max Mustermann',
  email: 'max@example.com',
  subject: 'Test-Ticket via API',
  message: '# Test\n\nDies ist eine **Testmeldung**',
  format: 'markdown'
})

// Mit Default-User (OSTICKET_DEFAULT_NAME/EMAIL aus .env)
mcp__osticket__create_ticket({
  subject: 'Test-Ticket via API',
  message: 'Dies ist eine Testmeldung'
})
```

**Response:**
```json
{
  "success": true,
  "ticketNumber": "363235",
  "message": "Ticket created successfully with number: 363235. Note: Department/Topic must be changed manually or via future update API."
}
```

**Error-Handling:**
- 401: Invalid API Key
- 403: Access denied
- 400: Invalid parameters (oder fehlende Defaults)
- 500: osTicket API error

## 🔍 Monitoring & Health

Der Server sammelt automatisch Metriken:

- SSH-Verbindungsstatus
- DB-Connection-Pool-Stats
- Cache-Hit-Rate
- Query-Performance
- Error-Counts

## 📖 Dokumentation

- [LIVESERVER_SETUP.md](./LIVESERVER_SETUP.md) - Server-Setup-Anleitung
- [MCP_OSTICKET_SETUP_Phase1.md](./MCP_OSTICKET_SETUP_Phase1.md) - Detaillierte Architektur

## 🐛 Troubleshooting

### SSH-Verbindung schlägt fehl

```bash
# SSH-Key testen
ssh -i ~/.ssh/claude_osticket claude@liveserver

# SSH-Debugging
ssh -vvv -i ~/.ssh/claude_osticket claude@liveserver
```

### DB-Connection-Error

```bash
# In .env prüfen:
# - DB_HOST muss 127.0.0.1 sein (nicht der Liveserver!)
# - DB_USER/DB_PASS korrekt?

# Direkt auf Liveserver testen:
ssh claude@liveserver "mysql -u osticket_readonly -p mm_tickets -e 'SELECT COUNT(*) FROM ost_ticket;'"
```

### MCP Server wird nicht geladen

```bash
# Logs von Claude Code anschauen
# MCP Server manuell testen:
cd ~/.claude/mcp-servers/osticket
node dist/index.js
```

## 📄 Lizenz

MIT
