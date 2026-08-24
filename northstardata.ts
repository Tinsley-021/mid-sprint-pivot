import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import * as dotenv from 'dotenv';
import { db } from './src/db/index.ts';
import {
  inventoryItems,
  syncLogs,
  blockerLogs,
  scopeDeltaItems,
  adaptabilityReviews,
  simulationState,
  users,
} from './src/db/schema.ts';
import { eq, desc, asc, sql } from 'drizzle-orm';
import { ensureSeeded } from './src/db/seed.ts';
import { computeHmacSignature, verifyHmacSignature } from './src/lib/crypto-utils.ts';
import { optionalAuth, requireAuth, AuthRequest } from './src/middleware/auth.ts';

dotenv.config();

// Define interface for rawBody preservation
interface RawBodyRequest extends Request {
  rawBody?: Buffer;
  user?: any;
  dbUser?: any;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Configure JSON parsing with rawBody capture for HMAC verification
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // Initialize DB data on launch
  await ensureSeeded();

  // -------------------------------------------------------------
  // API ROUTES
  // -------------------------------------------------------------

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  });

  // --- 1. SIMULATION CONTROLLER ---

  // Get current simulation state
  app.get('/api/simulation/state', async (_req, res) => {
    try {
      const states = await db.select().from(simulationState).orderBy(desc(simulationState.id)).limit(1);
      const state = states[0] || {
        sprintDay: 1,
        activeSyncMode: 'polling',
        pivotTriggered: false,
        webhookSecret: 'whsec_northstar_live_secret_key_8f9a2b',
        pollingIntervalSeconds: 300,
      };

      res.json(state);
    } catch (error: any) {
      console.error('Error fetching simulation state:', error);
      res.status(500).json({ error: 'Failed to fetch simulation state' });
    }
  });

  // Set sprint day (1 to 5)
  app.post('/api/simulation/day', async (req, res) => {
    try {
      const { day } = req.body;
      const parsedDay = Number(day);
      if (!parsedDay || parsedDay < 1 || parsedDay > 5) {
        return res.status(400).json({ error: 'Invalid day. Must be between 1 and 5.' });
      }

      const states = await db.select().from(simulationState).limit(1);
      const currentState = states[0];

      let newSyncMode = currentState ? currentState.activeSyncMode : 'polling';
      let pivotTriggered = currentState ? currentState.pivotTriggered : false;

      // When day changes to 4 or 5, automatically trigger pivot flag unless specified
      if (parsedDay >= 4) {
        pivotTriggered = true;
        newSyncMode = 'webhook';
      } else if (parsedDay <= 3) {
        newSyncMode = 'polling';
        pivotTriggered = false;
      }

      if (currentState) {
        await db
          .update(simulationState)
          .set({
            sprintDay: parsedDay,
            activeSyncMode: newSyncMode,
            pivotTriggered,
            lastPivotAt: parsedDay >= 4 ? new Date() : currentState.lastPivotAt,
          })
          .where(eq(simulationState.id, currentState.id));
      } else {
        await db.insert(simulationState).values({
          sprintDay: parsedDay,
          activeSyncMode: newSyncMode,
          pivotTriggered,
          webhookSecret: 'whsec_northstar_live_secret_key_8f9a2b',
          pollingIntervalSeconds: 300,
        });
      }

      res.json({ success: true, sprintDay: parsedDay, activeSyncMode: newSyncMode, pivotTriggered });
    } catch (error: any) {
      console.error('Error setting sprint day:', error);
      res.status(500).json({ error: 'Failed to update sprint day' });
    }
  });

  // Trigger the Day 4 Pivot
  app.post('/api/simulation/pivot', async (_req, res) => {
    try {
      const states = await db.select().from(simulationState).limit(1);
      const currentState = states[0];

      if (currentState) {
        await db
          .update(simulationState)
          .set({
            sprintDay: 4,
            activeSyncMode: 'webhook',
            pivotTriggered: true,
            lastPivotAt: new Date(),
          })
          .where(eq(simulationState.id, currentState.id));
      }

      // Add audit log entry
      await db.insert(syncLogs).values({
        syncType: 'webhook',
        status: 'success',
        sku: 'ALL_SYSTEMS',
        payload: JSON.stringify({
          alert: 'CRITICAL CLIENT PIVOT TRIGGERED',
          action: 'Polling pipeline deprecated. Switched to Webhook Push specification.',
          deadlineRemainingHours: 48,
        }),
        responseMs: 12,
        details: 'Client announcement received: Warehouse Polling API is being killed. Webhook push architecture is now active.',
        signatureVerified: true,
      });

      res.json({
        success: true,
        message: 'The Meridian Pivot triggered! Polling deprecated, Webhook push activated.',
      });
    } catch (error: any) {
      console.error('Error triggering pivot:', error);
      res.status(500).json({ error: 'Failed to trigger pivot' });
    }
  });

  // Reset simulation to fresh state
  app.post('/api/simulation/reset', async (_req, res) => {
    try {
      const states = await db.select().from(simulationState).limit(1);
      if (states[0]) {
        await db
          .update(simulationState)
          .set({
            sprintDay: 1,
            activeSyncMode: 'polling',
            pivotTriggered: false,
            lastPivotAt: null,
          })
          .where(eq(simulationState.id, states[0].id));
      }

      // Reset inventory sync methods back to polling
      await db.update(inventoryItems).set({
        syncMethod: 'polling',
        lastSyncedAt: new Date(),
      });

      res.json({ success: true, message: 'Simulation reset to Day 1 Solo Recon state.' });
    } catch (error: any) {
      console.error('Error resetting simulation:', error);
      res.status(500).json({ error: 'Failed to reset simulation' });
    }
  });

  // --- 2. NORTHSTAR INVENTORY & SUPPORT TOOL API ---

  // Get all inventory items with optional search & filter
  app.get('/api/inventory', async (req, res) => {
    try {
      const query = (req.query.q as string || '').toLowerCase().trim();
      const category = req.query.category as string;

      let items = await db.select().from(inventoryItems).orderBy(asc(inventoryItems.sku));

      if (query) {
        items = items.filter(
          (item) =>
            item.sku.toLowerCase().includes(query) ||
            item.name.toLowerCase().includes(query) ||
            item.warehouseLocation.toLowerCase().includes(query)
        );
      }

      if (category && category !== 'All') {
        items = items.filter((item) => item.category === category);
      }

      res.json(items);
    } catch (error: any) {
      console.error('Error querying inventory:', error);
      res.status(500).json({ error: 'Failed to query inventory' });
    }
  });

  // Get single inventory item by SKU (Used by Support Agent Tool)
  app.get('/api/inventory/:sku', async (req, res) => {
    try {
      const { sku } = req.params;
      const items = await db.select().from(inventoryItems).where(eq(inventoryItems.sku, sku));

      if (items.length === 0) {
        return res.status(404).json({ error: `SKU "${sku}" not found in Northstar Retail catalog.` });
      }

      const item = items[0];
      const available = Math.max(0, item.stock - item.reserved);

      res.json({
        ...item,
        availableStock: available,
        inStock: available > 0,
        supportStatusBadge: available > 10 ? 'IN_STOCK' : available > 0 ? 'LOW_STOCK' : 'OUT_OF_STOCK',
        warehouse: item.warehouseLocation,
      });
    } catch (error: any) {
      console.error('Error querying SKU:', error);
      res.status(500).json({ error: 'Failed to fetch SKU' });
    }
  });

  // Simulate a warehouse stock change
  app.post('/api/inventory/simulate-change', async (req, res) => {
    try {
      const { sku, deltaStock, reason } = req.body;
      if (!sku) {
        return res.status(400).json({ error: 'SKU is required' });
      }

      const items = await db.select().from(inventoryItems).where(eq(inventoryItems.sku, sku));
      if (items.length === 0) {
        return res.status(404).json({ error: 'SKU not found' });
      }

      const currentItem = items[0];
      const change = Number(deltaStock) || (Math.random() > 0.5 ? 5 : -5);
      const newStock = Math.max(0, currentItem.stock + change);
      const newStatus = newStock === 0 ? 'out_of_stock' : newStock <= 10 ? 'low_stock' : 'in_stock';

      await db
        .update(inventoryItems)
        .set({
          stock: newStock,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.sku, sku));

      res.json({
        success: true,
        sku,
        previousStock: currentItem.stock,
        newStock,
        delta: change,
        reason: reason || 'Warehouse floor scan update',
      });
    } catch (error: any) {
      console.error('Error simulating stock change:', error);
      res.status(500).json({ error: 'Failed to simulate stock change' });
    }
  });

  // --- 3. SYNC ENGINE: POLLING VS WEBHOOK PUSH ---

  // Day 3 Polling Worker Endpoint (Scheduled or Manual Poll)
  app.post('/api/sync/poll-warehouse', async (_req, res) => {
    const startTime = Date.now();
    try {
      const states = await db.select().from(simulationState).limit(1);
      const state = states[0];

      // If we are in Day 4 or 5 / Pivot mode, Polling is DEPRECATED & KILLED
      if (state && (state.sprintDay >= 4 || state.activeSyncMode === 'webhook' || state.pivotTriggered)) {
        await db.insert(syncLogs).values({
          syncType: 'polling',
          status: 'failed',
          sku: 'ALL_BATCH',
          payload: JSON.stringify({ error: 'HTTP 410 Gone - Polling endpoint decommissioned' }),
          responseMs: Date.now() - startTime,
          details: 'BLOCKED: Northstar Retail decommissioned the polling endpoint on Day 4. Request was rejected.',
        });

        return res.status(410).json({
          error: 'HTTP 410 Gone: The 5-minute warehouse polling API has been permanently decommissioned as of Day 4. Please use the Webhook Push Receiver at /api/webhooks/inventory-update.',
          code: 'POLLING_METHOD_DEPRECATED',
          deprecatedAt: state.lastPivotAt || new Date().toISOString(),
        });
      }

      // Normal Day 3 Polling logic: fetch warehouse delta and update inventory
      const items = await db.select().from(inventoryItems);
      const updatedCount = items.length;

      // Simulate a small random fluctuation during polling
      for (const item of items) {
        const randomDelta = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
        const newStock = Math.max(0, item.stock + randomDelta);
        const newStatus = newStock === 0 ? 'out_of_stock' : newStock <= 10 ? 'low_stock' : 'in_stock';

        await db
          .update(inventoryItems)
          .set({
            stock: newStock,
            status: newStatus,
            syncMethod: 'polling',
            lastSyncedAt: new Date(),
          })
          .where(eq(inventoryItems.id, item.id));
      }

      const elapsed = Date.now() - startTime;

      await db.insert(syncLogs).values({
        syncType: 'polling',
        status: 'success',
        sku: 'ALL_BATCH',
        payload: JSON.stringify({ itemsSynced: updatedCount, method: 'interval_poll_5min' }),
        responseMs: elapsed,
        details: `Day 3 Polling Sync: Polled warehouse API and synced ${updatedCount} items into PostgreSQL cache.`,
      });

      res.json({
        success: true,
        syncType: 'polling',
        itemsSynced: updatedCount,
        durationMs: elapsed,
        nextScheduledPollInSeconds: 300,
        message: 'Warehouse catalog polled and cached successfully.',
      });
    } catch (error: any) {
      console.error('Error during warehouse polling:', error);
      res.status(500).json({ error: 'Warehouse polling job failed' });
    }
  });

  // Day 4/5 Inbound Webhook Receiver (Push Model)
  app.post('/api/webhooks/inventory-update', async (req: RawBodyRequest, res: Response) => {
    const startTime = Date.now();
    try {
      const signature = req.headers['x-northstar-signature'] as string;
      const idempotencyKey = req.headers['x-idempotency-key'] as string;
      const timestampHeader = req.headers['x-timestamp'] as string;

      // Retrieve active webhook secret from simulation state
      const states = await db.select().from(simulationState).limit(1);
      const secret = states[0]?.webhookSecret || 'whsec_northstar_live_secret_key_8f9a2b';

      // 1. Signature Verification
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
      const isVerified = verifyHmacSignature(rawBody, signature, secret);

      if (!isVerified) {
        const elapsed = Date.now() - startTime;
        await db.insert(syncLogs).values({
          syncType: 'webhook',
          status: 'failed',
          sku: req.body?.sku || 'UNKNOWN',
          payload: JSON.stringify(req.body || {}),
          responseMs: elapsed,
          details: `SECURITY ALERT: Invalid HMAC-SHA256 signature rejected. Provided: ${signature?.substring(0, 12)}...`,
          signatureVerified: false,
          idempotencyKey,
        });

        return res.status(401).json({
          error: 'Unauthorized: Invalid x-northstar-signature HMAC signature.',
          code: 'INVALID_SIGNATURE',
          hint: 'Ensure your payload matches the raw buffer hash generated with Northstar webhook secret.',
        });
      }

      // 2. Idempotency Check (Prevent replay attacks / duplicate adjustments)
      if (idempotencyKey) {
        const existingLogs = await db
          .select()
          .from(syncLogs)
          .where(eq(syncLogs.idempotencyKey, idempotencyKey));

        if (existingLogs.length > 0 && existingLogs[0].status === 'success') {
          const elapsed = Date.now() - startTime;
          return res.status(200).json({
            success: true,
            idempotent: true,
            message: 'Duplicate event ignored via O(1) idempotency cache key.',
            previousSyncTimestamp: existingLogs[0].createdAt,
            durationMs: elapsed,
          });
        }
      }

      // 3. Process Webhook Payload
      const { event, sku, stock, delta, reserved, warehouse, reason } = req.body;

      if (!sku) {
        return res.status(400).json({ error: 'Missing SKU in webhook event payload' });
      }

      const existingItems = await db.select().from(inventoryItems).where(eq(inventoryItems.sku, sku));

      let updatedItem;
      if (existingItems.length > 0) {
        const item = existingItems[0];
        let finalStock = item.stock;

        if (typeof stock === 'number') {
          finalStock = Math.max(0, stock);
        } else if (typeof delta === 'number') {
          finalStock = Math.max(0, item.stock + delta);
        }

        const finalReserved = typeof reserved === 'number' ? reserved : item.reserved;
        const newStatus = finalStock === 0 ? 'out_of_stock' : finalStock <= 10 ? 'low_stock' : 'in_stock';

        const updated = await db
          .update(inventoryItems)
          .set({
            stock: finalStock,
            reserved: finalReserved,
            warehouseLocation: warehouse || item.warehouseLocation,
            syncMethod: 'webhook',
            status: newStatus,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(inventoryItems.id, item.id))
          .returning();

        updatedItem = updated[0];
      } else {
        // Create new inventory item on push
        const newStock = typeof stock === 'number' ? Math.max(0, stock) : 10;
        const created = await db
          .insert(inventoryItems)
          .values({
            sku,
            name: req.body.name || `Northstar Product ${sku}`,
            category: req.body.category || 'General Merchandise',
            stock: newStock,
            reserved: typeof reserved === 'number' ? reserved : 0,
            price: req.body.price || '99.99',
            warehouseLocation: warehouse || 'SEA-WH-01 (Seattle Primary)',
            syncMethod: 'webhook',
            status: newStock === 0 ? 'out_of_stock' : newStock <= 10 ? 'low_stock' : 'in_stock',
          })
          .returning();

        updatedItem = created[0];
      }

      const elapsed = Date.now() - startTime;

      // 4. Record Successful Sync Log
      await db.insert(syncLogs).values({
        syncType: 'webhook',
        status: 'success',
        sku,
        payload: JSON.stringify(req.body),
        responseMs: elapsed,
        details: `Instant Push Sync: Processed "${event || 'stock_update'}" for ${sku} in ${elapsed}ms (${reason || 'Live floor event'}).`,
        signatureVerified: true,
        idempotencyKey,
      });

      res.status(200).json({
        success: true,
        event: event || 'inventory.stock_updated',
        sku,
        updatedStock: updatedItem.stock,
        availableStock: Math.max(0, updatedItem.stock - updatedItem.reserved),
        status: updatedItem.status,
        latencyMs: elapsed,
        signatureVerified: true,
      });
    } catch (error: any) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Internal error processing webhook' });
    }
  });

  // Webhook Dispatcher Simulator (Emulates Northstar Warehouse ERP pushing events)
  app.post('/api/simulator/dispatch-webhook', async (req, res) => {
    try {
      const { sku, delta, stock, tamperSignature, replayAttack, customEvent } = req.body;

      const states = await db.select().from(simulationState).limit(1);
      const secret = states[0]?.webhookSecret || 'whsec_northstar_live_secret_key_8f9a2b';

      const targetSku = sku || 'NS-ELEC-4891';
      const payloadObj = {
        event: customEvent || 'inventory.stock_updated',
        sku: targetSku,
        timestamp: new Date().toISOString(),
        delta: typeof delta === 'number' ? delta : -2,
        stock: typeof stock === 'number' ? stock : undefined,
        warehouse: 'SEA-WH-01 (Seattle Primary)',
        reason: 'Northstar Customer Support Live Reservation Order #NS-88912',
      };

      const payloadString = JSON.stringify(payloadObj);
      const rawBuffer = Buffer.from(payloadString, 'utf8');

      let signature = computeHmacSignature(rawBuffer, secret);
      if (tamperSignature) {
        signature = 'invalid_tampered_signature_00000000000000000000000000000000';
      }

      const idempotencyKey = replayAttack
        ? 'static-replay-idempotency-key-fixed-token-9988'
        : `event-idemp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      // Dispatch to internal webhook handler
      const response = await fetch(`http://localhost:3000/api/webhooks/inventory-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-northstar-signature': signature,
          'x-idempotency-key': idempotencyKey,
          'x-timestamp': new Date().toISOString(),
        },
        body: payloadString,
      });

      const responseData = await response.json();

      res.json({
        dispatched: true,
        httpStatus: response.status,
        payloadSent: payloadObj,
        signatureUsed: signature,
        idempotencyKey,
        webhookResponse: responseData,
      });
    } catch (error: any) {
      console.error('Error in simulator dispatch:', error);
      res.status(500).json({ error: 'Simulator dispatch failed' });
    }
  });

  // Get recent sync logs
  app.get('/api/sync/logs', async (_req, res) => {
    try {
      const logs = await db.select().from(syncLogs).orderBy(desc(syncLogs.id)).limit(40);
      res.json(logs);
    } catch (error: any) {
      console.error('Error fetching sync logs:', error);
      res.status(500).json({ error: 'Failed to fetch sync logs' });
    }
  });

  // --- 4. ASSIGNMENT 1: SOLO RECON & BLOCKER LOGS ---

  // Get catalog of Solo Recon tools
  app.get('/api/recon/tools', (_req, res) => {
    const tools = [
      {
        id: 'webhook_hmac',
        name: 'Webhook Verification (HMAC-SHA256)',
        category: 'Security & Authenticity',
        difficulty: 'High',
        brief: 'Validate inbound webhook authenticity using SHA256 HMAC digest and constant-time buffer comparison to resist timing attacks.',
        primaryDocumentation: 'RFC-2104 (HMAC), Node.js Crypto.createHmac, Webhook signature headers',
        commonTrap: 'Reading parsed JSON objects alters key order and spacing, invalidating HMAC comparison. Always hash raw request buffers.',
        codeTemplate: `const crypto = require('crypto');\nfunction verifySignature(rawBuf, sig, secret) {\n  const hmac = crypto.createHmac('sha256', secret).update(rawBuf).digest('hex');\n  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac));\n}`,
      },
      {
        id: 'message_queue',
        name: 'Message Queuing & Dead-Letter Buffers (BullMQ)',
        category: 'Asynchronous Processing',
        difficulty: 'Very High',
        brief: 'Buffer rapid inventory changes in memory queues to absorb warehouse traffic spikes and route unprocessable events to a Dead Letter Queue (DLQ).',
        primaryDocumentation: 'BullMQ Queue API, Redis stream backpressure, Job retry backoff options',
        commonTrap: 'Forgetting job deduplication IDs causes duplicate queue items during network re-deliveries.',
        codeTemplate: `const { Queue, Worker } = require('bullmq');\nconst syncQueue = new Queue('inventory-sync');\nawait syncQueue.add('stock_update', { sku, delta }, { jobId: eventId, attempts: 3 });`,
      },
      {
        id: 'backoff_retry',
        name: 'Exponential Backoff with Full Jitter',
        category: 'Resilience Engineering',
        difficulty: 'High',
        brief: 'Prevent the Thundering Herd problem on warehouse API rate limits by combining mathematical exponential delays with random jitter.',
        primaryDocumentation: 'AWS Architecture Blog (Marc Brooker), Postgres connection resiliency',
        commonTrap: 'Deterministic exponential backoff without jitter causes all retrying clients to hit the server at identical timestamps.',
        codeTemplate: `function getBackoffDelay(attempt, base = 100, cap = 5000) {\n  const temp = Math.min(cap, base * Math.pow(2, attempt));\n  return Math.random() * temp;\n}`,
      },
      {
        id: 'graphql_engine',
        name: 'GraphQL Real-Time Subscriptions',
        category: 'API Architectures',
        difficulty: 'Very High',
        brief: 'Expose live inventory state to customer support agents using GraphQL schema resolvers and WebSocket topic subscriptions.',
        primaryDocumentation: 'GraphQL Spec (June 2018), GraphQL-WS transport protocol',
        commonTrap: 'Deeply nested queries without query depth limiting can overload database connections.',
        codeTemplate: `type InventoryItem {\n  sku: String!\n  stock: Int!\n  status: StockStatus!\n}\ntype Subscription {\n  stockChanged(sku: String!): InventoryItem!\n}`,
      },
      {
        id: 'serverless_event',
        name: 'Serverless Event-Driven Workers',
        category: 'Cloud Infrastructure',
        difficulty: 'High',
        brief: 'Stateless function triggers that fire automatically when warehouse inventory events land in object storage or event hubs.',
        primaryDocumentation: 'Cloud Run / Cloud Functions event bindings, OIDC token verification',
        commonTrap: 'Cold start latency spikes and non-idempotent lambda executions causing duplicate state transitions.',
        codeTemplate: `exports.onWarehouseEvent = async (event, context) => {\n  const payload = JSON.parse(Buffer.from(event.data, 'base64').toString());\n  await updateDatabase(payload);\n};`,
      },
    ];

    res.json(tools);
  });

  // Get blocker log entries
  app.get('/api/blockers', async (_req, res) => {
    try {
      const logs = await db.select().from(blockerLogs).orderBy(desc(blockerLogs.id));
      res.json(logs);
    } catch (error: any) {
      console.error('Error fetching blocker logs:', error);
      res.status(500).json({ error: 'Failed to fetch blocker logs' });
    }
  });

  // Create new blocker log
  app.post('/api/blockers', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const { toolName, errorSignature, blockerDesc, resourceConsulted, resolution, timeSpentMins } = req.body;

      if (!toolName || !errorSignature || !blockerDesc) {
        return res.status(400).json({ error: 'toolName, errorSignature, and blockerDesc are required' });
      }

      const inserted = await db
        .insert(blockerLogs)
        .values({
          userId: req.dbUser?.id || null,
          toolName,
          errorSignature,
          blockerDesc,
          resourceConsulted: resourceConsulted || 'Official API Docs & Specifications',
          resolution: resolution || 'Applied fix and validated in prototype test suite.',
          timeSpentMins: Number(timeSpentMins) || 30,
          status: 'resolved',
          prototypeStatus: 'completed',
        })
        .returning();

      res.status(201).json(inserted[0]);
    } catch (error: any) {
      console.error('Error creating blocker log:', error);
      res.status(500).json({ error: 'Failed to create blocker log' });
    }
  });

  // Update blocker log
  app.put('/api/blockers/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { resolution, status, timeSpentMins, prototypeStatus } = req.body;

      const updated = await db
        .update(blockerLogs)
        .set({
          resolution,
          status,
          timeSpentMins: typeof timeSpentMins === 'number' ? timeSpentMins : undefined,
          prototypeStatus,
        })
        .where(eq(blockerLogs.id, id))
        .returning();

      res.json(updated[0]);
    } catch (error: any) {
      console.error('Error updating blocker log:', error);
      res.status(500).json({ error: 'Failed to update blocker log' });
    }
  });

  // Delete blocker log
  app.delete('/api/blockers/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(blockerLogs).where(eq(blockerLogs.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting blocker log:', error);
      res.status(500).json({ error: 'Failed to delete blocker log' });
    }
  });

  // --- 5. ASSIGNMENT 2: SCOPE DELTA ANALYSIS & CHANGE LOG ---

  // Get all scope delta items
  app.get('/api/scope-delta', async (_req, res) => {
    try {
      const items = await db.select().from(scopeDeltaItems).orderBy(asc(scopeDeltaItems.id));
      res.json(items);
    } catch (error: any) {
      console.error('Error fetching scope delta:', error);
      res.status(500).json({ error: 'Failed to fetch scope delta items' });
    }
  });

  // Create scope delta item
  app.post('/api/scope-delta', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const { changeType, featureName, originalPlan, pivotAction, rationale, impactHours, regressionCheck } = req.body;

      if (!changeType || !featureName || !pivotAction) {
        return res.status(400).json({ error: 'changeType, featureName, and pivotAction are required' });
      }

      const inserted = await db
        .insert(scopeDeltaItems)
        .values({
          userId: req.dbUser?.id || null,
          changeType,
          featureName,
          originalPlan: originalPlan || 'Original Day 3 Polling specification',
          pivotAction,
          rationale: rationale || 'Required to absorb Day 4 client pivot without deadline extension.',
          impactHours: Number(impactHours) || 4,
          regressionCheck: regressionCheck || 'passed',
        })
        .returning();

      res.status(201).json(inserted[0]);
    } catch (error: any) {
      console.error('Error creating scope delta item:', error);
      res.status(500).json({ error: 'Failed to create scope delta item' });
    }
  });

  // Update scope delta item
  app.put('/api/scope-delta/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { changeType, featureName, originalPlan, pivotAction, rationale, impactHours, regressionCheck } = req.body;

      const updated = await db
        .update(scopeDeltaItems)
        .set({
          changeType,
          featureName,
          originalPlan,
          pivotAction,
          rationale,
          impactHours: typeof impactHours === 'number' ? impactHours : undefined,
          regressionCheck,
        })
        .where(eq(scopeDeltaItems.id, id))
        .returning();

      res.json(updated[0]);
    } catch (error: any) {
      console.error('Error updating scope delta item:', error);
      res.status(500).json({ error: 'Failed to update scope delta item' });
    }
  });

  // Delete scope delta item
  app.delete('/api/scope-delta/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(scopeDeltaItems).where(eq(scopeDeltaItems.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting scope delta item:', error);
      res.status(500).json({ error: 'Failed to delete scope delta item' });
    }
  });

  // --- 6. ASSIGNMENT 3: INDIVIDUAL ADAPTABILITY INDEX (PEER REVIEW MATRIX) ---

  // Get all peer reviews and aggregate calculations
  app.get('/api/adaptability', async (_req, res) => {
    try {
      const reviews = await db.select().from(adaptabilityReviews).orderBy(desc(adaptabilityReviews.id));

      let totalComposure = 0;
      let totalCommunication = 0;
      let totalFlexibility = 0;
      let totalContribution = 0;
      let rehireYesCount = 0;

      reviews.forEach((r) => {
        totalComposure += r.composureScore;
        totalCommunication += r.communicationScore;
        totalFlexibility += r.flexibilityScore;
        totalContribution += r.contributionScore;
        if (r.rehireDecision === 'definitely_yes' || r.rehireDecision === 'yes') {
          rehireYesCount += 1;
        }
      });

      const count = reviews.length || 1;
      const composureAvg = Number((totalComposure / count).toFixed(1));
      const communicationAvg = Number((totalCommunication / count).toFixed(1));
      const flexibilityAvg = Number((totalFlexibility / count).toFixed(1));
      const contributionAvg = Number((totalContribution / count).toFixed(1));
      const compositeRating = Number(
        (((composureAvg + communicationAvg + flexibilityAvg + contributionAvg) / 20) * 100).toFixed(1)
      );
      const rehireRate = Math.round((rehireYesCount / count) * 100);

      res.json({
        reviews,
        aggregate: {
          totalReviews: reviews.length,
          composureAvg,
          communicationAvg,
          flexibilityAvg,
          contributionAvg,
          compositeRating,
          rehireRate,
        },
      });
    } catch (error: any) {
      console.error('Error fetching adaptability reviews:', error);
      res.status(500).json({ error: 'Failed to fetch adaptability reviews' });
    }
  });

  // Submit peer review evaluation
  app.post('/api/adaptability', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const {
        revieweeName,
        revieweeRole,
        composureScore,
        communicationScore,
        flexibilityScore,
        contributionScore,
        rehireDecision,
        feedbackNotes,
        pivotResilienceNotes,
      } = req.body;

      if (!revieweeName || !feedbackNotes) {
        return res.status(400).json({ error: 'revieweeName and feedbackNotes are required' });
      }

      const inserted = await db
        .insert(adaptabilityReviews)
        .values({
          reviewerId: req.dbUser?.id || null,
          revieweeName,
          revieweeRole: revieweeRole || 'Software Engineer',
          composureScore: Math.min(5, Math.max(1, Number(composureScore) || 5)),
          communicationScore: Math.min(5, Math.max(1, Number(communicationScore) || 5)),
          flexibilityScore: Math.min(5, Math.max(1, Number(flexibilityScore) || 5)),
          contributionScore: Math.min(5, Math.max(1, Number(contributionScore) || 5)),
          rehireDecision: rehireDecision || 'definitely_yes',
          feedbackNotes,
          pivotResilienceNotes: pivotResilienceNotes || 'Maintained clear focus and steady delivery through the sprint.',
        })
        .returning();

      res.status(201).json(inserted[0]);
    } catch (error: any) {
      console.error('Error submitting adaptability review:', error);
      res.status(500).json({ error: 'Failed to submit adaptability review' });
    }
  });

  // --- 7. AUTOMATED SPRINT RUBRIC EVALUATION ENGINE ---

  app.post('/api/test-runner/evaluate', async (_req, res) => {
    try {
      // 1. Evaluate Assignment 1
      const blockers = await db.select().from(blockerLogs);
      const resolvedBlockers = blockers.filter((b) => b.status === 'resolved');
      const blockerAutonomy = blockers.length >= 3 ? 40 : Math.round((blockers.length / 3) * 40);
      const functionalCorrectnessA1 = resolvedBlockers.length >= 2 ? 40 : 25;
      const timeEfficiencyA1 = blockers.every((b) => b.timeSpentMins <= 60) ? 20 : 15;
      const totalA1 = blockerAutonomy + functionalCorrectnessA1 + timeEfficiencyA1;

      // 2. Evaluate Assignment 2
      const deltas = await db.select().from(scopeDeltaItems);
      const droppedItems = deltas.filter((d) => d.changeType === 'dropped');
      const addedItems = deltas.filter((d) => d.changeType === 'added');
      const passedRegressions = deltas.filter((d) => d.regressionCheck === 'passed');

      const adaptationCompleteness = addedItems.length > 0 && droppedItems.length > 0 ? 40 : 25;
      const architecturalIntegrity = passedRegressions.length >= deltas.length ? 30 : 20;
      const tradeoffDocsQuality = deltas.length >= 4 ? 30 : 20;
      const totalA2 = adaptationCompleteness + architecturalIntegrity + tradeoffDocsQuality;

      // 3. Evaluate Assignment 3
      const reviews = await db.select().from(adaptabilityReviews);
      let totalComp = 0, totalComm = 0, totalFlex = 0, totalContrib = 0;
      reviews.forEach((r) => {
        totalComp += r.composureScore;
        totalComm += r.communicationScore;
        totalFlex += r.flexibilityScore;
        totalContrib += r.contributionScore;
      });
      const revCount = reviews.length || 1;
      const composureAverage = Number((totalComp / revCount).toFixed(1));
      const communicationAverage = Number((totalComm / revCount).toFixed(1));
      const flexibilityAverage = Number((totalFlex / revCount).toFixed(1));
      const contributionAverage = Number((totalContrib / revCount).toFixed(1));
      const overallAdaptabilityIndex = Math.round(
        ((composureAverage + communicationAverage + flexibilityAverage + contributionAverage) / 20) * 100
      );

      const report = {
        evaluatedAt: new Date().toISOString(),
        overallScore: Math.round((totalA1 + totalA2 + overallAdaptabilityIndex) / 3),
        assignment1: {
          title: 'Assignment 1: Independent Learning & Blocker Journal',
          functionalCorrectness: functionalCorrectnessA1,
          troubleshootingAutonomy: blockerAutonomy,
          timeEfficiency: timeEfficiencyA1,
          total: totalA1,
          status: totalA1 >= 85 ? 'Exceptional' : totalA1 >= 70 ? 'Passing' : 'Needs Work',
          evidence: `${resolvedBlockers.length}/${blockers.length} prototype blockers resolved autonomously without instructor intervention.`,
        },
        assignment2: {
          title: 'Assignment 2: Mid-Sprint Change Log & Refactored Deliverable',
          adaptationCompleteness,
          architecturalIntegrity,
          tradeoffDocsQuality,
          total: totalA2,
          status: totalA2 >= 85 ? 'Exceptional' : totalA2 >= 70 ? 'Passing' : 'Needs Work',
          evidence: `Scope Delta documented: ${droppedItems.length} obsolete features dropped, ${addedItems.length} webhook push modules added with zero breaking queries on customer support tool.`,
        },
        assignment3: {
          title: 'Assignment 3: Individual Adaptability Index (Peer Review)',
          composureAverage,
          communicationAverage,
          flexibilityAverage,
          contributionAverage,
          adaptabilityIndexOverall: overallAdaptabilityIndex,
          rehireRate: Math.round(
            (reviews.filter((r) => r.rehireDecision === 'definitely_yes' || r.rehireDecision === 'yes').length /
              revCount) *
              100
          ),
          evidence: `Peer ratings across 4 core resilience dimensions collected confidentially across team members.`,
        },
      };

      res.json(report);
    } catch (error: any) {
      console.error('Error evaluating sprint rubric:', error);
      res.status(500).json({ error: 'Evaluation runner failed' });
    }
  });

  // --- VITE SPA & STATIC SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`The Meridian Pivot simulation server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
