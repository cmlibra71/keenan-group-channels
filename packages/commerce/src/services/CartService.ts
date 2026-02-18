import { eq } from "drizzle-orm";
import { carts, channels, customers, accounts, contacts, cartItems } from "../schema";
import { BaseService } from "../base/BaseService";
import { ForeignKeyValidation, DependencyCheck, IncludeConfig } from "../base/types";

class CartServiceClass extends BaseService<typeof carts> {
  constructor() {
    super(carts, {
      resourceName: "Cart",
      defaultSort: "id",
      sortColumns: {
        id: carts.id,
        created_at: carts.createdAt,
        updated_at: carts.updatedAt,
      },
      filterColumns: {
        channel_id: carts.channelId,
        customer_id: carts.customerId,
        account_id: carts.accountId,
        contact_id: carts.contactId,
        status: carts.status,
      },
      allowedFilters: ["channel_id", "customer_id", "account_id", "contact_id", "status"],
      timestamps: { created: "createdAt", updated: "updatedAt" },
    });
  }

  protected getForeignKeyValidations(): ForeignKeyValidation[] {
    return [
      { table: channels, column: channels.id, resourceName: "Channel", fieldName: "channelId" },
      { table: customers, column: customers.id, resourceName: "Customer", fieldName: "customerId", optional: true },
      { table: accounts, column: accounts.id, resourceName: "Account", fieldName: "accountId", optional: true },
      { table: contacts, column: contacts.id, resourceName: "Contact", fieldName: "contactId", optional: true },
    ];
  }

  protected getDependencyChecks(): DependencyCheck[] {
    return [
      { table: cartItems, foreignKeyColumn: cartItems.cartId, resourceName: "cart item", message: "Cannot delete cart because it has {count} item(s)." },
    ];
  }

  protected getIncludeConfigs(): IncludeConfig[] {
    return [
      { name: "items", table: cartItems, foreignKey: cartItems.cartId },
    ];
  }

  protected async beforeCreate(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!data.status) data.status = "active";
    if (!data.baseAmount) data.baseAmount = "0";
    if (!data.discountAmount) data.discountAmount = "0";
    if (!data.taxAmount) data.taxAmount = "0";
    if (!data.cartAmount) data.cartAmount = "0";
    if (!data.couponCodes) data.couponCodes = [];
    if (!data.giftCertificateCodes) data.giftCertificateCodes = [];

    if (!data.expiresAt) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      data.expiresAt = expiresAt;
    }

    if (!data.currencyCode && data.channelId) {
      const [channel] = await this.db
        .select({ defaultCurrencyCode: channels.defaultCurrencyCode })
        .from(channels)
        .where(eq(channels.id, data.channelId as number))
        .limit(1);
      data.currencyCode = channel?.defaultCurrencyCode || "USD";
    }

    return data;
  }
}

export const cartService = new CartServiceClass();
