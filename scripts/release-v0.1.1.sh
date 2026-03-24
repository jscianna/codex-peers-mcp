#!/usr/bin/env bash
set -euo pipefail

VERSION="v0.1.1"

# Guardrails
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not in a git repo"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is dirty. Commit or stash first."
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "error: origin remote not set. Add it first:"
  echo "  git remote add origin <repo-url>"
  exit 1
fi

# Local validation before tag
bash scripts/test-broker-routes.sh

# Tag + push
if git rev-parse "$VERSION" >/dev/null 2>&1; then
  echo "tag $VERSION already exists"
else
  git tag -a "$VERSION" -m "Release $VERSION"
fi

git push origin main
git push origin "$VERSION"

# Create GitHub release
if command -v gh >/dev/null 2>&1; then
  gh release create "$VERSION" \
    --title "codex-peers-mcp $VERSION" \
    --notes-file RELEASE_NOTES_v0.1.1.md \
    --latest
  echo "release created"
else
  echo "gh not found: create release manually and paste RELEASE_NOTES_v0.1.1.md"
fi
