# Changelog

Alle wichtigen Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

---

## [Unreleased]

---

## [2.0.0] - 2025-10-23

### Changed
- update dependencies to latest versions

---

## [1.2.2] - 2025-10-22

### Added
- set markdown as default format for tickets
- add markdown format support for ticket creation

### Changed
- Auto-sync from RTY-9618531788

### Fixed
- update API URL to production domain in example config
- correct SSL certificate verification logic

---

## [1.2.1] - 2025-10-19

### Added
- add default topic ID support for ticket creation

---

## [1.2.0] - 2025-10-19

### Added
- add default name/email config for ticket creation

### Fixed
- Remove unsupported departmentId and topicId from create_ticket
- Handle numeric ticket numbers from wildcard API

---

## [1.1.2] - 2025-10-19

### Added
- Switch to wildcard API endpoint for ticket creation

### Fixed
- Prevent EPIPE exception loops and implement log rotation
- Handle MCP close event for graceful shutdown

---

## [1.1.1] - 2025-10-19

### Fixed
- corrected json response parsing

---

## [1.1.0] - 2025-10-18

### Added
- Add Phase 2 features - API integration and metadata service
- Add file-based logging and fix SSH tunnel port forwarding
- Initial implementation of osTicket MCP Server

### Changed
- Add --scope user for global MCP registration
- Fix DEPLOYMENT.md for Claude Code CLI

### Fixed
- Use ost_user_email for user email address
- Use ost_ticket__cdata for subject field
- Load .env from absolute deployment path

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

[Unreleased]: https://github.com/markus-michalski/claude-mcp-osTicket/compare/v2.0.0...HEAD
[1.0.0]: https://github.com/username/claude-mcp-osticket/releases/tag/v1.0.0
[1.1.0]: https://github.com/markus-michalski/claude-mcp-osTicket/releases/tag/v1.1.0
[1.1.1]: https://github.com/markus-michalski/claude-mcp-osTicket/releases/tag/v1.1.1
[1.1.2]: https://github.com/markus-michalski/claude-mcp-osTicket/releases/tag/v1.1.2
[1.2.0]: https://github.com/markus-michalski/claude-mcp-osTicket/releases/tag/v1.2.0
[1.2.1]: https://github.com/markus-michalski/claude-mcp-osTicket/releases/tag/v1.2.1
[1.2.2]: https://github.com/markus-michalski/claude-mcp-osTicket/releases/tag/v1.2.2
[2.0.0]: https://github.com/markus-michalski/claude-mcp-osTicket/releases/tag/v2.0.0
