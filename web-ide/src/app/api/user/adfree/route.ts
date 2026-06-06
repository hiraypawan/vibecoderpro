import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ adFree: false });
    }

    const { db } = await connectToDatabase();

    // Check if user has ad-free pass
    const user = await db.collection('users').findOne({ _id: userId });
    if (user?.adFree === true) {
      return NextResponse.json({ adFree: true });
    }

    // Check redemption codes collection
    const code = await db.collection('adfree_codes').findOne({
      usedBy: userId,
      active: true,
    });

    if (code) {
      return NextResponse.json({ adFree: true });
    }

    return NextResponse.json({ adFree: false });
  } catch {
    return NextResponse.json({ adFree: false });
  }
}

// Admin endpoint to assign ad-free pass
export async function PUT(request: NextRequest) {
  try {
    const { userId, code, action } = await request.json();

    const { db } = await connectToDatabase();

    if (action === 'assign') {
      // Assign ad-free pass to user
      await db.collection('users').updateOne(
        { _id: userId },
        { $set: { adFree: true, adFreeCode: code } }
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'redeem') {
      // User redeems a code
      const redemption = await db.collection('adfree_codes').findOne({
        code: code,
        active: true,
        usedBy: { $exists: false },
      });

      if (!redemption) {
        return NextResponse.json({ error: 'Invalid or already used code' }, { status: 400 });
      }

      await db.collection('adfree_codes').updateOne(
        { code: code },
        { $set: { usedBy: userId, usedAt: new Date() } }
      );

      await db.collection('users').updateOne(
        { _id: userId },
        { $set: { adFree: true } }
      );

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
