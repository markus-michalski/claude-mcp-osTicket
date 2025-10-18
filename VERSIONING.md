# Versionierungs-Workflow

Dieser MCP Server folgt **Semantic Versioning 2.0.0** (https://semver.org/).

## Format

```
MAJOR.MINOR.PATCH

Beispiel: 1.2.3
  │   │   └── PATCH: Bugfixes (backward compatible)
  │   └────── MINOR: Neue Features (backward compatible)
  └────────── MAJOR: Breaking Changes
```

---

## Wann welche Version erhöhen?

### PATCH (1.0.0 → 1.0.1)

**Nur Bugfixes, keine neuen Features**

Beispiele:
- ✅ Caching-Bug behoben
- ✅ SQL-Query-Optimierung
- ✅ Typo in Fehlermeldung korrigiert
- ✅ Performance-Verbesserung ohne API-Änderung
- ❌ Neues MCP Tool hinzugefügt (MINOR!)

### MINOR (1.0.0 → 1.1.0)

**Neue Features, backward compatible**

Beispiele:
- ✅ Neues MCP Tool hinzugefügt (z.B. `create_ticket`)
- ✅ Neue optionale Parameter zu bestehendem Tool
- ✅ Neuer Service (z.B. MetadataService)
- ✅ Neue Konfigurationsoption
- ❌ Bestehende Parameter entfernt (MAJOR!)
- ❌ Tool umbenannt (MAJOR!)

### MAJOR (1.0.0 → 2.0.0)

**Breaking Changes**

Beispiele:
- ✅ Tool entfernt oder umbenannt
- ✅ Required Parameter hinzugefügt
- ✅ Response-Format geändert
- ✅ Komplette Migration von DB-Queries zu API (Änderung der Architektur)
- ✅ Node.js-Version-Requirement erhöht (z.B. 18 → 20)

---

## Workflow: Neue Version releasen

### 1. Code-Änderungen durchführen

```bash
# Feature-Branch erstellen
git checkout -b feature/create-ticket-tool

# Code implementieren...
# Tests schreiben...

git add .
git commit -m "feat: Add create_ticket tool with API integration"
```

### 2. CHANGELOG.md aktualisieren

Verschiebe Einträge von `[Unreleased]` nach `[X.Y.Z]`:

```markdown
## [1.1.0] - 2025-10-18

### Added
- create_ticket Tool für API-basierte Ticket-Erstellung
- MetadataService für intelligente Department/Topic-Zuordnung
```

### 3. Version erhöhen (automatisch mit npm)

```bash
# PATCH-Release (1.0.0 → 1.0.1)
npm version patch

# MINOR-Release (1.0.0 → 1.1.0)
npm version minor

# MAJOR-Release (1.0.0 → 2.0.0)
npm version major
```

**Was npm version macht:**
1. Erhöht Version in `package.json`
2. Erstellt Git-Commit: "1.1.0"
3. Erstellt Git-Tag: `v1.1.0`

### 4. Änderungen pushen

```bash
# Branch pushen
git push origin feature/create-ticket-tool

# Tags pushen (wichtig!)
git push --tags
```

### 5. Merge & Deploy

```bash
# PR erstellen und mergen
gh pr create --title "feat: Add create_ticket tool" --body "..."

# Nach Merge: Produktiv deployen
cd ~/.claude/mcp-servers/osticket
git pull
npm install
npm run build

# Claude Code neustarten
```

---

## Schnell-Referenz

| Änderung | Version | Befehl |
|----------|---------|--------|
| Bugfix | PATCH | `npm version patch` |
| Neues Feature | MINOR | `npm version minor` |
| Breaking Change | MAJOR | `npm version major` |

---

## Git-Tags anzeigen

```bash
# Alle Tags auflisten
git tag -l

# Details zu einem Tag
git show v1.0.0

# Tag auschecken (Read-Only)
git checkout v1.0.0
```

---

## Best Practices

1. **IMMER CHANGELOG.md aktualisieren** vor Version-Bump
2. **Breaking Changes dokumentieren** mit Migration-Guide
3. **Git-Tags pushen** nicht vergessen (`git push --tags`)
4. **Pre-Release-Versionen** für Testing: `1.1.0-beta.1`
5. **Konventionelle Commits** nutzen (feat:, fix:, chore:, etc.)

---

## Pre-Release-Versionen

Für Testing vor offiziellem Release:

```bash
# Beta-Version
npm version 1.1.0-beta.1

# Release Candidate
npm version 1.1.0-rc.1

# Alpha
npm version 1.1.0-alpha.1
```

---

## Rollback

Falls etwas schief geht:

```bash
# Version zurücksetzen
npm version 1.0.0 --no-git-tag-version

# Tag löschen (lokal)
git tag -d v1.1.0

# Tag löschen (remote)
git push origin :refs/tags/v1.1.0
```

---

## Weitere Ressourcen

- Semantic Versioning: https://semver.org/
- Keep a Changelog: https://keepachangelog.com/
- Conventional Commits: https://www.conventionalcommits.org/
