# osTicket MCP Server

**Model Context Protocol Server for osTicket integration in Claude Code** - Manage support tickets directly from your AI assistant.

## 📖 Documentation

**📚 [Complete Documentation & FAQ](https://faq.markus-michalski.net/en/mcp/osticket)**

The comprehensive guide includes:
- Installation instructions
- Configuration examples
- All 7 MCP tools with parameters
- Troubleshooting guide
- Best practices & workflows

## ⚡ Quick Start

```bash
# 1. Clone repository
git clone https://github.com/markus-michalski/claude-mcp-osTicket.git ~/.claude/mcp-servers/osticket

# 2. Install dependencies
cd ~/.claude/mcp-servers/osticket
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your osTicket API credentials

# 4. Build TypeScript
npm run build

# 5. Restart Claude Code
```

## 🔑 Requirements

- **Node.js 18+**
- **osTicket instance** with REST API enabled
- **[API Endpoints Plugin](https://github.com/markus-michalski/osticket-plugins/tree/main/api-endpoints)** installed on osTicket
- **osTicket API Key** with appropriate permissions

## 🛠️ Available Tools

- `get_ticket` - Retrieve complete tickets with all messages
- `list_tickets` - List tickets with filters (status, department, pagination)
- `search_tickets` - Full-text search across ticket subjects and numbers
- `get_ticket_stats` - Get aggregated ticket statistics
- `create_ticket` - Create new tickets with Markdown support
- `update_ticket` - Modify ticket properties (status, department, assignee, etc.)
- `delete_ticket` - Permanently delete tickets

## 📄 License

MIT License - See [LICENSE](./LICENSE) for details

## 👤 Author

**Markus Michalski**
- Website: [markus-michalski.net](https://markus-michalski.net)
- GitHub: [@markus-michalski](https://github.com/markus-michalski)

## 🔗 Links

- **[📚 Full Documentation](https://faq.markus-michalski.net/en/mcp/osticket)** (English)
- **[📚 Vollständige Dokumentation](https://faq.markus-michalski.net/de/mcp/osticket)** (Deutsch)
- [API Endpoints Plugin](https://github.com/markus-michalski/osticket-plugins/tree/main/api-endpoints)
- [Changelog](./CHANGELOG.md)
