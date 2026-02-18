// Database connection
export { initCommerceDb, getCommerceDb, getCommerceClient, closeCommerceDb } from "./db";
export type { CommerceDbOptions } from "./db";

// Schema & types
export * from "./schema";

// Error classes
export {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalError,
  normalizeError,
} from "./errors";

// Transform helpers
export {
  transformRow,
  transformRows,
  transformRequestBody,
  camelToSnake,
  snakeToCamel,
} from "./transforms";

// Base service classes (for extending in custom services)
export { BaseService } from "./base/BaseService";
export { NestedService } from "./base/NestedService";
export type {
  ServiceConfig,
  NestedServiceConfig,
  ListOptions,
  PaginatedResult,
  FilterValue,
  ForeignKeyValidation,
  UniqueConstraint,
  DependencyCheck,
  HookContext,
  IncludeConfig,
} from "./base/types";

// Pre-built service instances (for storefronts)
export {
  channelService,
  siteService,
  channelSettingsService,
  brandService,
  categoryService,
  categoryTreeService,
  productImageService,
  productVariantService,
  cartService,
  cartItemService,
  customerGroupService,
} from "./services";
