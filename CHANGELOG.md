# Changelog

Alle wichtigen Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/),
und dieses Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

---

## [Unreleased]

---

## [2.1.0] - 2025-12-25

### Added
- Add dueDate parameter to update_ticket tool


---

## [2.0.2] - 2025-12-19




---

## [2.0.1] - 2025-12-19

### Changed
- refactor!: Implement MCP best practices architecture

### Fixed
- Correct MCP SDK inputSchema usage and reset version to 2.0.0
- Rename unused variable to satisfy ESLint no-unused-vars rule


---

## [1.2.0] - 2025-12-10

### Added
- Add projectContext parameter for ticket creation


---

## [1.1.1] - 2025-11-10

### Changed
- Add CLAUDE.md to .gitignore

### Fixed
- Add graceful MCP server shutdown


---

## [1.1.0] - 2025-11-08

### Added
- Add TypeScript type safety for Subticket API endpoints
- Add Subticket Management tools and improve error handling

### Fixed
- Remove explicit port from HTTP requests to fix 404 errors


### Added
- Add Subticket Management tools (4 new MCP tools):
  - `get_parent_ticket` - Get parent ticket of a subticket
  - `get_child_tickets` - Get list of child tickets
  - `create_subticket_link` - Create parent-child relationship
  - `unlink_subticket` - Remove parent-child relationship
- Add support for new Subticket API endpoints from API Endpoints Plugin v1.1.0+
- Add TypeScript type definitions for Subticket API endpoints
  - New file: `src/infrastructure/http/types/SubticketTypes.ts`
  - Strict typing for `GetParentResponse`, `GetChildrenResponse`, `CreateLinkResponse`, `UnlinkResponse`
  - Comprehensive JSDoc documentation with error codes
- Add HTTP 422 and 501 error handling to error map
- Add response validation in all Subticket tool handlers

### Changed
- Improve JSON error response parsing (support new security-enhanced error format)
- Improve type safety by replacing `Promise<any>` with specific types for Subticket APIs
- Enhance error handling with detailed `@throws` JSDoc annotations
- Add runtime response validation (type checks before returning data)

### Fixed
- Fix HTTP 404 errors by removing explicit port from HTTP requests
  - Node.js HTTP client now omits default ports (443/80) from requests
  - Matches curl behavior for better Apache compatibility
- Improve 404 error messages to show specific osTicket messages
  - Now shows "Ticket not found" instead of generic "API endpoint not found"
  - Better error context for users (e.g., "Help Topic not found", "Department not found")

### Security
- Improve error message handling for JSON error responses from API
- Add stricter runtime type validation for API responses
- Improve error message handling to prevent data leakage

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

[Unreleased]: https://github.com/markus-michalski/claude-mcp-osTicket/compare/v2.1.0...HEAD
