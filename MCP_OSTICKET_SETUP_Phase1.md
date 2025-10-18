# osTicket MCP Server - Vollständige Implementierungsanleitung

**Erstellt:** 2025-01-18
**Zweck:** Projektübergreifende osTicket-Integration für Claude Code via Model Context Protocol (MCP)

---

## 🎯 Projektziel

Ein **MCP Server** der Claude Code in ALLEN Projekten ermöglicht, osTicket-Tickets abzurufen und zu verarbeiten - unabhängig vom aktuellen Projekt.

**Was ist MCP?**
Model Context Protocol - ein offener Standard von Anthropic für strukturierte Kommunikation zwischen KI-Assistenten und externen Datenquellen.
Mehr: https://modelcontextprotocol.io/

---

## 🏗️ Architektur-Übersicht

```
┌─────────────────────────────────────────────────┐
│ Entwicklungsrechner (WSL2/Linux/Mac)            │
│                                                 │
│  ┌──────────────┐                               │
│  │ Claude Code  │◄─────── MCP Protocol          │
│  └──────────────┘                               │
│         ▲                                       │
│         │                                       │
│    ┌────┴──────────────────┐                    │
│    │ MCP Server            │                    │
│    │ (Node.js/TypeScript)  │                    │
│    └────┬──────────────────┘                    │
│         │                                       │
│         │ 1. SSH-Tunnel öffnen                  │
│         │ 2. MySQL über Tunnel                  │
│         ▼                                       │
│    localhost:3306 ────────────────────┐         │
└───────────────────────────────────────┼─────────┘
                                        │
                          SSH-Tunnel    │
                          (automatisch) │
                                        ▼
                  ┌─────────────────────────────┐
                  │ Liveserver                  │
                  │                             │
                  │  SSH Server (Port 22)       │
                  │         │                   │
                  │         ▼                   │
                  │  ┌──────────────────┐       │
                  │  │ MariaDB          │       │
                  │  │ localhost:3306   │       │
                  │  │                  │       │
                  │  │ osticket_db      │       │
                  │  └──────────────────┘       │
                  └─────────────────────────────┘
```

---

## 📋 Voraussetzungen

### Auf dem Entwicklungsrechner

- ✅ Node.js 18+ (aktuell: 22.19.0)
- ✅ SSH-Zugang zum Liveserver
- ✅ SSH-Key (~/.ssh/id_rsa oder ~/.ssh/id_ed25519)

### Auf dem Liveserver

- ✅ SSH-Server läuft
- ✅ MariaDB/MySQL mit osTicket-Datenbank
- ✅ MariaDB-User mit SELECT-Rechten (kann localhost-only sein!)

---

## 🔧 Teil 1: Liveserver-Setup (MariaDB User)

### 1.1 MariaDB-User erstellen

```bash
# Auf Liveserver einloggen
ssh user@liveserver

# MySQL als root
mysql -u root -p
```

```sql
-- User für osTicket-Zugriff erstellen (localhost-only, da SSH-Tunnel)
CREATE USER 'osticket_readonly'@'localhost'
IDENTIFIED BY 'SICHERES_PASSWORT_HIER';

-- Nur SELECT-Rechte auf osTicket-DB geben
GRANT SELECT ON osticket_db.*
TO 'osticket_readonly'@'localhost';

-- Rechte aktivieren
FLUSH PRIVILEGES;

-- User prüfen
SELECT User, Host FROM mysql.user WHERE User = 'osticket_readonly';

-- Testen
exit;
mysql -u osticket_readonly -p osticket_db
SHOW TABLES;
exit;
```

**WICHTIG:** User ist `@'localhost'` - kein Remote-Zugriff nötig! SSH-Tunnel leitet alles über localhost um.

### 1.2 SSH-Key deployen (auf jedem Entwicklungsrechner)

