import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { auth } from '@/lib/auth';

const MAX_STORAGE_BYTES = 50 * 1024 * 1024; // 50MB
const EXPIRY_HOURS = 24;

export async function GET() {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id || 'anonymous';
    const { db } = await connectToDatabase();

    const projects = await db.collection('projects')
      .find({ userId })
      .sort({ updatedAt: -1 })
      .project({ name: 1, createdAt: 1, updatedAt: 1, expiresAt: 1, fileCount: 1, totalSize: 1 })
      .toArray();

    return NextResponse.json({ projects });
  } catch {
    return NextResponse.json({ projects: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id || 'anonymous';
    const { name } = await request.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Project name required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const existingCount = await db.collection('projects').countDocuments({ userId });
    if (existingCount >= 20) {
      return NextResponse.json({ error: 'Maximum 20 projects per user' }, { status: 400 });
    }

    const now = new Date();
    const result = await db.collection('projects').insertOne({
      userId,
      name: name.trim(),
      files: {},
      fileCount: 0,
      totalSize: 0,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + EXPIRY_HOURS * 60 * 60 * 1000),
    });

    return NextResponse.json({
      project: {
        _id: result.insertedId,
        name: name.trim(),
        createdAt: now,
        expiresAt: new Date(now.getTime() + EXPIRY_HOURS * 60 * 60 * 1000),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
