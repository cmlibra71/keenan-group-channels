import { eq } from "drizzle-orm";
import { PgColumn } from "drizzle-orm/pg-core";
import { carts, cartItems, products, productVariants } from "../schema";
import { NestedService } from "../base/NestedService";
import { ForeignKeyValidation, UniqueConstraint } from "../base/types";

class CartItemServiceClass extends NestedService<typeof carts, typeof cartItems> {
  constructor() {
    super(carts, cartItems, {
      resourceName: "Cart Item",
      parentResourceName: "Cart",
      defaultSort: "id",
      sortColumns: {
        id: cartItems.id,
        created_at: cartItems.createdAt,
        updated_at: cartItems.updatedAt,
      },
      filterColumns: {
        product_id: cartItems.productId,
        variant_id: cartItems.variantId,
      },
      allowedFilters: ["product_id", "variant_id"],
      timestamps: { created: "createdAt", updated: "updatedAt" },
    });
  }

  protected getParentIdColumn(): PgColumn { return carts.id; }
  protected getParentForeignKey(): PgColumn { return cartItems.cartId; }
  protected getParentForeignKeyFieldName(): string { return "cartId"; }

  protected getForeignKeyValidations(): ForeignKeyValidation[] {
    return [
      { table: products, column: products.id, resourceName: "Product", fieldName: "productId" },
      { table: productVariants, column: productVariants.id, resourceName: "Variant", fieldName: "variantId", optional: true },
    ];
  }

  protected getUniqueConstraints(): UniqueConstraint[] {
    return [
      {
        columns: [
          { column: cartItems.cartId, fieldName: "cartId" },
          { column: cartItems.productId, fieldName: "productId" },
          { column: cartItems.variantId, fieldName: "variantId" },
        ],
        message: "This product/variant is already in the cart.",
        composite: true,
      },
    ];
  }

  protected async beforeCreate(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const quantity = (data.quantity as number) || 1;
    const listPrice = parseFloat((data.listPrice as string) || "0");
    const salePrice = data.salePrice ? parseFloat(data.salePrice as string) : null;

    data.extendedListPrice = String(listPrice * quantity);
    data.extendedSalePrice = salePrice ? String(salePrice * quantity) : null;
    if (!data.discountAmount) data.discountAmount = "0";
    if (!data.appliedCoupons) data.appliedCoupons = [];
    if (!data.modifierSelections) data.modifierSelections = [];

    return data;
  }

  protected async afterCreate(result: Record<string, unknown>): Promise<void> {
    await this.recalculateCartTotals(result.cartId as number);
  }

  protected async beforeUpdate(data: Record<string, unknown>, existing: Record<string, unknown>): Promise<Record<string, unknown>> {
    const quantity = (data.quantity as number) ?? (existing.quantity as number);
    const listPrice = data.listPrice ?? existing.listPrice;
    const salePrice = data.salePrice !== undefined ? data.salePrice : existing.salePrice;

    if (listPrice) {
      data.extendedListPrice = String(parseFloat(listPrice as string) * quantity);
    }
    if (salePrice) {
      data.extendedSalePrice = String(parseFloat(salePrice as string) * quantity);
    } else if (data.salePrice === null) {
      data.extendedSalePrice = null;
    }

    return data;
  }

  protected async afterUpdate(result: Record<string, unknown>): Promise<void> {
    await this.recalculateCartTotals(result.cartId as number);
  }

  protected async afterDelete(_id: number, deleted: Record<string, unknown>): Promise<void> {
    await this.recalculateCartTotals(deleted.cartId as number);
  }

  private async recalculateCartTotals(cartId: number): Promise<void> {
    const items = await this.db
      .select({
        extendedListPrice: cartItems.extendedListPrice,
        extendedSalePrice: cartItems.extendedSalePrice,
        discountAmount: cartItems.discountAmount,
      })
      .from(cartItems)
      .where(eq(cartItems.cartId, cartId));

    let baseAmount = 0;
    let discountAmount = 0;

    for (const item of items) {
      const itemTotal = item.extendedSalePrice
        ? parseFloat(item.extendedSalePrice)
        : parseFloat(item.extendedListPrice ?? "0");
      baseAmount += itemTotal;
      discountAmount += parseFloat(item.discountAmount ?? "0");
    }

    await this.db
      .update(carts)
      .set({
        baseAmount: String(baseAmount),
        discountAmount: String(discountAmount),
        cartAmount: String(baseAmount - discountAmount),
        updatedAt: new Date(),
      })
      .where(eq(carts.id, cartId));
  }
}

export const cartItemService = new CartItemServiceClass();
