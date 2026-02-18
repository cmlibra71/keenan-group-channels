import { customerGroups, customers, accounts, priceListAssignments } from "../schema";
import { BaseService } from "../base/BaseService";
import { DependencyCheck } from "../base/types";

class CustomerGroupServiceClass extends BaseService<typeof customerGroups> {
  constructor() {
    super(customerGroups, {
      resourceName: "Customer Group",
      defaultSort: "id",
      sortColumns: {
        id: customerGroups.id,
        name: customerGroups.name,
        created_at: customerGroups.createdAt,
      },
      filterColumns: {
        name: customerGroups.name,
        is_default: customerGroups.isDefault,
      },
      allowedFilters: ["name", "is_default"],
      timestamps: { created: "createdAt", updated: "updatedAt" },
    });
  }

  protected getDependencyChecks(): DependencyCheck[] {
    return [
      { table: customers, foreignKeyColumn: customers.customerGroupId, resourceName: "customer", message: "Cannot delete customer group because it has {count} customer(s) assigned." },
      { table: accounts, foreignKeyColumn: accounts.customerGroupId, resourceName: "account", message: "Cannot delete customer group because it has {count} account(s) assigned." },
      { table: priceListAssignments, foreignKeyColumn: priceListAssignments.customerGroupId, resourceName: "price list assignment", message: "Cannot delete customer group because it has {count} price list assignment(s)." },
    ];
  }
}

export const customerGroupService = new CustomerGroupServiceClass();
