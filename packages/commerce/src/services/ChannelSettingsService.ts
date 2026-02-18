import { eq, and, sql, asc, desc } from "drizzle-orm";
import { getCommerceDb } from "../db";
import { channels, channelSettings } from "../schema";
import { NotFoundError, BadRequestError } from "../errors";
import { transformRow, transformRows } from "../transforms";
import { ListOptions, PaginatedResult } from "../base/types";

class ChannelSettingsServiceClass {
  protected get db() {
    return getCommerceDb();
  }

  async listForChannel(
    channelId: number,
    options: ListOptions
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const { page, limit, direction } = options;
    await this.validateChannel(channelId);

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(channelSettings)
      .where(eq(channelSettings.channelId, channelId));

    const total = countResult?.count ?? 0;

    const results = await this.db
      .select()
      .from(channelSettings)
      .where(eq(channelSettings.channelId, channelId))
      .orderBy(direction === "desc" ? desc(channelSettings.settingKey) : asc(channelSettings.settingKey))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      data: transformRows(results as Record<string, unknown>[]),
      pagination: { page, limit, total },
    };
  }

  async getByKey(channelId: number, key: string): Promise<Record<string, unknown>> {
    if (!key) throw new BadRequestError("Setting key is required.");
    await this.validateChannel(channelId);

    const [result] = await this.db
      .select()
      .from(channelSettings)
      .where(and(eq(channelSettings.channelId, channelId), eq(channelSettings.settingKey, key)))
      .limit(1);

    if (!result) throw new NotFoundError("Channel Setting", key);
    return transformRow(result as Record<string, unknown>);
  }

  async upsert(channelId: number, key: string, value: unknown): Promise<Record<string, unknown>> {
    if (!key) throw new BadRequestError("Setting key is required.");
    await this.validateChannel(channelId);

    const [existing] = await this.db
      .select({ id: channelSettings.id })
      .from(channelSettings)
      .where(and(eq(channelSettings.channelId, channelId), eq(channelSettings.settingKey, key)))
      .limit(1);

    let result;
    if (existing) {
      [result] = await this.db
        .update(channelSettings)
        .set({ settingValue: value, updatedAt: new Date() })
        .where(eq(channelSettings.id, existing.id))
        .returning();
    } else {
      [result] = await this.db
        .insert(channelSettings)
        .values({ channelId, settingKey: key, settingValue: value })
        .returning();
    }

    return transformRow(result as Record<string, unknown>);
  }

  async deleteByKey(channelId: number, key: string): Promise<void> {
    if (!key) throw new BadRequestError("Setting key is required.");

    const [setting] = await this.db
      .select({ id: channelSettings.id })
      .from(channelSettings)
      .where(and(eq(channelSettings.channelId, channelId), eq(channelSettings.settingKey, key)))
      .limit(1);

    if (!setting) throw new NotFoundError("Channel Setting", key);
    await this.db.delete(channelSettings).where(eq(channelSettings.id, setting.id));
  }

  private async validateChannel(channelId: number): Promise<void> {
    const [channel] = await this.db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);

    if (!channel) throw new NotFoundError("Channel", channelId);
  }
}

export const channelSettingsService = new ChannelSettingsServiceClass();
