import { brands, products } from "../schema";
import { BaseService } from "../base/BaseService";
import { UniqueConstraint, DependencyCheck } from "../base/types";

class BrandServiceClass extends BaseService<typeof brands> {
  constructor() {
    super(brands, {
      resourceName: "Brand",
      defaultSort: "id",
      sortColumns: {
        id: brands.id,
        name: brands.name,
        created_at: brands.createdAt,
      },
      filterColumns: { name: brands.name },
      allowedFilters: ["name"],
      timestamps: { created: "createdAt", updated: "updatedAt" },
    });
  }

  protected getUniqueConstraints(): UniqueConstraint[] {
    return [
      { columns: [{ column: brands.name, fieldName: "name" }], message: "Brand name already exists." },
      { columns: [{ column: brands.slug, fieldName: "slug" }], message: "Brand slug already exists." },
    ];
  }

  protected getDependencyChecks(): DependencyCheck[] {
    return [
      {
        table: products,
        foreignKeyColumn: products.brandId,
        resourceName: "product",
        message: "Cannot delete brand because it has {count} product(s) associated with it.",
      },
    ];
  }
}

export const brandService = new BrandServiceClass();
