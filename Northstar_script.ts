import { db } from './index.ts';
import {
  users,
  inventoryItems,
  simulationState,
  blockerLogs,
  scopeDeltaItems,
  adaptabilityReviews,
  syncLogs,
} from './schema.ts';
import { eq } from 'drizzle-orm';

export async function ensureSeeded() {
  try {
    // Check if simulation state exists
    const states = await db.select().from(simulationState);
    if (states.length === 0) {
      console.log('Seeding initial Meridian Pivot simulation state and inventory...');

      // 1. Create Default Simulation State
      await db.insert(simulationState).values({
        sprintDay: 1,
        activeSyncMode: 'polling',
        pivotTriggered: false,
        webhookSecret: 'whsec_northstar_live_secret_key_8f9a2b',
        pollingIntervalSeconds: 300,
      });

      // 2. Create Default User (Demo Instructor & Learner)
      const seededUser = await db.insert(users).values({
        uid: 'demo-learner-001',
        email: 'alex.chen@northstar-learner.internal',
        name: 'Alex Chen (Staff Engineer)',
        role: 'lead_learner',
      }).returning();

      const defaultUserId = seededUser[0]?.id;

      // 3. Seed Northstar Retail Live Inventory
      await db.insert(inventoryItems).values([
        {
          sku: 'NS-ELEC-4891',
          name: 'Northstar Pro ANC Wireless Headphones',
          category: 'Audio & Electronics',
          stock: 142,
          reserved: 12,
          price: '249.99',
          warehouseLocation: 'SEA-WH-01 (Seattle Primary)',
          syncMethod: 'polling',
          status: 'in_stock',
        },
        {
          sku: 'NS-ELEC-7822',
          name: 'Quantum 4K Ultra-Wide Curved Monitor 34"',
          category: 'Audio & Electronics',
          stock: 18,
          reserved: 4,
          price: '599.00',
          warehouseLocation: 'ORD-WH-04 (Chicago Hub)',
          syncMethod: 'polling',
          status: 'low_stock',
        },
        {
          sku: 'NS-HOME-1044',
          name: 'AeroBreeze Smart HEPA Air Purifier Pro',
          category: 'Smart Home',
          stock: 64,
          reserved: 3,
          price: '189.50',
          warehouseLocation: 'DFW-WH-02 (Dallas South)',
          syncMethod: 'polling',
          status: 'in_stock',
        },
        {
          sku: 'NS-HOME-9912',
          name: 'Artisan Espresso & Cold Brew Dual Extractor',
          category: 'Smart Home',
          stock: 0,
          reserved: 0,
          price: '349.00',
          warehouseLocation: 'SEA-WH-01 (Seattle Primary)',
          syncMethod: 'polling',
          status: 'out_of_stock',
        },
        {
          sku: 'NS-GEAR-3390',
          name: 'TrailVanguard Waterproof Tactical Backpack 35L',
          category: 'Outdoors & Travel',
          stock: 215,
          reserved: 18,
          price: '119.00',
          warehouseLocation: 'DEN-WH-03 (Denver Alpine)',
          syncMethod: 'polling',
          status: 'in_stock',
        },
        {
          sku: 'NS-GEAR-5511',
          name: 'SolarPulse 100W Ultralight Foldable Solar Array',
          category: 'Outdoors & Travel',
          stock: 8,
          reserved: 2,
          price: '179.99',
          warehouseLocation: 'DEN-WH-03 (Denver Alpine)',
          syncMethod: 'polling',
          status: 'low_stock',
        },
        {
          sku: 'NS-WEAR-6643',
          name: 'Meridian Polar-Thermal Insulated Parka (L)',
          category: 'Apparel & Outerwear',
          stock: 89,
          reserved: 7,
          price: '280.00',
          warehouseLocation: 'BOS-WH-05 (Boston North)',
          syncMethod: 'polling',
          status: 'in_stock',
        },
        {
          sku: 'NS-WEAR-1299',
          name: 'AeroKnit Ergonomic Carbon Running Shoes (US 10.5)',
          category: 'Apparel & Outerwear',
          stock: 3,
          reserved: 1,
          price: '165.00',
          warehouseLocation: 'ORD-WH-04 (Chicago Hub)',
          syncMethod: 'polling',
          status: 'low_stock',
        },
      ]);

      // 4. Seed Blocker Journal Entries (Assignment 1)
      if (defaultUserId) {
        await db.insert(blockerLogs).values([
          {
            userId: defaultUserId,
            toolName: 'Webhook HMAC-SHA256 Verification',
            errorSignature: 'CryptoSignatureVerificationFailed: computed hash does not match x-northstar-signature header',
            blockerDesc: 'Express bodyParser parsed the incoming JSON before crypto.createHmac computed the digest. The stringified object altered whitespace/key-ordering, creating hash divergence.',
            resourceConsulted: 'Node.js crypto doc, GitHub RFC-2104 examples, Express raw body buffer middleware specification',
            resolution: 'Configured express.json({ verify: (req, res, buf) => req.rawBody = buf }) to verify against pristine UTF-8 byte stream before JSON deserialization.',
            timeSpentMins: 45,
            status: 'resolved',
            prototypeStatus: 'completed',
          },
          {
            userId: defaultUserId,
            toolName: 'Exponential Backoff with Full Jitter',
            errorSignature: 'ThunderingHerdWarehouseQuotaExceeded: HTTP 429 Too Many Requests on batch sync',
            blockerDesc: 'Standard exponential backoff without jitter caused 5 concurrent polling workers to retry warehouse endpoints at identical mathematical intervals (1s, 2s, 4s, 8s), re-tripping the rate limiter.',
            resourceConsulted: 'AWS Architecture Blog: Exponential Backoff And Jitter (Marc Brooker), Postgres connection pool limits',
            resolution: 'Implemented "Full Jitter": sleep = Math.random() * Math.min(cap, base * Math.pow(2, attempt)). Distributed retry spikes uniformly across timeline.',
            timeSpentMins: 35,
            status: 'resolved',
            prototypeStatus: 'completed',
          },
          {
            userId: defaultUserId,
            toolName: 'Idempotency & Replay Attack Defense',
            errorSignature: 'DuplicateStockDecrementAnomaly: duplicate webhook delivery caused negative stock count',
            blockerDesc: 'Northstar warehouse retry simulation sent 2 identical webhook updates 200ms apart during network hiccups. Second payload double-applied warehouse adjustments.',
            resourceConsulted: 'Stripe API Webhook idempotency best practices, Postgres unique index constraints',
            resolution: 'Stored unique x-idempotency-key with 15-minute TTL table check; deduplicated incoming events in O(1) time before updating inventory.',
            timeSpentMins: 40,
            status: 'resolved',
            prototypeStatus: 'completed',
          },
        ]);

        // 5. Seed Scope Delta Items (Assignment 2)
        await db.insert(scopeDeltaItems).values([
          {
            userId: defaultUserId,
            changeType: 'dropped',
            featureName: 'Warehouse 5-Minute Polling Cron Job',
            originalPlan: 'Run background node-cron worker polling GET /warehouse/inventory/all every 300 seconds and batch-updating Postgres.',
            pivotAction: 'Disabled and deprecated cron runner completely. Polling endpoints marked HTTP 410 Gone / Deprecated.',
            rationale: 'Client killed warehouse polling API due to high server overhead. Retaining polling worker would flood deprecated endpoint.',
            impactHours: 6,
            regressionCheck: 'passed',
          },
          {
            userId: defaultUserId,
            changeType: 'added',
            featureName: 'Inbound Webhook Receiver + HMAC Verification',
            originalPlan: 'Not in original scope (no push infrastructure planned).',
            pivotAction: 'Created POST /api/webhooks/inventory-update endpoint with crypto HMAC-SHA256 signature verification and timing-safe equal checks.',
            rationale: 'Mandatory client pivot requirement. Required instant push updates from warehouse with enterprise-grade authenticity.',
            impactHours: 8,
            regressionCheck: 'passed',
          },
          {
            userId: defaultUserId,
            changeType: 'modified',
            featureName: 'Support Tool Stock Query & Cache Invalidation',
            originalPlan: 'Support tool checked periodic stale cache (up to 5 min old) with "Last Polled" timestamp.',
            pivotAction: 'Refactored to live sub-second event-driven cache invalidation. Stock is now updated in <15ms on webhook receipt.',
            rationale: 'Directly solves customer support complaint regarding stale out-of-stock data without breaking existing query contract.',
            impactHours: 4,
            regressionCheck: 'passed',
          },
          {
            userId: defaultUserId,
            changeType: 'dropped',
            featureName: 'Warehouse Rate-Limit Throttle Queue',
            originalPlan: 'Client-side rate limit queue to stay under 60 req/min during polling.',
            pivotAction: 'Removed as warehouse now controls push egress volume.',
            rationale: 'Unnecessary architectural complexity under a push model; freed bandwidth for webhook buffer verification.',
            impactHours: 3,
            regressionCheck: 'passed',
          },
        ]);

        // 6. Seed Adaptability Reviews (Assignment 3)
        await db.insert(adaptabilityReviews).values([
          {
            reviewerId: defaultUserId,
            revieweeName: 'Alex Chen',
            revieweeRole: 'Backend Lead / Webhook Architect',
            composureScore: 5,
            communicationScore: 5,
            flexibilityScore: 5,
            contributionScore: 5,
            rehireDecision: 'definitely_yes',
            feedbackNotes: 'Stayed completely calm when the Day 4 pivot notification dropped. Immediately organized a 15-minute triage, clearly mapped what had to be dropped, and spearheaded the HMAC verification endpoint without complaining.',
            pivotResilienceNotes: 'Exhibited exemplary engineering maturity. Treated client constraint change as a natural systems design challenge rather than a personal setback.',
          },
          {
            reviewerId: defaultUserId,
            revieweeName: 'Jordan Taylor',
            revieweeRole: 'Frontend & Support Tool Engineer',
            composureScore: 4,
            communicationScore: 5,
            flexibilityScore: 4,
            contributionScore: 5,
            rehireDecision: 'definitely_yes',
            feedbackNotes: 'Quickly adapted the support agent search UI to reflect real-time push events and added clear visual indicators showing event-driven latency vs old polling timestamps.',
            pivotResilienceNotes: 'Proactively communicated UI state changes to ensure no breaking customer queries occurred.',
          },
          {
            reviewerId: defaultUserId,
            revieweeName: 'Marcus Vance',
            revieweeRole: 'QA & Resilience Test Engineer',
            composureScore: 5,
            communicationScore: 4,
            flexibilityScore: 5,
            contributionScore: 4,
            rehireDecision: 'definitely_yes',
            feedbackNotes: 'Built the webhook dispatch simulator and attack test harness within 3 hours of the pivot announcement, catching raw-body hashing bugs before Day 5 review.',
            pivotResilienceNotes: 'Extremely flexible mindset; pivoted from load-testing polling intervals to fuzzing webhook signatures with invalid keys.',
          },
        ]);

        // 7. Seed Initial Sync Log
        await db.insert(syncLogs).values([
          {
            syncType: 'polling',
            status: 'success',
            sku: 'ALL_BATCH',
            payload: JSON.stringify({ itemsSynced: 8, source: 'warehouse_poll_cron' }),
            responseMs: 142,
            details: 'Initial Day 3 baseline polling sync completed. 8 SKUs refreshed.',
          },
        ]);
      }
      console.log('Seeding completed successfully.');
    }
  } catch (error) {
    console.error('Error during database seeding:', error);
  }
}
