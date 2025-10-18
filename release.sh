#!/bin/bash

################################################################################
# MCP Server Release Script
#
# Automated release workflow for osTicket MCP Server with Semantic Versioning.
# Handles version updates, changelog, git tagging, and GitHub releases.
#
# Author: MLM (adapted from oxid-module-release.sh)
# Date: 2025-10-18
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_error() {
    echo -e "${RED}✗ Error: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ Warning: $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ Info: $1${NC}"
}

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# Check if we're in a git repository
check_git_repo() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        print_error "Not in a git repository"
        exit 1
    fi
}

# Check if working directory is clean
check_working_dir() {
    if [ -n "$(git status --porcelain)" ]; then
        print_error "Working directory is not clean. Commit or stash your changes first."
        git status --short
        exit 1
    fi
    print_success "Working directory is clean"
}

# Check if required files exist
check_required_files() {
    local files=("package.json" "CHANGELOG.md")
    for file in "${files[@]}"; do
        if [ ! -f "$file" ]; then
            print_error "Required file not found: $file"
            exit 1
        fi
    done
    print_success "All required files found"
}

# Check if gh CLI is installed
check_gh_cli() {
    if ! command -v gh &> /dev/null; then
        print_warning "GitHub CLI (gh) not installed. GitHub release will be skipped."
        return 1
    fi
    print_success "GitHub CLI (gh) found"
    return 0
}

# Check if Node.js and npm are installed
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js not installed"
        exit 1
    fi
    if ! command -v npm &> /dev/null; then
        print_error "npm not installed"
        exit 1
    fi
    print_success "Node.js $(node --version) and npm $(npm --version) found"
}

# Extract current version from package.json
get_current_version() {
    node -p "require('./package.json').version"
}

# Update version in package.json
update_package_version() {
    local new_version=$1

    # Use npm version with --no-git-tag-version to only update package.json
    npm version "$new_version" --no-git-tag-version --allow-same-version

    print_success "Updated package.json to version $new_version"
}

# Extract commits since last release
get_commits_since_last_release() {
    local last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

    if [ -z "$last_tag" ]; then
        # No tags yet, get all commits
        git log --pretty=format:"%s" --no-merges
    else
        # Get commits since last tag
        git log "${last_tag}..HEAD" --pretty=format:"%s" --no-merges
    fi
}

