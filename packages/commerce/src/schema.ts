import {
  pgTable,
  serial,
  text,
  varchar,
  char,
  timestamp,
  boolean,
  integer,
  decimal,
  date,
  inet,
  uuid,
  jsonb,
  pgEnum,
  unique,
  index,
  bigserial,
} from "drizzle-orm/pg-core";

// ============================================================================
// SECTION 1: CHANNELS & MULTI-STOREFRONT
// ============================================================================

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull().default("storefront"),
  platform: varchar("platform", { length: 100 }),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  isDefault: boolean("is_default").default(false),
  defaultCurrencyCode: char("default_currency_code", { length: 3 }).default("USD"),
  defaultLocale: varchar("default_locale", { length: 10 }).default("en-US"),
  configMeta: jsonb("config_meta").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const sites = pgTable(
  "sites",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    channelId: integer("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 500 }).notNull(),
    isPrimary: boolean("is_primary").default(true),
    sslEnabled: boolean("ssl_enabled").default(true),
    siteName: varchar("site_name", { length: 255 }),
    metaTitle: varchar("meta_title", { length: 255 }),
    metaDescription: text("meta_description"),
    metaKeywords: text("meta_keywords"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [unique("sites_channel_url").on(table.channelId, table.url)]
);

export const channelSettings = pgTable(
  "channel_settings",
  {
    id: serial("id").primaryKey(),
    channelId: integer("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    settingKey: varchar("setting_key", { length: 100 }).notNull(),
    settingValue: jsonb("setting_value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [unique("channel_settings_unique").on(table.channelId, table.settingKey)]
);

// ============================================================================
// SECTION 2: CATEGORY TREES
// ============================================================================

export const categoryTrees = pgTable("category_trees", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  channelId: integer("channel_id").references(() => channels.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    treeId: integer("tree_id")
      .notNull()
      .references(() => categoryTrees.id, { onDelete: "cascade" }),
    parentId: integer("parent_id"),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    description: text("description"),
    pathIds: integer("path_ids").array().default([]),
    pathNames: text("path_names").array().default([]),
    depth: integer("depth").default(0),
    sortOrder: integer("sort_order").default(0),
    isVisible: boolean("is_visible").default(true),
    pageTitle: varchar("page_title", { length: 255 }),
    metaDescription: text("meta_description"),
    metaKeywords: text("meta_keywords"),
    imageUrl: varchar("image_url", { length: 500 }),
    metafields: jsonb("metafields").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("categories_tree_slug").on(table.treeId, table.slug),
    index("idx_categories_tree").on(table.treeId),
    index("idx_categories_parent").on(table.parentId),
    index("idx_categories_tree_parent_visible").on(table.treeId, table.parentId, table.isVisible),
  ]
);

// ============================================================================
// SECTION 3: BRANDS
// ============================================================================

export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  pageTitle: varchar("page_title", { length: 255 }),
  metaDescription: text("meta_description"),
  metaKeywords: text("meta_keywords"),
  searchKeywords: text("search_keywords"),
  imageUrl: varchar("image_url", { length: 500 }),
  metafields: jsonb("metafields").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// SECTION 4: PRODUCTS
// ============================================================================

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 100 }).unique(),
    type: varchar("type", { length: 50 }).notNull().default("physical"),
    description: text("description"),
    descriptionShort: text("description_short"),
    price: decimal("price", { precision: 19, scale: 4 }).notNull().default("0"),
    costPrice: decimal("cost_price", { precision: 19, scale: 4 }),
    retailPrice: decimal("retail_price", { precision: 19, scale: 4 }),
    salePrice: decimal("sale_price", { precision: 19, scale: 4 }),
    taxClassId: integer("tax_class_id"),
    isTaxExempt: boolean("is_tax_exempt").default(false),
    weight: decimal("weight", { precision: 10, scale: 4 }),
    width: decimal("width", { precision: 10, scale: 4 }),
    height: decimal("height", { precision: 10, scale: 4 }),
    depth: decimal("depth", { precision: 10, scale: 4 }),
    inventoryLevel: integer("inventory_level").default(0),
    inventoryWarningLevel: integer("inventory_warning_level").default(0),
    inventoryTracking: varchar("inventory_tracking", { length: 20 }).default("none"),
    brandId: integer("brand_id").references(() => brands.id, { onDelete: "set null" }),
    isVisible: boolean("is_visible").default(true),
    isFeatured: boolean("is_featured").default(false),
    availability: varchar("availability", { length: 50 }).default("available"),
    availabilityDescription: text("availability_description"),
    preorderReleaseDate: date("preorder_release_date"),
    preorderMessage: text("preorder_message"),
    condition: varchar("condition", { length: 20 }).default("new"),
    pageTitle: varchar("page_title", { length: 255 }),
    metaDescription: text("meta_description"),
    metaKeywords: text("meta_keywords"),
    searchKeywords: text("search_keywords"),
    urlPath: varchar("url_path", { length: 500 }),
    minPurchaseQuantity: integer("min_purchase_quantity").default(1),
    maxPurchaseQuantity: integer("max_purchase_quantity"),
    giftWrappingAllowed: boolean("gift_wrapping_allowed").default(true),
    relatedProductIds: integer("related_product_ids").array().default([]),
    warranty: text("warranty"),
    customFields: jsonb("custom_fields").default({}),
    metafields: jsonb("metafields").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    lastImportedAt: timestamp("last_imported_at", { withTimezone: true }),
    isDeleted: boolean("is_deleted").default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_products_sku").on(table.sku),
    index("idx_products_brand").on(table.brandId),
    index("idx_products_type").on(table.type),
    index("idx_products_name").on(table.name),
    index("idx_products_visible_featured").on(table.isVisible, table.isFeatured),
  ]
);

// ============================================================================
// SECTION 5: PRODUCT OPTIONS & VARIANTS
// ============================================================================

export const productOptions = pgTable(
  "product_options",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    type: varchar("type", { length: 50 }).notNull().default("dropdown"),
    sortOrder: integer("sort_order").default(0),
    isRequired: boolean("is_required").default(true),
    config: jsonb("config").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_product_options_product").on(table.productId)]
);

export const productOptionValues = pgTable(
  "product_option_values",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    optionId: integer("option_id")
      .notNull()
      .references(() => productOptions.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 255 }).notNull(),
    valueData: jsonb("value_data"),
    sortOrder: integer("sort_order").default(0),
    isDefault: boolean("is_default").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_option_values_option").on(table.optionId)]
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 100 }).unique(),
    skuId: integer("sku_id"),
    price: decimal("price", { precision: 19, scale: 4 }),
    costPrice: decimal("cost_price", { precision: 19, scale: 4 }),
    salePrice: decimal("sale_price", { precision: 19, scale: 4 }),
    retailPrice: decimal("retail_price", { precision: 19, scale: 4 }),
    weight: decimal("weight", { precision: 10, scale: 4 }),
    width: decimal("width", { precision: 10, scale: 4 }),
    height: decimal("height", { precision: 10, scale: 4 }),
    depth: decimal("depth", { precision: 10, scale: 4 }),
    inventoryLevel: integer("inventory_level").default(0),
    inventoryWarningLevel: integer("inventory_warning_level").default(0),
    upc: varchar("upc", { length: 50 }),
    ean: varchar("ean", { length: 50 }),
    gtin: varchar("gtin", { length: 50 }),
    mpn: varchar("mpn", { length: 50 }),
    binPickingNumber: varchar("bin_picking_number", { length: 50 }),
    purchasingDisabled: boolean("purchasing_disabled").default(false),
    purchasingDisabledMessage: text("purchasing_disabled_message"),
    imageUrl: varchar("image_url", { length: 500 }),
    optionDisplayName: varchar("option_display_name", { length: 500 }),
    metafields: jsonb("metafields").default({}),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_variants_product").on(table.productId),
    index("idx_variants_sku").on(table.sku),
  ]
);

