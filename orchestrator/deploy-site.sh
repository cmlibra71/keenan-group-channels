#!/bin/bash
#
# Deploy or redeploy a single site.
#
# Usage:
#   ./orchestrator/deploy-site.sh <site-name>
#   ./orchestrator/deploy-site.sh --all
#
# This builds the Docker container and updates the Caddy config on the host.
# Caddy is already running on the EC2 instance with auto-SSL via Let's Encrypt.
#

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITES_DIR="$ROOT/sites"
CADDY_SITES_DIR="$ROOT/caddy/sites"
SERVER_CADDYFILE="/etc/caddy/Caddyfile"

deploy_site() {
  local name="$1"
  local site_dir="$SITES_DIR/$name"
  local caddy_snippet="$CADDY_SITES_DIR/$name.caddy"

  if [ ! -d "$site_dir" ]; then
    echo "Error: Site '$name' not found in sites/"
    exit 1
  fi

  echo "Deploying site: $name"

  # Build and restart the container (Dockerfile.site handles commerce build)
  echo "  Building Docker image..."
  docker compose build "$name"

  echo "  Starting container..."
  docker compose up -d "$name"

  # Update Caddy config if the snippet exists and we're on the server
  if [ -f "$caddy_snippet" ] && [ -f "$SERVER_CADDYFILE" ]; then
    echo "  Updating Caddy config..."

    # Check if this site's config is already in the Caddyfile
    DOMAIN=$(head -2 "$caddy_snippet" | grep -v "^#" | head -1 | awk '{print $1}')
    if grep -q "$DOMAIN" "$SERVER_CADDYFILE" 2>/dev/null; then
      echo "  Caddy config for $DOMAIN already exists in $SERVER_CADDYFILE"
    else
      echo "" >> "$SERVER_CADDYFILE"
      cat "$caddy_snippet" >> "$SERVER_CADDYFILE"
      echo "  Appended config for $DOMAIN to $SERVER_CADDYFILE"
    fi

    # Reload Caddy
    sudo systemctl reload caddy
    echo "  Caddy reloaded - SSL will be auto-provisioned by Let's Encrypt"
  else
    echo "  Note: Caddy config at $caddy_snippet"
    echo "  Append it to $SERVER_CADDYFILE and run: sudo systemctl reload caddy"
  fi

  echo "  Done! Site $name deployed."
}

# Handle --all flag
if [ "${1:-}" = "--all" ]; then
  for site_dir in "$SITES_DIR"/*/; do
    [ -d "$site_dir" ] || continue
    site_name=$(basename "$site_dir")
    deploy_site "$site_name"
  done
  exit 0
fi

# Deploy single site
if [ -z "${1:-}" ]; then
  echo "Usage: ./orchestrator/deploy-site.sh <site-name>"
  echo "       ./orchestrator/deploy-site.sh --all"
  echo ""
  echo "Available sites:"
  ls -1 "$SITES_DIR" 2>/dev/null || echo "  (none)"
  exit 1
fi

deploy_site "$1"
