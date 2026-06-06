import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { auth } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function POST(
  request: NextRequest,
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
      return NextResponse.json({ error: 'Project expired' }, { status: 410 });
    }

    // Log download for telemetry
    await db.collection('downloads').insertOne({
      userId,
      projectId: id,
      projectName: project.name,
      fileCount: project.fileCount,
      totalSize: project.totalSize,
      timestamp: now,
    }).catch(() => {});

    return NextResponse.json({
      files: project.files || {},
      projectName: project.name,
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
