import { eq } from "drizzle-orm";
import { channels, productChannelAssignments, sites } from "../schema";
import { BaseService } from "../base/BaseService";
import { DependencyCheck, IncludeConfig } from "../base/types";

class ChannelServiceClass extends BaseService<typeof channels> {
  constructor() {
    super(channels, {
      resourceName: "Channel",
      defaultSort: "id",
      sortColumns: {
        id: channels.id,
        name: channels.name,
        created_at: channels.createdAt,
        updated_at: channels.updatedAt,
      },
      filterColumns: {
        status: channels.status,
        type: channels.type,
        is_default: channels.isDefault,
        name: channels.name,
      },
      allowedFilters: ["status", "type", "is_default", "name"],
      timestamps: { created: "createdAt", updated: "updatedAt" },
    });
  }

  protected getDependencyChecks(): DependencyCheck[] {
    return [
      {
        table: productChannelAssignments,
        foreignKeyColumn: productChannelAssignments.channelId,
        resourceName: "product assignment",
        message: "Cannot delete channel because it has {count} product(s) assigned.",
      },
    ];
  }

  protected getIncludeConfigs(): IncludeConfig[] {
    return [
      { name: "sites", table: sites, foreignKey: sites.channelId },
    ];
  }

  protected async beforeCreate(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (data.isDefault) {
      await this.db.update(channels).set({ isDefault: false }).where(eq(channels.isDefault, true));
    }
    return data;
  }

  protected async beforeUpdate(
    data: Record<string, unknown>,
    _existing: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (data.isDefault === true) {
      await this.db.update(channels).set({ isDefault: false }).where(eq(channels.isDefault, true));
    }
    return data;
  }
}

export const channelService = new ChannelServiceClass();
