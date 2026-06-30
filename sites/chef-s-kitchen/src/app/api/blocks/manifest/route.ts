import { NextResponse } from "next/server";
import { SUPPORTED_BLOCK_TYPES } from "@/blocks/registry";

/**
 * Advertises which Block Registry types THIS fork can actually render. The portal
 * intersects this with the registry palette so editors can't place a block this
 * site has no component for.
 */
export function GET() {
  return NextResponse.json({
    channelKey: process.env.CHANNEL_KEY ?? null,
    channelId: parseInt(process.env.CHANNEL_ID || "1", 10),
    types: SUPPORTED_BLOCK_TYPES,
  });
}
