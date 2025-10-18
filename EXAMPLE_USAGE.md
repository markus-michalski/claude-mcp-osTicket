# MCP osTicket - Beispiel-Nutzung in Claude Code

## Setup

Stelle sicher, dass in deiner `.env`-Datei die API-Konfiguration vorhanden ist:

```bash
# osTicket API (für create_ticket tool)
OSTICKET_API_URL=https://127.0.0.1:8000
OSTICKET_API_KEY=067BA7B63ECA7A3EE868841382B2BC84
OSTICKET_API_REJECT_UNAUTHORIZED=false
```

## create_ticket Tool verwenden

### Beispiel 1: Einfaches Ticket erstellen

```typescript
// In Claude Code einfach fragen:
"Erstelle ein Test-Ticket in osTicket mit dem Betreff 'API Test' von test@example.com"

// Claude Code nutzt automatisch:
mcp__osticket__create_ticket({
  name: 'Test User',
  email: 'test@example.com',
  subject: 'API Test',
  message: 'Dies ist ein Test-Ticket erstellt via MCP API'
})
```

**Response:**
```json
{
  "success": true,
  "ticketNumber": "363235",
  "message": "Ticket created successfully with number: 363235"
}
```

### Beispiel 2: Ticket mit Department und Topic

```typescript
// In Claude Code:
"Erstelle ein Ticket für Max Mustermann (max@example.com) zum Thema 'Passwort vergessen' im Department 'Support' (ID 2)"

// Claude Code nutzt:
mcp__osticket__create_ticket({
  name: 'Max Mustermann',
  email: 'max@example.com',
  subject: 'Passwort vergessen',
  message: 'Ich habe mein Passwort vergessen und benötige Hilfe beim Zurücksetzen.',
  departmentId: 2,
  topicId: 1
})
```

### Beispiel 3: Ticket nach Analyse erstellen

```typescript
// Workflow in Claude Code:
// 1. Analysiere offene Tickets
mcp__osticket__list_tickets({ status: 'open', limit: 10 })

// 2. Erstelle Follow-Up-Ticket basierend auf Analyse
mcp__osticket__create_ticket({
  name: 'System Admin',
  email: 'admin@example.com',
  subject: 'Follow-Up: Kritische Tickets Review',
  message: 'Basierend auf der Analyse der offenen Tickets benötigen wir eine Priorisierung...'
})
```

## Error-Handling

### API-Key fehlt

**Request:**
```typescript
mcp__osticket__create_ticket({
  name: 'Test',
  email: 'test@example.com',
  subject: 'Test',
  message: 'Test'
})
```

**Response (wenn OSTICKET_API_KEY nicht gesetzt):**
```json
{
  "error": "API client not configured. Set OSTICKET_API_URL and OSTICKET_API_KEY in .env"
}
```

### Ungültige Email

**Request:**
```typescript
mcp__osticket__create_ticket({
  name: 'Test User',
  email: 'invalid-email',
  subject: 'Test',
  message: 'Test message'
})
```

**Response:**
```json
{
  "error": "Invalid email format"
}
```

### API-Fehler (401 Unauthorized)

**Request:**
```typescript
mcp__osticket__create_ticket({
  name: 'Test',
  email: 'test@example.com',
  subject: 'Test',
  message: 'Test'
})
```

**Response (wenn API-Key ungültig):**
```json
{
  "error": "Failed to create ticket: osTicket API error: Unauthorized - Invalid API key"
}
```

## Integration mit anderen Tools

### Workflow: Ticket erstellen und direkt abrufen

```typescript
// 1. Ticket erstellen
const createResponse = await mcp__osticket__create_ticket({
  name: 'John Doe',
  email: 'john@example.com',
  subject: 'Integration Test',
  message: 'Testing the workflow'
});

// Response: { success: true, ticketNumber: "363235" }

// 2. Ticket suchen
const searchResponse = await mcp__osticket__search_tickets({
  query: createResponse.ticketNumber
});

// 3. Ticket-Details abrufen
const ticket = await mcp__osticket__get_ticket({
  number: createResponse.ticketNumber
});
```

## Production Best Practices

### 1. API-Key Sicherheit

**NIEMALS** den API-Key im Code hardcoden!

```bash
# ✅ RICHTIG: In .env
OSTICKET_API_KEY=067BA7B63ECA7A3EE868841382B2BC84

# ❌ FALSCH: Im Code
const apiKey = '067BA7B63ECA7A3EE868841382B2BC84';
```

### 2. SSL-Zertifikat-Validierung

**Production:**
```bash
OSTICKET_API_URL=https://tickets.example.com
OSTICKET_API_REJECT_UNAUTHORIZED=true  # SSL-Validierung aktiviert
```

**Development (localhost):**
```bash
OSTICKET_API_URL=https://127.0.0.1:8000
OSTICKET_API_REJECT_UNAUTHORIZED=false  # SSL-Validierung deaktiviert
```

### 3. Error-Handling in Claude Code

Wenn das Tool einen Error zurückgibt, sollte Claude Code:

1. Den User über den Fehler informieren
2. Vorschläge zur Behebung machen
3. Bei API-Fehlern die Setup-Dokumentation referenzieren

## Debugging

### MCP Tool manuell testen

```bash
# Server starten
cd ~/.claude/mcp-servers/osticket
node dist/index.js

# In einem anderen Terminal: MCP-Anfrage senden (via stdin)
# (Beispiel-JSON siehe MCP Protocol Spec)
```

### Logs prüfen

```bash
# Server-Logs anschauen
tail -f ~/.claude/mcp-servers/osticket/logs/server.log
```

### API direkt testen (ohne MCP)

```bash
# osTicket API direkt aufrufen
curl -X POST https://127.0.0.1:8000/api/http.php/tickets.json \
  -k \
  -H "X-API-Key: 067BA7B63ECA7A3EE868841382B2BC84" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "subject": "cURL Test",
    "message": "Direct API test",
    "topicId": 1
  }'
```

## Weitere Infos

- [README.md](./README.md) - Hauptdokumentation
- [osTicket API Docs](https://docs.osticket.com/en/latest/Developer%20Documentation/API/Tickets.html)
