# Metadata Service - Intelligente Department/Topic-Zuordnung

## Übersicht

Der `MetadataService` ermöglicht es, Departments und Help Topics nicht nur über IDs, sondern auch über **Namen** und **Fuzzy-Matching** zuzuordnen.

**Problem gelöst:**
```bash
# Früher: User musste IDs kennen
create_ticket(..., departmentId=5, topicId=1)

# Jetzt: User kann Namen nutzen
create_ticket(..., departmentName="Sitemap", topicName="Feature")
```

---

## Architektur

### Neue Komponenten

```
src/
├── core/
│   ├── entities/
│   │   ├── Department.ts         # Department Entity mit hierarchischem Path
│   │   └── HelpTopic.ts          # Help Topic Entity
│   ├── services/
│   │   └── MetadataService.ts    # Service mit Fuzzy-Matching-Logik
│   └── repositories/
│       └── IMetadataRepository.ts # Repository-Interface
└── infrastructure/
    └── database/
        └── MySQLTicketRepository.ts # Erweitert um queryDepartments() & queryHelpTopics()
```

### Dependency Injection Flow

```
index.ts
  ↓
repository = new MySQLTicketRepository()
  ↓
metadataService = new MetadataService(repository)
  ↓
toolHandlers = new ToolHandlers(ticketService, metadataService, apiClient)
```

---

## Fuzzy-Matching-Strategien

### Department-Matching

Der Service versucht in folgender Reihenfolge:

1. **Exakter Name-Match** (case-insensitive)
   ```
   "Sitemap" → findet Department mit name="Sitemap"
   ```

2. **Exakter Path-Match** (case-insensitive)
   ```
   "Projekte / OXID 7 / Sitemap" → findet Department mit diesem path
   ```

3. **Partial Path-Match**
   ```
   "OXID Sitemap" → findet Department mit path enthält "oxid" und "sitemap"
   ```

4. **Partial Name-Match**
   ```
   "Site" → findet Department mit name enthält "site"
   ```

**Fehlerbehandlung:**
Wenn kein Match gefunden wird, wirft der Service eine **hilfreiche Fehlermeldung** mit einer Liste aller verfügbaren Departments:

```
Department not found: "Foobar"

Available departments:
  - ID 1: "Support"
  - ID 3: "Projekte"
  - ID 4: "Projekte / OXID 7"
  - ID 5: "Projekte / OXID 7 / Sitemap"
  - ID 6: "Projekte / OXID 7 / Backend"

Please use either the department ID or one of the names/paths above.
```

### Topic-Matching

Der Service versucht:

1. **Exakter Match** (case-insensitive)
   ```
   "Feature" → findet Topic mit name="Feature"
   ```

2. **Partial Match**
   ```
   "Feature Request" → findet Topic mit name enthält "feature"
   ```

3. **Alias-Matching**
   ```
   "Bug" → findet Topic "Softwarebug"
   "Enhancement" → findet Topic "Feature Request"
   "Support" → findet Topic "General Inquiry"
   ```

**Vordefinierte Aliases:**

| Alias | Findet Topic mit |
|-------|------------------|
| `bug` | softwarebug, defect, issue, error |
| `feature` | feature request, enhancement, new feature |
| `support` | help, question, assistance |
| `general` | general inquiry, other, misc |

---

## API-Nutzung

### 1. Department-Lookup

```typescript
const dept = await metadataService.findDepartmentByName('Sitemap');
// Ergebnis:
// {
//   id: 5,
//   name: "Sitemap",
//   parentId: 4,
//   path: "Projekte / OXID 7 / Sitemap",
//   isPublic: true,
//   isActive: true
// }
```

### 2. Topic-Lookup

```typescript
const topic = await metadataService.findTopicByName('Bug');
// Ergebnis (via Alias-Matching):
// {
//   id: 10,
//   name: "Softwarebug",
//   departmentId: 3,
//   isActive: true,
//   isPublic: true
// }
```

### 3. Liste aller Departments

```typescript
const departments = await metadataService.getDepartments();
// Ergebnis: Array von Department-Objekten (gecached für 5 Minuten)
```

### 4. Cache Management

