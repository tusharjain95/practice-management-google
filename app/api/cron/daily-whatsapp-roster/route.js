import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { sendDailyRosterPdfWhatsApp } from '@/lib/whatsapp/client';
import { sendDailyRosterTelegram } from '@/lib/telegram/client';

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
    
    // 2. Fetch all active users who opted-in and have Daily Roster enabled for either WhatsApp or Telegram
    const users = await db.collection('users').find({
      active: true,
      $or: [
        { dailyRosterEnabled: true, whatsappOptIn: true },
        { telegramDailyRosterEnabled: true, telegramOptIn: true }
      ]
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
        const orgIds = (user.orgs || []).map(o => o.orgId);

        // Fetch Yesterday's Performance Statistics
        const completedYesterdayCount = await db.collection('tasks').countDocuments({
          orgId: { $in: orgIds },
          $or: [{ assignedTo: user.id }, { assignees: user.id }],
          status: 'Completed',
          updatedAt: { $regex: '^' + yesterdayStr }
        });

        const openedYesterdayCount = await db.collection('tasks').countDocuments({
          orgId: { $in: orgIds },
          createdBy: user.id,
          createdAt: { $regex: '^' + yesterdayStr }
        });

        const assignedYesterdayCount = await db.collection('tasks').countDocuments({
          orgId: { $in: orgIds },
          $or: [{ assignedTo: user.id }, { assignees: user.id }],
          createdAt: { $regex: '^' + yesterdayStr }
        });

        // Current workload counts
        const pendingTasks = await db.collection('tasks').find({
          orgId: { $in: orgIds },
          $or: [{ assignedTo: user.id }, { assignees: user.id }],
          status: { $ne: 'Completed' }
        }).toArray();

        const pendingCount = pendingTasks.length;
        const overdueCount = pendingTasks.filter(t => t.dueDate && t.dueDate < dateStr).length;
        const dueTodayCount = pendingTasks.filter(t => t.dueDate === dateStr).length;

        const performanceStats = {
          completedYesterdayCount,
          openedYesterdayCount,
          assignedYesterdayCount,
          pendingCount,
          overdueCount,
          dueTodayCount
        };

        // Generate dynamic secure JWT token that expires in 24 hours to secure PDF access
        const token = jwt.sign(
          { userId: user.id, date: dateStr },
          JWT_SECRET,
          { expiresIn: '1d' }
        );

        // Construct the public URL where external APIs or internal servers can fetch the PDF
        const publicPdfUrl = `${APP_BASE_URL}/api/whatsapp/pdf-roster?token=${token}`;

        const statusReport = { name: user.name, date: dateStr, channels: {} };

        // Send via WhatsApp if enabled
        if (user.dailyRosterEnabled && user.whatsappOptIn && user.whatsappNumber) {
          try {
            await sendDailyRosterPdfWhatsApp(db, user, dateStr, publicPdfUrl);
            statusReport.channels.whatsapp = 'sent';
          } catch (err) {
            statusReport.channels.whatsapp = `failed: ${err.message}`;
          }
        } else if (user.dailyRosterEnabled) {
          statusReport.channels.whatsapp = 'skipped (missing number or opt-in)';
        }

        // Send via Telegram if enabled
        if (user.telegramDailyRosterEnabled && user.telegramOptIn && user.telegramChatId) {
          try {
            await sendDailyRosterTelegram(db, user, dateStr, publicPdfUrl, performanceStats);
            statusReport.channels.telegram = 'sent';
          } catch (err) {
            statusReport.channels.telegram = `failed: ${err.message}`;
          }
        } else if (user.telegramDailyRosterEnabled) {
          statusReport.channels.telegram = 'skipped (missing chatId or opt-in)';
        }

        results.push(statusReport);
      } catch (userErr) {
        console.error(`[Cron Error] Failed processing roster for user ${user.name}:`, userErr);
        results.push({ name: user.name, status: 'failed', error: userErr.message });
      }
    }

    return NextResponse.json({
      message: 'Daily roster process complete.',
      processedCount: users.length,
      results,
      date: dateStr,
      yesterday: yesterdayStr
    });
  } catch (error) {
    console.error('[Cron Error] Daily Roster process failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
