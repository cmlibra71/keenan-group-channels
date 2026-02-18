import { eq } from "drizzle-orm";
import { PgColumn } from "drizzle-orm/pg-core";
import { products, productImages } from "../schema";
import { NestedService } from "../base/NestedService";

class ProductImageServiceClass extends NestedService<typeof products, typeof productImages> {
  constructor() {
    super(products, productImages, {
      resourceName: "Image",
      parentResourceName: "Product",
      defaultSort: "sort_order",
      sortColumns: {
        id: productImages.id,
        sort_order: productImages.sortOrder,
        created_at: productImages.createdAt,
      },
      filterColumns: { is_thumbnail: productImages.isThumbnail },
      allowedFilters: ["is_thumbnail"],
      timestamps: { created: "createdAt", updated: "updatedAt" },
    });
  }

  protected getParentIdColumn(): PgColumn { return products.id; }
  protected getParentForeignKey(): PgColumn { return productImages.productId; }
  protected getParentForeignKeyFieldName(): string { return "productId"; }

  protected async beforeCreate(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (data.isThumbnail) {
      const productId = data.productId as number;
      await this.db.update(productImages).set({ isThumbnail: false }).where(eq(productImages.productId, productId));
    }
    return data;
  }

  protected async beforeUpdate(data: Record<string, unknown>, existing: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (data.isThumbnail === true) {
      const productId = existing.productId as number;
      await this.db.update(productImages).set({ isThumbnail: false }).where(eq(productImages.productId, productId));
    }
    return data;
  }
}

export const productImageService = new ProductImageServiceClass();