# Categorize commits by type
categorize_commits() {
    local commits="$1"

    # Arrays for different categories
    local -a added=()
    local -a changed=()
    local -a deprecated=()
    local -a removed=()
    local -a fixed=()
    local -a security=()

    while IFS= read -r commit; do
        # Skip empty lines
        [ -z "$commit" ] && continue

        # Extract commit type and message
        if [[ "$commit" =~ ^([a-z]+)(\([^)]+\))?: ]]; then
            local type="${BASH_REMATCH[1]}"
            # Remove "type(scope): " or "type: " prefix to get message
            local message="${commit#*: }"

            # Categorize by conventional commit type
            case "$type" in
                feat)
                    added+=("$message")
                    ;;
                fix)
                    fixed+=("$message")
                    ;;
                docs|refactor|perf|style)
                    changed+=("$message")
                    ;;
                security|sec)
                    security+=("$message")
                    ;;
                remove)
                    removed+=("$message")
                    ;;
                deprecate)
                    deprecated+=("$message")
                    ;;
                chore|build|ci|test)
                    # Skip internal changes unless they're important
                    if [[ "$message" =~ ^(Release|Version|Update) ]]; then
                        continue
                    fi
                    changed+=("$message")
                    ;;
                *)
                    # Uncategorized commits go to Changed
                    changed+=("$commit")
                    ;;
            esac
        else
            # Non-conventional commits go to Changed
            changed+=("$commit")
        fi
    done <<< "$commits"

    # Build changelog sections
    local changelog=""

    if [ ${#added[@]} -gt 0 ]; then
        changelog+="### Added\n"
        for item in "${added[@]}"; do
            changelog+="- $item\n"
        done
        changelog+="\n"
    fi

    if [ ${#changed[@]} -gt 0 ]; then
        changelog+="### Changed\n"
        for item in "${changed[@]}"; do
            changelog+="- $item\n"
        done
        changelog+="\n"
    fi

    if [ ${#deprecated[@]} -gt 0 ]; then
        changelog+="### Deprecated\n"
        for item in "${deprecated[@]}"; do
            changelog+="- $item\n"
        done
        changelog+="\n"
    fi

    if [ ${#removed[@]} -gt 0 ]; then
        changelog+="### Removed\n"
        for item in "${removed[@]}"; do
            changelog+="- $item\n"
        done
        changelog+="\n"
    fi

    if [ ${#fixed[@]} -gt 0 ]; then
        changelog+="### Fixed\n"
        for item in "${fixed[@]}"; do
            changelog+="- $item\n"
        done
        changelog+="\n"
    fi

    if [ ${#security[@]} -gt 0 ]; then
        changelog+="### Security\n"
        for item in "${security[@]}"; do
            changelog+="- $item\n"
        done
        changelog+="\n"
    fi

    echo -e "$changelog"
}

# Update CHANGELOG.md
update_changelog() {
    local new_version=$1
    local release_date=$(date +%Y-%m-%d)

    # Check if version already exists
    if grep -q "## \[$new_version\]" CHANGELOG.md; then
        print_warning "Version $new_version already exists in CHANGELOG.md"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    # Get commits since last release
    print_info "Extracting commits since last release..."
    local commits=$(get_commits_since_last_release)

    if [ -z "$commits" ]; then
        print_warning "No commits found since last release"
        commits=""
    else
        local commit_count=$(echo "$commits" | wc -l)
        print_info "Found $commit_count commits to categorize"
    fi

    # Categorize commits
    local changelog_content=$(categorize_commits "$commits")

    # Get repository URL
    local repo_url=$(git config --get remote.origin.url | sed 's/\.git$//')
    repo_url=${repo_url/git@github.com:/https:\/\/github.com\/}

    # Create temporary file for new CHANGELOG
    local temp_file=$(mktemp)

    # Read CHANGELOG and insert new version section
    local found_unreleased=false
    while IFS= read -r line; do
        echo "$line" >> "$temp_file"

        # When we find [Unreleased], insert new sections after it
        if [[ "$line" =~ ^\#\#[[:space:]]\[Unreleased\] ]]; then
            found_unreleased=true
            echo "" >> "$temp_file"
            echo "---" >> "$temp_file"
            echo "" >> "$temp_file"
            echo "## [$new_version] - $release_date" >> "$temp_file"
            echo "" >> "$temp_file"
            echo -e "$changelog_content" >> "$temp_file"
        fi
    done < CHANGELOG.md

    # If [Unreleased] section wasn't found, append at top after header
    if [ "$found_unreleased" = false ]; then
        print_error "Could not find [Unreleased] section in CHANGELOG.md"
        rm -f "$temp_file"
        exit 1
    fi

    # Replace old CHANGELOG with new one
    mv "$temp_file" CHANGELOG.md

    # Update [Unreleased] link at bottom
    sed -i "s|\[Unreleased\]:.*|[Unreleased]: $repo_url/compare/v$new_version...HEAD|" CHANGELOG.md

    # Add/update version link at bottom
    if grep -q "^\[$new_version\]:" CHANGELOG.md; then
        sed -i "s|^\[$new_version\]:.*|[$new_version]: $repo_url/releases/tag/v$new_version|" CHANGELOG.md
    else
        echo "[$new_version]: $repo_url/releases/tag/v$new_version" >> CHANGELOG.md
    fi

    print_success "Updated CHANGELOG.md with version $new_version"
}

# Run build
run_build() {
    print_info "Building TypeScript..."
    npm run build
    print_success "Build completed successfully"
}

# Increment version number
increment_version() {
    local version=$1
    local type=$2

    IFS='.' read -ra VERSION_PARTS <<< "$version"
    local major="${VERSION_PARTS[0]}"
    local minor="${VERSION_PARTS[1]}"
    local patch="${VERSION_PARTS[2]}"

    case "$type" in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            echo "$version"
            return
            ;;
    esac

    echo "$major.$minor.$patch"
}

# Create git commit and tag
create_git_release() {
    local version=$1

    git add package.json package-lock.json CHANGELOG.md
    git commit -m "chore: Release v$version

Release version $version

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

    git tag -a "v$version" -m "Release v$version"

    print_success "Created git commit and tag v$version"
}

# Push to remote
push_to_remote() {
    local branch=$(git rev-parse --abbrev-ref HEAD)

    print_info "Pushing to remote..."
    git push origin "$branch"
    git push origin --tags

    print_success "Pushed to remote (branch: $branch)"
}

# Create GitHub release
create_github_release() {
    local version=$1

    print_info "Creating GitHub release..."

    # Extract release notes from CHANGELOG.md
    local release_notes=$(awk "/## \[$version\]/,/## \[/" CHANGELOG.md | sed '1d;$d')

    if [ -z "$release_notes" ]; then
        release_notes="Release v$version"
    fi

    gh release create "v$version" \
        --title "v$version" \
        --notes "$release_notes" \
        --verify-tag

    print_success "Created GitHub release: v$version"
}

# Main function
main() {
    print_header "osTicket MCP Server Release Script"

    # Checks
    check_git_repo
    check_working_dir
    check_required_files
    check_node
    local has_gh_cli=$(check_gh_cli && echo "1" || echo "0")

    # Get current version
    local current_version=$(get_current_version)
    print_info "Current version: $current_version"

    # Ask for release type
    echo -e "\nSelect release type:"
    echo "  1) Patch   (x.x.X) - Bugfixes"
    echo "  2) Minor   (x.X.x) - New features, backward compatible"
    echo "  3) Major   (X.x.x) - Breaking changes"
    echo "  4) Custom version"
    echo "  5) Cancel"

    read -p "Your choice (1-5): " choice

    local new_version=""
    case "$choice" in
        1)
            new_version=$(increment_version "$current_version" "patch")
            print_info "Patch release: $current_version → $new_version"
            ;;
        2)
            new_version=$(increment_version "$current_version" "minor")
            print_info "Minor release: $current_version → $new_version"
            ;;
        3)
            new_version=$(increment_version "$current_version" "major")
            print_info "Major release: $current_version → $new_version"
            ;;
        4)
            read -p "Enter custom version (e.g., 2.1.0): " new_version
            if [[ ! $new_version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                print_error "Invalid version format. Use X.Y.Z"
                exit 1
            fi
            ;;
        5)
            print_info "Cancelled by user"
            exit 0
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac

    # Confirm
    echo -e "\n${YELLOW}This will:${NC}"
    echo "  - Update package.json: $current_version → $new_version"
    echo "  - Update CHANGELOG.md with release notes"
    echo "  - Build TypeScript (npm run build)"
    echo "  - Create git commit and tag v$new_version"
    echo "  - Push to remote repository"
    if [ "$has_gh_cli" = "1" ]; then
        echo "  - Create GitHub release"
    fi
    echo ""

    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Cancelled by user"
        exit 0
    fi

    # Execute release steps
    print_header "Executing Release Steps"

    update_package_version "$new_version"
    update_changelog "$new_version"
    run_build
    create_git_release "$new_version"
    push_to_remote

    if [ "$has_gh_cli" = "1" ]; then
        create_github_release "$new_version"
    fi

    print_header "Release Complete!"
    print_success "Successfully released version $new_version"

    if [ "$has_gh_cli" = "1" ]; then
        local repo_url=$(git config --get remote.origin.url | sed 's/\.git$//' | sed 's/git@github.com:/https:\/\/github.com\//')
        print_info "GitHub Release: $repo_url/releases/tag/v$new_version"
    fi

    print_info "\nNext steps:"
    echo "  - Deploy to production: cp -r dist node_modules .env ~/.claude/mcp-servers/osticket/"
    echo "  - Restart Claude Code to load new version"
}

# Run main function
main
