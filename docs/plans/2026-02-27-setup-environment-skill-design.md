# Setup Environment Skill Design

**Date**: 2026-02-27
**Status**: Approved

## Overview

A skill that automates Claude Code environment setup on new machines, primarily configuring MCP servers via `claude mcp add` commands.

## Design Decisions

- **Approach**: Command execution via `claude mcp add` (not JSON editing)
- **Scope**: User scope (`--scope user`) for all-project availability
- **Target**: Self-use only, hardcoded MCP list
- **Trigger**: "setup", "MCP", "environment setup", "initial configuration"
- **Location**: superpowers plugin (`skills/setup-environment/SKILL.md`)

## MCP Server List

### HTTP (7)
| Name | URL |
|------|-----|
| github | https://api.githubcopilot.com/mcp/ |
| sentry | https://mcp.sentry.dev/mcp |
| slack | https://slack-mcp.anthropic.com/mcp |
| notion | https://mcp.notion.com/mcp |
| linear | https://mcp.linear.app/sse |
| asana | https://mcp.asana.com/sse |
| stripe | https://mcp.stripe.com |

### stdio (13)
| Name | Command |
|------|---------|
| playwright | npx -y @playwright/mcp@latest |
| context7 | npx -y @upstash/context7-mcp@latest |
| sequential-thinking | npx -y @modelcontextprotocol/server-sequential-thinking |
| filesystem | npx -y @modelcontextprotocol/server-filesystem /Users/arnold |
| fetch | npx -y @modelcontextprotocol/server-fetch |
| puppeteer | npx -y @modelcontextprotocol/server-puppeteer |
| sqlite | npx -y @modelcontextprotocol/server-sqlite |
| memory | npx -y @modelcontextprotocol/server-memory |
| git | npx -y @modelcontextprotocol/server-git |
| postgres | npx -y @modelcontextprotocol/server-postgres |
| brave-search | npx -y @modelcontextprotocol/server-brave-search |
| google-maps | npx -y @modelcontextprotocol/server-google-maps |
| everart | npx -y @modelcontextprotocol/server-everart |

## Flow

1. Check current MCP config via `claude mcp list`
2. Diff against defined list
3. Add missing MCPs with `claude mcp add --scope user`
4. Report results (added, skipped, failed)
5. Show post-setup instructions (auth, API keys)

## API Keys Required

- `BRAVE_API_KEY` for brave-search
- `GOOGLE_MAPS_API_KEY` for google-maps
