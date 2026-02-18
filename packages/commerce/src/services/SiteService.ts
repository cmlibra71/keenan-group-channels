import { eq } from "drizzle-orm";
import { PgColumn } from "drizzle-orm/pg-core";
import { channels, sites } from "../schema";
import { NestedService } from "../base/NestedService";
import { UniqueConstraint } from "../base/types";

class SiteServiceClass extends NestedService<typeof channels, typeof sites> {
  constructor() {
    super(channels, sites, {
      resourceName: "Site",
      parentResourceName: "Channel",
      defaultSort: "id",
      sortColumns: {
        id: sites.id,
        url: sites.url,
        created_at: sites.createdAt,
        updated_at: sites.updatedAt,
      },
      filterColumns: {
        is_primary: sites.isPrimary,
        ssl_enabled: sites.sslEnabled,
      },
      allowedFilters: ["is_primary", "ssl_enabled"],
      timestamps: { created: "createdAt", updated: "updatedAt" },
    });
  }

  protected getParentIdColumn(): PgColumn { return channels.id; }
  protected getParentForeignKey(): PgColumn { return sites.channelId; }
  protected getParentForeignKeyFieldName(): string { return "channelId"; }

  protected getUniqueConstraints(): UniqueConstraint[] {
    return [
      {
        columns: [
          { column: sites.channelId, fieldName: "channelId" },
          { column: sites.url, fieldName: "url" },
        ],
        message: "Site with this URL already exists for this channel.",
        composite: true,
      },
    ];
  }

  protected async beforeCreate(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (data.isPrimary) {
      const channelId = data.channelId as number;
      await this.db.update(sites).set({ isPrimary: false }).where(eq(sites.channelId, channelId));
    }
    return data;
  }

  protected async beforeUpdate(
    data: Record<string, unknown>,
    existing: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (data.isPrimary === true) {
      const channelId = existing.channelId as number;
      await this.db.update(sites).set({ isPrimary: false }).where(eq(sites.channelId, channelId));
    }
    return data;
  }
}

export const siteService = new SiteServiceClass();