```typescript
// Cache manuell leeren (z.B. nach Metadata-Änderungen in osTicket)
metadataService.clearCache();
```

---

## MCP Tool Integration

### Erweiterte Tool-Schema

Das `create_ticket` Tool unterstützt jetzt **4 neue optionale Parameter**:

```typescript
{
  // ... bestehende Parameter (name, email, subject, message)

  // NEU: Entweder ID oder Name (Name nutzt Fuzzy-Matching)
  departmentId?: number;        // Klassisch: ID direkt
  departmentName?: string;      // NEU: Name mit Fuzzy-Matching

  topicId?: number;             // Klassisch: ID direkt
  topicName?: string;           // NEU: Name mit Fuzzy-Matching & Aliases
}
```

### Beispiel-Requests

#### Request 1: Mit Namen (Fuzzy-Matching)

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

**Interne Resolution:**
```
1. findDepartmentByName("Sitemap")
   → findet Department ID 5 ("Projekte / OXID 7 / Sitemap")

2. findTopicByName("Bug")
   → via Alias-Matching findet Topic ID 10 ("Softwarebug")

3. createTicket(..., departmentId=5, topicId=10)
```

#### Request 2: Mix aus ID und Name

```json
{
  "name": "create_ticket",
  "arguments": {
    "name": "Anna Schmidt",
    "email": "anna@example.com",
    "subject": "Feature Request: Export-Funktion",
    "message": "Bitte Export als CSV hinzufügen.",
    "departmentId": 6,
    "topicName": "Feature"
  }
}
```

**Interne Resolution:**
```
1. departmentId=6 direkt genutzt (kein Lookup nötig)

2. findTopicByName("Feature")
   → findet Topic ID 1 ("Feature Request")

3. createTicket(..., departmentId=6, topicId=1)
```

#### Request 3: Mit vollständigem Path

```json
{
  "name": "create_ticket",
  "arguments": {
    "name": "John Doe",
    "email": "john@example.com",
    "subject": "Backend-Fehler",
    "message": "Login funktioniert nicht.",
    "departmentName": "Projekte / OXID 7 / Backend",
    "topicName": "Support"
  }
}
```

---

## Fehlerbehandlung

### Department nicht gefunden

**Request:**
```json
{
  "departmentName": "Foobar"
}
```

**Response:**
```json
{
  "error": "Department not found: \"Foobar\"\n\nAvailable departments:\n  - ID 1: \"Support\"\n  - ID 3: \"Projekte\"\n  - ID 5: \"Projekte / OXID 7 / Sitemap\"\n  ...\n\nPlease use either the department ID or one of the names/paths above."
}
```

### Topic nicht gefunden

**Request:**
```json
{
  "topicName": "Foobar"
}
```

**Response:**
```json
{
  "error": "Help topic not found: \"Foobar\"\n\nAvailable topics:\n  - ID 1: \"Feature Request\"\n  - ID 10: \"Softwarebug\"\n  - ID 15: \"General Inquiry\"\n  ...\n\nPlease use either the topic ID or one of the names above."
}
```

---

## Datenbank-Schema (Referenz)

### Department-Tabelle

```sql
SELECT
  d.id,
  d.name,
  d.pid as parent_id,  -- NULL für Top-Level-Departments
  d.ispublic,
  d.flags              -- Bit 0x01 = Archived
FROM ost_department d;
```

**Hierarchie-Beispiel:**

| id | name | pid | path |
|----|------|-----|------|
| 3  | Projekte | NULL | "Projekte" |
| 4  | OXID 7   | 3    | "Projekte / OXID 7" |
| 5  | Sitemap  | 4    | "Projekte / OXID 7 / Sitemap" |

### Help-Topic-Tabelle

```sql
SELECT
  topic_id,
  topic as name,
  dept_id,
  priority_id,
  flags,            -- Bit 0x01 = Disabled
  ispublic
FROM ost_help_topic;
```

---

## Performance & Caching

### Cache-Strategie

- **TTL:** 5 Minuten (300.000ms)
- **Speicher:** In-Memory im MetadataService
- **Cache-Keys:**
  - `departmentsCache`: Alle Departments
  - `topicsCache`: Alle Topics

### Cache-Invalidierung

