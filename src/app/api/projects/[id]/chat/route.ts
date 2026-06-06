import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { auth } from '@/lib/auth';
import { ObjectId } from 'mongodb';

// Get chat history for a project
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

    return NextResponse.json({
      messages: project.messages || [],
      context: project.context || '',
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Save chat history for a project
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    const userId = (session?.user as any)?.id || 'anonymous';
    const { messages, context } = await request.json();

    const { db } = await connectToDatabase();

    // Calculate storage size
    const messagesSize = new TextEncoder().encode(JSON.stringify(messages)).byteLength;
    const contextSize = new TextEncoder().encode(context || '').byteLength;
    const totalSize = messagesSize + contextSize;

    // Update project with chat history
    const result = await db.collection('projects').findOneAndUpdate(
      { _id: new ObjectId(id), userId },
      {
        $set: {
          messages: messages || [],
          context: context || '',
          updatedAt: new Date(),
        },
        $inc: { chatStorageUsed: totalSize },
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
