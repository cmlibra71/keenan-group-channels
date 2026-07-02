// ============================================================================
// CMS v2 widget MAP — Chef's Depot fork. SERVER-SAFE module (no "use client"):
// the shared TemplateRenderer/SubBlockRenderer (server components) index into
// this map, which is impossible on an object exported from a client module
// (RSC client references only proxy component exports). Implementations live
// in widgets-client.tsx; importing them here yields indexable references.
// ============================================================================
import type { FC } from "react";
import type { RenderContext } from "@keenan/services";
import {
  ProductGalleryWidget,
  PriceWidget,
  BulkPricingWidget,
  OptionSelectorWidget,
  QuantityWidget,
  AddToCartWidget,
  AddToQuoteWidget,
  StockStatusWidget,
  MobileBuyBarWidget,
  ReviewStarsWidget,
} from "./widgets-client";
import {
  ProductGridWidget,
  BreadcrumbsWidget,
  FilterRailWidget,
  FilterChipsWidget,
  SortSelectWidget,
  ListingGridWidget,
  LoadMoreWidget,
} from "./widgets-server";
import { HeroSidePanelWidget } from "./home-blocks";

export type WidgetComponent = FC<{ attrs: Record<string, unknown>; ctx?: RenderContext }>;

export const WIDGETS: Record<string, WidgetComponent> = {
  product_gallery: ProductGalleryWidget,
  price: PriceWidget,
  bulk_pricing: BulkPricingWidget,
  option_selector: OptionSelectorWidget,
  quantity: QuantityWidget,
  add_to_cart: AddToCartWidget,
  add_to_quote: AddToQuoteWidget,
  stock_status: StockStatusWidget,
  mobile_buy_bar: MobileBuyBarWidget,
  review_stars: ReviewStarsWidget,
  product_grid: ProductGridWidget as unknown as WidgetComponent,
  breadcrumbs: BreadcrumbsWidget as unknown as WidgetComponent,
  filter_rail: FilterRailWidget as unknown as WidgetComponent,
  filter_chips: FilterChipsWidget as unknown as WidgetComponent,
  sort_select: SortSelectWidget as unknown as WidgetComponent,
  listing_grid: ListingGridWidget as unknown as WidgetComponent,
  load_more: LoadMoreWidget as unknown as WidgetComponent,
  hero_side_panel: HeroSidePanelWidget as unknown as WidgetComponent,
};
