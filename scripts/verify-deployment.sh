#!/usr/bin/env bash
#
# Smart EDMS — Deployment Verification Script
#
# Verifies that a deployment is healthy and all critical endpoints respond
# correctly. Run after every deployment.
#
# Usage:
#   ./scripts/verify-deployment.sh https://smartedms.example.com
#   ./scripts/verify-deployment.sh http://localhost:3000
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0
WARN=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo -e "  ${GREEN}✅ PASS${NC}  $name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}❌ FAIL${NC}  $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_body() {
  local name="$1"
  local url="$2"
  local pattern="$3"
  local body
  body=$(curl -s "$url" 2>/dev/null || echo "")
  if echo "$body" | grep -q "$pattern"; then
    echo -e "  ${GREEN}✅ PASS${NC}  $name"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}❌ FAIL${NC}  $name (pattern '$pattern' not found in response)"
    FAIL=$((FAIL + 1))
  fi
}

echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  Smart EDMS — Deployment Verification                                ║"
echo "║  Target: $BASE_URL"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

# --- 1. Health Check ---
echo "── Health Check ────────────────────────────────────────────────────────"
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health" 2>/dev/null || echo "000")
check "Health endpoint" "200" "$HEALTH_STATUS"
check_body "Health returns status" "$BASE_URL/api/health" '"status"'

# --- 2. Security Headers ---
echo ""
echo "── Security Headers ────────────────────────────────────────────────────"
HEADERS=$(curl -sI "$BASE_URL/api/health" 2>/dev/null || echo "")
for header in "X-Frame-Options: DENY" "X-Content-Type-Options: nosniff" "Strict-Transport-Security" "Content-Security-Policy" "Cross-Origin-Opener-Policy: same-origin" "X-Robots-Tag: noindex"; do
  if echo "$HEADERS" | grep -qi "$header"; then
    echo -e "  ${GREEN}✅ PASS${NC}  Header: $header"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}❌ FAIL${NC}  Header: $header (missing)"
    FAIL=$((FAIL + 1))
  fi
done

# --- 3. PWA Manifest ---
echo ""
echo "── PWA ─────────────────────────────────────────────────────────────────"
MANIFEST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/manifest.webmanifest" 2>/dev/null || echo "000")
check "Manifest endpoint" "200" "$MANIFEST_STATUS"
check_body "Manifest has icons" "$BASE_URL/manifest.webmanifest" '"icons"'

# --- 4. Error Pages ---
echo ""
echo "── Error Pages ─────────────────────────────────────────────────────────"
NOTFOUND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/nonexistent-page-12345" 2>/dev/null || echo "000")
check "404 page" "404" "$NOTFOUND_STATUS"

API_NOTFOUND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/nonexistent-endpoint" 2>/dev/null || echo "000")
check "API 404 JSON" "404" "$API_NOTFOUND_STATUS"
check_body "API 404 returns JSON error" "$BASE_URL/api/nonexistent-endpoint" '"error"'

# --- 5. Auth ---
echo ""
echo "── Authentication ──────────────────────────────────────────────────────"
UNAUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/dashboard" 2>/dev/null || echo "000")
if [ "$UNAUTH_STATUS" = "401" ] || [ "$UNAUTH_STATUS" = "403" ]; then
  echo -e "  ${GREEN}✅ PASS${NC}  Unauthenticated /api/dashboard rejected (HTTP $UNAUTH_STATUS)"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}❌ FAIL${NC}  Unauthenticated /api/dashboard should reject (got $UNAUTH_STATUS)"
  FAIL=$((FAIL + 1))
fi

# --- 6. Login Page ---
echo ""
echo "── Login Page ──────────────────────────────────────────────────────────"
LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/login" 2>/dev/null || echo "000")
check "Login page accessible" "200" "$LOGIN_STATUS"
check_body "Login page has Smart EDMS branding" "$BASE_URL/login" "Smart EDMS"

# --- 7. API Root ---
echo ""
echo "── API Root ────────────────────────────────────────────────────────────"
check_body "API root returns service info" "$BASE_URL/api" '"name"'

# --- 8. CSP Report Endpoint ---
echo ""
echo "── CSP Report ──────────────────────────────────────────────────────────"
CSP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/csp-report" -d '{"csp-report":{}}' "$BASE_URL/api/csp-report" 2>/dev/null || echo "000")
check "CSP report endpoint" "204" "$CSP_STATUS"

# --- Summary ---
echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo -e "  ${GREEN}PASSED${NC}: $PASS  ${RED}FAILED${NC}: $FAIL  ${YELLOW}WARNINGS${NC}: $WARN"
echo "════════════════════════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo -e "\n${RED}❌ Deployment verification FAILED — $FAIL check(s) failed.${NC}"
  exit 1
else
  echo -e "\n${GREEN}✅ Deployment verification PASSED — all checks OK.${NC}"
  exit 0
fi
