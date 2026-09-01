// Telegram Configuration from Environment
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const PROVIDER = process.env.TELEGRAM_PROVIDER || (BOT_TOKEN ? 'telegram' : 'mock');

console.log(`[Telegram Client] Loaded with provider: "${PROVIDER}"`);

/**
 * Log Telegram notification to database
 */
export async function logTelegramNotification(db, { type, user, messageText, status, messageId, error }) {
  try {
    const telegramNotifications = db.collection('telegram_notifications');
    const logEntry = {
      id: Math.random().toString(36).substring(2, 11),
      orgId: user?.activeOrgId || (user?.orgs && user.orgs[0]?.orgId) || null,
      type,
      recipientUserId: user.id,
      recipientName: user.name,
      recipientTelegramChatId: user.telegramChatId || '',
      messageText: messageText ? messageText.substring(0, 500) : '',
      status,
      providerMessageId: messageId || null,
      error: error || null,
      createdAt: new Date().toISOString(),
      sentAt: status === 'sent' ? new Date().toISOString() : null,
    };
    await telegramNotifications.insertOne(logEntry);
    console.log(`[Telegram Log] ${type} to ${user.name} (${status}): ${error || 'success'}`);
    return logEntry;
  } catch (err) {
    console.error('[Telegram Log Error] Failed to log Telegram notification in DB:', err);
  }
}

/**
 * Send custom text message to Telegram Chat
 */