export const productVariantOptions = pgTable(
  "product_variant_options",
  {
    id: serial("id").primaryKey(),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    optionId: integer("option_id")
      .notNull()
      .references(() => productOptions.id, { onDelete: "cascade" }),
    optionValueId: integer("option_value_id")
      .notNull()
      .references(() => productOptionValues.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("variant_options_unique").on(table.variantId, table.optionId),
    index("idx_variant_options_variant").on(table.variantId),
  ]
);

// ============================================================================
// SECTION 6: PRODUCT MODIFIERS
// ============================================================================

export const productModifiers = pgTable("product_modifiers", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  isRequired: boolean("is_required").default(false),
  sortOrder: integer("sort_order").default(0),
  config: jsonb("config").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const productModifierValues = pgTable("product_modifier_values", {
  id: serial("id").primaryKey(),
  modifierId: integer("modifier_id")
    .notNull()
    .references(() => productModifiers.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 255 }).notNull(),
  priceAdjuster: varchar("price_adjuster", { length: 20 }),
  priceAdjusterValue: decimal("price_adjuster_value", { precision: 19, scale: 4 }),
  weightAdjuster: varchar("weight_adjuster", { length: 20 }),
  weightAdjusterValue: decimal("weight_adjuster_value", { precision: 10, scale: 4 }),
  sortOrder: integer("sort_order").default(0),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// SECTION 7: PRODUCT IMAGES & VIDEOS
// ============================================================================

export const productImages = pgTable(
  "product_images",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    urlStandard: varchar("url_standard", { length: 500 }).notNull(),
    urlThumbnail: varchar("url_thumbnail", { length: 500 }),
    urlTiny: varchar("url_tiny", { length: 500 }),
    urlZoom: varchar("url_zoom", { length: 500 }),
    description: text("description"),
    altText: varchar("alt_text", { length: 255 }),
    isThumbnail: boolean("is_thumbnail").default(false),
    sortOrder: integer("sort_order").default(0),
    variantId: integer("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_product_images_product").on(table.productId)]
);

export const productVideos = pgTable("product_videos", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  type: varchar("type", { length: 50 }).notNull(),
  videoId: varchar("video_id", { length: 100 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// SECTION 8: PRODUCT CHANNEL ASSIGNMENTS
// ============================================================================

export const productChannelAssignments = pgTable(
  "product_channel_assignments",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    channelId: integer("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    isVisible: boolean("is_visible").default(true),
    isFeatured: boolean("is_featured"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("product_channel_unique").on(table.productId, table.channelId),
    index("idx_product_channel_product").on(table.productId),
    index("idx_product_channel_channel").on(table.channelId),
  ]
);

export const productCategories = pgTable(
  "product_categories",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0),
    isPrimary: boolean("is_primary").default(false),
  },
  (table) => [
    unique("product_category_unique").on(table.productId, table.categoryId),
    index("idx_product_categories_product").on(table.productId),
    index("idx_product_categories_category").on(table.categoryId),
  ]
);

// ============================================================================
// SECTION 9: PRICE LISTS
// ============================================================================

export const priceLists = pgTable("price_lists", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  currencyCode: char("currency_code", { length: 3 }).notNull().default("USD"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const priceListRecords = pgTable(
  "price_list_records",
  {
    id: serial("id").primaryKey(),
    priceListId: integer("price_list_id")
      .notNull()
      .references(() => priceLists.id, { onDelete: "cascade" }),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    price: decimal("price", { precision: 19, scale: 4 }),
    salePrice: decimal("sale_price", { precision: 19, scale: 4 }),
    retailPrice: decimal("retail_price", { precision: 19, scale: 4 }),
    mapPrice: decimal("map_price", { precision: 19, scale: 4 }),
    bulkPricingTiers: jsonb("bulk_pricing_tiers").default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("price_list_variant_unique").on(table.priceListId, table.variantId),
    index("idx_price_records_pricelist").on(table.priceListId),
    index("idx_price_records_variant").on(table.variantId),
  ]
);

export const priceListAssignments = pgTable(
  "price_list_assignments",
  {
    id: serial("id").primaryKey(),
    priceListId: integer("price_list_id")
      .notNull()
      .references(() => priceLists.id, { onDelete: "cascade" }),
    channelId: integer("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    customerGroupId: integer("customer_group_id"),
    priority: integer("priority").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("price_list_assignment_unique").on(
      table.priceListId,
      table.channelId,
      table.customerGroupId
    ),
  ]
);

// ============================================================================
// SECTION 10: BULK PRICING
// ============================================================================

export const bulkPricingRules = pgTable(
  "bulk_pricing_rules",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantityMin: integer("quantity_min").notNull(),
    quantityMax: integer("quantity_max"),
    type: varchar("type", { length: 20 }).notNull(),
    amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_bulk_pricing_product").on(table.productId)]
);

// ============================================================================
// SECTION 11: CUSTOMERS
// ============================================================================

export const customerGroups = pgTable("customer_groups", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  discountType: varchar("discount_type", { length: 20 }),
  discountAmount: decimal("discount_amount", { precision: 19, scale: 4 }),
  categoryAccessType: varchar("category_access_type", { length: 20 }).default("all"),
  isDefault: boolean("is_default").default(false),
  isGroupForGuests: boolean("is_group_for_guests").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    originChannelId: integer("origin_channel_id").references(() => channels.id, {
      onDelete: "set null",
    }),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    customerGroupId: integer("customer_group_id").references(() => customerGroups.id, {
      onDelete: "set null",
    }),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    company: varchar("company", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    taxExemptCategory: varchar("tax_exempt_category", { length: 100 }),
    storeCredit: decimal("store_credit", { precision: 19, scale: 4 }).default("0"),
    isActive: boolean("is_active").default(true),
    acceptsMarketing: boolean("accepts_marketing").default(false),
    notes: text("notes"),
    formFields: jsonb("form_fields").default({}),
    attributes: jsonb("attributes").default({}),
    metafields: jsonb("metafields").default({}),
    registrationIpAddress: inet("registration_ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("customer_channel_email").on(table.originChannelId, table.email),
    index("idx_customers_email").on(table.email),
    index("idx_customers_group").on(table.customerGroupId),
    index("idx_customers_channel").on(table.originChannelId),
    index("idx_customers_email_active").on(table.email, table.isActive),
  ]
);

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    company: varchar("company", { length: 255 }),
    address1: varchar("address1", { length: 255 }).notNull(),
    address2: varchar("address2", { length: 255 }),
    city: varchar("city", { length: 100 }).notNull(),
    stateOrProvince: varchar("state_or_province", { length: 100 }),
    stateOrProvinceCode: varchar("state_or_province_code", { length: 10 }),
    postalCode: varchar("postal_code", { length: 20 }),
    country: varchar("country", { length: 100 }).notNull(),
    countryCode: char("country_code", { length: 2 }),
    phone: varchar("phone", { length: 50 }),
    addressType: varchar("address_type", { length: 20 }).default("residential"),
    isDefaultBilling: boolean("is_default_billing").default(false),
    isDefaultShipping: boolean("is_default_shipping").default(false),
    formFields: jsonb("form_fields").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_customer_addresses_customer").on(table.customerId)]
);

// ============================================================================
// SECTION 12: ACCOUNTS (B2B)
// ============================================================================

export const accounts = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    legalName: varchar("legal_name", { length: 255 }),
    taxId: varchar("tax_id", { length: 100 }),
    customerGroupId: integer("customer_group_id").references(() => customerGroups.id, {
      onDelete: "set null",
    }),
    originChannelId: integer("origin_channel_id").references(() => channels.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    taxExemptCategory: varchar("tax_exempt_category", { length: 100 }),
    storeCredit: decimal("store_credit", { precision: 19, scale: 4 }).default("0"),
    acceptsMarketing: boolean("accepts_marketing").default(false),
    phone: varchar("phone", { length: 50 }),
    website: varchar("website", { length: 500 }),
    industry: varchar("industry", { length: 100 }),
    notes: text("notes"),
    attributes: jsonb("attributes").default({}),
    metafields: jsonb("metafields").default({}),
    // Net terms
    netTermsDays: integer("net_terms_days").default(0),
    creditLimit: decimal("credit_limit", { precision: 19, scale: 4 }),
    currentBalance: decimal("current_balance", { precision: 19, scale: 4 }).default("0"),
    pastDueAmount: decimal("past_due_amount", { precision: 19, scale: 4 }).default("0"),
    pastDueAction: varchar("past_due_action", { length: 30 }).default("warn"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_accounts_name").on(table.name),
    index("idx_accounts_status").on(table.status),
    index("idx_accounts_customer_group").on(table.customerGroupId),
    index("idx_accounts_channel").on(table.originChannelId),
  ]
);

export const accountRoles = pgTable("account_roles", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  permissions: jsonb("permissions").default([]),
  isSystem: boolean("is_system").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    phone: varchar("phone", { length: 50 }),
    jobTitle: varchar("job_title", { length: 100 }),
    roleId: integer("role_id").references(() => accountRoles.id, { onDelete: "set null" }),
    isPrimary: boolean("is_primary").default(false),
    isActive: boolean("is_active").default(true),
    acceptsMarketing: boolean("accepts_marketing").default(false),
    registrationIpAddress: inet("registration_ip_address"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    formFields: jsonb("form_fields").default({}),
    attributes: jsonb("attributes").default({}),
    metafields: jsonb("metafields").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("contacts_account_email").on(table.accountId, table.email),
    index("idx_contacts_email").on(table.email),
    index("idx_contacts_account").on(table.accountId),
    index("idx_contacts_role").on(table.roleId),
    index("idx_contacts_active").on(table.isActive),
    index("idx_contacts_email_active").on(table.email, table.isActive),
  ]
);

export const accountLocations = pgTable(
  "account_locations",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 50 }),
    isDefault: boolean("is_default").default(false),
    isActive: boolean("is_active").default(true),
    allowedShippingMethodIds: jsonb("allowed_shipping_method_ids").default([]),
    allowedPaymentMethods: jsonb("allowed_payment_methods").default([]),
    address1: varchar("address1", { length: 255 }),
    address2: varchar("address2", { length: 255 }),
    city: varchar("city", { length: 100 }),
    stateOrProvince: varchar("state_or_province", { length: 100 }),
    stateOrProvinceCode: varchar("state_or_province_code", { length: 10 }),
    postalCode: varchar("postal_code", { length: 20 }),
    country: varchar("country", { length: 100 }),
    countryCode: char("country_code", { length: 2 }),
    phone: varchar("phone", { length: 50 }),
    metafields: jsonb("metafields").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("account_locations_account_code").on(table.accountId, table.code),
    index("idx_account_locations_account").on(table.accountId),
  ]
);

export const contactLocationAssignments = pgTable(
  "contact_location_assignments",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    locationId: integer("location_id")
      .notNull()
      .references(() => accountLocations.id, { onDelete: "cascade" }),
    isDefault: boolean("is_default").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("contact_location_unique").on(table.contactId, table.locationId),
    index("idx_contact_location_contact").on(table.contactId),
    index("idx_contact_location_location").on(table.locationId),
  ]
);

export const accountAddresses = pgTable(
  "account_addresses",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    locationId: integer("location_id").references(() => accountLocations.id, {
      onDelete: "set null",
    }),
    label: varchar("label", { length: 100 }),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    company: varchar("company", { length: 255 }),
    address1: varchar("address1", { length: 255 }).notNull(),
    address2: varchar("address2", { length: 255 }),
    city: varchar("city", { length: 100 }).notNull(),
    stateOrProvince: varchar("state_or_province", { length: 100 }),
    stateOrProvinceCode: varchar("state_or_province_code", { length: 10 }),
    postalCode: varchar("postal_code", { length: 20 }),
    country: varchar("country", { length: 100 }).notNull(),
    countryCode: char("country_code", { length: 2 }),
    phone: varchar("phone", { length: 50 }),
    addressType: varchar("address_type", { length: 20 }).default("shipping"),
    isDefaultBilling: boolean("is_default_billing").default(false),
    isDefaultShipping: boolean("is_default_shipping").default(false),
    formFields: jsonb("form_fields").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_account_addresses_account").on(table.accountId)]
);

export const salesReps = pgTable("sales_reps", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  phone: varchar("phone", { length: 50 }),
  title: varchar("title", { length: 100 }),
  isActive: boolean("is_active").default(true),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }),
  territory: varchar("territory", { length: 255 }),
  metafields: jsonb("metafields").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const accountSalesRepAssignments = pgTable(
  "account_sales_rep_assignments",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    salesRepId: integer("sales_rep_id")
      .notNull()
      .references(() => salesReps.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").default(false),
    commissionRateOverride: decimal("commission_rate_override", { precision: 5, scale: 2 }),
    notes: text("notes"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("account_sales_rep_unique").on(table.accountId, table.salesRepId),
    index("idx_account_sales_rep_account").on(table.accountId),
    index("idx_account_sales_rep_rep").on(table.salesRepId),
  ]
);

export const approvalRules = pgTable(
  "approval_rules",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    ruleType: varchar("rule_type", { length: 30 }).notNull(),
    threshold: decimal("threshold", { precision: 19, scale: 4 }),
    appliesToRoles: jsonb("applies_to_roles").default([]),
    approverRoleId: integer("approver_role_id").references(() => accountRoles.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").default(true),
    priority: integer("priority").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_approval_rules_account").on(table.accountId)]
);

// ============================================================================
// SECTION 13: WISHLISTS
// ============================================================================

export const wishlists = pgTable("wishlists", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull().default("My Wishlist"),
  isPublic: boolean("is_public").default(false),
  shareToken: varchar("share_token", { length: 100 }).unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: serial("id").primaryKey(),
    wishlistId: integer("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: integer("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    quantity: integer("quantity").default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("wishlist_item_unique").on(table.wishlistId, table.productId, table.variantId),
  ]
);

// ============================================================================
// SECTION 13: CARTS
// ============================================================================

export const carts = pgTable(
  "carts",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    channelId: integer("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    currencyCode: char("currency_code", { length: 3 }).notNull().default("USD"),
    baseAmount: decimal("base_amount", { precision: 19, scale: 4 }).default("0"),
    discountAmount: decimal("discount_amount", { precision: 19, scale: 4 }).default("0"),
    taxAmount: decimal("tax_amount", { precision: 19, scale: 4 }).default("0"),
    cartAmount: decimal("cart_amount", { precision: 19, scale: 4 }).default("0"),
    couponCodes: text("coupon_codes").array().default([]),
    giftCertificateCodes: text("gift_certificate_codes").array().default([]),
    email: varchar("email", { length: 255 }),
    locale: varchar("locale", { length: 10 }),
    status: varchar("status", { length: 20 }).default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_carts_customer").on(table.customerId),
    index("idx_carts_channel").on(table.channelId),
    index("idx_carts_status").on(table.status),
  ]
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    cartId: integer("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: integer("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    quantity: integer("quantity").notNull().default(1),
    listPrice: decimal("list_price", { precision: 19, scale: 4 }).notNull(),
    salePrice: decimal("sale_price", { precision: 19, scale: 4 }),
    extendedListPrice: decimal("extended_list_price", { precision: 19, scale: 4 }),
    extendedSalePrice: decimal("extended_sale_price", { precision: 19, scale: 4 }),
    discountAmount: decimal("discount_amount", { precision: 19, scale: 4 }).default("0"),
    appliedCoupons: jsonb("applied_coupons").default([]),
    modifierSelections: jsonb("modifier_selections").default([]),
    giftWrappingOptionId: integer("gift_wrapping_option_id"),
    giftMessage: text("gift_message"),
    recipientEmail: varchar("recipient_email", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_cart_items_cart").on(table.cartId),
    index("idx_cart_items_product").on(table.productId),
  ]
);

// ============================================================================
// SECTION 14: ORDERS
// ============================================================================

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    channelId: integer("channel_id")
      .notNull()
      .references(() => channels.id),
    accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    salesRepId: integer("sales_rep_id").references(() => salesReps.id, { onDelete: "set null" }),
    approvalStatus: varchar("approval_status", { length: 20 }).default("none"),
    orderNumber: varchar("order_number", { length: 50 }).unique(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    paymentStatus: varchar("payment_status", { length: 50 }).default("pending"),
    currencyCode: char("currency_code", { length: 3 }).notNull().default("USD"),
    currencyExchangeRate: decimal("currency_exchange_rate", { precision: 19, scale: 10 }).default(
      "1"
    ),
    subtotalExTax: decimal("subtotal_ex_tax", { precision: 19, scale: 4 }).notNull().default("0"),
    subtotalIncTax: decimal("subtotal_inc_tax", { precision: 19, scale: 4 }).notNull().default("0"),
    shippingCostExTax: decimal("shipping_cost_ex_tax", { precision: 19, scale: 4 }).default("0"),
    shippingCostIncTax: decimal("shipping_cost_inc_tax", { precision: 19, scale: 4 }).default("0"),
    handlingCostExTax: decimal("handling_cost_ex_tax", { precision: 19, scale: 4 }).default("0"),
    handlingCostIncTax: decimal("handling_cost_inc_tax", { precision: 19, scale: 4 }).default("0"),
    wrappingCostExTax: decimal("wrapping_cost_ex_tax", { precision: 19, scale: 4 }).default("0"),
    wrappingCostIncTax: decimal("wrapping_cost_inc_tax", { precision: 19, scale: 4 }).default("0"),
    discountAmount: decimal("discount_amount", { precision: 19, scale: 4 }).default("0"),
    couponDiscount: decimal("coupon_discount", { precision: 19, scale: 4 }).default("0"),
    giftCertificateAmount: decimal("gift_certificate_amount", { precision: 19, scale: 4 }).default(
      "0"
    ),
    storeCreditAmount: decimal("store_credit_amount", { precision: 19, scale: 4 }).default("0"),
    totalExTax: decimal("total_ex_tax", { precision: 19, scale: 4 }).notNull().default("0"),
    totalIncTax: decimal("total_inc_tax", { precision: 19, scale: 4 }).notNull().default("0"),
    totalTax: decimal("total_tax", { precision: 19, scale: 4 }).default("0"),
    itemsTotal: integer("items_total").default(0),
    itemsShipped: integer("items_shipped").default(0),
    refundedAmount: decimal("refunded_amount", { precision: 19, scale: 4 }).default("0"),
    billingAddress: jsonb("billing_address").notNull(),
    customerMessage: text("customer_message"),
    staffNotes: text("staff_notes"),
    externalId: varchar("external_id", { length: 255 }),
    externalSource: varchar("external_source", { length: 100 }),
    ipAddress: inet("ip_address"),
    ipAddressV6: inet("ip_address_v6"),
    paymentMethod: varchar("payment_method", { length: 100 }),
    paymentProviderId: varchar("payment_provider_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    metafields: jsonb("metafields").default({}),
  },
  (table) => [
    index("idx_orders_channel").on(table.channelId),
    index("idx_orders_account").on(table.accountId),
    index("idx_orders_contact").on(table.contactId),
    index("idx_orders_sales_rep").on(table.salesRepId),
    index("idx_orders_status").on(table.status),
    index("idx_orders_date").on(table.createdAt),
    index("idx_orders_number").on(table.orderNumber),
    index("idx_orders_status_date").on(table.status, table.createdAt),
  ]
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: integer("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 100 }),
    quantity: integer("quantity").notNull().default(1),
    quantityShipped: integer("quantity_shipped").default(0),
    quantityRefunded: integer("quantity_refunded").default(0),
    basePrice: decimal("base_price", { precision: 19, scale: 4 }).notNull(),
    priceExTax: decimal("price_ex_tax", { precision: 19, scale: 4 }).notNull(),
    priceIncTax: decimal("price_inc_tax", { precision: 19, scale: 4 }).notNull(),
    priceTax: decimal("price_tax", { precision: 19, scale: 4 }).default("0"),
    baseTotal: decimal("base_total", { precision: 19, scale: 4 }).notNull(),
    totalExTax: decimal("total_ex_tax", { precision: 19, scale: 4 }).notNull(),
    totalIncTax: decimal("total_inc_tax", { precision: 19, scale: 4 }).notNull(),
    totalTax: decimal("total_tax", { precision: 19, scale: 4 }).default("0"),
    baseCostPrice: decimal("base_cost_price", { precision: 19, scale: 4 }),
    costPriceExTax: decimal("cost_price_ex_tax", { precision: 19, scale: 4 }),
    costPriceIncTax: decimal("cost_price_inc_tax", { precision: 19, scale: 4 }),
    costPriceTax: decimal("cost_price_tax", { precision: 19, scale: 4 }),
    discountAmount: decimal("discount_amount", { precision: 19, scale: 4 }).default("0"),
    couponAmount: decimal("coupon_amount", { precision: 19, scale: 4 }).default("0"),
    weight: decimal("weight", { precision: 10, scale: 4 }),
    type: varchar("type", { length: 20 }).default("physical"),
    downloadUrl: varchar("download_url", { length: 500 }),
    downloadExpiry: timestamp("download_expiry", { withTimezone: true }),
    downloadCount: integer("download_count").default(0),
    downloadLimit: integer("download_limit"),
    giftCertificateId: integer("gift_certificate_id"),
    productOptions: jsonb("product_options").default([]),
    wrappingId: integer("wrapping_id"),
    wrappingName: varchar("wrapping_name", { length: 255 }),
    wrappingMessage: text("wrapping_message"),
    wrappingCostExTax: decimal("wrapping_cost_ex_tax", { precision: 19, scale: 4 }),
    wrappingCostIncTax: decimal("wrapping_cost_inc_tax", { precision: 19, scale: 4 }),
    isRefunded: boolean("is_refunded").default(false),
    refundAmount: decimal("refund_amount", { precision: 19, scale: 4 }).default("0"),
    externalId: varchar("external_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_order_items_order").on(table.orderId),
    index("idx_order_items_product").on(table.productId),
  ]
);

export const orderShippingAddresses = pgTable(
  "order_shipping_addresses",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    company: varchar("company", { length: 255 }),
    address1: varchar("address1", { length: 255 }).notNull(),
    address2: varchar("address2", { length: 255 }),
    city: varchar("city", { length: 100 }).notNull(),
    stateOrProvince: varchar("state_or_province", { length: 100 }),
    stateOrProvinceCode: varchar("state_or_province_code", { length: 10 }),
    postalCode: varchar("postal_code", { length: 20 }),
    country: varchar("country", { length: 100 }).notNull(),
    countryCode: char("country_code", { length: 2 }),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 255 }),
    shippingMethod: varchar("shipping_method", { length: 255 }),
    shippingZoneId: integer("shipping_zone_id"),
    shippingZoneName: varchar("shipping_zone_name", { length: 255 }),
    baseCost: decimal("base_cost", { precision: 19, scale: 4 }),
    costExTax: decimal("cost_ex_tax", { precision: 19, scale: 4 }),
    costIncTax: decimal("cost_inc_tax", { precision: 19, scale: 4 }),
    costTax: decimal("cost_tax", { precision: 19, scale: 4 }),
    baseHandlingCost: decimal("base_handling_cost", { precision: 19, scale: 4 }),
    handlingCostExTax: decimal("handling_cost_ex_tax", { precision: 19, scale: 4 }),
    handlingCostIncTax: decimal("handling_cost_inc_tax", { precision: 19, scale: 4 }),
    handlingCostTax: decimal("handling_cost_tax", { precision: 19, scale: 4 }),
    itemsTotal: integer("items_total").default(0),
    itemsShipped: integer("items_shipped").default(0),
    formFields: jsonb("form_fields").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_order_shipping_order").on(table.orderId)]
);

export const shipments = pgTable(
  "shipments",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderShippingAddressId: integer("order_shipping_address_id").references(
      () => orderShippingAddresses.id,
      { onDelete: "set null" }
    ),
    trackingNumber: varchar("tracking_number", { length: 255 }),
    trackingCarrier: varchar("tracking_carrier", { length: 100 }),
    trackingUrl: varchar("tracking_url", { length: 500 }),
    shippingMethod: varchar("shipping_method", { length: 255 }),
    shippingProvider: varchar("shipping_provider", { length: 255 }),
    comments: text("comments"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
  },
  (table) => [index("idx_shipments_order").on(table.orderId)]
);

export const shipmentItems = pgTable("shipment_items", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id")
    .notNull()
    .references(() => shipments.id, { onDelete: "cascade" }),
  orderItemId: integer("order_item_id")
    .notNull()
    .references(() => orderItems.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// SECTION 15: ORDER TRANSACTIONS & REFUNDS
// ============================================================================

export const orderTransactions = pgTable(
  "order_transactions",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    event: varchar("event", { length: 50 }).notNull(),
    method: varchar("method", { length: 50 }),
    amount: decimal("amount", { precision: 19, scale: 4 }).notNull(),
    currencyCode: char("currency_code", { length: 3 }).notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    gateway: varchar("gateway", { length: 100 }),
    gatewayTransactionId: varchar("gateway_transaction_id", { length: 255 }),
    fraudReview: boolean("fraud_review").default(false),
    avsResult: jsonb("avs_result"),
    cvvResult: jsonb("cvv_result"),
    gatewayResponse: jsonb("gateway_response"),
    referenceTransactionId: integer("reference_transaction_id"),
    offlineReason: varchar("offline_reason", { length: 50 }),
    customProviderField: text("custom_provider_field"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_transactions_order").on(table.orderId),
    index("idx_transactions_gateway").on(table.gatewayTransactionId),
  ]
);

export const orderRefunds = pgTable("order_refunds", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  reason: text("reason"),
  totalAmount: decimal("total_amount", { precision: 19, scale: 4 }).notNull(),
  taxAdjustmentAmount: decimal("tax_adjustment_amount", { precision: 19, scale: 4 }).default("0"),
  createdByUserId: integer("created_by_user_id"),
  transactionId: integer("transaction_id").references(() => orderTransactions.id),
  paymentMethod: varchar("payment_method", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const orderRefundItems = pgTable("order_refund_items", {
  id: serial("id").primaryKey(),
  refundId: integer("refund_id")
    .notNull()
    .references(() => orderRefunds.id, { onDelete: "cascade" }),
  orderItemId: integer("order_item_id")
    .notNull()
    .references(() => orderItems.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  itemType: varchar("item_type", { length: 50 }),
  requestedAmount: decimal("requested_amount", { precision: 19, scale: 4 }),
  reason: text("reason"),
});

// ============================================================================
// SECTION 16: COUPONS & PROMOTIONS
// ============================================================================

export const promotions = pgTable(
  "promotions",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    redemptionType: varchar("redemption_type", { length: 20 }).notNull().default("automatic"),
    channelIds: integer("channel_ids").array().default([]),
    customerGroupIds: integer("customer_group_ids").array().default([]),
    priority: integer("priority").default(0),
    status: varchar("status", { length: 20 }).notNull().default("enabled"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    maxUses: integer("max_uses"),
    currentUses: integer("current_uses").default(0),
    stop: boolean("stop").default(false),
    canBeCombined: boolean("can_be_combined").default(true),
    rules: jsonb("rules").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_promotions_status").on(table.status),
    index("idx_promotions_dates").on(table.startDate, table.endDate),
  ]
);

export const coupons = pgTable(
  "coupons",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    promotionId: integer("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 100 }).notNull().unique(),
    maxUses: integer("max_uses"),
    maxUsesPerCustomer: integer("max_uses_per_customer"),
    currentUses: integer("current_uses").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_coupons_code").on(table.code),
    index("idx_coupons_promotion").on(table.promotionId),
  ]
);

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id")
    .notNull()
    .references(() => coupons.id, { onDelete: "cascade" }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  discountAmount: decimal("discount_amount", { precision: 19, scale: 4 }).notNull(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// SECTION 17: GIFT CERTIFICATES
// ============================================================================

export const giftCertificates = pgTable(
  "gift_certificates",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    code: varchar("code", { length: 100 }).notNull().unique(),
    originalBalance: decimal("original_balance", { precision: 19, scale: 4 }).notNull(),
    balance: decimal("balance", { precision: 19, scale: 4 }).notNull(),
    currencyCode: char("currency_code", { length: 3 }).notNull().default("USD"),
    toName: varchar("to_name", { length: 255 }),
    toEmail: varchar("to_email", { length: 255 }),
    fromName: varchar("from_name", { length: 255 }),
    fromEmail: varchar("from_email", { length: 255 }),
    message: text("message"),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    template: varchar("template", { length: 100 }).default("default"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    expiryDate: date("expiry_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_gift_certificates_code").on(table.code),
    index("idx_gift_certificates_email").on(table.toEmail),
  ]
);

// ============================================================================
// SECTION 18: SHIPPING ZONES & METHODS
// ============================================================================

export const shippingZones = pgTable("shipping_zones", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).default("country"),
  locations: jsonb("locations").notNull().default([]),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const shippingMethods = pgTable("shipping_methods", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  shippingZoneId: integer("shipping_zone_id")
    .notNull()
    .references(() => shippingZones.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  displayName: varchar("display_name", { length: 255 }),
  fixedCost: decimal("fixed_cost", { precision: 19, scale: 4 }),
  ratePerItem: decimal("rate_per_item", { precision: 19, scale: 4 }),
  ratePerWeight: decimal("rate_per_weight", { precision: 19, scale: 4 }),
  rateRanges: jsonb("rate_ranges").default([]),
  carrier: varchar("carrier", { length: 100 }),
  carrierServiceCode: varchar("carrier_service_code", { length: 100 }),
  carrierOptions: jsonb("carrier_options").default({}),
  handlingFee: decimal("handling_fee", { precision: 19, scale: 4 }),
  handlingFeeType: varchar("handling_fee_type", { length: 20 }),
  enabled: boolean("enabled").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// SECTION 19: ORDER & PAYMENT STATUSES
// ============================================================================

export const orderStatuses = pgTable("order_statuses", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  value: varchar("value", { length: 50 }).unique().notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 100 }).notNull().default("bg-zinc-100 text-zinc-600"),
  sortOrder: integer("sort_order").notNull().default(0),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const paymentStatuses = pgTable("payment_statuses", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  value: varchar("value", { length: 50 }).unique().notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 100 }).notNull().default("bg-zinc-100 text-zinc-600"),
  sortOrder: integer("sort_order").notNull().default(0),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// SECTION 20: TAX CLASSES & SETTINGS
// ============================================================================

export const taxClasses = pgTable("tax_classes", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const taxRates = pgTable("tax_rates", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  taxClassId: integer("tax_class_id")
    .notNull()
    .references(() => taxClasses.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  countryCode: char("country_code", { length: 2 }),
  stateCode: varchar("state_code", { length: 10 }),
  postalCodes: text("postal_codes").array(),
  rate: decimal("rate", { precision: 8, scale: 4 }).notNull(),
  priority: integer("priority").default(0),
  isCompound: boolean("is_compound").default(false),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// SECTION 20: REVIEWS
// ============================================================================

export const productReviews = pgTable(
  "product_reviews",
  {
    id: serial("id").primaryKey(),
    uuid: uuid("uuid").defaultRandom().unique().notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }),
    text: text("text"),
    rating: integer("rating").notNull(),
    authorName: varchar("author_name", { length: 255 }),
    authorEmail: varchar("author_email", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_reviews_product").on(table.productId),
    index("idx_reviews_customer").on(table.customerId),
    index("idx_reviews_status").on(table.status),
  ]
);

// ============================================================================
// SECTION 21: INVENTORY LOCATIONS
// ============================================================================

export const inventoryLocations = pgTable("inventory_locations", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).unique(),
  type: varchar("type", { length: 50 }).default("warehouse"),
  address: jsonb("address"),
  isActive: boolean("is_active").default(true),
  isShippingEnabled: boolean("is_shipping_enabled").default(true),
  isPickupEnabled: boolean("is_pickup_enabled").default(false),
  fulfillmentPriority: integer("fulfillment_priority").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const inventoryLevels = pgTable(
  "inventory_levels",
  {
    id: serial("id").primaryKey(),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    locationId: integer("location_id")
      .notNull()
      .references(() => inventoryLocations.id, { onDelete: "cascade" }),
    available: integer("available").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    incoming: integer("incoming").notNull().default(0),
    warningLevel: integer("warning_level").default(0),
    binLocation: varchar("bin_location", { length: 100 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("inventory_variant_location").on(table.variantId, table.locationId),
    index("idx_inventory_variant").on(table.variantId),
    index("idx_inventory_location").on(table.locationId),
  ]
);

// ============================================================================
// SECTION 22: WEBHOOKS & EVENTS
// ============================================================================

export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  scope: varchar("scope", { length: 100 }).notNull(),
  destinationUrl: varchar("destination_url", { length: 500 }).notNull(),
  isActive: boolean("is_active").default(true),
  headers: jsonb("headers").default({}),
  channelId: integer("channel_id").references(() => channels.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: serial("id").primaryKey(),
    webhookId: integer("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 100 }).notNull(),
    payload: jsonb("payload").notNull(),
    responseCode: integer("response_code"),
    responseBody: text("response_body"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    attempts: integer("attempts").default(0),
    maxAttempts: integer("max_attempts").default(5),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_webhook_events_status").on(table.status),
    index("idx_webhook_events_webhook").on(table.webhookId),
  ]
);

// ============================================================================
// SECTION 23: STORE SETTINGS
// ============================================================================

export const storeSettings = pgTable("store_settings", {
  id: serial("id").primaryKey(),
  settingKey: varchar("setting_key", { length: 100 }).notNull().unique(),
  settingValue: jsonb("setting_value").notNull(),
  description: text("description"),
  isSensitive: boolean("is_sensitive").default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// SECTION 24: ADMIN USERS (DEPRECATED)
// ============================================================================
// DEPRECATED: admin_users is no longer used by the application.
// Portal users are managed via the app DB (users + memberships tables).
// This table is retained only because audit_log has a FK to admin_user_id.

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  uuid: uuid("uuid").defaultRandom().unique().notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  role: varchar("role", { length: 50 }).notNull().default("staff"),
  permissions: jsonb("permissions").default({}),
  channelIds: integer("channel_ids").array(),
  isActive: boolean("is_active").default(true),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  twoFactorSecret: varchar("two_factor_secret", { length: 255 }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// SECTION 25: AUDIT LOG
// ============================================================================

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    adminUserId: integer("admin_user_id").references(() => adminUsers.id, {
      onDelete: "set null",
    }),
    customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
    accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: integer("entity_id"),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_audit_entity").on(table.entityType, table.entityId),
    index("idx_audit_date").on(table.createdAt),
    index("idx_audit_user").on(table.adminUserId),
  ]
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type CategoryTree = typeof categoryTrees.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type ProductOption = typeof productOptions.$inferSelect;
export type ProductOptionValue = typeof productOptionValues.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type CustomerGroup = typeof customerGroups.$inferSelect;
export type CustomerAddress = typeof customerAddresses.$inferSelect;
export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderShippingAddress = typeof orderShippingAddresses.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;
export type OrderTransaction = typeof orderTransactions.$inferSelect;
export type OrderRefund = typeof orderRefunds.$inferSelect;
export type Promotion = typeof promotions.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type GiftCertificate = typeof giftCertificates.$inferSelect;
export type ShippingZone = typeof shippingZones.$inferSelect;
export type ShippingMethod = typeof shippingMethods.$inferSelect;
export type TaxClass = typeof taxClasses.$inferSelect;
export type TaxRate = typeof taxRates.$inferSelect;
export type ProductReview = typeof productReviews.$inferSelect;
export type InventoryLocation = typeof inventoryLocations.$inferSelect;
export type InventoryLevel = typeof inventoryLevels.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type StoreSetting = typeof storeSettings.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type Wishlist = typeof wishlists.$inferSelect;
export type WishlistItem = typeof wishlistItems.$inferSelect;
export type PriceList = typeof priceLists.$inferSelect;
export type PriceListRecord = typeof priceListRecords.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type AccountRole = typeof accountRoles.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type AccountLocation = typeof accountLocations.$inferSelect;
export type ContactLocationAssignment = typeof contactLocationAssignments.$inferSelect;
export type AccountAddress = typeof accountAddresses.$inferSelect;
export type SalesRep = typeof salesReps.$inferSelect;
export type AccountSalesRepAssignment = typeof accountSalesRepAssignments.$inferSelect;
export type ApprovalRule = typeof approvalRules.$inferSelect;
export type OrderStatus = typeof orderStatuses.$inferSelect;
export type NewOrderStatus = typeof orderStatuses.$inferInsert;
export type PaymentStatus = typeof paymentStatuses.$inferSelect;
export type NewPaymentStatus = typeof paymentStatuses.$inferInsert;
