import { PgColumn, PgTable } from "drizzle-orm/pg-core";

export interface FilterValue {
  type: "eq" | "min" | "max" | "in" | "like";
  value: string | number | boolean | (string | number | boolean)[];
}

export interface ListOptions {
  page: number;
  limit: number;
  sort: string;
  direction: "asc" | "desc";
  filters?: Record<string, FilterValue>;
  includes?: string[];
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface ServiceConfig {
  resourceName: string;
  defaultSort?: string;
  sortColumns?: Record<string, PgColumn>;
  filterColumns?: Record<string, PgColumn>;
  allowedFilters?: string[];
  softDelete?: {
    column: PgColumn;
    fieldName: string;
    deletedValue: boolean;
    deletedAtColumn?: PgColumn;
    deletedAtFieldName?: string;
  };
  timestamps?: {
    created?: string;
    updated?: string;
  };
}

export interface NestedServiceConfig extends ServiceConfig {
  parentResourceName: string;
}

export interface ForeignKeyValidation {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTable<any>;
  column: PgColumn;
  resourceName: string;
  fieldName: string;
  optional?: boolean;
}

export interface UniqueConstraint {
  columns: { column: PgColumn; fieldName: string }[];
  message: string;
  composite?: boolean;
}

export interface DependencyCheck {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTable<any>;
  foreignKeyColumn: PgColumn;
  resourceName: string;
  message?: string;
}

export interface HookContext {
  id?: number;
  data?: Record<string, unknown>;
  existing?: Record<string, unknown>;
}

export interface IncludeConfig {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTable<any>;
  foreignKey: PgColumn;
  transform?: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
}
