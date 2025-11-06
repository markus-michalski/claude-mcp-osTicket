# Changelog

Alle wichtigen Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

---

## [Unreleased]

---

## [1.0.1] - 2025-11-06

### Added
- Add dynamic status lookup with API caching
- Add status name to ID resolution for update_ticket

### Changed
- removed Zone.Identifier file
- added missing License file
- Add GitHub Actions CI workflow
- Reduce README to minimum and reference Wiki.js FAQ

### Fixed
- Add ESLint 9.x flat config and fix linting errors


---

## [1.0.0] - 2025-11-05

### Added
- Add note parameters to update_ticket
- Add noteFormat parameter to update_ticket tool
- set markdown as default format for tickets
- add markdown format support for ticket creation
- add default topic ID support for ticket creation
- add default name/email config for ticket creation
- Switch to wildcard API endpoint for ticket creation
- Add Phase 2 features - API integration and metadata service
- Add file-based logging and fix SSH tunnel port forwarding
- Initial implementation of osTicket MCP Server

### Changed
- fixed verion in package.json
- Reset CHANGELOG.md for fresh start
- Add .claude/ to .gitignore
- Remove internal files for public release
- Remove priorityId and add note/noteTitle to update_ticket
- feat!: Migrate to API-only architecture (v2.0.0)
- update dependencies to latest versions
- Auto-sync from RTY-9618531788
- Add --scope user for global MCP registration
- Fix DEPLOYMENT.md for Claude Code CLI

### Fixed
- Add HTTP timeout and make health check non-blocking
- Handle API response arrays correctly in list/search tools
- Update Configuration for API-only architecture and health check endpoint
- update API URL to production domain in example config
- correct SSL certificate verification logic
- Remove unsupported departmentId and topicId from create_ticket
- Handle numeric ticket numbers from wildcard API
- Prevent EPIPE exception loops and implement log rotation
- Handle MCP close event for graceful shutdown
- corrected json response parsing
- Use ost_user_email for user email address
- Use ost_ticket__cdata for subject field
- Load .env from absolute deployment path

### Added
- Nothing yet

### Changed
- Nothing yet

### Deprecated
- Nothing yet

### Removed
- Nothing yet

### Fixed
- Nothing yet

### Security
- Nothing yet

---

[Unreleased]: https://github.com/markus-michalski/claude-mcp-osTicket/compare/v1.0.1...HEAD
