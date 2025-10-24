# osTicket MCP Server

**Model Context Protocol Server** für projektübergreifende osTicket-Integration in Claude Code.

## 🎯 Features

- ✅ REST API-basierter Zugriff auf osTicket
- ✅ Keine Datenbankabfragen - reine API-Integration
- ✅ 7 MCP Tools: get_ticket, list_tickets, search_tickets, get_ticket_stats, create_ticket, update_ticket, delete_ticket
- ✅ Markdown-Support für Ticket-Erstellung
- ✅ Granulare API-Key-Berechtigungen (can_read_tickets, can_update_tickets, etc.)
- ✅ Production-ready mit Logging & Health Checks

## 🏗️ Architektur

```
┌─────────────────────────────────────┐
│ Claude Code                         │
│  └─ MCP Protocol                    │
├─────────────────────────────────────┤
│ MCP Server (Node.js/TypeScript)     │
│  ├─ Application Layer               │
│  │   └─ MCP Tool Handlers           │
│  └─ Infrastructure Layer            │
│      ├─ HTTP Client                 │
│      └─ Logger                      │
├─────────────────────────────────────┤
│ osTicket REST API                   │
│  └─ API Endpoints Plugin            │
└─────────────────────────────────────┘
```

**Version 2.0.0 - API-Only Architecture:**
- ❌ Kein SSH-Tunnel mehr
- ❌ Keine Datenbankverbindung mehr
- ❌ Kein Connection Pooling mehr
- ❌ Kein Caching mehr
- ✅ Ausschließlich REST API-basiert

## 📋 Voraussetzungen

