import { categories, categoryTrees, productCategories } from "../schema";
import { BaseService } from "../base/BaseService";
import { ForeignKeyValidation, UniqueConstraint, DependencyCheck } from "../base/types";

class CategoryServiceClass extends BaseService<typeof categories> {
  constructor() {
    super(categories, {
      resourceName: "Category",
      defaultSort: "id",
      sortColumns: {
        id: categories.id,
        name: categories.name,
        sort_order: categories.sortOrder,
        created_at: categories.createdAt,
      },
      filterColumns: {
        tree_id: categories.treeId,
        parent_id: categories.parentId,
        is_visible: categories.isVisible,
        name: categories.name,
      },
      allowedFilters: ["tree_id", "parent_id", "is_visible", "name"],
      timestamps: { created: "createdAt", updated: "updatedAt" },
    });
  }

  protected getForeignKeyValidations(): ForeignKeyValidation[] {
    return [
      { table: categoryTrees, column: categoryTrees.id, resourceName: "Category Tree", fieldName: "treeId" },
      { table: categories, column: categories.id, resourceName: "Parent Category", fieldName: "parentId", optional: true },
    ];
  }

  protected getUniqueConstraints(): UniqueConstraint[] {
    return [
      {
        columns: [
          { column: categories.treeId, fieldName: "treeId" },
          { column: categories.slug, fieldName: "slug" },
        ],
        message: "Category slug already exists in this tree.",
        composite: true,
      },
    ];
  }

  protected getDependencyChecks(): DependencyCheck[] {
    return [
      { table: categories, foreignKeyColumn: categories.parentId, resourceName: "child category", message: "Cannot delete category because it has {count} child category(s)." },
      { table: productCategories, foreignKeyColumn: productCategories.categoryId, resourceName: "product assignment", message: "Cannot delete category because it has {count} product(s) assigned." },
    ];
  }
}

export const categoryService = new CategoryServiceClass();
