import { NextRequest, NextResponse } from "next/server";
import { calculateShipping } from "@/lib/store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const postcode = String(body.postcode || "").trim();
    const subtotal = parseFloat(String(body.subtotal || "0"));

    if (!postcode || postcode.length < 3) {
      return NextResponse.json(
        { error: "Valid postcode is required.", success: false, cost: 0 },
        { status: 400 }
      );
    }

    if (isNaN(subtotal) || subtotal < 0) {
      return NextResponse.json(
        { error: "Valid subtotal is required.", success: false, cost: 0 },
        { status: 400 }
      );
    }

    const result = await calculateShipping(postcode, subtotal);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Shipping calculation error:", error);
    return NextResponse.json(
      { error: "Failed to calculate shipping.", cost: 0, success: false },
      { status: 500 }
    );
  }
}
