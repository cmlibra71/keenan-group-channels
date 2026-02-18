import { eq, and, sql, asc, desc } from "drizzle-orm";
import { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { NotFoundError } from "../errors";
import { transformRow, transformRows } from "../transforms";
import { BaseService } from "./BaseService";
import { NestedServiceConfig, ListOptions, PaginatedResult } from "./types";

/**
 * Abstract nested service for resources that belong to a parent resource.
 * Examples: Sites belong to Channels, Variants belong to Products.
 */
export abstract class NestedService<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TParentTable extends PgTable<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TTable extends PgTable<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TSelect = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TInsert = any
> extends BaseService<TTable, TSelect, TInsert> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected parentTable: any;
  protected parentConfig: NestedServiceConfig;

  constructor(parentTable: TParentTable, table: TTable, config: NestedServiceConfig) {
    super(table, config);
    this.parentTable = parentTable;
    this.parentConfig = config;
  }

  async listForParent(
    parentId: number,
    options: ListOptions
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const { page, limit, sort, direction, filters, includes } = options;
    await this.validateParent(parentId);

    let whereConditions = and(
      eq(this.getParentForeignKey(), parentId),
      this.buildFilterConditions(filters || {})
    );

    if (this.config.softDelete) {
      whereConditions = and(
        whereConditions,
        eq(this.config.softDelete.column, !this.config.softDelete.deletedValue)
      );
    }

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(this.table)
      .where(whereConditions);

    const total = countResult?.count ?? 0;
    const sortColumn = this.getSortColumn(sort);

    const results = await this.db
      .select()
      .from(this.table)
      .where(whereConditions)
      .orderBy(direction === "desc" ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset((page - 1) * limit);

    let data = transformRows(results as Record<string, unknown>[]);

    if (includes && includes.length > 0) {
      data = await this.includeRelatedData(data, results, includes);
    }

    return { data, pagination: { page, limit, total } };
  }

  async getByIdForParent(
    parentId: number,
    id: number,
    includes?: string[]
  ): Promise<Record<string, unknown>> {
    let whereConditions = and(
      eq(this.getIdColumn(), id),
      eq(this.getParentForeignKey(), parentId)
    );

    if (this.config.softDelete) {
      whereConditions = and(
        whereConditions,
        eq(this.config.softDelete.column, !this.config.softDelete.deletedValue)
      );
    }

    const [result] = await this.db
      .select()
      .from(this.table)
      .where(whereConditions)
      .limit(1);

    if (!result) {
      throw new NotFoundError(this.config.resourceName, id);
    }

    let data = transformRow(result as Record<string, unknown>);

    if (includes && includes.length > 0) {
      const [dataWithIncludes] = await this.includeRelatedData([data], [result], includes);
      data = dataWithIncludes;
    }

    return data;
  }

  async createForParent(
    parentId: number,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    await this.validateParent(parentId);
    const transformedData = this.transformInputData(data);
    transformedData[this.getParentForeignKeyFieldName()] = parentId;
    await this.validateForeignKeys(transformedData);
    await this.validateUniqueConstraints(transformedData);
    const finalData = await this.beforeCreate(transformedData);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [result] = await this.db
      .insert(this.table)
      .values(finalData as any)
      .returning();

    await this.afterCreate(result as Record<string, unknown>);
    return transformRow(result as Record<string, unknown>);
  }

  async updateForParent(
    parentId: number,
    id: number,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    await this.validateBelongsToParent(parentId, id);
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError(this.config.resourceName, id);

    const transformedData = this.transformInputData(data);
    transformedData[this.getParentForeignKeyFieldName()] = parentId;
    await this.validateForeignKeys(transformedData);
    await this.validateUniqueConstraints(transformedData, id);
    const finalData = await this.beforeUpdate(transformedData, existing as Record<string, unknown>);

    if (this.config.timestamps?.updated) {
      finalData[this.config.timestamps.updated] = new Date();
    }

    delete finalData[this.getParentForeignKeyFieldName()];

    const [result] = await this.db
      .update(this.table)
      .set(finalData)
      .where(eq(this.getIdColumn(), id))
      .returning();

    await this.afterUpdate(result as Record<string, unknown>, existing as Record<string, unknown>);
    return transformRow(result as Record<string, unknown>);
  }

  async deleteForParent(parentId: number, id: number): Promise<void> {
    await this.validateBelongsToParent(parentId, id);
    return this.delete(id);
  }

  protected async validateParent(parentId: number): Promise<void> {
    const [parent] = await this.db
      .select({ id: this.getParentIdColumn() })
      .from(this.parentTable)
      .where(eq(this.getParentIdColumn(), parentId))
      .limit(1);

    if (!parent) {
      throw new NotFoundError(this.parentConfig.parentResourceName, parentId);
    }
  }

  protected async validateBelongsToParent(parentId: number, childId: number): Promise<void> {
    const [child] = await this.db
      .select({ id: this.getIdColumn() })
      .from(this.table)
      .where(and(eq(this.getIdColumn(), childId), eq(this.getParentForeignKey(), parentId)))
      .limit(1);

    if (!child) {
      throw new NotFoundError(this.config.resourceName, childId);
    }
  }

  protected async findByIdForParent(parentId: number, id: number): Promise<TSelect | null> {
    const [result] = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.getIdColumn(), id), eq(this.getParentForeignKey(), parentId)))
      .limit(1);
    return (result as TSelect) || null;
  }

  protected abstract getParentIdColumn(): PgColumn;
  protected abstract getParentForeignKey(): PgColumn;
  protected abstract getParentForeignKeyFieldName(): string;
}