export async function sendTelegramMessage(chatId, text, parseMode = 'HTML') {
  if (PROVIDER === 'mock' || !BOT_TOKEN || !chatId) {
    console.log(`[Telegram Mock Send Message] Chat ID: ${chatId}, ParseMode: ${parseMode}\nText:\n${text}`);
    return { success: true, messageId: `mock_tg_msg_${Math.random().toString(36).substring(2, 15)}` };
  }

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode
      })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.description || `Telegram API error: ${res.status}`);
    }

    return { success: true, messageId: String(data.result?.message_id || 'success') };
  } catch (error) {
    console.error(`[Telegram Send Message Failed] Chat ID ${chatId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send Document/PDF to Telegram Chat
 */
export async function sendTelegramDocument(chatId, pdfUrlOrBuffer, filename, caption = '', parseMode = 'HTML') {
  if (PROVIDER === 'mock' || !BOT_TOKEN || !chatId) {
    console.log(`[Telegram Mock Send Document] Chat ID: ${chatId}, Filename: ${filename}, Caption: ${caption}`);
    return { success: true, messageId: `mock_tg_doc_${Math.random().toString(36).substring(2, 15)}` };
  }

  try {
    // If it's a URL and does NOT point to localhost (Telegram servers can reach it)
    if (typeof pdfUrlOrBuffer === 'string' && !pdfUrlOrBuffer.includes('localhost') && !pdfUrlOrBuffer.includes('127.0.0.1')) {
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chatId,
          document: pdfUrlOrBuffer,
          caption,
          parse_mode: parseMode
        })
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        return { success: true, messageId: String(data.result?.message_id || 'success') };
      }
      console.warn(`[Telegram URL Document Failed, trying buffer upload] Error: ${data.description}`);
    }

    // Fallback: If it's a buffer or the URL call failed/was local, download and send as form-data
    let buffer = pdfUrlOrBuffer;
    if (typeof pdfUrlOrBuffer === 'string') {
      const fetchRes = await fetch(pdfUrlOrBuffer);
      if (!fetchRes.ok) {
        throw new Error(`Failed to fetch local PDF for upload: ${fetchRes.status}`);
      }
      buffer = Buffer.from(await fetchRes.arrayBuffer());
    }

    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', parseMode);
    
    const blob = new Blob([buffer], { type: 'application/pdf' });
    formData.append('document', blob, filename);

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`;
    const res = await fetch(url, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.description || `Telegram Upload API error: ${res.status}`);
    }

    return { success: true, messageId: String(data.result?.message_id || 'success') };
  } catch (error) {
    console.error(`[Telegram Send Document Failed] Chat ID ${chatId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send Telegram notification when a task is assigned
 */
export async function sendTaskAssignedTelegram(db, user, task) {
  if (!user || !user.telegramChatId || !user.telegramOptIn || !user.telegramNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (task && task.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: task.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[Telegram Notification Org Lookup Error]', e);
    }
  }

  const text = `
<b>🔔 New Task Assigned!</b>

<b>Title:</b> ${task.title || 'Untitled Task'}
${orgName ? `<b>Organisation:</b> ${orgName}\n` : ''}<b>Priority:</b> ${task.priority || 'Medium'}
<b>Due Date:</b> ${task.dueDate || 'No due date'}
<b>Category:</b> ${task.category || 'Other'}

${task.description ? `<b>Description:</b>\n<i>${task.description}</i>\n` : ''}
Please log in to your CA Manager workspace to start working on it.
  `.trim();

  const res = await sendTelegramMessage(user.telegramChatId, text);

  await logTelegramNotification(db, {
    type: 'TASK_ASSIGNED',
    user,
    messageText: text,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Send Telegram notification when a task is reassigned
 */
export async function sendTaskReassignedWhatsApp(db, user, task) {
  // Overloaded for WhatsApp/Telegram compatibility
}

export async function sendTaskReassignedTelegram(db, user, task) {
  if (!user || !user.telegramChatId || !user.telegramOptIn || !user.telegramNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (task && task.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: task.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[Telegram Notification Org Lookup Error]', e);
    }
  }

  const text = `
<b>🔄 Task Reassigned!</b>

<b>Title:</b> ${task.title || 'Untitled Task'}
${orgName ? `<b>Organisation:</b> ${orgName}\n` : ''}<b>Priority:</b> ${task.priority || 'Medium'}
<b>Due Date:</b> ${task.dueDate || 'No due date'}
<b>Category:</b> ${task.category || 'Other'}

${task.description ? `<b>Description:</b>\n<i>${task.description}</i>\n` : ''}
Please check your updated task roster in your workspace.
  `.trim();

  const res = await sendTelegramMessage(user.telegramChatId, text);

  await logTelegramNotification(db, {
    type: 'TASK_REASSIGNED',
    user,
    messageText: text,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Send Telegram notification when a task is assigned for discussion to a manager
 */
export async function sendTaskDiscussionTelegram(db, user, task) {
  if (!user || !user.telegramChatId || !user.telegramOptIn || !user.telegramNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (task && task.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: task.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[Telegram Notification Org Lookup Error]', e);
    }
  }

  const text = `
<b>🗣️ Task Assigned for Discussion!</b>

<b>Title:</b> ${task.title || 'Untitled Task'}
${orgName ? `<b>Organisation:</b> ${orgName}\n` : ''}<b>Priority:</b> ${task.priority || 'Medium'}
<b>Due Date:</b> ${task.dueDate || 'No due date'}
<b>Category:</b> ${task.category || 'Other'}

${task.description ? `<b>Description:</b>\n<i>${task.description}</i>\n` : ''}
${task.discussionRaisedByName ? `<b>Discussion Raised By:</b> ${task.discussionRaisedByName}\n` : ''}
Please log in to your CA Manager workspace to discuss this task.
  `.trim();

  const res = await sendTelegramMessage(user.telegramChatId, text);

  await logTelegramNotification(db, {
    type: 'TASK_DISCUSSION',
    user,
    messageText: text,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Send Telegram notification when a lead is assigned
 */
export async function sendLeadAssignedTelegram(db, user, lead) {
  if (!user || !user.telegramChatId || !user.telegramOptIn || !user.telegramNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (lead && lead.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: lead.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[Telegram Notification Org Lookup Error]', e);
    }
  }

  const text = `
<b>🚀 New Lead Assigned!</b>

<b>Lead Name:</b> ${lead.name || 'Anonymous'}
${orgName ? `<b>Organisation:</b> ${orgName}\n` : ''}<b>Company:</b> ${lead.company || 'N/A'}
<b>Service:</b> ${lead.serviceType || 'Other'}
<b>Source:</b> ${lead.source || 'Other'}
<b>Status:</b> ${lead.status || 'New'}

${lead.phone ? `<b>Phone:</b> ${lead.phone}\n` : ''}${lead.email ? `<b>Email:</b> ${lead.email}\n` : ''}${lead.followUpDate ? `<b>Next Follow-Up:</b> ${lead.followUpDate}\n` : ''}
Please follow up with this lead as soon as possible!
  `.trim();

  const res = await sendTelegramMessage(user.telegramChatId, text);

  await logTelegramNotification(db, {
    type: 'LEAD_ASSIGNED',
    user,
    messageText: text,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Send Telegram notification when a lead is reassigned
 */
export async function sendLeadReassignedTelegram(db, user, lead) {
  if (!user || !user.telegramChatId || !user.telegramOptIn || !user.telegramNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (lead && lead.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: lead.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[Telegram Notification Org Lookup Error]', e);
    }
  }

  const text = `
<b>🔄 Lead Reassigned to You!</b>

<b>Lead Name:</b> ${lead.name || 'Anonymous'}
${orgName ? `<b>Organisation:</b> ${orgName}\n` : ''}<b>Company:</b> ${lead.company || 'N/A'}
<b>Service:</b> ${lead.serviceType || 'Other'}
<b>Status:</b> ${lead.status || 'New'}

Please coordinate and resume follow-up operations.
  `.trim();

  const res = await sendTelegramMessage(user.telegramChatId, text);

  await logTelegramNotification(db, {
    type: 'LEAD_REASSIGNED',
    user,
    messageText: text,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Send Daily Telegram Roster & Performance Highlights
 */
export async function sendDailyRosterTelegram(db, user, date, publicPdfUrl, performanceStats) {
  if (!user || !user.telegramChatId || !user.telegramOptIn || !user.telegramDailyRosterEnabled) {
    return;
  }

  const filename = `roster_${(user.name || 'staff').toLowerCase().replace(/[^a-z0-9]/g, '_')}_${date}.pdf`;

  let milestoneStatsText = '';
  if (performanceStats.totalMilestonesCount > 0) {
    milestoneStatsText = `\n\n<b>⚡ Milestones & Deliverables:</b>
• <b>Bigger Tasks:</b> ${performanceStats.biggerTasksCount || 0}
• <b>Total Milestones:</b> ${performanceStats.totalMilestonesCount}
• <b>Completed:</b> ${performanceStats.completedMilestonesCount || 0} | <b>Pending:</b> ${performanceStats.pendingMilestonesCount || 0}${performanceStats.overdueMilestonesCount > 0 ? `\n• <b>⚠️ Overdue Milestones:</b> ${performanceStats.overdueMilestonesCount}` : ''}${performanceStats.awaitingDiscussionMilestonesCount > 0 ? `\n• <b>🗣️ Needs Discussion:</b> ${performanceStats.awaitingDiscussionMilestonesCount}` : ''}`;
  }

  const caption = `
<b>📅 Daily Task Roster - ${date}</b>
Hello <b>${user.name || 'Staff'}</b>! Here is your daily task schedule.

<b>🏆 Yesterday's Performance points:</b>
• <b>Tasks Opened (Created):</b> ${performanceStats.openedYesterdayCount || 0}
• <b>Tasks Closed (Completed):</b> ${performanceStats.completedYesterdayCount || 0}
• <b>Tasks Assigned:</b> ${performanceStats.assignedYesterdayCount || 0}

<b>📈 Current Workload:</b>
• <b>Pending Tasks:</b> ${performanceStats.pendingCount || 0}
• <b>Overdue Tasks:</b> ${performanceStats.overdueCount || 0}
• <b>Due Today:</b> ${performanceStats.dueTodayCount || 0}${milestoneStatsText}

<i>Check the attached PDF for a complete breakdown of tasks and detailed milestone statuses. Let's make today even more productive!</i>
  `.trim();

  const res = await sendTelegramDocument(user.telegramChatId, publicPdfUrl, filename, caption);

  await logTelegramNotification(db, {
    type: 'DAILY_ROSTER',
    user,
    messageText: caption,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

let cachedBotUsername = null;

/**
 * Dynamically fetch the Telegram bot username from the token
 */
export async function getBotUsername() {
  if (PROVIDER === 'mock' || !BOT_TOKEN) {
    return 'MockPracticeRosterBot';
  }
  if (cachedBotUsername) return cachedBotUsername;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const data = await res.json();
    if (res.ok && data.ok && data.result?.username) {
      cachedBotUsername = data.result.username;
      return cachedBotUsername;
    }
  } catch (err) {
    console.error('Failed to fetch bot username:', err);
  }
  return 'YourConfiguredBot';
}

/**
 * Send a test message to verify connection
 */
export async function sendTestTelegram(chatId) {
  const text = `<b>🤖 CA Workspace Notification Test</b>\n\nHello! This is a test message to confirm that your Telegram integration is working perfectly. 🎉\n\nIf you can read this, your configuration is 100% correct!`;
  return await sendTelegramMessage(chatId, text);
}

/**
 * Send Telegram notification when a new comment is added to a task
 */
export async function sendTaskCommentTelegram(db, user, task, comment, commentatorName) {
  if (!user || !user.telegramChatId || !user.telegramOptIn || !user.telegramNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (task && task.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: task.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[Telegram Notification Org Lookup Error]', e);
    }
  }

  const text = `
<b>💬 New Comment on Task!</b>

<b>Task Title:</b> ${task.title || 'Untitled Task'}
${orgName ? `<b>Organisation:</b> ${orgName}\n` : ''}<b>By:</b> ${commentatorName}
<b>Comment:</b>
<i>${comment.text || comment}</i>

Please check your task in your workspace.
  `.trim();

  const res = await sendTelegramMessage(user.telegramChatId, text);

  await logTelegramNotification(db, {
    type: 'TASK_COMMENT',
    user,
    messageText: text,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Send Telegram notification when a new note is added to a lead
 */
export async function sendLeadNoteTelegram(db, user, lead, note, commentatorName) {
  if (!user || !user.telegramChatId || !user.telegramOptIn || !user.telegramNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (lead && lead.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: lead.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[Telegram Notification Org Lookup Error]', e);
    }
  }

  const text = `
<b>💬 New Note on Lead!</b>

<b>Lead Name:</b> ${lead.name || 'Anonymous'}
${orgName ? `<b>Organisation:</b> ${orgName}\n` : ''}<b>By:</b> ${commentatorName}
<b>Note:</b>
<i>${note.text || note}</i>

Please check your lead detail in your workspace.
  `.trim();

  const res = await sendTelegramMessage(user.telegramChatId, text);

  await logTelegramNotification(db, {
    type: 'LEAD_NOTE',
    user,
    messageText: text,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Send Telegram notification when a Department matter/task is assigned
 */
export async function sendDepartmentTaskAssignedTelegram(db, user, task) {
  if (!user || !user.telegramChatId || !user.telegramOptIn || !user.telegramNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (task && task.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: task.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[Telegram Notification Org Lookup Error]', e);
    }
  }

  const officerInfo = [task.officerName, task.wardOrCircle].filter(Boolean).join(' | ');
  const visitInfo = task.visitDate ? `${task.visitDate}${task.visitTime ? ` at ${task.visitTime}` : ''}` : '';

  const text = `
<b>🏛️ New Department Task Assigned!</b>

<b>📌 Task Name:</b> ${task.title || 'Department Notice / Proceeding'}
<b>🏢 Department:</b> ${task.department || 'Income Tax / GST / MCA'}
<b>📋 Matter Type:</b> ${task.matterType || 'Statutory Proceeding'}
${task.noticeNo ? `<b>🔢 Notice / DIN No:</b> <code>${task.noticeNo}</code>\n` : ''}<b>👤 Client:</b> ${task.clientName || 'N/A'}
${orgName ? `<b>🏢 Organisation:</b> ${orgName}\n` : ''}<b>⚡ Priority:</b> ${task.priority || 'Medium'}
<b>📅 Reply Due Date:</b> ${task.dueDate ? `<b>${task.dueDate}</b>` : 'Not set'}
${visitInfo ? `<b>🏛️ Hearing / Visit:</b> ${visitInfo}\n` : ''}${officerInfo ? `<b>👮 Officer / Ward:</b> ${officerInfo}\n` : ''}${task.departmentAddress ? `<b>📍 Office:</b> ${task.departmentAddress}\n` : ''}
${task.description ? `<b>📝 Brief / Notes:</b>\n<i>${task.description}</i>\n` : ''}
Please review this matter in your CA Workspace.
  `.trim();

  const res = await sendTelegramMessage(user.telegramChatId, text);

  await logTelegramNotification(db, {
    type: 'DEPARTMENT_TASK_ASSIGNED',
    user,
    messageText: text,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Send Telegram reminder for Department Notice Reply or Visit (2 Days Prior & On Due Date)
 */
export async function sendDepartmentReminderTelegram(db, user, task, reminderType = 'due_today') {
  if (!user || !user.telegramChatId || !user.telegramOptIn || !user.telegramNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (task && task.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: task.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[Telegram Notification Org Lookup Error]', e);
    }
  }

  const isTwoDaysPrior = reminderType === 'two_days_prior';
  const header = isTwoDaysPrior
    ? '<b>⏰ 2-DAY REMINDER: Department Notice / Task Due Soon!</b>'
    : '<b>🚨 URGENT REMINDER: Department Matter DUE TODAY!</b>';

  const subText = isTwoDaysPrior
    ? '⚠️ <i>This statutory notice reply or department visit is due in 2 days. Please finalize submission / verify documents.</i>'
    : '🔥 <i>Today is the final statutory deadline for notice reply submission or scheduled hearing! Please take immediate action.</i>';

  const officerInfo = [task.officerName, task.wardOrCircle].filter(Boolean).join(' | ');
  const visitInfo = task.visitDate ? `${task.visitDate}${task.visitTime ? ` at ${task.visitTime}` : ''}` : '';

  const text = `
${header}

<b>📌 Task Name:</b> ${task.title || 'Department Notice / Proceeding'}
<b>🏢 Department:</b> ${task.department || 'Income Tax / GST / MCA'}
<b>📋 Matter Type:</b> ${task.matterType || 'Statutory Proceeding'}
${task.noticeNo ? `<b>🔢 Notice / DIN No:</b> <code>${task.noticeNo}</code>\n` : ''}<b>👤 Client:</b> ${task.clientName || 'N/A'}
${orgName ? `<b>🏢 Organisation:</b> ${orgName}\n` : ''}<b>📅 Due Date:</b> <b>${task.dueDate || 'Today'}</b>
${visitInfo ? `<b>🏛️ Hearing / Visit:</b> ${visitInfo}\n` : ''}${officerInfo ? `<b>👮 Officer / Ward:</b> ${officerInfo}\n` : ''}<b>📊 Status:</b> ${task.status || 'Pending'}
<b>⚡ Priority:</b> ${task.priority || 'Medium'}

${subText}
  `.trim();

  const res = await sendTelegramMessage(user.telegramChatId, text);

  await logTelegramNotification(db, {
    type: isTwoDaysPrior ? 'DEPARTMENT_REMINDER_2_DAYS' : 'DEPARTMENT_REMINDER_DUE_TODAY',
    user,
    messageText: text,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Send Telegram notification when a new comment is added to a department task
 */
export async function sendDepartmentCommentTelegram(db, user, task, comment, commentatorName) {
  if (!user || !user.telegramChatId || !user.telegramOptIn || !user.telegramNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (task && task.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: task.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[Telegram Notification Org Lookup Error]', e);
    }
  }

  const text = `
<b>💬 New Note on Department Task!</b>

<b>📌 Task Name:</b> ${task.title || 'Department Task'}
<b>🏢 Department:</b> ${task.department || 'General'}
<b>📋 Matter Type:</b> ${task.matterType || 'Notice'}
${task.clientName ? `<b>👤 Client:</b> ${task.clientName}\n` : ''}${task.noticeNo ? `<b>🔢 Notice / DIN No:</b> <code>${task.noticeNo}</code>\n` : ''}${orgName ? `<b>🏢 Organisation:</b> ${orgName}\n` : ''}<b>✍️ By:</b> ${commentatorName}
<b>💬 Note / Update:</b>
<i>${comment.text || comment}</i>

Please check your department task in your workspace.
  `.trim();

  const res = await sendTelegramMessage(user.telegramChatId, text);

  await logTelegramNotification(db, {
    type: 'DEPARTMENT_COMMENT',
    user,
    messageText: text,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Automated engine to scan database and dispatch Telegram reminders for department tasks
 * (Fires automatically 2 days before due date / hearing date, and on the due date morning).
 * @param {import('mongodb').Db} db
 * @param {string|null} orgId - optional organization filter, if null processes all orgs
 */
export async function processDepartmentReminders(db, orgId = null) {
  try {
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
    const twoDaysObj = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const twoDaysLaterStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(twoDaysObj);

    const query = {
      status: { $nin: ['Completed', 'Closed', 'Closed / Order Passed'] },
      remindersEnabled: { $ne: false },
      $or: [
        { dueDate: todayStr },
        { visitDate: todayStr },
        { dueDate: twoDaysLaterStr },
        { visitDate: twoDaysLaterStr }
      ]
    };

    if (orgId) {
      query.orgId = orgId;
    }

    const activeTasks = await db.collection('department_tasks').find(query).toArray();
    const results = [];
    let sentCount = 0;

    for (const task of activeTasks) {
      const remindersSent = Array.isArray(task.remindersSent) ? task.remindersSent : [];
      const isDueToday = task.dueDate === todayStr || task.visitDate === todayStr;
      const isDueInTwoDays = task.dueDate === twoDaysLaterStr || task.visitDate === twoDaysLaterStr;

      let reminderType = null;
      let reminderKey = '';

      if (isDueToday) {
        reminderType = 'due_today';
        reminderKey = `due_today_${todayStr}`;
      } else if (isDueInTwoDays) {
        reminderType = 'two_days_prior';
        reminderKey = `two_days_prior_${todayStr}`;
      }

      // Ensure idempotency so reminder isn't sent multiple times on the same date
      const alreadySent = remindersSent.some(r => r.key === reminderKey || (r.type === reminderType && r.date === todayStr));
      if (reminderType && !alreadySent) {
        const assignees = Array.isArray(task.assignees) && task.assignees.length ? task.assignees : (task.assignedTo ? [task.assignedTo] : []);
        const targetUsers = await db.collection('users').find({
          id: { $in: assignees },
          active: true,
          telegramOptIn: true,
          telegramNotificationsEnabled: true
        }).toArray();

        let dispatchedForTask = 0;
        for (const targetUser of targetUsers) {
          try {
            await sendDepartmentReminderTelegram(db, targetUser, task, reminderType);
            sentCount++;
            dispatchedForTask++;
          } catch (err) {
            console.error(`[Auto Telegram Dept Reminder Error] Task ${task.id} user ${targetUser.id}:`, err);
          }
        }

        const newReminderEntry = {
          key: reminderKey,
          type: reminderType,
          date: todayStr,
          at: new Date().toISOString(),
          sentCount: dispatchedForTask,
          targetUserIds: targetUsers.map(u => u.id)
        };

        await db.collection('department_tasks').updateOne(
          { id: task.id },
          { $push: { remindersSent: newReminderEntry } }
        );

        results.push({
          taskId: task.id,
          title: task.title,
          department: task.department,
          reminderType,
          recipients: targetUsers.map(u => u.name)
        });
      }
    }

    return {
      ok: true,
      todayStr,
      twoDaysLaterStr,
      activeTasksChecked: activeTasks.length,
      sentCount,
      dispatched: results
    };
  } catch (error) {
    console.error('[processDepartmentReminders Error]', error);
    return { ok: false, error: error.message, sentCount: 0, dispatched: [] };
  }
}


