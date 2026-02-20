# Security Audit: osticket-mcp-server v2.2.0

**Datum:** 2026-02-20
**Auditor:** Claude Code (security-auditor, code-reviewer, backend-security-coder)
**Scope:** Vollstaendiger Source-Code Review aller 7 TypeScript-Dateien

---

## Zusammenfassung

| Severity | Anzahl |
|----------|--------|
| KRITISCH | 4 |
| HOCH | 4 |
| MITTEL | 8 |
| NIEDRIG | 4 |
| **Gesamt** | **20** |

Zusaetzlich: **Keine Tests vorhanden**, kein Rate-Limiting, keine Response-Validierung.

---

## KRITISCH

### K1: MCP SDK mit bekannter HIGH-Severity-Vulnerability

- **Datei:** `package.json`
- **Installiert:** `@modelcontextprotocol/sdk` 1.24.3
- **CVE:** GHSA-345p-7cg4-v4c7 (Cross-Client Data Leak, betrifft <=1.25.3)
- **Risiko:** Daten koennen zwischen MCP-Clients leaken - direkt relevant fuer einen MCP Server
- **Fix:** `npm update @modelcontextprotocol/sdk` (mindestens 1.26.0)

### K2: TLS-Zertifikatspruefung ist per Default deaktiviert

- **Datei:** `src/config/Configuration.ts:37`
- **Code:**
  ```typescript
  this.osTicketApiRejectUnauthorized = this.get('OSTICKET_API_REJECT_UNAUTHORIZED', 'false') === 'true';
  ```
- **Risiko:** Man-in-the-Middle-Angriffe moeglich. Jeder Nutzer, der die Env-Variable nicht explizit setzt, kommuniziert ohne Zertifikatspruefung.
- **Fix:** Default auf `'true'` aendern. Wer Self-Signed Certs nutzt, setzt explizit auf `false`.

### K3: Echter API-Key in .env.example

- **Datei:** `.env.example`
- **Code:**
  ```
  OSTICKET_API_KEY=CE206076F0B32E58AB3EBBF8CBD2DD29
  OSTICKET_DEFAULT_EMAIL=info@markus-michalski.net
  ```
- **Risiko:** 32-Char Hex-Key sieht real aus. Falls Repo public ist/wird, liegt der Key offen.
- **Fix:** Durch Placeholder ersetzen (`your-api-key-here`), Key rotieren falls noch aktiv.

### K4: `console.log` auf stdout stoert MCP-Transport

- **Datei:** `src/config/Configuration.ts:102-110`
- **Code:**
  ```typescript
  logSummary(): void {
      console.log('=== osTicket MCP Server Configuration ===');
      // ...
  }
  ```
- **Risiko:** stdout ist im MCP-Kontext fuer JSON-RPC reserviert. `console.log` schreibt auf stdout und kann den Transport korrumpieren.
- **Fix:** `console.log` durch `process.stderr.write()` oder Logger ersetzen.

---

## HOCH

### H1: `dueDate` ohne Format-Validierung

- **Datei:** `src/schemas/index.ts:185-188`
- **Code:**
  ```typescript
  dueDate: z.string()
      .nullable()
      .optional()
      .describe('Due date in ISO 8601 format ...'),
  ```
- **Risiko:** Akzeptiert beliebige Strings. Kein Defense-in-Depth gegen SQL-Injection auf Backend-Seite.
- **Fix:**
  ```typescript
  dueDate: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/, 'Must be ISO 8601 format')
      .nullable()
      .optional()
  ```

### H2: Unbegrenzte HTTP-Response-Groesse

- **Datei:** `src/infrastructure/http/OsTicketApiClient.ts:441-445`
- **Code:**
  ```typescript
  res.on('data', (chunk) => {
      data += chunk;  // Kein Size-Limit
  });
  ```
- **Risiko:** Kompromittiertes/fehlerhaftes osTicket-Backend kann riesige Responses senden → OOM-Kill. `truncateIfNeeded()` in `index.ts` greift erst nach vollstaendigem Download.
- **Fix:**
  ```typescript
  const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10 MB
  let dataSize = 0;
  res.on('data', (chunk) => {
      dataSize += chunk.length;
      if (dataSize > MAX_RESPONSE_SIZE) {
          req.destroy(new Error('Response too large'));
          return;
      }
      data += chunk;
  });
  ```

### H3: `parentTicketNumber` ohne Regex-Validierung

- **Datei:** `src/schemas/index.ts:189-191`
- **Code:**
  ```typescript
  parentTicketNumber: z.string()
      .optional()
      .describe('Parent ticket number (makes this a subticket)'),
  ```
- **Risiko:** Im Gegensatz zu `TicketNumberSchema` (`/^\d+$/`) fehlt hier jede Validierung. Beliebige Strings werden an die API weitergereicht.
- **Fix:** `TicketNumberSchema` wiederverwenden oder `.regex(/^\d+$/)` ergaenzen.

### H4: Massives `any`-Typing im HTTP-Client

