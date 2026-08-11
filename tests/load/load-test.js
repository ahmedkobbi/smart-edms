/**
 * Smart EDMS — Production Load Test (Node.js)
 *
 * A dependency-free load test that simulates 100 concurrent users hitting
 * the Smart EDMS API for 5 minutes. Measures latency, error rate, and
 * throughput for each endpoint.
 *
 * Prerequisites:
 *   1. Dev server running: npx next dev -p 3000
 *   2. Database seeded: npm run seed
 *
 * Run:
 *   node tests/load/load-test.js
 *
 * Or with custom params:
 *   VUS=200 DURATION=600 node tests/load/load-test.js
 */

const http = require('http');
const { URL } = require('url');

// ============================================================================
//  Configuration
// ============================================================================

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@smartedms.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe!2025';
const TARGET_VUS = parseInt(process.env.VUS || '50', 10);
const DURATION_SEC = parseInt(process.env.DURATION || '120', 10); // 2 min default
const RAMP_UP_SEC = 10; // seconds to reach full load

const parsedUrl = new URL(BASE_URL);
const HOST = parsedUrl.hostname;
const PORT = parsedUrl.port || 80;

// ============================================================================
//  Metrics
// ============================================================================

const metrics = {
  totalRequests: 0,
  totalErrors: 0,
  successfulLogins: 0,
  loginDurations: [],
  dashboardDurations: [],
  searchDurations: [],
  docListDurations: [],
  healthDurations: [],
  allDurations: [],
};

// ============================================================================
//  HTTP helpers
// ============================================================================

