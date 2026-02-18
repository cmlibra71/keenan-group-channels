import { eq, and, sql, asc, desc, gte, lte, like, inArray, SQL, ne, getTableColumns } from "drizzle-orm";
import { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { getCommerceDb } from "../db";
import { NotFoundError, ValidationError, ConflictError } from "../errors";
import { transformRow, transformRows } from "../transforms";
import {
  ServiceConfig,
  ListOptions,
  PaginatedResult,
  FilterValue,
  ForeignKeyValidation,
  UniqueConstraint,
  DependencyCheck,
  IncludeConfig,
} from "./types";

/**
 * Abstract base service providing CRUD operations for commerce resources.
 * Framework-agnostic - works in any Next.js app that imports @keenan/commerce.
 */
export abstract class BaseService<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TTable extends PgTable<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TSelect = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TInsert = any
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected table: any;
  protected config: ServiceConfig;

  protected get db() {
    return getCommerceDb();
  }

  constructor(table: TTable, config: ServiceConfig) {
    this.table = table;
    this.config = {
      defaultSort: "id",
      timestamps: { created: "createdAt", updated: "updatedAt" },
      ...config,
    };
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  async list(options: ListOptions): Promise<PaginatedResult<Record<string, unknown>>> {
    const { page, limit, sort, direction, filters, includes } = options;

    let whereConditions = this.buildFilterConditions(filters || {});

    if (this.config.softDelete) {
      const notDeletedCondition = eq(
        this.config.softDelete.column,
        !this.config.softDelete.deletedValue
      );
      whereConditions = whereConditions
        ? and(whereConditions, notDeletedCondition)
        : notDeletedCondition;
    }

    const sortColumn = this.getSortColumn(sort);

    const resultsWithCount = await this.db
      .select({
        ...getTableColumns(this.table),
        _total: sql<number>`count(*) over()::int`.as("_total"),
      })
      .from(this.table)
      .where(whereConditions)
      .orderBy(direction === "desc" ? desc(sortColumn) : asc(sortColumn))
      .limit(limit)
      .offset((page - 1) * limit);

    const total = resultsWithCount[0]?._total ?? 0;
    const results = resultsWithCount.map(({ _total, ...row }) => row);

    let data = transformRows(results as Record<string, unknown>[]);

    if (includes && includes.length > 0) {
      data = await this.includeRelatedData(data, results, includes);
    }

    return {
      data,
      pagination: { page, limit, total },
    };
  }

  async count(where?: SQL): Promise<number> {
    let whereConditions = where;

    if (this.config.softDelete) {
      const notDeletedCondition = eq(
        this.config.softDelete.column,
        !this.config.softDelete.deletedValue
      );
      whereConditions = whereConditions
        ? and(whereConditions, notDeletedCondition)
        : notDeletedCondition;
    }

    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(this.table)
      .where(whereConditions);

    return result?.count ?? 0;
  }

  async sum(column: PgColumn, where?: SQL): Promise<string> {
    let whereConditions = where;

    if (this.config.softDelete) {
      const notDeletedCondition = eq(
        this.config.softDelete.column,
        !this.config.softDelete.deletedValue
      );
      whereConditions = whereConditions
        ? and(whereConditions, notDeletedCondition)
        : notDeletedCondition;
    }

    const [result] = await this.db
      .select({ total: sql<string>`coalesce(sum(${column}), 0)::text` })
      .from(this.table)
      .where(whereConditions);

    return result?.total ?? "0";
  }

  async getById(id: number, includes?: string[]): Promise<Record<string, unknown>> {
    let whereConditions: SQL | undefined = eq(this.getIdColumn(), id);

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

  async create(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const transformedData = this.transformInputData(data);
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

  async update(id: number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundError(this.config.resourceName, id);
    }

    const transformedData = this.transformInputData(data);
    await this.validateForeignKeys(transformedData);
    await this.validateUniqueConstraints(transformedData, id);
    const finalData = await this.beforeUpdate(transformedData, existing as Record<string, unknown>);

    if (this.config.timestamps?.updated && !(this.config.timestamps.updated in finalData)) {
      finalData[this.config.timestamps.updated] = new Date();
    }

    const [result] = await this.db
      .update(this.table)
      .set(finalData)
      .where(eq(this.getIdColumn(), id))
      .returning();

    await this.afterUpdate(result as Record<string, unknown>, existing as Record<string, unknown>);
    return transformRow(result as Record<string, unknown>);
  }

  async delete(id: number): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundError(this.config.resourceName, id);
    }

    await this.checkDependencies(id, existing as Record<string, unknown>);
    await this.beforeDelete(id, existing as Record<string, unknown>);

    if (this.config.softDelete) {
      const updateData: Record<string, unknown> = {
        [this.config.softDelete.fieldName]: this.config.softDelete.deletedValue,
      };
      if (this.config.softDelete.deletedAtColumn && this.config.softDelete.deletedAtFieldName) {
        updateData[this.config.softDelete.deletedAtFieldName] = new Date();
      }
      await this.db
        .update(this.table)
        .set(updateData)
        .where(eq(this.getIdColumn(), id));
    } else {
      await this.db.delete(this.table).where(eq(this.getIdColumn(), id));
    }

    await this.afterDelete(id, existing as Record<string, unknown>);
  }

  // ============================================================================
  // Hook Methods
  // ============================================================================

  protected getForeignKeyValidations(): ForeignKeyValidation[] { return []; }
  protected getUniqueConstraints(): UniqueConstraint[] { return []; }
  protected getDependencyChecks(): DependencyCheck[] { return []; }
  protected getIncludeConfigs(): IncludeConfig[] { return []; }

  protected async beforeCreate(data: Record<string, unknown>): Promise<Record<string, unknown>> { return data; }
  protected async afterCreate(_result: Record<string, unknown>): Promise<void> {}
  protected async beforeUpdate(data: Record<string, unknown>, _existing: Record<string, unknown>): Promise<Record<string, unknown>> { return data; }
  protected async afterUpdate(_result: Record<string, unknown>, _previous: Record<string, unknown>): Promise<void> {}
  protected async beforeDelete(_id: number, _existing: Record<string, unknown>): Promise<void> {}
  protected async afterDelete(_id: number, _deleted: Record<string, unknown>): Promise<void> {}

  // ============================================================================
  // Helper Methods
  // ============================================================================

  protected async findById(id: number): Promise<TSelect | null> {
    const [result] = await this.db
      .select()
      .from(this.table)
      .where(eq(this.getIdColumn(), id))
      .limit(1);
    return (result as TSelect) || null;
  }

  protected getIdColumn(): PgColumn { return this.table.id; }

  protected getColumnName(column: PgColumn): string { return column.name; }

  protected getSortColumn(sort: string): PgColumn {
    if (this.config.sortColumns && this.config.sortColumns[sort]) {
      return this.config.sortColumns[sort];
    }
    return this.getIdColumn();
  }

  protected buildFilterConditions(filters: Record<string, FilterValue>): SQL | undefined {
    if (!this.config.filterColumns) return undefined;

    const conditions: SQL[] = [];

    for (const [field, filter] of Object.entries(filters)) {
      const column = this.config.filterColumns[field];
      if (!column) continue;

      switch (filter.type) {
        case "eq":
          conditions.push(eq(column, filter.value as string | number | boolean));
          break;
        case "min":
          conditions.push(gte(column, filter.value as number));
          break;
        case "max":
          conditions.push(lte(column, filter.value as number));
          break;
        case "in":
          if (Array.isArray(filter.value)) {
            conditions.push(inArray(column, filter.value));
          }
          break;
        case "like":
          conditions.push(like(column, `%${this.escapeLikeValue(String(filter.value))}%`));
          break;
      }
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  protected transformInputData(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const columns = getTableColumns(this.table);
    for (const [key, value] of Object.entries(data)) {
      const camelKey = this.snakeToCamel(key);
      const column = columns[camelKey];
      if (column && column.columnType === "PgTimestamp" && typeof value === "string") {
        const date = new Date(value);
        result[camelKey] = isNaN(date.getTime()) ? value : date;
      } else {
        result[camelKey] = value;
      }
    }
    return result;
  }

  protected snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }

  protected camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  protected escapeLikeValue(value: string): string {
    return value.replace(/[%_\\]/g, "\\$&");
  }

  protected async validateForeignKeys(data: Record<string, unknown>): Promise<void> {
    const validations = this.getForeignKeyValidations();
    const toCheck = validations.filter((validation) => {
      const value = data[validation.fieldName];
      if (validation.optional && (value === undefined || value === null)) return false;
      return value !== undefined && value !== null;
    });

    if (toCheck.length === 0) return;

    const byTable = new Map<string, typeof toCheck>();
    for (const validation of toCheck) {
      const tableKey = validation.resourceName;
      if (!byTable.has(tableKey)) byTable.set(tableKey, []);
      byTable.get(tableKey)!.push(validation);
    }

    const errors: Record<string, string> = {};

    for (const [, tableValidations] of byTable) {
      if (tableValidations.length === 0) continue;
      const firstValidation = tableValidations[0];
      const ids = tableValidations.map((v) => data[v.fieldName] as number);

      const existing = await this.db
        .select({ id: firstValidation.column })
        .from(firstValidation.table)
        .where(inArray(firstValidation.column, ids));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingIds = new Set(existing.map((e: any) => e.id as number));

      for (const validation of tableValidations) {
        const value = data[validation.fieldName] as number;
        if (!existingIds.has(value)) {
          errors[this.camelToSnake(validation.fieldName)] =
            `${validation.resourceName} with ID ${value} does not exist.`;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError("One or more referenced resources do not exist.", errors);
    }
  }

  protected async validateUniqueConstraints(
    data: Record<string, unknown>,
    excludeId?: number
  ): Promise<void> {
    const constraints = this.getUniqueConstraints();

    for (const constraint of constraints) {
      const conditions: SQL[] = [];
      let allFieldsPresent = true;

      for (const { column, fieldName } of constraint.columns) {
        const value = data[fieldName];
        if (value === undefined) {
          if (constraint.composite) { allFieldsPresent = false; break; }
          continue;
        }
        conditions.push(eq(column, value as string | number | boolean));
      }

      if (!allFieldsPresent || conditions.length === 0) continue;

      if (excludeId) {
        conditions.push(ne(this.getIdColumn(), excludeId));
      }

      const [existing] = await this.db
        .select({ id: this.getIdColumn() })
        .from(this.table)
        .where(and(...conditions))
        .limit(1);

      if (existing) {
        throw new ConflictError(constraint.message);
      }
    }
  }

  protected async checkDependencies(id: number, _existing: Record<string, unknown>): Promise<void> {
    const checks = this.getDependencyChecks();
    for (const check of checks) {
      const [countResult] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(check.table)
        .where(eq(check.foreignKeyColumn, id));

      const count = countResult?.count ?? 0;
      if (count > 0) {
        const message = check.message
          ? check.message.replace("{count}", String(count))
          : `Cannot delete ${this.config.resourceName} because it has ${count} ${check.resourceName}(s) associated with it.`;
        throw new ConflictError(message);
      }
    }
  }

  protected async includeRelatedData(
    data: Record<string, unknown>[],
    rawResults: unknown[],
    includes: string[]
  ): Promise<Record<string, unknown>[]> {
    const configs = this.getIncludeConfigs();
    const ids = rawResults.map((r) => (r as Record<string, unknown>).id as number);

    for (const include of includes) {
      const config = configs.find((c) => c.name === include);
      if (!config) continue;

      const related = await this.db
        .select()
        .from(config.table)
        .where(inArray(config.foreignKey, ids));

      const sqlName = config.foreignKey.name;
      const fkPropertyName = sqlName.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());

      const groupedRelated = new Map<number, Record<string, unknown>[]>();
      for (const row of related) {
        const fkValue = (row as Record<string, unknown>)[fkPropertyName] as number;
        if (!groupedRelated.has(fkValue)) groupedRelated.set(fkValue, []);
        groupedRelated.get(fkValue)!.push(row as Record<string, unknown>);
      }

      for (let i = 0; i < data.length; i++) {
        const id = (rawResults[i] as Record<string, unknown>).id as number;
        let relatedRows = groupedRelated.get(id) || [];
        relatedRows = transformRows(relatedRows);
        if (config.transform) relatedRows = config.transform(relatedRows);
        data[i][include] = relatedRows;
      }
    }

    return data;
  }
}
