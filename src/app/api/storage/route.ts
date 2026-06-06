import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { auth } from '@/lib/auth';

// Get user's total storage usage
export async function GET() {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id || 'anonymous';
    const { db } = await connectToDatabase();

    const projects = await db.collection('projects')
      .find({ userId })
      .project({ totalSize: 1, chatStorageUsed: 1, name: 1 })
      .toArray();

    let totalFileStorage = 0;
    let totalChatStorage = 0;

    projects.forEach((p: any) => {
      totalFileStorage += p.totalSize || 0;
      totalChatStorage += p.chatStorageUsed || 0;
    });

    const totalUsed = totalFileStorage + totalChatStorage;
    const maxStorage = 50 * 1024 * 1024; // 50MB

    return NextResponse.json({
      totalUsed,
      totalFileStorage,
      totalChatStorage,
      maxStorage,
      projectCount: projects.length,
      percentage: Math.min(100, (totalUsed / maxStorage) * 100),
    });
  } catch {
    return NextResponse.json({
      totalUsed: 0,
      totalFileStorage: 0,
      totalChatStorage: 0,
      maxStorage: 50 * 1024 * 1024,
      projectCount: 0,
      percentage: 0,
    });
  }
}
