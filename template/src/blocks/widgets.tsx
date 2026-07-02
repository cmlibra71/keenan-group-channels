// ============================================================================
// CMS v2 widget MAP — template/IK fork. SERVER-SAFE module (no "use client"):
// server components index into this map; implementations live in
// widgets-client.tsx (client) and widgets-server.tsx (server).
// ============================================================================
import type { FC } from "react";
import type { RenderContext } from "@keenan/services";
import {
  ProductGalleryWidget,
  PriceWidget,
  BulkPricingWidget,
  OptionSelectorWidget,
  AddToCartWidget,
  AddToQuoteWidget,
} from "./widgets-client";
import {
  ProductGridWidget,
  ListingGridWidget,
  FilterChipsWidget,
  SortSelectWidget,
  LoadMoreWidget,
} from "./widgets-server";

export type WidgetComponent = FC<{ attrs: Record<string, unknown>; ctx?: RenderContext }>;

export const WIDGETS: Record<string, WidgetComponent> = {
  product_gallery: ProductGalleryWidget,
  price: PriceWidget,
  bulk_pricing: BulkPricingWidget,
  option_selector: OptionSelectorWidget,
  add_to_cart: AddToCartWidget,
  add_to_quote: AddToQuoteWidget,
  product_grid: ProductGridWidget as unknown as WidgetComponent,
  listing_grid: ListingGridWidget as unknown as WidgetComponent,
  filter_chips: FilterChipsWidget as unknown as WidgetComponent,
  sort_select: SortSelectWidget as unknown as WidgetComponent,
  load_more: LoadMoreWidget as unknown as WidgetComponent,
};
