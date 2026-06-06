import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { auth } from '@/lib/auth';
import { ObjectId } from 'mongodb';

const MAX_STORAGE_BYTES = 50 * 1024 * 1024;
const EXPIRY_HOURS = 24;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    const userId = (session?.user as any)?.id || 'anonymous';
    const { db } = await connectToDatabase();

    const project = await db.collection('projects').findOne({
      _id: new ObjectId(id),
      userId,
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const now = new Date();
    if (project.expiresAt && new Date(project.expiresAt) < now) {
      await db.collection('projects').deleteOne({ _id: new ObjectId(id) });
      return NextResponse.json({ error: 'Project expired and was deleted' }, { status: 410 });
    }

    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    const userId = (session?.user as any)?.id || 'anonymous';
    const { files } = await request.json();

    if (!files || typeof files !== 'object') {
      return NextResponse.json({ error: 'Files object required' }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    let totalSize = 0;
    for (const [path, content] of Object.entries(files)) {
      totalSize += new TextEncoder().encode(content as string).byteLength;
    }

    if (totalSize > MAX_STORAGE_BYTES) {
      return NextResponse.json({
        error: `Storage limit exceeded (${(totalSize / 1024 / 1024).toFixed(1)}MB / 50MB)`,
      }, { status: 400 });
    }

    const fileCount = Object.keys(files).length;
    const now = new Date();
    const result = await db.collection('projects').findOneAndUpdate(
      { _id: new ObjectId(id), userId },
      {
        $set: {
          files,
          fileCount,
          totalSize,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + EXPIRY_HOURS * 60 * 60 * 1000),
        },
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      expiresAt: result.expiresAt,
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    const userId = (session?.user as any)?.id || 'anonymous';
    const { db } = await connectToDatabase();

    await db.collection('projects').deleteOne({
      _id: new ObjectId(id),
      userId,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
