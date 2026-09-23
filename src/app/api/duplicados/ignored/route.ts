import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { IgnoredDuplicate } from '@/lib/models/IgnoredDuplicate';

export const dynamic = 'force-dynamic';

// GET: Fetch all ignored pair IDs
export async function GET() {
  try {
    await connectToDatabase();
    const ignored = await IgnoredDuplicate.find({}).lean();
    const ignoredIds = ignored.map(doc => doc.pairId);
    return NextResponse.json({ success: true, ignoredIds });
  } catch (error) {
    console.error('Error fetching ignored duplicates:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch ignored duplicates' }, { status: 500 });
  }
}

// POST: Ignore a pair
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const { pairId, productAId, productBId } = await req.json();

    if (!pairId || !productAId || !productBId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    await IgnoredDuplicate.findOneAndUpdate(
      { pairId },
      { pairId, productAId, productBId, ignoredAt: new Date() },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error ignoring duplicate pair:', error);
    return NextResponse.json({ success: false, error: 'Failed to ignore duplicate pair' }, { status: 500 });
  }
}

// DELETE: Restore an ignored pair
export async function DELETE(req: NextRequest) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const pairId = searchParams.get('pairId');

    if (!pairId) {
      return NextResponse.json({ success: false, error: 'Missing pairId' }, { status: 400 });
    }

    await IgnoredDuplicate.findOneAndDelete({ pairId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error restoring duplicate pair:', error);
    return NextResponse.json({ success: false, error: 'Failed to restore duplicate pair' }, { status: 500 });
  }
}
