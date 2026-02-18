import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type CommerceDb = ReturnType<typeof drizzle<typeof schema>>;

let _db: CommerceDb | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export interface CommerceDbOptions {
  /** Max connections in pool (default: 5 for storefronts, keep low) */
  maxConnections?: number;
  /** Close idle connections after N seconds (default: 30) */
  idleTimeout?: number;
  /** Connection timeout in seconds (default: 10) */
  connectTimeout?: number;
}

/**
 * Initialize the commerce database connection.
 * Call this once at app startup before using any services.
 */
export function initCommerceDb(
  connectionString: string,
  options: CommerceDbOptions = {}
): CommerceDb {
  if (_db) return _db;

  _client = postgres(connectionString, {
    prepare: false,
    max: options.maxConnections ?? 5,
    idle_timeout: options.idleTimeout ?? 30,
    connect_timeout: options.connectTimeout ?? 10,
  });

  _db = drizzle(_client, { schema });
  return _db;
}

/**
 * Get the commerce database instance.
 * Throws if initCommerceDb() hasn't been called yet.
 */
export function getCommerceDb(): CommerceDb {
  if (!_db) {
    // Auto-init from env if available
    const url = process.env.COMMERCE_DATABASE_URL;
    if (url) {
      return initCommerceDb(url);
    }
    throw new Error(
      "Commerce DB not initialized. Call initCommerceDb(connectionString) or set COMMERCE_DATABASE_URL."
    );
  }
  return _db;
}

/**
 * Get the raw postgres client (e.g., for test teardown).
 */
export function getCommerceClient() {
  return _client;
}

/**
 * Close the database connection (for graceful shutdown).
 */
export async function closeCommerceDb(): Promise<void> {
  if (_client) {
    await _client.end();
    _client = null;
    _db = null;
  }
}
