# Metadata Service - Quick Start

## Was ist neu?

Der osTicket MCP Server unterstützt jetzt **intelligente Department/Topic-Zuordnung** beim Ticket-Erstellen!

**Vorher:**
```typescript
// User musste IDs kennen
create_ticket(..., departmentId: 5, topicId: 1)
```

**Jetzt:**
```typescript
// User kann Namen nutzen - Fuzzy-Matching inklusive!
create_ticket(..., departmentName: "Sitemap", topicName: "Feature")
```

---

## Schnellstart

### 1. Tool nutzen (via MCP)

```json
{
  "name": "create_ticket",
  "arguments": {
    "name": "Max Mustermann",
    "email": "max@example.com",
    "subject": "Bug in der Sitemap",
    "message": "Die Sitemap zeigt nicht alle Kategorien an.",
    "departmentName": "Sitemap",
    "topicName": "Bug"
  }
}
```

### 2. Fuzzy-Matching

Folgende Eingaben führen zum **gleichen Department**:

- `"Sitemap"` (exakter Name)
- `"OXID Sitemap"` (Partial Path)
- `"Projekte / OXID 7 / Sitemap"` (vollständiger Path)
- `"sitemap"` (case-insensitive)

### 3. Topic-Aliases

Folgende Aliases werden automatisch erkannt:

| Du schreibst | System findet |
|--------------|---------------|
| `"Bug"` | "Softwarebug" |
| `"Feature"` | "Feature Request" |
| `"Enhancement"` | "Feature Request" |
| `"Support"` | "General Inquiry" |
| `"Question"` | "General Inquiry" |

---

## Neue Dateien

```
src/
├── core/
│   ├── entities/
│   │   ├── Department.ts          # ✓ Neu
│   │   └── HelpTopic.ts           # ✓ Neu
│   ├── services/
│   │   └── MetadataService.ts     # ✓ Neu
│   └── repositories/
│       └── IMetadataRepository.ts # ✓ Neu
└── infrastructure/
    └── database/
        └── MySQLTicketRepository.ts  # ✓ Erweitert
```

---

## API-Referenz

### MetadataService

```typescript
class MetadataService {
  // Liste aller Departments (gecached für 5 Minuten)
  async getDepartments(): Promise<Department[]>

  // Liste aller Help Topics (gecached für 5 Minuten)
  async getHelpTopics(): Promise<HelpTopic[]>

  // Finde Department by Name (Fuzzy-Matching)
  async findDepartmentByName(name: string): Promise<Department>

  // Finde Help Topic by Name (Fuzzy-Matching + Aliases)
  async findTopicByName(name: string): Promise<HelpTopic>

  // Cache manuell leeren
  clearCache(): void
}
```

### Entities

```typescript
interface Department {
  readonly id: number;
  readonly name: string;
  readonly parentId: number | null;
  readonly path: string;            // z.B. "Projekte / OXID 7 / Sitemap"
  readonly isPublic: boolean;
  readonly isActive: boolean;
}

interface HelpTopic {
  readonly id: number;
  readonly name: string;
  readonly departmentId: number;
  readonly isActive: boolean;
  readonly priorityId?: number;
  readonly isPublic: boolean;
}
```

---

## Fehlerbehandlung

Wenn ein Department/Topic nicht gefunden wird, erhältst du eine **hilfreiche Fehlermeldung** mit allen verfügbaren Optionen:

```json
{
  "error": "Department not found: \"Foobar\"\n\nAvailable departments:\n  - ID 1: \"Support\"\n  - ID 3: \"Projekte\"\n  - ID 5: \"Projekte / OXID 7 / Sitemap\"\n  ...\n\nPlease use either the department ID or one of the names/paths above."
}
```

---

## Performance

- **Caching:** Departments und Topics werden für **5 Minuten** gecached
- **Queries:** Nur **2 SQL-Queries** beim ersten Aufruf
- **Fuzzy-Matching:** Läuft in JavaScript (kein DB-Overhead)

---

## Beispiele

Siehe vollständige Beispiele in:
- `examples/metadata-usage.ts` - Code-Beispiele
- `METADATA_SERVICE.md` - Ausführliche Dokumentation

### Schnell-Test

```bash
# Build
npm run build

# Test (mit echter DB-Verbindung)
node dist/examples/metadata-usage.js
```

---

## Integration in bestehenden Code

### Vorher (nur mit IDs)

```typescript
const handlers = new ToolHandlers(ticketService, apiClient);

await handlers.handleCreateTicket({
  name: 'User',
  email: 'user@example.com',
  subject: 'Test',
  message: 'Test',
  departmentId: 5,  // ← User muss ID kennen
  topicId: 1        // ← User muss ID kennen
});
```

### Nachher (mit Namen)

```typescript
const metadataService = new MetadataService(repository);
const handlers = new ToolHandlers(ticketService, metadataService, apiClient);

await handlers.handleCreateTicket({
  name: 'User',
  email: 'user@example.com',
  subject: 'Test',
  message: 'Test',
  departmentName: 'Sitemap',  // ← Fuzzy-Matching!
  topicName: 'Feature'        // ← Mit Aliases!
});
```

---

## Weitere Ressourcen

- **Vollständige Dokumentation:** [METADATA_SERVICE.md](./METADATA_SERVICE.md)
- **Code-Beispiele:** [examples/metadata-usage.ts](./examples/metadata-usage.ts)
- **TypeScript-Definitionen:** [src/core/entities/](./src/core/entities/)

---

## FAQ

**Q: Kann ich weiterhin IDs nutzen?**
A: Ja! IDs werden direkt genutzt, ohne Lookup. Du kannst IDs und Namen mixen.

**Q: Was passiert bei Tippfehlern?**
A: Fuzzy-Matching verzeiht kleine Fehler. Bei größeren Fehlern erhältst du eine Liste aller Optionen.

**Q: Wie oft wird der Cache aktualisiert?**
A: Alle 5 Minuten automatisch. Du kannst ihn auch manuell mit `clearCache()` leeren.

**Q: Funktioniert es mit hierarchischen Departments?**
A: Ja! Du kannst den vollständigen Path oder nur Teile davon nutzen.

**Q: Sind die Aliases anpassbar?**
A: Aktuell fest im Code. Zukünftig geplant: Custom-Aliases via Config.

---

## Änderungen am Tool-Schema

### create_ticket Tool

**Neue optionale Parameter:**

```typescript
{
  departmentName?: string;  // Alternative zu departmentId
  topicName?: string;       // Alternative zu topicId
}
```

**Tool-Beschreibung aktualisiert:**

```
Create a new osTicket ticket via API.
Supports intelligent department/topic lookup by name.
```

---

## TypeScript Strict Mode

Alle neuen Komponenten sind mit **TypeScript Strict Mode** kompatibel:

- ✓ `strict: true`
- ✓ `noUnusedLocals: true`
- ✓ `noUnusedParameters: true`
- ✓ `noImplicitReturns: true`
- ✓ Readonly properties
- ✓ JSDoc-Kommentare

Build ohne Errors:
```bash
npm run build
# ✓ No errors
```

---

## Was ist als Nächstes zu tun?

1. **Integration testen** mit echten osTicket-Daten
2. **Unit-Tests schreiben** für MetadataService
3. **Custom-Aliases** implementieren (optional)
4. **Mehrsprachigkeit** für Department/Topic-Namen (optional)
5. **Analytics** für Fuzzy-Match-Statistiken (optional)

---

**Viel Erfolg beim Nutzen des Metadata Service!** 🚀