- **Datei:** `src/infrastructure/http/OsTicketApiClient.ts` (diverse Zeilen)
- **Code:**
  ```typescript
  async getTicket(number: string): Promise<any>
  async searchTickets(params: {...}): Promise<any>
  async getTicketStats(): Promise<any>
  async updateTicket(...): Promise<any>
  async deleteTicket(number: string): Promise<any>
  const body: any = { ... };
  const options: any = { ... };
  ```
- **Risiko:** API-Responses werden unvalidiert an den MCP-Client durchgereicht. Bei kompromittiertem Backend koennen beliebige Daten in Claude landen.
- **Fix:** Response-Interfaces definieren, idealerweise mit Zod-Schemas validieren.

---

## MITTEL

### M1: Zod-Refinements werden nie zur Laufzeit ausgefuehrt

- **Datei:** `src/schemas/index.ts:79-85`, `src/index.ts:178`
- **Details:** `GetTicketInputSchema` hat ein Refinement (mindestens `id` oder `number` noetig), aber das Tool registriert `GetTicketInputSchemaShape` (ohne Refinement). Im Handler wird `params` als `GetTicketInput` getypt, aber nie gegen das Schema mit Refinement validiert.
- **Risiko:** Leeres Objekt `{}` fuehrt zu `params.number || String(params.id)` → `"undefined"` als Ticket-Nummer.
- **Fix:** Im Handler explizit `GetTicketInputSchema.parse(params)` ausfuehren.

### M2: `status`-Feld ohne Enum-Validierung

- **Datei:** `src/schemas/index.ts:93-95`
- **Code:**
  ```typescript
  status: z.string()
      .optional()
      .describe('Filter by status (open, closed, resolved, archived)'),
  ```
- **Risiko:** Beliebige Strings werden als Query-Parameter an die API geschickt.
- **Fix:** `z.enum(['open', 'closed', 'resolved', 'archived'])` verwenden.

### M3: String-Felder ohne Laengenbegrenzung

- **Datei:** `src/schemas/index.ts:170-182`
- **Code:**
  ```typescript
  departmentId: z.union([z.string(), z.number()]).optional(),
  statusId: z.union([z.string(), z.number()]).optional(),
  // etc. - kein .max() auf den Strings
  ```
- **Risiko:** Extrem lange Strings koennen eingeschleust werden.
- **Fix:** `.max(255)` und `.min(1)` auf String-Varianten setzen.

### M4: Error-Messages leaken API-Response-Inhalte

- **Datei:** `src/infrastructure/http/OsTicketApiClient.ts:98`
- **Code:**
  ```typescript
  throw new Error(
      `Failed to extract ticket number from API response (type: ${typeof response}, value: ${JSON.stringify(response)})`
  );
  ```
- **Risiko:** Vollstaendige API-Response in Fehlermeldung → kann sensitive Daten (E-Mails, interne Pfade, DB-Fehler) ueber MCP an den Client zurueckfliessen lassen.
- **Fix:** Nur Typ und Laenge loggen, nicht den Inhalt: `(type: ${typeof response}, length: ${JSON.stringify(response).length})`

### M5: `formatError()` basiert auf fragilem String-Matching

- **Datei:** `src/index.ts:90-111`
- **Code:**
  ```typescript
  if (message.includes('404') || message.includes('not found')) { ... }
  if (message.includes('401') || message.includes('Unauthorized')) { ... }
  ```
- **Risiko:** False Positives wenn Ticket-Beschreibungen "404" oder "Unauthorized" enthalten.
- **Fix:** Custom Error-Klassen mit `statusCode`-Property verwenden.

### M6: Kein Retry-Mechanismus

- **Datei:** `src/infrastructure/http/OsTicketApiClient.ts`
- **Risiko:** Ein einziger Netzwerk-Fehler (5xx, Timeout, ECONNRESET) fuehrt zum sofortigen Abbruch. Fuer einen langlebigen MCP-Server problematisch.
- **Fix:** Exponential Backoff mit max. 2-3 Retries fuer transiente Fehler.

### M7: Timeout hardcodiert statt aus Constants

- **Datei:** `src/infrastructure/http/OsTicketApiClient.ts:498`
- **Code:**
  ```typescript
  req.setTimeout(10000, () => {  // Hardcoded statt API_TIMEOUT_MS
  ```
- **Referenz:** `src/constants.ts` definiert `API_TIMEOUT_MS = 10000`, wird aber nicht verwendet.
- **Fix:** `API_TIMEOUT_MS` importieren und verwenden.

### M8: Versionsinkonsistenz

- **Dateien:** `src/constants.ts:17`, `package.json`, `VERSION.txt`
- **Details:** `constants.ts` sagt `SERVER_VERSION = '3.0.0'`, Rest sagt `2.2.0`.
- **Fix:** Version aus `package.json` lesen oder Single Source of Truth definieren.

---

## NIEDRIG

### N1: API-Key letzte 4 Zeichen werden geloggt

- **Datei:** `src/config/Configuration.ts:105`
- **Code:**
  ```typescript
  console.log(`  API Key: ${this.osTicketApiKey ? '***' + this.osTicketApiKey.slice(-4) : 'not set'}`);
  ```
