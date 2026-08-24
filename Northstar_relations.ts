import { relations } from 'drizzle-orm';
import { boolean, integer, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  name: text('name'),
  avatar: text('avatar'),
  role: text('role').default('learner').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Inventory items for Northstar Retail
export const inventoryItems = pgTable('inventory_items', {
  id: serial('id').primaryKey(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  stock: integer('stock').notNull().default(0),
  reserved: integer('reserved').notNull().default(0),
  price: numeric('price', { precision: 10, scale: 2 }).notNull().default('0.00'),
  warehouseLocation: text('warehouse_location').notNull(),
  syncMethod: text('sync_method').notNull().default('polling'), // 'polling' | 'webhook'
  status: text('status').notNull().default('in_stock'), // 'in_stock' | 'low_stock' | 'out_of_stock'
  lastSyncedAt: timestamp('last_synced_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Sync logs (polling jobs vs webhook events)
export const syncLogs = pgTable('sync_logs', {
  id: serial('id').primaryKey(),
  syncType: text('sync_type').notNull(), // 'polling' | 'webhook' | 'manual'
  status: text('status').notNull(), // 'success' | 'failed' | 'ignored'
  sku: text('sku'),
  payload: text('payload'),
  responseMs: integer('response_ms').notNull().default(0),
  details: text('details'),
  signatureVerified: boolean('signature_verified').default(false),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Assignment 1: Solo Recon & Blocker Logs
export const blockerLogs = pgTable('blocker_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  toolName: text('tool_name').notNull(), // e.g. "Webhook HMAC Verification", "Message Queue (BullMQ)", "GraphQL", "Exponential Backoff"
  errorSignature: text('error_signature').notNull(),
  blockerDesc: text('blocker_desc').notNull(),
  resourceConsulted: text('resource_consulted').notNull(),
  resolution: text('resolution').notNull(),
  timeSpentMins: integer('time_spent_mins').notNull().default(30),
  status: text('status').notNull().default('resolved'), // 'resolved' | 'workaround' | 'open'
  prototypeStatus: text('prototype_status').notNull().default('completed'), // 'completed' | 'in_progress'
  createdAt: timestamp('created_at').defaultNow(),
});

// Assignment 2: Scope Delta Analysis & Change Log
export const scopeDeltaItems = pgTable('scope_delta_items', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  changeType: text('change_type').notNull(), // 'dropped' | 'modified' | 'added'
  featureName: text('feature_name').notNull(),
  originalPlan: text('original_plan').notNull(),
  pivotAction: text('pivot_action').notNull(),
  rationale: text('rationale').notNull(),
  impactHours: integer('impact_hours').notNull().default(4),
  regressionCheck: text('regression_check').notNull().default('passed'), // 'passed' | 'warning' | 'pending'
  createdAt: timestamp('created_at').defaultNow(),
});

// Assignment 3: Individual Adaptability Index (Peer Review Matrix)
export const adaptabilityReviews = pgTable('adaptability_reviews', {
  id: serial('id').primaryKey(),
  reviewerId: integer('user_id').references(() => users.id),
  revieweeName: text('reviewee_name').notNull(),
  revieweeRole: text('reviewee_role').notNull(),
  composureScore: integer('composure_score').notNull(), // 1-5
  communicationScore: integer('communication_score').notNull(), // 1-5
  flexibilityScore: integer('flexibility_score').notNull(), // 1-5
  contributionScore: integer('contribution_score').notNull(), // 1-5
  rehireDecision: text('rehire_decision').notNull(), // 'definitely_yes' | 'yes' | 'neutral' | 'no'
  feedbackNotes: text('feedback_notes').notNull(),
  pivotResilienceNotes: text('pivot_resilience_notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Simulation state tracker
export const simulationState = pgTable('simulation_state', {
  id: serial('id').primaryKey(),
  sprintDay: integer('sprint_day').notNull().default(1), // 1 to 5
  activeSyncMode: text('active_sync_mode').notNull().default('polling'), // 'polling' | 'webhook' | 'deprecated'
  pivotTriggered: boolean('pivot_triggered').notNull().default(false),
  webhookSecret: text('webhook_secret').notNull().default('whsec_northstar_live_secret_key_8f9a2b'),
  pollingIntervalSeconds: integer('polling_interval_seconds').notNull().default(300),
  lastPivotAt: timestamp('last_pivot_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relationships
export const usersRelations = relations(users, ({ many }) => ({
  blockerLogs: many(blockerLogs),
  scopeDeltaItems: many(scopeDeltaItems),
  adaptabilityReviews: many(adaptabilityReviews),
}));

export const blockerLogsRelations = relations(blockerLogs, ({ one }) => ({
  author: one(users, {
    fields: [blockerLogs.userId],
    references: [users.id],
  }),
}));

export const scopeDeltaRelations = relations(scopeDeltaItems, ({ one }) => ({
  author: one(users, {
    fields: [scopeDeltaItems.userId],
    references: [users.id],
  }),
}));

export const adaptabilityRelations = relations(adaptabilityReviews, ({ one }) => ({
  reviewer: one(users, {
    fields: [adaptabilityReviews.reviewerId],
    references: [users.id],
  }),
}));
