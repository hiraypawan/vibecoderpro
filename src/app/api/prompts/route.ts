import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { auth } from '@/lib/auth';

const ANONYMOUS_LIMIT = 5;

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id;

    // Signed-in users have unlimited access
    if (userId) {
      return NextResponse.json({ unlimited: true, remaining: Infinity, used: 0 });
    }

    // Anonymous users get 5 prompts
    const { db } = await connectToDatabase();
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const fingerprint = request.headers.get('x-session-id') || ip;

    const record = await db.collection('prompt_limits').findOne({ fingerprint });

    if (!record) {
      // First time user
      await db.collection('prompt_limits').insertOne({
        fingerprint,
        count: 0,
        createdAt: new Date(),
        lastPromptAt: new Date(),
      });
      return NextResponse.json({ unlimited: false, remaining: ANONYMOUS_LIMIT, used: 0 });
    }

    const remaining = Math.max(0, ANONYMOUS_LIMIT - record.count);
    return NextResponse.json({ unlimited: false, remaining, used: record.count });
  } catch {
    return NextResponse.json({ unlimited: false, remaining: ANONYMOUS_LIMIT, used: 0 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id;

    // Signed-in users have unlimited access
    if (userId) {
      return NextResponse.json({ success: true, unlimited: true, remaining: Infinity });
    }

    const { db } = await connectToDatabase();
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const fingerprint = request.headers.get('x-session-id') || ip;

    const record = await db.collection('prompt_limits').findOne({ fingerprint });

    if (!record) {
      await db.collection('prompt_limits').insertOne({
        fingerprint,
        count: 1,
        createdAt: new Date(),
        lastPromptAt: new Date(),
      });
      return NextResponse.json({ success: true, unlimited: false, remaining: ANONYMOUS_LIMIT - 1 });
    }

    if (record.count >= ANONYMOUS_LIMIT) {
      return NextResponse.json({ success: false, unlimited: false, remaining: 0, error: 'Limit reached. Sign in for unlimited access.' }, { status: 429 });
    }

    await db.collection('prompt_limits').updateOne(
      { fingerprint },
      { $inc: { count: 1 }, $set: { lastPromptAt: new Date() } }
    );

    return NextResponse.json({ success: true, unlimited: false, remaining: ANONYMOUS_LIMIT - record.count - 1 });
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}