- **Risiko:** Marginal, aber reduziert Brute-Force-Raum in Kombination mit bekannter URL.
- **Fix:** Nur `[SET]` / `[NOT SET]` loggen.

### N2: API-Key ohne CRLF-Pruefung

- **Datei:** `src/config/Configuration.ts:81`
- **Risiko:** Header-Injection theoretisch moeglich. Node.js v14+ blockt CRLF in Headers, aber Defense-in-Depth fehlt.
- **Fix:**
  ```typescript
  if (/[\r\n]/.test(this.osTicketApiKey)) {
      throw new Error('OSTICKET_API_KEY must not contain newline characters');
  }
  ```

### N3: `parseInt` ohne NaN-Check fuer TopicId

- **Datei:** `src/config/Configuration.ts:42`
- **Code:**
  ```typescript
  this.osTicketDefaultTopicId = parseInt(this.get('OSTICKET_DEFAULT_TOPIC_ID', '0'));
  ```
- **Risiko:** `parseInt('abc')` → `NaN`, faellt silent auf `undefined` zurueck.
- **Fix:** NaN-Check und expliziter Fehler bei ungueltigem Wert.

### N4: Logger nicht in ApiClient injiziert

- **Dateien:** `src/index.ts:60-75`, `src/infrastructure/http/OsTicketApiClient.ts:169`
- **Details:** Logger wird erstellt, aber ApiClient nutzt `process.stderr.write()` direkt.
- **Fix:** Logger als Constructor-Dependency in ApiClient injizieren.

---

## Positive Befunde

| Bereich | Bewertung |
|---------|-----------|
| URL-Parameter-Encoding | `url.searchParams.append()` korrekt verwendet (RFC 3986) |
| Regex-Patterns | Kein ReDoS-Risiko (`/^\d+$/` und negierte Zeichenklassen) |
| MCP Tool Annotations | `readOnlyHint`, `destructiveHint` korrekt gesetzt |
| Graceful Shutdown | SIGINT/SIGTERM Handling implementiert |
| `.gitignore` | `.env` korrekt ausgeschlossen |
| TypeScript Strict Mode | Alle wichtigen Flags aktiv |
| Log-Rotation | Konfigurierbare Groesse und Cleanup |
| EPIPE-Handling | Verhindert Crashes bei Client-Disconnect |

---

## Fehlende Massnahmen

### Keine Tests

Null Testdateien im Projekt. Kein Test-Framework konfiguriert, kein `test`-Script in `package.json`.

**Kritische Tests die fehlen:**

| Prio | Test | Begruendung |
|------|------|-------------|
| P0 | `OsTicketApiClient.makeRequest()` | Kernlogik, Error Handling, Timeout |
| P0 | `formatError()` | Sicherstellen, dass keine Daten leaken |
| P0 | Zod-Schema-Validierung | Ungueltige Inputs muessen abgefangen werden |
| P1 | `Configuration` | Env-Variablen, Defaults, Validierung |
| P1 | `truncateIfNeeded()` | Edge Cases (leeres Array, riesiges Item) |
| P1 | Tool-Handler Integration | End-to-End mit gemocktem API-Client |

### Kein Rate-Limiting

Keine Begrenzung der API-Calls an das osTicket-Backend. Ein fehlerhafter MCP-Client koennte das Backend ueberlasten.

### Keine Response-Validierung

API-Responses vom osTicket-Backend werden unvalidiert weitergereicht (`any`-Typing).

---

## Empfohlene Fix-Reihenfolge

### Phase 1: Sofort (Security-kritisch)

1. `npm update @modelcontextprotocol/sdk` auf >=1.26.0
2. `OSTICKET_API_REJECT_UNAUTHORIZED` Default auf `'true'`
3. `.env.example` bereinigen (Placeholder statt echtem Key)
4. `console.log` → `process.stderr.write()` in `logSummary()`

### Phase 2: Kurzfristig (Input Validation)

5. `dueDate` mit ISO-8601-Regex validieren
6. `parentTicketNumber` mit `/^\d+$/` validieren
7. HTTP-Response-Size-Limit einbauen (10 MB)
8. String-Felder mit `.max()` begrenzen
9. `status` als `z.enum()` definieren

### Phase 3: Mittelfristig (Qualitaet)

10. Test-Framework einrichten (vitest) + kritische Tests
11. `any`-Types durch Interfaces/Zod-Response-Schemas ersetzen
12. Custom Error-Klassen statt String-Matching
13. Retry-Logik fuer transiente Fehler
14. `API_TIMEOUT_MS` aus constants.ts verwenden
15. Versionsinkonsistenz fixen
16. Logger in ApiClient injizieren

### Phase 4: Nice-to-have

17. API-Key Logging auf `[SET]`/`[NOT SET]` reduzieren
18. CRLF-Check fuer API-Key
19. NaN-Check fuer `parseInt` in Config
20. `index.ts` in separate Tool-Dateien aufsplitten