function httpRequest(method, path, body, cookies, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: HOST,
      port: PORT,
      path,
      method,
      headers: {
        ...headers,
        'X-Requested-With': 'XMLHttpRequest',
        ...(cookies ? { Cookie: cookies } : {}),
      },
    };

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const startTime = Date.now();
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const duration = Date.now() - startTime;
        // Extract Set-Cookie for session management
        const setCookies = res.headers['set-cookie'] || [];
        resolve({
          status: res.statusCode,
          body: data,
          duration,
          headers: res.headers,
          setCookies,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy(new Error('Request timeout'));
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// ============================================================================
//  Session Management
// ============================================================================

async function login() {
  const start = Date.now();
  try {
    // Step 1: GET /api/auth/csrf to get CSRF token + cookie
    const csrfRes = await httpRequest('GET', '/api/auth/csrf', null, null, {});
    const csrfData = JSON.parse(csrfRes.body);
    const csrfToken = csrfData.csrfToken;

    // Extract the csrf cookie from Set-Cookie
    let csrfCookie = '';
    const setCookies = csrfRes.setCookies || [];
    for (const cookie of setCookies) {
      const match = cookie.match(/([^=]+)=([^;]+)/);
      if (match && match[1].includes('csrf')) {
        csrfCookie = `${match[1]}=${match[2]}`;
      }
    }

    // Step 2: POST credentials with the CSRF cookie
    const formData = `email=${encodeURIComponent(ADMIN_EMAIL)}&password=${encodeURIComponent(ADMIN_PASSWORD)}&csrfToken=${encodeURIComponent(csrfToken)}&json=true`;
    const loginRes = await httpRequest('POST', '/api/auth/callback/credentials', formData, csrfCookie, {
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    const duration = Date.now() - start;
    metrics.loginDurations.push(duration);
    metrics.totalRequests += 2;

    // Check if login succeeded — with json=true, NextAuth returns a JSON
    // response. If the URL contains "signin?csrf=true", login FAILED.
    // If login succeeds, it returns {"url": "..."} and sets a session cookie.
    const allCookies = [...(csrfRes.setCookies || []), ...(loginRes.setCookies || [])];
    let sessionToken = '';
    for (const cookie of allCookies) {
      const match = cookie.match(/(next-auth\.session-token|__Secure-next-auth\.session-token)=([^;]+)/);
      if (match) {
        sessionToken = `${match[1]}=${match[2]}`;
      }
    }

    // Also check if the response body has a URL (indicating redirect, not success)
    if (loginRes.body && loginRes.body.includes('signin?csrf=true')) {
      // CSRF mismatch or auth failure
      metrics.totalErrors++;
      return null;
    }

    if (sessionToken) {
      metrics.successfulLogins++;
      return sessionToken;
    }

    // Try without json=true — follow redirect to get session cookie
    const formData2 = `email=${encodeURIComponent(ADMIN_EMAIL)}&password=${encodeURIComponent(ADMIN_PASSWORD)}&csrfToken=${encodeURIComponent(csrfToken)}`;
    const loginRes2 = await httpRequest('POST', '/api/auth/callback/credentials', formData2, csrfCookie, {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    metrics.totalRequests++;

    const allCookies2 = [...(csrfRes.setCookies || []), ...(loginRes2.setCookies || [])];
    for (const cookie of allCookies2) {
      const match = cookie.match(/(next-auth\.session-token|__Secure-next-auth\.session-token)=([^;]+)/);
      if (match) {
        metrics.successfulLogins++;
        return `${match[1]}=${match[2]}`;
      }
    }

    metrics.totalErrors++;
    return null;
  } catch (err) {
    metrics.totalErrors++;
    metrics.totalRequests++;
    return null;
  }
}

// ============================================================================
//  Test Scenarios
// ============================================================================

async function scenarioHealth(cookies) {
  const start = Date.now();
  try {
    const res = await httpRequest('GET', '/api/health', null, cookies);
    const dur = Date.now() - start;
    metrics.healthDurations.push(dur);
    metrics.allDurations.push(dur);
    metrics.totalRequests++;
    if (res.status !== 200) metrics.totalErrors++;
  } catch { metrics.totalErrors++; metrics.totalRequests++; }
}

async function scenarioDashboard(cookies) {
  const start = Date.now();
  try {
    const res = await httpRequest('GET', '/api/dashboard', null, cookies);
    const dur = Date.now() - start;
    metrics.dashboardDurations.push(dur);
    metrics.allDurations.push(dur);
    metrics.totalRequests++;
    if (res.status !== 200) metrics.totalErrors++;
  } catch { metrics.totalErrors++; metrics.totalRequests++; }
}

async function scenarioDocList(cookies) {
  const start = Date.now();
  try {
    const res = await httpRequest('GET', '/api/documents?page=1&pageSize=20', null, cookies);
    const dur = Date.now() - start;
    metrics.docListDurations.push(dur);
    metrics.allDurations.push(dur);
    metrics.totalRequests++;
    if (res.status !== 200) metrics.totalErrors++;
  } catch { metrics.totalErrors++; metrics.totalRequests++; }
}

async function scenarioSearch(cookies) {
  const start = Date.now();
  const queries = ['test', 'document', 'report', 'contract', 'invoice', ''];
  const query = queries[Math.floor(Math.random() * queries.length)];
  try {
    const res = await httpRequest('GET', `/api/search?q=${encodeURIComponent(query)}&page=1&pageSize=10`, null, cookies);
    const dur = Date.now() - start;
    metrics.searchDurations.push(dur);
    metrics.allDurations.push(dur);
    metrics.totalRequests++;
    if (res.status !== 200) metrics.totalErrors++;
  } catch { metrics.totalErrors++; metrics.totalRequests++; }
}

// ============================================================================
//  Virtual User
// ============================================================================

async function virtualUser(vuId) {
  // Login first
  const cookies = await login();
  if (!cookies) {
    console.error(`  VU ${vuId}: login failed — exiting`);
    return;
  }

  // Run scenarios in a loop
  const endTime = Date.now() + DURATION_SEC * 1000;
  while (Date.now() < endTime) {
    const r = Math.random();
    if (r < 0.2) {
      await scenarioHealth(cookies);
      await sleep(500);
    } else if (r < 0.5) {
      await scenarioDashboard(cookies);
      await sleep(1000);
    } else if (r < 0.75) {
      await scenarioDocList(cookies);
      await sleep(1000);
    } else {
      await scenarioSearch(cookies);
      await sleep(1000);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
//  Statistics
// ============================================================================

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function printStats() {
  const errorRate = metrics.totalRequests > 0 ? (metrics.totalErrors / metrics.totalRequests * 100) : 0;
  const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '0';

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  Smart EDMS — Load Test Results                                       ║
╚══════════════════════════════════════════════════════════════════════╝

Configuration:
  Target VUs:        ${TARGET_VUS}
  Duration:          ${DURATION_SEC}s
  Base URL:          ${BASE_URL}

Overall:
  Total requests:    ${metrics.totalRequests}
  Total errors:      ${metrics.totalErrors}
  Error rate:        ${errorRate.toFixed(2)}%
  Successful logins: ${metrics.successfulLogins}
  Throughput:        ${(metrics.totalRequests / DURATION_SEC).toFixed(1)} req/s

Latency (all endpoints):
  Average:           ${avg(metrics.allDurations)}ms
  p50:               ${percentile(metrics.allDurations, 50).toFixed(1)}ms
  p95:               ${percentile(metrics.allDurations, 95).toFixed(1)}ms
  p99:               ${percentile(metrics.allDurations, 99).toFixed(1)}ms

Breakdown by endpoint:
  Login:
    Avg: ${avg(metrics.loginDurations)}ms  p99: ${percentile(metrics.loginDurations, 99).toFixed(1)}ms  (${metrics.loginDurations.length} requests)
  Dashboard:
    Avg: ${avg(metrics.dashboardDurations)}ms  p99: ${percentile(metrics.dashboardDurations, 99).toFixed(1)}ms  (${metrics.dashboardDurations.length} requests)
  Document list:
    Avg: ${avg(metrics.docListDurations)}ms  p99: ${percentile(metrics.docListDurations, 99).toFixed(1)}ms  (${metrics.docListDurations.length} requests)
  Search:
    Avg: ${avg(metrics.searchDurations)}ms  p99: ${percentile(metrics.searchDurations, 99).toFixed(1)}ms  (${metrics.searchDurations.length} requests)
  Health:
    Avg: ${avg(metrics.healthDurations)}ms  p99: ${percentile(metrics.healthDurations, 99).toFixed(1)}ms  (${metrics.healthDurations.length} requests)

Threshold assessment:
  p99 < 500ms:        ${percentile(metrics.allDurations, 99) < 500 ? '✅ PASS' : '❌ FAIL'} (${percentile(metrics.allDurations, 99).toFixed(1)}ms)
  Error rate < 5%:    ${errorRate < 5 ? '✅ PASS' : '❌ FAIL'} (${errorRate.toFixed(2)}%)
  Login p99 < 2000ms: ${percentile(metrics.loginDurations, 99) < 2000 ? '✅ PASS' : '❌ FAIL'} (${percentile(metrics.loginDurations, 99).toFixed(1)}ms)
  Dashboard p99 < 500ms: ${percentile(metrics.dashboardDurations, 99) < 500 ? '✅ PASS' : '❌ FAIL'} (${percentile(metrics.dashboardDurations, 99).toFixed(1)}ms)
`);
}

// ============================================================================
//  Main
// ============================================================================

async function main() {
  console.log(`🚀 Starting load test: ${TARGET_VUS} VUs for ${DURATION_SEC}s against ${BASE_URL}`);
  console.log(`   Ramp-up: ${RAMP_UP_SEC}s\n`);

  // Verify server is reachable
  try {
    const healthRes = await httpRequest('GET', '/api/health', null, null, {});
    if (healthRes.status !== 200) {
      console.error(`❌ Server health check failed: HTTP ${healthRes.status}`);
      process.exit(1);
    }
    console.log('✅ Server is healthy\n');
  } catch (err) {
    console.error(`❌ Cannot reach server at ${BASE_URL}: ${err.message}`);
    process.exit(1);
  }

  // Launch VUs with ramp-up
  const vuPromises = [];
  const rampUpDelay = (RAMP_UP_SEC * 1000) / TARGET_VUS;

  for (let i = 0; i < TARGET_VUS; i++) {
    setTimeout(() => {
      vuPromises.push(virtualUser(i + 1));
    }, i * rampUpDelay);
  }

  // Wait for all VUs to complete
  setTimeout(async () => {
    await Promise.allSettled(vuPromises);
    printStats();

    // Write results JSON
    const fs = require('fs');
    const results = {
      timestamp: new Date().toISOString(),
      config: { vus: TARGET_VUS, duration: DURATION_SEC, baseUrl: BASE_URL },
      metrics: {
        totalRequests: metrics.totalRequests,
        totalErrors: metrics.totalErrors,
        errorRate: metrics.totalRequests > 0 ? metrics.totalErrors / metrics.totalRequests : 0,
        successfulLogins: metrics.successfulLogins,
        throughput: metrics.totalRequests / DURATION_SEC,
        all: {
          avg: metrics.allDurations.reduce((a, b) => a + b, 0) / (metrics.allDurations.length || 1),
          p50: percentile(metrics.allDurations, 50),
          p95: percentile(metrics.allDurations, 95),
          p99: percentile(metrics.allDurations, 99),
        },
        login: { p99: percentile(metrics.loginDurations, 99), count: metrics.loginDurations.length },
        dashboard: { p99: percentile(metrics.dashboardDurations, 99), count: metrics.dashboardDurations.length },
        docList: { p99: percentile(metrics.docListDurations, 99), count: metrics.docListDurations.length },
        search: { p99: percentile(metrics.searchDurations, 99), count: metrics.searchDurations.length },
        health: { p99: percentile(metrics.healthDurations, 99), count: metrics.healthDurations.length },
      },
    };
    fs.writeFileSync('tests/load/results.json', JSON.stringify(results, null, 2));
    console.log('\n📁 Results saved to tests/load/results.json');
    process.exit(0);
  }, (DURATION_SEC + RAMP_UP_SEC + 5) * 1000);
}

main();
