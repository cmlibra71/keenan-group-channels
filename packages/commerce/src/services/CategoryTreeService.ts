import { categoryTrees, categories, channels } from "../schema";
import { BaseService } from "../base/BaseService";
import { ForeignKeyValidation, DependencyCheck } from "../base/types";

class CategoryTreeServiceClass extends BaseService<typeof categoryTrees> {
  constructor() {
    super(categoryTrees, {
      resourceName: "Category Tree",
      defaultSort: "id",
      sortColumns: {
        id: categoryTrees.id,
        name: categoryTrees.name,
        created_at: categoryTrees.createdAt,
      },
      filterColumns: {
        name: categoryTrees.name,
        channel_id: categoryTrees.channelId,
      },
      allowedFilters: ["name", "channel_id"],
      timestamps: { created: "createdAt", updated: "updatedAt" },
    });
  }

  protected getForeignKeyValidations(): ForeignKeyValidation[] {
    return [
      { table: channels, column: channels.id, resourceName: "Channel", fieldName: "channelId", optional: true },
    ];
  }

  protected getDependencyChecks(): DependencyCheck[] {
    return [
      { table: categories, foreignKeyColumn: categories.treeId, resourceName: "category", message: "Cannot delete category tree because it has {count} category(s)." },
    ];
  }
}

export const categoryTreeService = new CategoryTreeServiceClass();