Der Cache wird automatisch nach 5 Minuten ungültig. Bei Metadata-Änderungen in osTicket kann der Cache manuell geleert werden:

```typescript
metadataService.clearCache();
```

### Query-Optimierung

- **Departments:** 1 SQL-Query mit hierarchischem Path-Building in JavaScript
- **Topics:** 1 SQL-Query
- **Find-Operationen:** Nutzen gecachte Daten (keine zusätzlichen DB-Queries)

---

## TypeScript Type Safety

Alle Entities sind **readonly** und **strongly typed**:

```typescript
interface Department {
  readonly id: number;
  readonly name: string;
  readonly parentId: number | null;
  readonly path: string;
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

## Testing-Hinweise

### Unit-Tests (MetadataService)

```typescript
import { MetadataService } from './MetadataService.js';

// Mock-Repository
const mockRepo = {
  queryDepartments: jest.fn().mockResolvedValue([
    { id: 5, name: 'Sitemap', parentId: 4, path: 'Projekte / OXID 7 / Sitemap', isPublic: true, isActive: true }
  ]),
  queryHelpTopics: jest.fn().mockResolvedValue([
    { id: 1, name: 'Feature Request', departmentId: 3, isActive: true, isPublic: true }
  ])
};

const service = new MetadataService(mockRepo);

// Test: Exakter Match
const dept = await service.findDepartmentByName('Sitemap');
expect(dept?.id).toBe(5);

// Test: Fuzzy Match
const dept2 = await service.findDepartmentByName('oxid sitemap');
expect(dept2?.id).toBe(5);

// Test: Fehler bei nicht gefundenem Department
await expect(service.findDepartmentByName('Foobar')).rejects.toThrow('Department not found');
```

### Integration-Tests (mit echter DB)

```bash
# 1. Test-DB mit Seed-Daten erstellen
npm run seed:test

# 2. Integration-Tests ausführen
npm run test:integration

# Beispiel-Test:
it('should resolve department name to ID', async () => {
  const result = await toolHandlers.handleCreateTicket({
    name: 'Test User',
    email: 'test@example.com',
    subject: 'Test',
    message: 'Test Message',
    departmentName: 'Sitemap',
    topicName: 'Feature'
  });

  expect(result.success).toBe(true);
  expect(result.metadata.departmentId).toBe(5);
  expect(result.metadata.topicId).toBe(1);
});
```

---

## Erweiterte Features (Zukunft)

### 1. Mehrsprachigkeit

Departments/Topics können mehrsprachige Namen haben:

```typescript
interface Department {
  // ...
  readonly translations?: {
    en: string;
    de: string;
    fr: string;
  };
}
```

### 2. Custom-Aliases pro Installation

Ermögliche Admin, eigene Aliases zu definieren:

```typescript
// config/aliases.json
{
  "departments": {
    "Shop": ["E-Commerce", "Online-Shop", "Webshop"]
  },
  "topics": {
    "Zahlung": ["Payment", "Bezahlung", "Checkout"]
  }
}
```

### 3. Statistiken & Analytics

Tracking, welche Fuzzy-Matches am häufigsten genutzt werden:

```typescript
metadataService.getMatchStatistics();
// Ergebnis:
// {
//   "departmentMatches": {
//     "Sitemap": { exactMatch: 80, fuzzyMatch: 20 }
//   }
// }
```

---

## Fazit

Der MetadataService macht die Ticket-Erstellung deutlich **benutzerfreundlicher**, indem:

1. ✅ User keine IDs mehr kennen müssen
2. ✅ Fuzzy-Matching Tippfehler verzeiht
3. ✅ Hilfreiche Fehlermeldungen bei falschen Namen
4. ✅ Aliases gängige Abkürzungen unterstützen
5. ✅ Caching Performance optimiert
6. ✅ TypeScript Type-Safety garantiert

**Beispiel-Workflow:**
```bash
User sagt: "Erstelle Ticket in Sitemap als Feature"
           ↓
           findDepartmentByName("Sitemap") → ID 5
           findTopicByName("Feature") → ID 1
           ↓
           createTicket(..., departmentId=5, topicId=1)
           ↓
           ✅ Ticket erstellt: #123456
```
