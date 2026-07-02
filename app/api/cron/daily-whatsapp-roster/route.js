import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { sendDailyRosterPdfWhatsApp } from '@/lib/whatsapp/client';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

export async function GET(request) {
  return handleCron(request);
}

export async function POST(request) {
  return handleCron(request);
}

async function handleCron(request) {
  // 1. Authorize Cron with CRON_SECRET if configured
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
    
    // 2. Fetch all users who opted-in and have Daily Roster enabled
    const users = await db.collection('users').find({
      dailyRosterEnabled: true,
      whatsappOptIn: true,
      active: true
    }).toArray();

    if (users.length === 0) {
      return NextResponse.json({ message: 'No users have daily roster enabled.' });
    }

    // 3. Setup Dates (IST / Asia/Kolkata timezone)
    const today = new Date();
    const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('en-CA', options); // returns YYYY-MM-DD
    const dateStr = formatter.format(today);

    // Yesterday date calculation
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = formatter.format(yesterday);

    const results = [];

    // 4. Process each user's roster
    for (const user of users) {
      try {
        if (!user.whatsappNumber) {
          results.push({ name: user.name, status: 'skipped', reason: 'No WhatsApp number configured' });
          continue;
        }

        // Generate dynamic secure JWT token that expires in 24 hours to secure PDF access
        const token = jwt.sign(
          { userId: user.id, date: dateStr },
          JWT_SECRET,
          { expiresIn: '1d' }
        );

        // Construct the public URL where Meta/WhatsApp Cloud API can fetch the PDF
        const publicPdfUrl = `${APP_BASE_URL}/api/whatsapp/pdf-roster?token=${token}`;

        // Send roster notification
        await sendDailyRosterPdfWhatsApp(db, user, dateStr, publicPdfUrl);
        
        results.push({ name: user.name, status: 'sent', date: dateStr });
      } catch (userErr) {
        console.error(`[Cron Error] Failed processing roster for user ${user.name}:`, userErr);
        results.push({ name: user.name, status: 'failed', error: userErr.message });
      }
    }

    return NextResponse.json({
      message: 'Daily WhatsApp roster process complete.',
      processedCount: users.length,
      results,
      date: dateStr,
      yesterday: yesterdayStr
    });
  } catch (error) {
    console.error('[Cron Error] Daily WhatsApp Roster process failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