```bash
# Von Entwicklungsrechner aus:
ssh-copy-id user@liveserver

# Oder manuell:
cat ~/.ssh/id_rsa.pub | ssh user@liveserver "cat >> ~/.ssh/authorized_keys"

# Test: Login ohne Passwort sollte funktionieren
ssh user@liveserver "echo 'SSH-Key funktioniert!'"
```

---

## 🚀 Teil 2: MCP Server Implementation

### 2.1 Projektstruktur erstellen

```bash
# MCP Server Verzeichnis
mkdir -p ~/.claude/mcp-servers/osticket
cd ~/.claude/mcp-servers/osticket

# Initialisierung
npm init -y
```

### 2.2 Dependencies installieren

```bash
npm install \
  @modelcontextprotocol/sdk \
  mysql2 \
  ssh2 \
  dotenv

npm install -D \
  @types/node \
  @types/ssh2 \
  typescript \
  ts-node
```

### 2.3 TypeScript konfigurieren

**Datei: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 2.4 Package.json Scripts

**Datei: `package.json`** (scripts-Sektion ergänzen)

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "clean": "rm -rf dist"
  }
}
```

### 2.5 Umgebungsvariablen

**Datei: `.env`** (wird in .gitignore gelistet)

```env
# SSH-Verbindung
SSH_HOST=liveserver.example.com
SSH_USER=markus
SSH_KEY_PATH=/home/markus/.ssh/id_rsa

# MariaDB-Zugriff (über SSH-Tunnel = localhost)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=osticket_db
DB_USER=osticket_readonly
DB_PASS=SICHERES_PASSWORT_HIER

# osTicket-Konfiguration
OSTICKET_TABLE_PREFIX=ost_

# Cache-Einstellungen
CACHE_TTL=300000
```

**Datei: `.gitignore`**

```
node_modules/
dist/
.env
*.log
```

### 2.6 Source-Code

#### Datei: `src/types.ts`

```typescript
export interface TicketDTO {
  id: number;
  number: string;
  subject: string;
  status: string;
  priority: string;
  department: string;
  created: string;
  updated: string;
  user_name: string;
  user_email: string;
  assignee?: string;
  messages: TicketMessageDTO[];
}

export interface TicketMessageDTO {
  id: number;
  created: string;
  author: string;
  type: 'message' | 'response' | 'note';
  body: string;
}

export interface TicketStatisticsDTO {
  total: number;
  open: number;
  closed: number;
  overdue: number;
  by_priority: Record<string, number>;
  by_department: Record<string, number>;
}
```

#### Datei: `src/ssh-tunnel.ts`

```typescript
import { Client } from 'ssh2';
import * as fs from 'fs';

export class SSHTunnelManager {
  private client: Client | null = null;
  private stream: any = null;

  constructor(
    private config: {
      host: string;
      username: string;
      privateKeyPath: string;
      localPort: number;
      remoteHost: string;
      remotePort: number;
    }
  ) {}

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = new Client();

      this.client
        .on('ready', () => {
          console.log('[SSH] Tunnel established');
          resolve();
        })
        .on('error', (err) => {
          console.error('[SSH] Connection error:', err);
          reject(err);
        })
        .connect({
          host: this.config.host,
          username: this.config.username,
          privateKey: fs.readFileSync(this.config.privateKeyPath),
        });
    });
  }

  async createForward(localPort: number): Promise<void> {
    if (!this.client) {
      throw new Error('SSH client not connected');
    }

    return new Promise((resolve, reject) => {
      this.client!.forwardOut(
        '127.0.0.1',
        localPort,
        this.config.remoteHost,
        this.config.remotePort,
        (err, stream) => {
          if (err) {
            reject(err);
            return;
          }
          this.stream = stream;
          resolve();
        }
      );
    });
  }

  close(): void {
    if (this.stream) {
      this.stream.end();
    }
    if (this.client) {
      this.client.end();
    }
    console.log('[SSH] Tunnel closed');
  }
}
```

#### Datei: `src/database.ts`

```typescript
import mysql from 'mysql2/promise';
import { SSHTunnelManager } from './ssh-tunnel';

