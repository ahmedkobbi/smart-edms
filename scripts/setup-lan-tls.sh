#!/usr/bin/env bash
#
# Smart EDMS — LAN TLS setup helper
#
# Generates a self-signed TLS certificate for the given hostname or LAN IP,
# for use with Caddy when you don't have an internal CA or Let's Encrypt.
#
# For production, prefer:
#   1. Internal DNS hostname + Caddy internal CA (distribute root cert via GPO)
#   2. Your enterprise CA (mount certs and uncomment tls in Caddyfile)
#   3. Public domain + Let's Encrypt (if exposing to internet)
#
# This script is for the "quick start" case: LAN IP with self-signed cert.
#
# Usage:
#   ./scripts/setup-lan-tls.sh smartedms.internal.company.dz
#   ./scripts/setup-lan-tls.sh 192.168.1.100
#
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <hostname-or-lan-ip>"
  echo ""
  echo "Examples:"
  echo "  $0 smartedms.internal.company.dz"
  echo "  $0 192.168.1.100"
  exit 1
fi

HOSTNAME_OR_IP="$1"
CERTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"

echo "🔐 Smart EDMS — LAN TLS setup"
echo "   Target: $HOSTNAME_OR_IP"
echo "   Certs:  $CERTS_DIR"
echo ""

# Validate the input is either a hostname or an IP
if [[ "$HOSTNAME_OR_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "   Detected: LAN IP address"
  SAN="IP:$HOSTNAME_OR_IP"
else
  echo "   Detected: hostname"
  SAN="DNS:$HOSTNAME_OR_IP"
fi

# Create certs directory
mkdir -p "$CERTS_DIR"

# Check if certs already exist
if [ -f "$CERTS_DIR/fullchain.pem" ] || [ -f "$CERTS_DIR/privkey.pem" ]; then
  echo "⚠️  Certificates already exist in $CERTS_DIR"
  read -p "   Overwrite? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "   Aborted."
    exit 0
  fi
  rm -f "$CERTS_DIR/fullchain.pem" "$CERTS_DIR/privkey.pem"
fi

echo ""
echo "📝 Generating self-signed certificate (10-year validity)..."
echo ""

openssl req -x509 \
  -newkey rsa:4096 \
  -keyout "$CERTS_DIR/privkey.pem" \
  -out "$CERTS_DIR/fullchain.pem" \
  -days 3650 \
  -nodes \
  -subj "/CN=$HOSTNAME_OR_IP" \
  -addext "subjectAltName=$SAN"

if [ $? -ne 0 ]; then
  echo "❌ Certificate generation failed."
  exit 1
fi

echo "✅ Certificate generated successfully!"
echo ""
echo "   Private key: $CERTS_DIR/privkey.pem"
echo "   Full chain:  $CERTS_DIR/fullchain.pem"
echo ""

# Update Caddyfile if it exists
CADDYFILE="$(cd "$(dirname "$0")/.." && pwd)/Caddyfile"
if [ -f "$CADDYFILE" ]; then
  echo "📝 Updating Caddyfile to use the generated certificate..."
  echo ""

  # Backup the original Caddyfile
  cp "$CADDYFILE" "$CADDYFILE.bak"

  # Replace the hostname and uncomment the tls line
  # This is a simple sed replacement — for complex Caddyfiles, edit manually
  if [[ "$HOSTNAME_OR_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    # IP address — no port needed, but Caddy needs the IP in the site block
    sed -i.bak "s/^smartedms\.internal\.company\.dz {$/$HOSTNAME_OR_IP {/" "$CADDYFILE"
  else
    sed -i.bak "s/^smartedms\.internal\.company\.dz {$/$HOSTNAME_OR_IP {/" "$CADDYFILE"
  fi

  # Uncomment the tls line for enterprise CA / self-signed certs
  sed -i.bak "s|^# tls /certs/fullchain.pem /certs/privkey.pem|tls /certs/fullchain.pem /certs/privkey.pem|" "$CADDYFILE"

  rm -f "$CADDYFILE.bak"

  echo "✅ Caddyfile updated. Backup at $CADDYFILE.bak"
else
  echo "⚠️  Caddyfile not found at $CADDYFILE — skipping Caddyfile update."
fi

echo ""
echo "📋 Next steps:"
echo ""
echo "   1. Update .env:"
echo "      NEXTAUTH_URL=https://$HOSTNAME_OR_IP"
echo ""
echo "   2. The docker-compose.lan.yml already mounts ./certs:/certs:ro in Caddy."
echo "      (Uncomment the volume mount line if needed.)"
echo ""
echo "   3. Start the stack:"
echo "      docker compose -f docker-compose.lan.yml up -d --build"
echo ""
echo "   4. Employees will see a TLS warning on first visit."
echo "      They must click 'Advanced → Proceed to $HOSTNAME_OR_IP (unsafe)'."
echo "      For production, distribute a trusted CA cert via GPO/MDM instead."
echo ""
echo "🔐 Done."