- Node.js 18+
- osTicket-Installation mit [API Endpoints Plugin](https://github.com/markus-michalski/osticket-plugins/tree/main/api-endpoints)
- osTicket API-Key mit entsprechenden Berechtigungen

## 🚀 Setup

### 1. osTicket API Endpoints Plugin installieren

Das MCP Server benötigt das **API Endpoints Plugin** für osTicket, um auf alle Funktionen zugreifen zu können:

```bash
# Plugin aus GitHub klonen
cd /path/to/osticket/include/plugins
git clone https://github.com/markus-michalski/osticket-plugins.git
ln -s osticket-plugins/api-endpoints api-endpoints

# In osTicket Admin Panel aktivieren: Admin Panel → Manage → Plugins → API Endpoints
```

### 2. API-Key erstellen

In osTicket Admin Panel:
1. **Admin Panel → Manage → API Keys**
2. **Add New API Key**
3. **IP-Adresse:** `0.0.0.0` (für alle IPs) oder spezifische IP
4. **Berechtigungen setzen:**
   - `can_create_tickets` - Ticket erstellen
   - `can_read_tickets` - Ticket abrufen
   - `can_update_tickets` - Ticket aktualisieren
   - `can_search_tickets` - Tickets suchen
   - `can_delete_tickets` - Ticket löschen
   - `can_read_stats` - Statistiken abrufen

### 3. Lokale Installation

```bash
# Dependencies installieren
npm install

# .env-Datei erstellen
cp .env.example .env
nano .env  # API-Zugangsdaten eintragen
```

**.env konfigurieren:**
```bash
# osTicket API Configuration (REQUIRED)
OSTICKET_API_URL=https://tickets.example.com
OSTICKET_API_KEY=YOUR_API_KEY_HERE
OSTICKET_API_REJECT_UNAUTHORIZED=false  # true für Produktiv-Server mit gültigem SSL

# Default User for Ticket Creation (optional)
OSTICKET_DEFAULT_NAME=Claude AI
OSTICKET_DEFAULT_EMAIL=claude@example.com
OSTICKET_DEFAULT_TOPIC_ID=1

# Logging
LOG_LEVEL=info
```

```bash
# TypeScript kompilieren
npm run build
```

### 4. Claude Code konfigurieren

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

### 5. Claude Code neustarten

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
mcp__osticket__get_ticket({ number: "123456" })
mcp__osticket__get_ticket({ id: 123 })  // ID wird zu Number konvertiert
```

**Benötigt:** `can_read_tickets` Berechtigung

### `list_tickets`

Listet Tickets mit optionalen Filtern.

```typescript
mcp__osticket__list_tickets({
  status: 'open',
  departmentId: 1,
  limit: 20,
  offset: 0
})
```

**Benötigt:** `can_read_tickets` oder `can_search_tickets` Berechtigung

### `search_tickets`

Volltextsuche in Subject und Number.

```typescript
mcp__osticket__search_tickets({
  query: 'Dashboard Widget',
  limit: 20
})
```

**Benötigt:** `can_search_tickets` Berechtigung (Fallback: `can_read_tickets`)

### `get_ticket_stats`

Aggregierte Statistiken über alle Tickets.

```typescript
mcp__osticket__get_ticket_stats({})
```

**Benötigt:** `can_read_stats` Berechtigung (Fallback: `can_read_tickets`)

### `create_ticket`

Erstellt ein neues osTicket-Ticket über die osTicket API.

**Default-User konfigurieren (optional):**
```bash
# In .env:
OSTICKET_DEFAULT_NAME=MM - Standard
OSTICKET_DEFAULT_EMAIL=info@markus-michalski.net
OSTICKET_DEFAULT_TOPIC_ID=1  # Optional: Default Help Topic
```

**Markdown-Support:**
Das Tool verwendet standardmäßig **Markdown-Formatierung**:

```typescript
// Markdown ist der Standard (format-Parameter kann weggelassen werden)
mcp__osticket__create_ticket({
  subject: 'Bug Report',
  message: '# Bug Report\n\n- Issue 1\n- Issue 2\n\n**Priorität:** Hoch'
})

// Mit expliziten User-Daten
mcp__osticket__create_ticket({
  name: 'Max Mustermann',
  email: 'max@example.com',
  subject: 'Test-Ticket via API',
  message: '# Test\n\nDies ist eine **Testmeldung**',
  format: 'markdown'
})
```

**Format-Parameter:**
- `markdown` - Content wird als Markdown geparst **(Standard)**
- `html` - Content wird als HTML behandelt
- `text` - Content wird als reiner Text behandelt

**Benötigt:** `can_create_tickets` Berechtigung

### `update_ticket`

Aktualisiert ein bestehendes Ticket (Department, Status, Priority, Assignee, etc.).

```typescript
mcp__osticket__update_ticket({
  number: '123456',
  departmentId: 2,           // Department ID oder Name
  statusId: 'Closed',        // Status ID oder Name
  priorityId: 'High',        // Priority ID oder Name
  staffId: 'admin',          // Staff ID oder Username (Zuweisung)
  topicId: 3,                // Help Topic ID oder Name
  slaId: 1,                  // SLA Plan ID oder Name
  parentTicketNumber: '999'  // Parent Ticket Number (für Subtickets)
})
```

**Benötigt:** `can_update_tickets` Berechtigung

### `delete_ticket`

Löscht ein Ticket permanent.

```typescript
mcp__osticket__delete_ticket({
  number: '123456'
})
```

**Benötigt:** `can_delete_tickets` Berechtigung

## 🔍 Logging

Der Server loggt automatisch in:
- `~/.claude/mcp-servers/osticket/logs/server.log`

Log-Level konfigurierbar via `.env`:
```bash
LOG_LEVEL=info  # debug, info, warn, error
```

## 📖 Dokumentation

- [API Endpoints Plugin](https://github.com/markus-michalski/osticket-plugins/tree/main/api-endpoints) - osTicket Plugin-Dokumentation
- [API Documentation](https://github.com/markus-michalski/osticket-plugins/blob/main/api-endpoints/API.md) - REST API Endpoints

## 🐛 Troubleshooting

### API-Verbindung schlägt fehl

```bash
# API-Key testen (via curl)
curl -X GET \
  -H "X-API-Key: YOUR_API_KEY" \
  https://tickets.example.com/api/tickets-stats.php

# Sollte JSON zurückgeben:
# {"total": 123, "open": 45, "closed": 78, ...}
```

### 401 Unauthorized

- API-Key in `.env` korrekt?
- API-Key in osTicket Admin Panel aktiviert?
- IP-Adresse des MCP Servers in osTicket erlaubt? (oder `0.0.0.0` für alle IPs)

### 403 Forbidden

- Hat der API-Key die benötigte Berechtigung?
- Prüfe im Admin Panel: **Manage → API Keys → Edit → Permissions**

### MCP Server wird nicht geladen

```bash
# Logs von Claude Code anschauen
# MCP Server manuell testen:
cd ~/.claude/mcp-servers/osticket
node dist/index.js

# Health Check manuell testen:
curl -X GET \
  -H "X-API-Key: YOUR_API_KEY" \
  https://tickets.example.com/api/wildcard.php
```

## 📄 Lizenz

MIT

## 🚀 Version History

### v2.0.0 (2025-10-24) - API-Only Architecture

**Breaking Changes:**
- ❌ Removed SSH tunnel support
- ❌ Removed direct database access
- ❌ Removed connection pooling
- ❌ Removed caching layer

**New Features:**
- ✅ Pure REST API integration
- ✅ Added `update_ticket` tool
- ✅ Added `delete_ticket` tool
- ✅ Simplified architecture (API-only)
- ✅ Reduced dependencies (removed mysql2, ssh2)

**Migration from v1.x:**
1. Update `.env` - remove SSH/DB variables, keep only API variables
2. Ensure osTicket has API Endpoints Plugin v1.0.0+ installed
3. Create API Key with required permissions
4. Run `npm install && npm run build`