export class DatabaseManager {
  private connection: mysql.Connection | null = null;
  private tunnel: SSHTunnelManager | null = null;

  constructor(
    private config: {
      ssh: {
        host: string;
        username: string;
        privateKeyPath: string;
      };
      db: {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
      };
    }
  ) {}

  async connect(): Promise<void> {
    // 1. SSH-Tunnel öffnen
    this.tunnel = new SSHTunnelManager({
      host: this.config.ssh.host,
      username: this.config.ssh.username,
      privateKeyPath: this.config.ssh.privateKeyPath,
      localPort: this.config.db.port,
      remoteHost: '127.0.0.1',
      remotePort: 3306,
    });

    await this.tunnel.open();
    console.log('[DB] SSH Tunnel established');

    // 2. MySQL-Verbindung über Tunnel
    this.connection = await mysql.createConnection({
      host: this.config.db.host,
      port: this.config.db.port,
      database: this.config.db.database,
      user: this.config.db.user,
      password: this.config.db.password,
    });

    console.log('[DB] MySQL connection established');
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.connection) {
      throw new Error('Database not connected');
    }

    const [rows] = await this.connection.execute(sql, params);
    return rows as T[];
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      console.log('[DB] MySQL connection closed');
    }
    if (this.tunnel) {
      this.tunnel.close();
    }
  }

  isConnected(): boolean {
    return this.connection !== null;
  }
}
```

#### Datei: `src/osticket-service.ts`

```typescript
import { DatabaseManager } from './database';
import { TicketDTO, TicketStatisticsDTO } from './types';

export class OsTicketService {
  private cache: Map<string, { data: any; expires: number }> = new Map();

  constructor(
    private db: DatabaseManager,
    private tablePrefix: string = 'ost_',
    private cacheTTL: number = 300000 // 5 minutes
  ) {}

