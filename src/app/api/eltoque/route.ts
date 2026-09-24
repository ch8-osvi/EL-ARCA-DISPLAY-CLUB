import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import { ElToqueRate } from '@/lib/models/ElToqueRate';

export async function GET() {
  try {
    await dbConnect();
    
    // Get the most recently inserted rate
    const latestRate = await ElToqueRate.findOne().sort({ createdAt: -1 });
    
    if (!latestRate) {
      return NextResponse.json({ success: false, message: 'No rate found' }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      rate: latestRate.rateUSD,
      updatedAt: latestRate.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching elTOQUE rate:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
