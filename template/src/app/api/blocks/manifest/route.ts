import { NextResponse } from "next/server";
import { SUPPORTED_BLOCK_TYPES } from "@/blocks/registry";
import { WIDGETS } from "@/blocks/widgets";
import { CHANNEL_ID } from "@/lib/channel";

/**
 * Advertises which Block Registry types THIS fork can actually render (and,
 * for CMS v2, which locked widgets it implements). The portal intersects this
 * with the shared registries so editors can't place anything this site has no
 * component for.
 */
export function GET() {
  return NextResponse.json({
    channelKey: process.env.CHANNEL_KEY ?? null,
    channelId: CHANNEL_ID,
    types: SUPPORTED_BLOCK_TYPES,
    widgets: Object.keys(WIDGETS),
  });
}