  private getCacheKey(method: string, ...args: any[]): string {
    return `${method}:${JSON.stringify(args)}`;
  }

  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data as T;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.cacheTTL,
    });
  }

  async getTicket(ticketId: number): Promise<TicketDTO | null> {
    const cacheKey = this.getCacheKey('getTicket', ticketId);
    const cached = this.getFromCache<TicketDTO>(cacheKey);
    if (cached) return cached;

    const sql = `
      SELECT
        t.ticket_id as id,
        t.number,
        t.subject,
        t.status_id,
        t.priority_id,
        t.dept_id,
        t.created,
        t.updated,
        u.name as user_name,
        u.email as user_email
      FROM ${this.tablePrefix}ticket t
      LEFT JOIN ${this.tablePrefix}user u ON t.user_id = u.id
      WHERE t.ticket_id = ?
    `;

    const rows = await this.db.query<any>(sql, [ticketId]);
    if (rows.length === 0) return null;

    const ticket = rows[0];

    // Messages laden (vereinfacht)
    const messages = await this.getTicketMessages(ticketId);

    const result: TicketDTO = {
      id: ticket.id,
      number: ticket.number,
      subject: ticket.subject,
      status: ticket.status_id || 'unknown',
      priority: ticket.priority_id || 'normal',
      department: ticket.dept_id || 'unknown',
      created: ticket.created,
      updated: ticket.updated,
      user_name: ticket.user_name,
      user_email: ticket.user_email,
      messages,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  private async getTicketMessages(ticketId: number): Promise<any[]> {
    const sql = `
      SELECT
        thread_id as id,
        created,
        poster as author,
        title,
        body
      FROM ${this.tablePrefix}ticket_thread
      WHERE ticket_id = ?
      ORDER BY created ASC
    `;

    return await this.db.query(sql, [ticketId]);
  }

  async listTickets(filters?: {
    status?: string;
    limit?: number;
  }): Promise<TicketDTO[]> {
    const cacheKey = this.getCacheKey('listTickets', filters);
    const cached = this.getFromCache<TicketDTO[]>(cacheKey);
    if (cached) return cached;

    let sql = `
      SELECT
        t.ticket_id as id,
        t.number,
        t.subject,
        t.status_id,
        t.created
      FROM ${this.tablePrefix}ticket t
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters?.status) {
      sql += ' AND t.status_id = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY t.created DESC';

    if (filters?.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    const rows = await this.db.query<any>(sql, params);
    this.setCache(cacheKey, rows);
    return rows;
  }

  async searchTickets(query: string, limit: number = 20): Promise<TicketDTO[]> {
    const sql = `
      SELECT
        t.ticket_id as id,
        t.number,
        t.subject,
        t.status_id,
        t.created
      FROM ${this.tablePrefix}ticket t
      WHERE t.subject LIKE ? OR t.number LIKE ?
      ORDER BY t.created DESC
      LIMIT ?
    `;

    const searchPattern = `%${query}%`;
    return await this.db.query<any>(sql, [searchPattern, searchPattern, limit]);
  }

  async getStatistics(): Promise<TicketStatisticsDTO> {
    const cacheKey = this.getCacheKey('getStatistics');
    const cached = this.getFromCache<TicketStatisticsDTO>(cacheKey);
    if (cached) return cached;

    const sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status_id = 'open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status_id = 'closed' THEN 1 ELSE 0 END) as closed
      FROM ${this.tablePrefix}ticket
    `;

    const rows = await this.db.query<any>(sql);
    const stats = rows[0];

    const result: TicketStatisticsDTO = {
      total: stats.total || 0,
      open: stats.open || 0,
      closed: stats.closed || 0,
      overdue: 0,
      by_priority: {},
      by_department: {},
    };

    this.setCache(cacheKey, result);
    return result;
  }
}
```

#### Datei: `src/index.ts`

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';
import { DatabaseManager } from './database';
import { OsTicketService } from './osticket-service';

dotenv.config();

const db = new DatabaseManager({
  ssh: {
    host: process.env.SSH_HOST!,
    username: process.env.SSH_USER!,
    privateKeyPath: process.env.SSH_KEY_PATH!,
  },
  db: {
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASS!,
  },
});

const osTicketService = new OsTicketService(
  db,
  process.env.OSTICKET_TABLE_PREFIX || 'ost_',
  parseInt(process.env.CACHE_TTL || '300000')
);

const server = new Server(
  {
    name: 'osticket-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tools definieren
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_ticket',
        description: 'Get a specific osTicket ticket by ID or number',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Ticket ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_tickets',
        description: 'List osTicket tickets with optional filters',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Filter by status',
            },
            limit: {
              type: 'number',
              description: 'Limit results (default: 20)',
            },
          },
        },
      },
      {
        name: 'search_tickets',
        description: 'Search tickets by subject or number',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Limit results (default: 20)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_ticket_stats',
        description: 'Get osTicket statistics',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Tool-Aufrufe behandeln
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_ticket': {
        const ticket = await osTicketService.getTicket(args.id as number);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(ticket, null, 2),
            },
          ],
        };
      }

      case 'list_tickets': {
        const tickets = await osTicketService.listTickets(args as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(tickets, null, 2),
            },
          ],
        };
      }

      case 'search_tickets': {
        const tickets = await osTicketService.searchTickets(
          args.query as string,
          (args.limit as number) || 20
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(tickets, null, 2),
            },
          ],
        };
      }

      case 'get_ticket_stats': {
        const stats = await osTicketService.getStatistics();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Server starten
async function main() {
  console.log('[MCP] Starting osTicket MCP Server...');

  try {
    await db.connect();
    console.log('[MCP] Database connected');

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.log('[MCP] Server running');
  } catch (error) {
    console.error('[MCP] Failed to start:', error);
    process.exit(1);
  }
}

// Cleanup
process.on('SIGINT', async () => {
  console.log('[MCP] Shutting down...');
  await db.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[MCP] Shutting down...');
  await db.disconnect();
  process.exit(0);
});

main();
```

### 2.7 Build & Test

```bash
# TypeScript kompilieren
npm run build

# Manueller Test (nicht via Claude Code)
npm start
```

---

## 🔌 Teil 3: Claude Code Konfiguration

### 3.1 MCP Server registrieren

**Datei: `~/.claude/mcp-servers.json`** (neu erstellen falls nicht vorhanden)

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

**WICHTIG:** Umgebungsvariablen kommen aus `.env` (dotenv), nicht aus dieser Datei!

### 3.2 Claude Code neustarten

```bash
# Claude Code komplett beenden und neu starten
# Der MCP Server wird automatisch beim Start geladen
```

---

## ✅ Teil 4: Testen

### 4.1 In Claude Code testen

```
User: "Zeig mir Ticket #123"

Claude: *nutzt get_ticket(123) Tool automatisch*

        📋 Ticket #123
        Betreff: Dashboard Widget
        Status: Open
        ...
```

### 4.2 Verfügbare Befehle

```
"Zeig mir Ticket #123456"
"Liste alle offenen Tickets"
"Suche nach 'osTicket Dashboard'"
"Zeig mir die Ticket-Statistiken"
"Bearbeite Ticket #123456"
```

### 4.3 Debugging

**Log-Ausgaben prüfen:**

```bash
# Claude Code im Terminal starten (für Logs)
claude-code

# Oder MCP Server manuell testen:
cd ~/.claude/mcp-servers/osticket
npm start
```

**Häufige Fehler:**

- SSH-Verbindung schlägt fehl → SSH-Key prüfen (`ssh user@liveserver`)
- MySQL-Fehler → Credentials in `.env` prüfen
- "Module not found" → `npm run build` erneut ausführen

---

## 🚀 Teil 5: Multi-Rechner-Setup

### Auf jedem neuen Rechner:

1. **MCP Server installieren**
   
   ```bash
   # Option A: Git Repository
   git clone https://github.com/dein-user/osticket-mcp-server.git ~/.claude/mcp-servers/osticket
   cd ~/.claude/mcp-servers/osticket
   npm install
   npm run build
   ```

2. **SSH-Key deployen**
   
   ```bash
   ssh-copy-id user@liveserver
   ```

3. **`.env` konfigurieren**
   
   ```bash
   cp .env.example .env
   nano .env
   # SSH/DB-Credentials eintragen
   ```

4. **Claude Code Config**
   
   ```bash
   # ~/.claude/mcp-servers.json erstellen (siehe Teil 3.1)
   ```

5. **Claude Code starten** - Fertig! ✅

---

## 🔄 Teil 6: Migration - Symfony Service entfernen

**WICHTIG:** Dieser Schritt erfolgt NACH erfolgreicher MCP-Implementierung!

### 6.1 Dateien aus mlm-gallery entfernen

```bash
cd ~/projekte/mlm-gallery

# Services löschen
rm -rf src/Service/OsTicket/

# DTOs löschen
rm -rf src/DTO/OsTicket/

# Exceptions löschen (falls vorhanden)
rm -rf src/Exception/OsTicket/

# Tests löschen
rm -rf tests/Service/OsTicket/
rm -f tests/OsTicketTestCase.php
rm -f tests/Fixtures/OsTicketTestFixtures.php

# Test-Config löschen
# (OsTicketTestCase wird in anderen Tests evtl. noch genutzt - prüfen!)
```

### 6.2 Doctrine-Konfiguration bereinigen

**Datei: `config/packages/doctrine.yaml`**

```yaml
# VORHER:
doctrine:
    dbal:
        default_connection: default
        connections:
            default:
                url: '%env(resolve:DATABASE_URL)%'
            osticket:
                url: '%env(resolve:OSTICKET_DATABASE_URL)%'

# NACHHER (osticket-Connection entfernen):
doctrine:
    dbal:
        url: '%env(resolve:DATABASE_URL)%'
        profiling_collect_backtrace: '%kernel.debug%'
        use_savepoints: true
```

### 6.3 Environment-Variablen bereinigen

**Datei: `.env.test`**

```bash
# Diese Zeile entfernen:
OSTICKET_DATABASE_URL="sqlite:///:memory:"
```

**Datei: `.env.local`** (falls vorhanden)

```bash
# Diese Zeile entfernen:
OSTICKET_DATABASE_URL="mysql://..."
```

### 6.4 Services aus DI-Container entfernen

**Prüfen ob Autowiring betroffen ist:**

```bash
# Services suchen die OsTicket* nutzen
grep -r "OsTicket" src/Controller/
grep -r "OsTicket" src/Command/

# Falls Services in config/services.yaml manuell definiert sind:
nano config/packages/services.yaml
# OsTicket-Services entfernen
```

### 6.5 CLAUDE.md aktualisieren

**Datei: `CLAUDE.md`**

Abschnitt "osTicket Integration" ersetzen durch:

```markdown
**osTicket Integration:**
- **MCP Server** - Projektübergreifende Integration via Model Context Protocol
- **Standort:** ~/.claude/mcp-servers/osticket/
- **Tools:** get_ticket(), list_tickets(), search_tickets(), get_ticket_stats()
- **Dokumentation:** ~/projekte/MCP_OSTICKET_SETUP.md
- **Kein Symfony-Service mehr** - Komplette Migration zu MCP abgeschlossen
```

### 6.6 Tests ausführen

```bash
# Sicherstellen dass keine Tests mehr osTicket-Services nutzen
composer test

# Falls Tests fehlschlagen:
# → Abhängigkeiten zu gelöschten Services finden und entfernen
```

### 6.7 Git: Änderungen committen

```bash
# Feature-Branch bereinigen
git add -A
git status  # Prüfen was gelöscht wurde

# Commit mit Migration
git commit -m "refactor: Migrate osTicket integration from Symfony to MCP Server

- Remove Symfony-based osTicket services (OsTicketService, OsTicketConnectionService, OsTicketCacheService)
- Remove osTicket DTOs and test infrastructure
- Remove osticket DBAL connection from doctrine.yaml
- Update CLAUDE.md to reference MCP-based integration
- Migration complete: osTicket now accessible via MCP in all projects

BREAKING CHANGE: osTicket functionality now requires MCP server setup
See ~/projekte/MCP_OSTICKET_SETUP.md for installation"

# Branch Status prüfen
git log --oneline -5
```

### 6.8 Optional: Feature-Branch verwerfen

Falls der osTicket-Code nur zu Testzwecken im Branch war:

```bash
# Branch löschen (Änderungen verwerfen)
git checkout master
git branch -D feature/osticket-dashboard-integration

# Sauberer Start
git status
```

### 6.9 Verifikation

**Checklist:**

- [ ] MCP Server läuft und ist in Claude Code verfügbar
- [ ] Alle Symfony osTicket-Services gelöscht
- [ ] Keine osTicket-Imports mehr in Symfony-Code
- [ ] Tests laufen grün (keine Abhängigkeiten zu gelöschten Services)
- [ ] `doctrine.yaml` hat keine osticket-Connection mehr
- [ ] `.env.test` hat keine OSTICKET_DATABASE_URL mehr
- [ ] CLAUDE.md aktualisiert
- [ ] Git Commit erstellt

**Test in Claude Code:**

```
User: "Zeig mir Ticket #123456"
Claude: *nutzt MCP-Tool get_ticket()*
```

Wenn das funktioniert → **Migration erfolgreich!** ✅
