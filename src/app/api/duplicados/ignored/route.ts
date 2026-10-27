import { requireAdmin } from "@/lib/security/admin";
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongoose";
import { IgnoredDuplicate } from "@/lib/models/IgnoredDuplicate";

export const dynamic = "force-dynamic";

// GET: Fetch all ignored pair IDs
async function handleGET() {
  try {
    await connectToDatabase();
    const ignored = await IgnoredDuplicate.find({}).lean();
    const ignoredIds = ignored.map((doc) => doc.pairId);
    return NextResponse.json({ success: true, ignoredIds });
  } catch (error) {
    console.error("Error fetching ignored duplicates:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch ignored duplicates" },
      { status: 500 },
    );
  }
}

// POST: Ignore a pair
async function handlePOST(req: NextRequest) {
  try {
    await connectToDatabase();
    const { pairId, productAId, productBId } = await req.json();

    if (!pairId || !productAId || !productBId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    await IgnoredDuplicate.findOneAndUpdate(
      { pairId },
      { pairId, productAId, productBId, ignoredAt: new Date() },
      { upsert: true, returnDocument: "after" },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error ignoring duplicate pair:", error);
    return NextResponse.json(
      { success: false, error: "Failed to ignore duplicate pair" },
      { status: 500 },
    );
  }
}

// DELETE: Restore an ignored pair
async function handleDELETE(req: NextRequest) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const pairId = searchParams.get("pairId");

    if (!pairId) {
      return NextResponse.json(
        { success: false, error: "Missing pairId" },
        { status: 400 },
      );
    }

    await IgnoredDuplicate.findOneAndDelete({ pairId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error restoring duplicate pair:", error);
    return NextResponse.json(
      { success: false, error: "Failed to restore duplicate pair" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request, context: any) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return (handleGET as any)(req, context);
}

export async function POST(req: Request, context: any) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return (handlePOST as any)(req, context);
}

export async function DELETE(req: Request, context: any) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return (handleDELETE as any)(req, context);
}
