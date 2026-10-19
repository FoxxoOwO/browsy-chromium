#!/usr/bin/env node

/**
 * Browsy Self-Hosted Sync Server
 * Minimal, zero-dependency, secure HTTP/HTTPS synchronization server for Browsy Chromium.
 * Stores zero-knowledge encrypted payloads (AES-256-GCM) per user.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8080', 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'sync-store.json');
const MASTER_TOKEN = process.env.SYNC_TOKEN || ''; // If set, all clients must use this token

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Sync Server] Error reading store, initializing fresh:', err.message);
  }
  return {};
}

function saveStore(store) {
  try {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error('[Sync Server] Error saving store:', err.message);
  }
}

let syncStore = loadStore();

function extractAuthUser(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader) return null;

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (MASTER_TOKEN && token !== MASTER_TOKEN) return null;
    return 'user_' + crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
  }

  if (authHeader.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.substring(6).trim(), 'base64').toString('utf8');
      const [user, pass] = decoded.split(':');
      if (MASTER_TOKEN && pass !== MASTER_TOKEN) return null;
      return user ? 'user_' + crypto.createHash('sha256').update(user).digest('hex').substring(0, 16) : null;
    } catch {
      return null;
    }
  }

  return null;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB max
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Health check
  if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/sync/status')) {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'browsy-sync-server',
      version: '1.0.0',
      timestamp: Date.now()
    });
  }

  // Authenticated routes
  const userId = extractAuthUser(req);
  if (!userId) {
    return sendJson(res, 401, { error: 'Unauthorized: missing or invalid Authorization header' });
  }

  try {
    // 1. PUSH (Save encrypted sync payload)
    if ((req.method === 'POST' || req.method === 'PUT') && url.pathname === '/api/sync/push') {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw);
      if (!parsed.cipherText) {
        return sendJson(res, 400, { error: 'Invalid payload: missing encrypted cipherText' });
      }

      syncStore[userId] = {
        updatedAt: Date.now(),
        payload: parsed
      };
      saveStore(syncStore);

      return sendJson(res, 200, {
        success: true,
        updatedAt: syncStore[userId].updatedAt
      });
    }

    // 2. PULL (Retrieve latest encrypted sync payload)
    if (req.method === 'GET' && url.pathname === '/api/sync/pull') {
      const record = syncStore[userId];
      if (!record) {
        return sendJson(res, 404, { error: 'No sync data found for this account', notFound: true });
      }
      return sendJson(res, 200, {
        success: true,
        updatedAt: record.updatedAt,
        payload: record.payload
      });
    }

    // 3. DELETE (Clear sync payload)
    if (req.method === 'DELETE' && url.pathname === '/api/sync/data') {
      delete syncStore[userId];
      saveStore(syncStore);
      return sendJson(res, 200, { success: true, message: 'Sync data deleted' });
    }

    // Route not found
    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[Sync Server] Request error:', err);
    sendJson(res, 500, { error: 'Internal server error: ' + err.message });
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Browsy Sync Server] Listening on http://0.0.0.0:${PORT}`);
    console.log(`[Browsy Sync Server] Data directory: ${DATA_DIR}`);
    if (MASTER_TOKEN) {
      console.log(`[Browsy Sync Server] Token protection: ENABLED`);
    } else {
      console.log(`[Browsy Sync Server] Multi-tenant mode (each Bearer token/user has isolated storage)`);
    }
  });
}

module.exports = server;
