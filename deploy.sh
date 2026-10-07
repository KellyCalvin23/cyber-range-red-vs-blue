#!/usr/bin/env bash
# deploy.sh — one command to commit and push Cyber Range: Red vs Blue.
#
# First run ever (no git repo yet, no GitHub repo yet):
#   ./deploy.sh init
#
# Every run after that (commits whatever has changed and pushes it):
#   ./deploy.sh
#   ./deploy.sh "optional commit message"
#
# Requires: git, and GitHub CLI (`gh`) already logged in (`gh auth status`).

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

REPO_NAME="cyber-range-red-vs-blue"
GH_USER="$(gh api user --jq .login 2>/dev/null || echo '')"

ATTRIBUTION="Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"

if [[ "${1:-}" == "init" ]]; then
  if [[ -d .git ]]; then
    echo "Already a git repository — nothing to initialise. Run ./deploy.sh instead."
    exit 0
  fi
  git init -b main
  git add -A
  git commit -m "$(printf 'Add Cyber Range: Red vs Blue security simulation\n\n%s' "$ATTRIBUTION")"
  gh repo create "$REPO_NAME" --public --source=. --push \
    --description "A turn-based cyber security simulation for beginners: red team attacker vs blue team defender against a fictional school network. MITRE ATT&CK and NIST CSF mapped, zero dependencies."
  # Enable GitHub Pages from the repo root on main, so the game is playable at a URL.
  if [[ -n "$GH_USER" ]]; then
    gh api -X POST "repos/${GH_USER}/${REPO_NAME}/pages" \
      -f 'source[branch]=main' -f 'source[path]=/' >/dev/null 2>&1 \
      && echo "Pages enabled: https://${GH_USER}.github.io/${REPO_NAME}/" \
      || echo "Pages may already be enabled, or needs a minute — check: gh api repos/${GH_USER}/${REPO_NAME}/pages"
  fi
  echo "Done. Repo: https://github.com/${GH_USER}/${REPO_NAME}"
  exit 0
fi

if [[ ! -d .git ]]; then
  echo "No git repository here yet. Run ./deploy.sh init first." >&2
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "Nothing changed — nothing to commit or push."
  exit 0
fi

MSG="${1:-Update Cyber Range: Red vs Blue}"
git commit -m "$(printf '%s\n\n%s' "$MSG" "$ATTRIBUTION")"
git push
echo "Pushed. Live at: https://${GH_USER:-<your-username>}.github.io/${REPO_NAME}/ (may take a minute to update)"
