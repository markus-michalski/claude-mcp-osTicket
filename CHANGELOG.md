# Changelog

Alle wichtigen Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

---

## [Unreleased]

### Added
- create_ticket Tool für API-basierte Ticket-Erstellung
- MetadataService für intelligente Department/Topic-Zuordnung
- Fuzzy-Matching für Department-Namen (z.B. "Sitemap" → ID 5)
- Fuzzy-Matching für Help-Topic-Namen (z.B. "Feature" → ID 1)
- HTTP-Client (OsTicketApiClient) für osTicket REST API
- Caching für Departments und Help Topics (5 Min TTL)
- Unterstützung für departmentName & topicName Parameter
- Ausführliche Dokumentation (METADATA_SERVICE.md, EXAMPLE_USAGE.md)

### Changed
- Tool-Handlers erweitert um API-Client-Support
- Configuration erweitert um API-Einstellungen (OSTICKET_API_URL, OSTICKET_API_KEY)

---

## [1.0.0] - 2025-01-18

### Added
- Initiales Release des osTicket MCP Servers
- SSH-Tunnel-basierte Verbindung zu Remote-MariaDB
- Readonly-Zugriff auf osTicket-Datenbank
- Connection Pooling mit Circuit Breaker Pattern
- Multi-Layer-Caching (In-Memory)
- MCP Tools implementiert:
  - `get_ticket` - Ticket mit allen Messages abrufen
  - `list_tickets` - Tickets mit Filtern auflisten
  - `search_tickets` - Volltextsuche in Tickets
  - `get_ticket_stats` - Aggregierte Statistiken
- Health Checks für SSH-Tunnel und DB-Connection
- Production-ready Logging
- TypeScript mit Strict Mode
- Clean Architecture (Application → Core → Infrastructure)

### Security
- SSH-Key-basierte Authentifizierung (keine Passwörter)
- Readonly-DB-User (keine Write-Rechte)
- SSL-Support für DB-Verbindungen

---

## Versionshistorie

[Unreleased]: https://github.com/username/claude-mcp-osticket/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/username/claude-mcp-osticket/releases/tag/v1.0.0
