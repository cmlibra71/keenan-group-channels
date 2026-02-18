/**
 * Transform database row to API response format (camelCase → snake_case).
 * Framework-agnostic - no Next.js dependencies.
 */
export function transformRow<T extends Record<string, unknown>>(
  row: T,
  fieldMappings?: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    const snakeKey = fieldMappings?.[key] || camelToSnake(key);

    if (value instanceof Date) {
      result[snakeKey] = value.toISOString();
    } else if (typeof value === "bigint") {
      result[snakeKey] = Number(value);
    } else if (typeof value === "string" && isDecimalString(value)) {
      result[snakeKey] = value;
    } else if (value === null) {
      result[snakeKey] = null;
    } else if (typeof value === "object" && value !== null) {
      result[snakeKey] = value;
    } else {
      result[snakeKey] = value;
    }
  }

  return result;
}

export function transformRows<T extends Record<string, unknown>>(
  rows: T[],
  fieldMappings?: Record<string, string>
): Record<string, unknown>[] {
  return rows.map((row) => transformRow(row, fieldMappings));
}

/**
 * Transform request body from snake_case to camelCase for database operations
 */
export function transformRequestBody<T extends Record<string, unknown>>(
  body: T,
  fieldMappings?: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    const camelKey = fieldMappings?.[key] || snakeToCamel(key);

    if (typeof value === "string" && isISODateString(value)) {
      result[camelKey] = new Date(value);
    } else if (value === null) {
      result[camelKey] = null;
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[camelKey] = value;
    } else {
      result[camelKey] = value;
    }
  }

  return result;
}

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function isDecimalString(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value);
}

function isISODateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/.test(value);
}
