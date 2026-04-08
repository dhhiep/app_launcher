#!/bin/bash
# Release script for App Launcher
# Bumps version, builds, and publishes to npm

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PACKAGE_FILE="$PROJECT_ROOT/package.json"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get current version from package.json
get_current_version() {
    node -p "require('$PACKAGE_FILE').version"
}

# Update version in package.json
update_version() {
    local new_version="$1"
    cd "$PROJECT_ROOT"
    npm version "$new_version" --no-git-tag-version --allow-same-version > /dev/null 2>&1
}

# Parse semver components
parse_version() {
    local version="$1"
    MAJOR=$(echo "$version" | cut -d. -f1)
    MINOR=$(echo "$version" | cut -d. -f2)
    PATCH=$(echo "$version" | cut -d. -f3)
}

# Build project
build_project() {
    echo -e "${YELLOW}Building...${NC}"
    cd "$PROJECT_ROOT"
    npm run build
    echo -e "${GREEN}✓ Build complete${NC}"
}

# Publish to npm
publish_npm() {
    local version="$1"
    local dry_run="$2"

    echo ""
    if [ "$dry_run" = "true" ]; then
        echo -e "${YELLOW}Dry run (npm publish --dry-run)...${NC}"
        cd "$PROJECT_ROOT"
        npm publish --dry-run --access public 2>&1
        echo ""
        echo -e "${BLUE}This was a dry run. No package was published.${NC}"
    else
        echo -e "${YELLOW}Publishing v$version to npm...${NC}"
        cd "$PROJECT_ROOT"
        npm publish --access public
        echo -e "${GREEN}✓ Published @hieepjddinh/app-launcher@$version to npm${NC}"
    fi
}

# Git commit, tag, push, and create GitHub release
git_release() {
    local version="$1"
    cd "$PROJECT_ROOT"

    if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        echo -e "${YELLOW}Not a git repo, skipping git operations${NC}"
        return
    fi

    echo -e "${YELLOW}Git: committing version bump...${NC}"
    git add package.json
    git commit -m "chore: release v$version" || true

    echo -e "${YELLOW}Git: creating tag v$version...${NC}"
    git tag -a "v$version" -m "Release v$version"

    echo -e "${YELLOW}Git: pushing to remote...${NC}"
    git push && git push --tags
    echo -e "${GREEN}✓ Pushed v$version with tag${NC}"

    # Create GitHub release if gh CLI available
    if command -v gh &> /dev/null; then
        echo -e "${YELLOW}GitHub: creating release...${NC}"
        gh release create "v$version" \
            --title "v$version" \
            --generate-notes \
            --latest
        echo -e "${GREEN}✓ GitHub release v$version created${NC}"
    else
        echo -e "${YELLOW}gh CLI not found, skipping GitHub release (install: brew install gh)${NC}"
    fi
}

# Display menu
show_menu() {
    local current_version=$(get_current_version)
    parse_version "$current_version"

    local next_patch="$MAJOR.$MINOR.$((PATCH + 1))"
    local next_minor="$MAJOR.$((MINOR + 1)).0"
    local next_major="$((MAJOR + 1)).0.0"

    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}   App Launcher - Release Manager${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Current version: ${GREEN}$current_version${NC}"
    echo ""
    echo -e "  ${YELLOW}1)${NC} Rebuild & publish current   → ${GREEN}$current_version${NC}"
    echo -e "  ${YELLOW}2)${NC} Bump patch (bug fixes)      → ${GREEN}$next_patch${NC}"
    echo -e "  ${YELLOW}3)${NC} Bump minor (new features)   → ${GREEN}$next_minor${NC}"
    echo -e "  ${YELLOW}4)${NC} Bump major (breaking)       → ${GREEN}$next_major${NC}"
    echo -e "  ${YELLOW}5)${NC} Custom version"
    echo -e "  ${YELLOW}d)${NC} Dry run (build + simulate publish)"
    echo -e "  ${YELLOW}q)${NC} Quit"
    echo ""
}

# Main
main() {
    # Check prerequisites
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: node not found${NC}"
        exit 1
    fi
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}Error: npm not found${NC}"
        exit 1
    fi
    if [ ! -f "$PACKAGE_FILE" ]; then
        echo -e "${RED}Error: package.json not found at $PACKAGE_FILE${NC}"
        exit 1
    fi

    local current_version=$(get_current_version)
    parse_version "$current_version"

    show_menu

    read -p "Select option [1-5, d, q]: " choice
    echo ""

    case $choice in
        1)
            echo -e "${YELLOW}Rebuilding current version...${NC}"
            build_project
            publish_npm "$current_version" "false"
            git_release "$current_version"
            ;;
        2)
            local new_version="$MAJOR.$MINOR.$((PATCH + 1))"
            echo -e "${YELLOW}Bumping to $new_version...${NC}"
            update_version "$new_version"
            build_project
            publish_npm "$new_version" "false"
            git_release "$new_version"
            ;;
        3)
            local new_version="$MAJOR.$((MINOR + 1)).0"
            echo -e "${YELLOW}Bumping to $new_version...${NC}"
            update_version "$new_version"
            build_project
            publish_npm "$new_version" "false"
            git_release "$new_version"
            ;;
        4)
            local new_version="$((MAJOR + 1)).0.0"
            echo -e "${YELLOW}Bumping to $new_version...${NC}"
            update_version "$new_version"
            build_project
            publish_npm "$new_version" "false"
            git_release "$new_version"
            ;;
        5)
            read -p "Enter custom version (e.g., 2.1.0): " custom_version
            if [[ ! "$custom_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                echo -e "${RED}Invalid version format. Use X.Y.Z${NC}"
                exit 1
            fi
            echo -e "${YELLOW}Setting version to $custom_version...${NC}"
            update_version "$custom_version"
            build_project
            publish_npm "$custom_version" "false"
            git_release "$custom_version"
            ;;
        d|D)
            echo -e "${YELLOW}Running dry run...${NC}"
            build_project
            publish_npm "$current_version" "true"
            ;;
        q|Q)
            echo "Cancelled."
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid option${NC}"
            exit 1
            ;;
    esac

    echo ""
    echo -e "${GREEN}✓ Release complete!${NC}"
}

main
