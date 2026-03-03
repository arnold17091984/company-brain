# Lessons Learned

## Project Setup
- Always git init early. ai-knowledge was used for weeks without version control.
- Plans in ~/.claude/plans/ are machine-local. Always copy to docs/plans/ for portability.
- dotfiles + symlink approach works well for Claude Code skill management across machines.

## macOS Python Background Process Issue
- `uv sync` by default links `.venv/bin/python` to `/Library/Frameworks/Python.framework/.../Python.app` (App bundle)
- The Python.app bundle hangs silently when run as a background process from Claude Code's Bash tool
- Fix: `uv venv --python /opt/homebrew/opt/python@3.13/bin/python3.13 .venv` before `uv sync`
- Or simply create venv explicitly: `python3.13 -m venv .venv` using homebrew Python
- The venv for apps/api has been fixed already (March 2026)

## Dev Server Startup
- DATABASE_URL must use `postgresql+asyncpg://` prefix (not just `postgresql://`) for asyncpg driver
- apps/api/.env symlink needed: `ln -s ../../.env apps/api/.env` and `ln -s ../../.env apps/bot/.env`
- Node.js not pre-installed; install via: `brew install node`
- Add to PATH: `export PATH="/opt/homebrew/bin:$PATH"`
- For long-running dev servers, always open a new Terminal window and run manually
