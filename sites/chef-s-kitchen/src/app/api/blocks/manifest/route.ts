import { NextResponse } from "next/server";
import { SUPPORTED_BLOCK_TYPES } from "@/blocks/registry";
import { CHANNEL_ID } from "@/lib/channel";

/**
 * Advertises which Block Registry types THIS fork can actually render. The portal
 * intersects this with the registry palette so editors can't place a block this
 * site has no component for.
 */
export function GET() {
  return NextResponse.json({
    channelKey: process.env.CHANNEL_KEY ?? null,
    channelId: CHANNEL_ID,
    types: SUPPORTED_BLOCK_TYPES,
  });
}
