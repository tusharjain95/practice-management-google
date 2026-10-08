import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { sendDailyRosterPdfWhatsApp } from '@/lib/whatsapp/client';
import { sendDailyRosterTelegram, processDepartmentReminders } from '@/lib/telegram/client';

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

    // Automatically process department 2-day & due-date Telegram reminders as well
    let deptRemindersReport = null;
    try {
      deptRemindersReport = await processDepartmentReminders(db, null);
    } catch (deptErr) {
      console.error('[Cron Error] Department reminders auto-dispatch failed:', deptErr);
    }

    // Automatically check and create compliance review tasks for any clients due today or overdue
    let complianceReviewTasksCreated = 0;
    try {
      const allClientsWithReview = await db.collection('clients').find({
        autoReviewPeriodMonths: { $gt: 0 },
        $or: [
          { complianceAssignedTo: { $exists: true, $ne: '' } },
          { assignedTo: { $exists: true, $ne: '' } }
        ]
      }).toArray();

      for (const cl of allClientsWithReview) {
        const assignedTo = cl.complianceAssignedTo || cl.assignedTo;
        if (!assignedTo) continue;
        const months = Number(cl.autoReviewPeriodMonths) || 3;
        let nextReviewDate = null;
        if (cl.lastReviewedOn) {
          const d = new Date(cl.lastReviewedOn);
          if (!isNaN(d.getTime())) {
            d.setMonth(d.getMonth() + months);
            nextReviewDate = d.toISOString().slice(0, 10);
          }
        } else {
          nextReviewDate = cl.createdAt ? cl.createdAt.slice(0, 10) : dateStr;
        }

        if (nextReviewDate && nextReviewDate <= dateStr) {
          const existingPending = await db.collection('tasks').findOne({
            clientId: cl.id,
            category: 'Compliance',
            status: { $in: ['Pending', 'In Progress'] }
          });

          if (!existingPending) {
            const applicableIds = Array.isArray(cl.applicableCompliances) ? cl.applicableCompliances : [];
            let compNames = [];
            if (applicableIds.length > 0) {
              const comps = await db.collection('compliances').find({ id: { $in: applicableIds } }).toArray();
              compNames = comps.map(c => c.name);
            }

            const assignedUser = await db.collection('users').findOne({ id: assignedTo });
            const reviewTask = {
              id: (await import('uuid')).v4(),
              orgId: cl.orgId,
              title: `Compliance Review Due: ${cl.name}`,
              description: `[Auto-Scheduled Review Task]\nClient: ${cl.name} ${cl.company ? '(' + cl.company + ')' : ''}\n` +
                `GSTIN: ${cl.gstin || 'N/A'}\nLast Reviewed: ${cl.lastReviewedOn || 'Never'}\n` +
                `Review Interval: Every ${months} month(s)\nNext Due: ${nextReviewDate}\n` +
                `Applicable: ${compNames.join(', ') || 'General'}\n` +
                `Please audit books and mark review complete in Compliances Matrix.`,
              category: 'Compliance',
              priority: 'High',
              dueDate: nextReviewDate,
              assignedTo,
              assignees: [assignedTo],
              status: 'Pending',
              isBiggerTask: true,
              milestones: compNames.map((cName, idx) => ({
                id: (Math.random() + 1).toString(36).substring(7),
                title: `Verify ${cName} Status`,
                status: 'Pending',
                completed: false,
                order: idx
              })),
              leadId: null,
              clientId: cl.id,
              clientName: cl.name,
              comments: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              createdBy: 'system',
              createdByName: 'Daily Compliance Cron',
            };

            await db.collection('tasks').insertOne(reviewTask);
            await db.collection('clients').updateOne(
              { id: cl.id },
              { $set: { lastReviewTaskId: reviewTask.id, nextReviewDate } }
            );
            complianceReviewTasksCreated++;
          }
        }
      }
    } catch (compErr) {
      console.error('[Cron Error] Compliance review auto-creation failed:', compErr);
    }

    return NextResponse.json({
      message: 'Daily roster process complete.',
      processedCount: users.length,
      results,
      deptRemindersReport,
      complianceReviewTasksCreated,
      date: dateStr,
      yesterday: yesterdayStr
    });
  } catch (error) {
    console.error('[Cron Error] Daily Roster process failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
