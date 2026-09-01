import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { processDepartmentReminders } from '@/lib/telegram/client';

export async function GET(request) {
  return handleCron(request);
}

export async function POST(request) {
  return handleCron(request);
}

async function handleCron(request) {
  // Authorize Cron with CRON_SECRET if configured
  const authHeader = request.headers.get('authorization');
  const querySecret = new URL(request.url).searchParams.get('secret');

  if (process.env.CRON_SECRET) {
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
    if (authHeader !== expectedAuth && querySecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const db = await getDb();
    // Process across all organizations
    const result = await processDepartmentReminders(db, null);

    return NextResponse.json({
      message: 'Automatic department reminders sweep completed successfully.',
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Department Reminders Cron Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
