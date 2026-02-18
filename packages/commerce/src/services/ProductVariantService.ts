import { PgColumn } from "drizzle-orm/pg-core";
import { products, productVariants, inventoryLevels, priceListRecords } from "../schema";
import { NestedService } from "../base/NestedService";
import { UniqueConstraint, DependencyCheck } from "../base/types";

class ProductVariantServiceClass extends NestedService<typeof products, typeof productVariants> {
  constructor() {
    super(products, productVariants, {
      resourceName: "Variant",
      parentResourceName: "Product",
      defaultSort: "id",
      sortColumns: {
        id: productVariants.id,
        sku: productVariants.sku,
        sort_order: productVariants.sortOrder,
        created_at: productVariants.createdAt,
      },
      filterColumns: {
        sku: productVariants.sku,
        purchasing_disabled: productVariants.purchasingDisabled,
      },
      allowedFilters: ["sku", "purchasing_disabled"],
      timestamps: { created: "createdAt", updated: "updatedAt" },
    });
  }

  protected getParentIdColumn(): PgColumn { return products.id; }
  protected getParentForeignKey(): PgColumn { return productVariants.productId; }
  protected getParentForeignKeyFieldName(): string { return "productId"; }

  protected getUniqueConstraints(): UniqueConstraint[] {
    return [
      { columns: [{ column: productVariants.sku, fieldName: "sku" }], message: "Variant SKU is already in use." },
    ];
  }

  protected getDependencyChecks(): DependencyCheck[] {
    return [
      { table: inventoryLevels, foreignKeyColumn: inventoryLevels.variantId, resourceName: "inventory level", message: "Cannot delete variant because it has {count} inventory level(s)." },
      { table: priceListRecords, foreignKeyColumn: priceListRecords.variantId, resourceName: "price list record", message: "Cannot delete variant because it has {count} price list record(s)." },
    ];
  }
}

export const productVariantService = new ProductVariantServiceClass();
