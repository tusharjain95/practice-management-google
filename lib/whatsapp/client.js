import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { robotoRegularBase64, robotoBoldBase64 } from './fonts-base64.js';

// WhatsApp Configuration from Environment
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const PROVIDER = process.env.WHATSAPP_PROVIDER || (ACCESS_TOKEN && PHONE_NUMBER_ID ? 'whatsapp' : 'mock');

console.log(`[WhatsApp Client] Loaded with provider: "${PROVIDER}"`);
const TASK_ASSIGNED_TEMPLATE = process.env.WHATSAPP_TASK_TEMPLATE || 'task_assigned_notification';
const TASK_REASSIGNED_TEMPLATE = process.env.WHATSAPP_REASSIGNED_TEMPLATE || 'task_reassigned_notification';
const TASK_DISCUSSION_TEMPLATE = process.env.WHATSAPP_DISCUSSION_TEMPLATE || 'task_discussion_notification';
const ROSTER_TEMPLATE = process.env.WHATSAPP_ROSTER_TEMPLATE || 'daily_staff_roster_pdf';
const LANGUAGE_CODE = process.env.WHATSAPP_LANGUAGE_CODE || 'en';
const APP_BASE_URL = process.env.APP_BASE_URL || '';

/**
 * Log WhatsApp notification to database
 */
export async function logNotification(db, { type, user, templateName, status, messageId, error }) {
  try {
    const whatsappNotifications = db.collection('whatsapp_notifications');
    const logEntry = {
      id: Math.random().toString(36).substring(2, 11),
      orgId: user?.activeOrgId || (user?.orgs && user.orgs[0]?.orgId) || null,
      type,
      recipientUserId: user.id,
      recipientName: user.name,
      recipientPhone: user.whatsappNumber || '',
      templateName,
      status,
      providerMessageId: messageId || null,
      error: error || null,
      createdAt: new Date().toISOString(),
      sentAt: status === 'sent' ? new Date().toISOString() : null,
    };
    await whatsappNotifications.insertOne(logEntry);
    console.log(`[WhatsApp Log] ${type} to ${user.name} (${status}): ${error || 'success'}`);
    return logEntry;
  } catch (err) {
    console.error('[WhatsApp Log Error] Failed to log notification in DB:', err);
  }
}

/**
 * Send template message using Meta WhatsApp Cloud API
 */
export async function sendWhatsAppTemplateMessage(to, templateName, components, documentPayload = null) {
  if (PROVIDER === 'mock' || !ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.log(`[WhatsApp Mock Send] To: ${to}, Template: ${templateName}, Components:`, JSON.stringify(components), documentPayload ? `With document: ${documentPayload.filename}` : '');
    return { success: true, messageId: `mock_msg_${Math.random().toString(36).substring(2, 15)}` };
  }

  try {
    // Format recipient phone number: strip spaces, dashes, ensure prefix
    let cleanPhone = to.replace(/[\s\-\+\(\)]/g, '');
    if (!cleanPhone.startsWith('91') && cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone; // Default to India prefix if 10-digit
    }

    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    
    // Structure components
    const finalComponents = [];
    
    // Add header component if sending a document
    if (documentPayload) {
      finalComponents.push({
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: {
              link: documentPayload.link,
              filename: documentPayload.filename,
              caption: documentPayload.caption || ''
            }
          }
        ]
      });
    }

    // Add body components
    if (components && components.length > 0) {
      finalComponents.push({
        type: 'body',
        parameters: components.map(text => ({ type: 'text', text }))
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: LANGUAGE_CODE
        },
        components: finalComponents
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `WhatsApp API error: ${res.status}`);
    }

    const messageId = data.messages?.[0]?.id || 'success';
    return { success: true, messageId };
  } catch (error) {
    console.error(`[WhatsApp Send Failed] ${templateName}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send WhatsApp notification when a task is assigned
 */
export async function sendTaskAssignedWhatsApp(db, user, task) {
  if (!user || !user.whatsappNumber || !user.whatsappOptIn || !user.whatsappNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (task && task.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: task.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[WhatsApp Notification Org Lookup Error]', e);
    }
  }

  const taskTitleWithOrg = orgName ? `[${orgName}] ${task.title || 'Untitled Task'}` : (task.title || 'Untitled Task');

  // Template placeholders: Staff Name, Task Title, Due Date, Priority
  const params = [
    user.name || 'Staff',
    taskTitleWithOrg,
    task.dueDate || 'No due date',
    task.priority || 'Medium'
  ];

  const res = await sendWhatsAppTemplateMessage(user.whatsappNumber, TASK_ASSIGNED_TEMPLATE, params);
  
  await logNotification(db, {
    type: 'TASK_ASSIGNED',
    user,
    templateName: TASK_ASSIGNED_TEMPLATE,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Send WhatsApp notification when a task is reassigned
 */
export async function sendTaskReassignedWhatsApp(db, user, task) {
  if (!user || !user.whatsappNumber || !user.whatsappOptIn || !user.whatsappNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (task && task.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: task.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[WhatsApp Notification Org Lookup Error]', e);
    }
  }

  const taskTitleWithOrg = orgName ? `[${orgName}] ${task.title || 'Untitled Task'}` : (task.title || 'Untitled Task');

  // Template placeholders: Staff Name, Task Title, Due Date, Priority
  const params = [
    user.name || 'Staff',
    taskTitleWithOrg,
    task.dueDate || 'No due date',
    task.priority || 'Medium'
  ];

  const res = await sendWhatsAppTemplateMessage(user.whatsappNumber, TASK_REASSIGNED_TEMPLATE, params);

  await logNotification(db, {
    type: 'TASK_REASSIGNED',
    user,
    templateName: TASK_REASSIGNED_TEMPLATE,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Send WhatsApp notification when a task is assigned for discussion to a manager
 */
export async function sendTaskDiscussionWhatsApp(db, user, task) {
  if (!user || !user.whatsappNumber || !user.whatsappOptIn || !user.whatsappNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (task && task.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: task.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[WhatsApp Notification Org Lookup Error]', e);
    }
  }

  const taskTitleWithOrg = orgName ? `[${orgName}] ${task.title || 'Untitled Task'}` : (task.title || 'Untitled Task');

  // Template placeholders: Manager Name, Task Title, Due Date, Priority
  const params = [
    user.name || 'Manager',
    taskTitleWithOrg,
    task.dueDate || 'No due date',
    task.priority || 'Medium'
  ];

  const res = await sendWhatsAppTemplateMessage(user.whatsappNumber, TASK_DISCUSSION_TEMPLATE, params);

  await logNotification(db, {
    type: 'TASK_DISCUSSION',
    user,
    templateName: TASK_DISCUSSION_TEMPLATE,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Send Daily WhatsApp Roster PDF
 */
export async function sendDailyRosterPdfWhatsApp(db, user, date, publicPdfUrl) {
  if (!user || !user.whatsappNumber || !user.whatsappOptIn || !user.dailyRosterEnabled) {
    return;
  }

  const filename = `roster_${(user.name || 'staff').toLowerCase().replace(/[^a-z0-9]/g, '_')}_${date}.pdf`;
  const documentPayload = {
    link: publicPdfUrl,
    filename,
    caption: `Your Daily Task Roster for ${date}`
  };

  // Body placeholders: Staff Name, Date
  const bodyParams = [
    user.name || 'Staff',
    date
  ];

  const res = await sendWhatsAppTemplateMessage(user.whatsappNumber, ROSTER_TEMPLATE, bodyParams, documentPayload);

  await logNotification(db, {
    type: 'DAILY_ROSTER',
    user,
    templateName: ROSTER_TEMPLATE,
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Generate PDF buffer using pdfkit
 */
/**
 * Helper to draw a cute, sleek modern checklist logo with a gold star next to it.
 */
function drawLogo(doc, x, y) {
  doc.save();
  // Draw page shadow / backing
  doc.roundedRect(x + 2, y + 2, 32, 38, 4).fillColor('#E2E8F0').fill();
  
  // White page with folded corner
  doc.roundedRect(x, y, 32, 38, 4).fillColor('#FFFFFF').fill();
  doc.roundedRect(x, y, 32, 38, 4).lineWidth(1.5).strokeColor('#4F46E5').stroke();
  
  // Checklist lines
  doc.lineCap('round');
  doc.lineWidth(1.5).strokeColor('#10B981');
  // Cute checkmark
  doc.moveTo(x + 8, y + 15).lineTo(x + 12, y + 19).lineTo(x + 20, y + 11).stroke();
  
  // Lines
  doc.strokeColor('#94A3B8');
  doc.moveTo(x + 8, y + 26).lineTo(x + 24, y + 26).stroke();
  doc.moveTo(x + 8, y + 31).lineTo(x + 18, y + 31).stroke();
  
  // A cute sparkling star next to it
  doc.fillColor('#F59E0B');
  doc.moveTo(x + 26, y + 4).lineTo(x + 28, y + 8).lineTo(x + 32, y + 9).lineTo(x + 29, y + 11).lineTo(x + 30, y + 15).lineTo(x + 26, y + 13).lineTo(x + 22, y + 15).lineTo(x + 23, y + 11).lineTo(x + 20, y + 9).lineTo(x + 24, y + 8).closePath().fill();
  doc.restore();
}

/**
 * Helper to draw a rotated, cute rounded-rect sticker with a dotted white inner border.
 */
function drawSticker(doc, x, y, text, color = '#F59E0B') {
  const savedY = doc.y;
  const savedX = doc.x;
  doc.save();
  doc.translate(x, y);
  doc.rotate(-8); // rotate slightly for a sticker effect
  // Sticker background with soft shadow
  doc.roundedRect(-40, -12, 80, 24, 6).fillColor(color).fill();
  // Sticker inner dotted border
  doc.roundedRect(-38, -10, 76, 20, 5).lineWidth(1).strokeColor('#FFFFFF').dash(3, {space: 2}).stroke();
  // Sticker text
  doc.fillColor('#FFFFFF').fontSize(8).font('Roboto-Bold').text(text, -40, -4, { width: 80, align: 'center' });
  doc.restore();
  doc.y = savedY;
  doc.x = savedX;
}

/**
 * Helper to draw a cute, small steaming pink coffee cup.
 */
function drawCoffeeCup(doc, x, y) {
  doc.save();
  doc.translate(x, y);
  // Cup body
  doc.roundedRect(0, 4, 16, 14, 2).fillColor('#F43F5E').fill(); // Pink cup
  // Handle
  doc.moveTo(16, 7).bezierCurveTo(21, 7, 21, 15, 16, 15).lineWidth(2).strokeColor('#F43F5E').stroke();
  // Steam
  doc.lineWidth(1).strokeColor('#FDA4AF');
  doc.moveTo(4, 1).bezierCurveTo(3, -1, 5, -1, 4, -3).stroke();
  doc.moveTo(8, 1).bezierCurveTo(7, -1, 9, -1, 8, -3).stroke();
  doc.moveTo(12, 1).bezierCurveTo(11, -1, 13, -1, 12, -3).stroke();
  doc.restore();
}

/**
 * Generate PDF buffer using pdfkit
 */
export function generateRosterPdfBuffer(staffName, date, data) {
  return new Promise((resolve, reject) => {
    try {
      const regularFontBuffer = Buffer.from(robotoRegularBase64, 'base64');
      const boldFontBuffer = Buffer.from(robotoBoldBase64, 'base64');

      // --- INTERCEPT PDFKit Font Init and Font method to Avoid Helvetica.afm Load Error on Next.js/Vercel ---
      const origInitFonts = PDFDocument.prototype.initFonts;
      PDFDocument.prototype.initFonts = function() {
        this._fontFamilies = {};
        this._fontCount = 0;
        this._registeredFonts = {};
        this._fontSource = null;
        this._fontFamily = null;
        this._fontSize = 12;
        this._font = null;
        this._remSize = 12;
      };

      const origFont = PDFDocument.prototype.font;
      PDFDocument.prototype.font = function(name, size) {
        if (!this._registeredFonts['Roboto-Regular']) {
          this.registerFont('Roboto-Regular', regularFontBuffer);
        }
        if (!this._registeredFonts['Roboto-Bold']) {
          this.registerFont('Roboto-Bold', boldFontBuffer);
        }

        if (name === 'Helvetica' || name === 'Helvetica-Bold' || !name) {
          const targetFont = name === 'Helvetica-Bold' ? 'Roboto-Bold' : 'Roboto-Regular';
          return origFont.call(this, targetFont, size);
        }

        return origFont.call(this, name, size);
      };

      const doc = new PDFDocument({ margin: 40, size: 'A4' });

      // Restore original prototype functions immediately so other usage isn't permanently modified
      PDFDocument.prototype.initFonts = origInitFonts;
      PDFDocument.prototype.font = origFont;

      // Override doc.font on the instance so that subsequent calls during document drawing correctly route Helvetica to Roboto
      const originalDocFont = doc.font;
      doc.font = function(name, size) {
        if (name === 'Helvetica' || name === 'Helvetica-Bold' || !name) {
          const targetFont = name === 'Helvetica-Bold' ? 'Roboto-Bold' : 'Roboto-Regular';
          return originalDocFont.call(doc, targetFont, size);
        }
        return originalDocFont.call(doc, name, size);
      };

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      // --- REGISTER CUSTOM FONTS (Avoids Next.js missing standard font .afm issues) ---
      doc.registerFont('Roboto-Regular', regularFontBuffer);
      doc.registerFont('Roboto-Bold', boldFontBuffer);

      const F_REGULAR = 'Roboto-Regular';
      const F_BOLD = 'Roboto-Bold';

      doc.font(F_REGULAR);

      // --- COLOR PALETTE ---
      const PRIMARY_COLOR = '#4F46E5'; // Indigo
      const TEXT_COLOR = '#1E293B'; // Slate 800
      const LIGHT_TEXT = '#64748B'; // Slate 500
      const OVERDUE_COLOR = '#EF4444'; // Red 500
      const BORDER_COLOR = '#E2E8F0'; // Slate 200
      const CARD_BG = '#F8FAFC'; // Slate 50

      // ==========================================
      // PAGE 1 — SUMMARY DASHBOARD
      // ==========================================
      
      // Header Banner
      doc.rect(0, 0, 595.28, 12).fill(PRIMARY_COLOR);
      doc.y = 40;

      // Draw custom cute logo next to title
      drawLogo(doc, 515, 30);

      // Title & Metadata
      doc.fillColor(PRIMARY_COLOR).fontSize(24).font(F_BOLD).text('DAILY TASK ROSTER', { tracking: 1 });
      doc.fillColor(LIGHT_TEXT).fontSize(10).font(F_REGULAR).text(`Generated on: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST`);
      doc.moveDown(1.5);

      // Staff Header Card
      const cardY = doc.y;
      doc.rect(40, cardY, 515, 52).fillAndStroke(CARD_BG, BORDER_COLOR);
      doc.fillColor(TEXT_COLOR).fontSize(12).font(F_BOLD).text('STAFF MEMBER:', 55, cardY + 10);
      doc.fontSize(15).fillColor(PRIMARY_COLOR).text(staffName.toUpperCase(), 55, cardY + 26);
      
      doc.fillColor(TEXT_COLOR).fontSize(12).font(F_BOLD).text('ROSTER DATE:', 350, cardY + 10);
      doc.fontSize(15).fillColor(LIGHT_TEXT).text(date, 350, cardY + 26);
      
      // Draw cute energy coffee cup next to the Date
      drawCoffeeCup(doc, 480, cardY + 26);

      doc.y = cardY + 68;
      doc.x = 40;

      // 1. PRIMARY TASK KPI SUMMARY
      doc.fillColor(TEXT_COLOR).fontSize(12).font(F_BOLD).text('TASK PERFORMANCE & WORKLOAD SUMMARY');
      drawSticker(doc, 510, doc.y - 4, '★ ROCKSTAR', '#F59E0B');
      doc.moveDown(0.4);

      // Task KPI Boxes Grid
      const kpiY = doc.y;
      const boxWidth = 91;
      const boxHeight = 52;
      const gap = 15;

      const kpis = [
        { label: 'Completed Yesterday', value: data.completedYesterdayCount || 0, color: '#10B981' },
        { label: 'Opened Yesterday', value: data.openedYesterdayCount || 0, color: '#6366F1' },
        { label: 'Assigned Yesterday', value: data.assignedYesterdayCount || 0, color: PRIMARY_COLOR },
        { label: 'Pending Tasks', value: data.pendingCount || 0, color: '#F59E0B' },
        { label: 'Overdue Tasks', value: data.overdueCount || 0, color: OVERDUE_COLOR }
      ];

      kpis.forEach((kpi, idx) => {
        const x = 40 + idx * (boxWidth + gap);
        doc.rect(x, kpiY, boxWidth, boxHeight).fillAndStroke('#FFFFFF', BORDER_COLOR);
        
        // Value
        doc.fillColor(kpi.color).fontSize(16).font(F_BOLD).text(String(kpi.value), x + 4, kpiY + 8, { width: boxWidth - 8, align: 'center' });
        // Label
        doc.fillColor(LIGHT_TEXT).fontSize(7).font(F_REGULAR).text(kpi.label, x + 2, kpiY + 32, { width: boxWidth - 4, align: 'center' });
      });

      doc.y = kpiY + 62;
      doc.x = 40;

      // 2. MILESTONE & SUB-DELIVERABLES KPI SUMMARY
      doc.fillColor(TEXT_COLOR).fontSize(12).font(F_BOLD).text('MILESTONES & SUB-DELIVERABLES PROGRESS');
      drawSticker(doc, 510, doc.y - 4, '⚡ MILESTONES', '#6366F1');
      doc.moveDown(0.4);

      const mKpiY = doc.y;
      const mKpis = [
        { label: 'Bigger Tasks', value: data.biggerTasksCount || 0, color: '#7C3AED' },
        { label: 'Total Milestones', value: data.totalMilestonesCount || 0, color: '#4338CA' },
        { label: 'Milestones Done', value: `${data.completedMilestonesCount || 0} (${data.milestoneCompletionRate || 0}%)`, color: '#10B981' },
        { label: 'Milestones Pending', value: data.pendingMilestonesCount || 0, color: '#F59E0B' },
        { label: 'Overdue Milestones', value: data.overdueMilestonesCount || 0, color: '#EF4444' }
      ];

      mKpis.forEach((kpi, idx) => {
        const x = 40 + idx * (boxWidth + gap);
        doc.rect(x, mKpiY, boxWidth, boxHeight).fillAndStroke('#FFFFFF', BORDER_COLOR);
        
        // Value
        doc.fillColor(kpi.color).fontSize(14).font(F_BOLD).text(String(kpi.value), x + 4, mKpiY + 8, { width: boxWidth - 8, align: 'center' });
        // Label
        doc.fillColor(LIGHT_TEXT).fontSize(7).font(F_REGULAR).text(kpi.label, x + 2, mKpiY + 32, { width: boxWidth - 4, align: 'center' });
      });

      doc.y = mKpiY + 70;
      doc.x = 40;

      // Productivity Summary Notes with cute FOCUS Sticker
      doc.fillColor(TEXT_COLOR).fontSize(12).font(F_BOLD).text('Productivity Analysis & Focus Area');
      drawSticker(doc, 510, doc.y - 4, '🎯 DAILY FOCUS', '#10B981');
      doc.moveDown(0.4);
      
      const textX = 40;
      const textWidth = 515;
      doc.fillColor(TEXT_COLOR).fontSize(9.5).font(F_REGULAR);
      
      let analysisText = `Hello ${staffName}, today is ${date}. You have ${data.pendingCount} pending task(s) in your active roster pipeline. `;
      if (data.overdueCount > 0) {
        analysisText += `CRITICAL ACTION REQUIRED: You currently have ${data.overdueCount} overdue task(s). Please prioritize these immediately to avoid compliance delays. `;
      } else {
        analysisText += `Great job! You have no overdue tasks in your roster today. Keep up the high standard of delivery! `;
      }

      if (data.dueTodayCount > 0) {
        analysisText += `You have ${data.dueTodayCount} task(s) due today. Ensure they are addressed before the close of business. `;
      } else {
        analysisText += `No main tasks are explicitly due today. `;
      }

      if (data.totalMilestonesCount > 0) {
        analysisText += `You are tracking ${data.biggerTasksCount || 0} bigger task(s) containing ${data.totalMilestonesCount} sub-milestone deliverable(s) (${data.completedMilestonesCount || 0} completed • ${data.milestoneCompletionRate || 0}%, ${data.pendingMilestonesCount || 0} active). `;
        if (data.overdueMilestonesCount > 0) {
          analysisText += `⚠️ ATTENTION: ${data.overdueMilestonesCount} milestone(s) are past their due dates and require immediate review. `;
        }
        if (data.dueTodayMilestonesCount > 0) {
          analysisText += `📅 ${data.dueTodayMilestonesCount} milestone(s) are due today. `;
        }
        if (data.awaitingDiscussionMilestonesCount > 0) {
          analysisText += `🗣️ ${data.awaitingDiscussionMilestonesCount} milestone(s) have been flagged for manager discussion. `;
        }
      }
      
      doc.text(analysisText, textX, doc.y, { width: textWidth, align: 'justify', lineGap: 3.5 });

      // Visual Divider / Footer of Page 1
      doc.moveDown(2);
      doc.strokeColor(BORDER_COLOR).lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.8);
      doc.x = 40;
      doc.fillColor(LIGHT_TEXT).fontSize(8.5).font(F_REGULAR).text('Please refer to Page 2 for your detailed task roster with milestones breakdown, and Page 3 for organization team workloads.', { align: 'center' });

      // ==========================================
      // PAGE 2 — DETAILED TASK BREAKDOWN
      // ==========================================
      doc.addPage();
      
      // Header Banner
      doc.rect(0, 0, 595.28, 12).fill(PRIMARY_COLOR);
      
      // Steam coffee cup icon on top right
      drawCoffeeCup(doc, 540, 20);

      doc.y = 40;
      doc.fillColor(PRIMARY_COLOR).fontSize(18).font(F_BOLD).text('DETAILED TASK WORKLOAD (MY TASKS)');
      doc.fillColor(LIGHT_TEXT).fontSize(10).font(F_REGULAR).text(`Staff: ${staffName}  |  Date: ${date}`);
      doc.moveDown(1.5);

      const renderTaskTable = (title, taskList, highlightColor = TEXT_COLOR, showAssignedTo = false) => {
        doc.x = 40; // Reset left margin to prevent any prior x-coordinate pollution
        
        // Smart pagination check: if we're near the bottom of the page, start a fresh page
        if (doc.y > 630) {
          doc.addPage();
          doc.rect(0, 0, 595.28, 12).fill(PRIMARY_COLOR);
          drawCoffeeCup(doc, 540, 20);
          doc.y = 40;
          doc.x = 40;
        }

        doc.fillColor(highlightColor).fontSize(12).font(F_BOLD).text(title);
        doc.moveDown(0.4);

        if (!taskList || taskList.length === 0) {
          doc.fillColor(LIGHT_TEXT).fontSize(9).font(F_REGULAR).text('No active tasks in this category.');
          doc.moveDown(1.5);
          doc.x = 40;
          return;
        }

        // Table Header
        const startY = doc.y;
        doc.rect(40, startY, 515, 20).fill(CARD_BG);
        doc.fillColor(TEXT_COLOR).fontSize(9).font(F_BOLD);
        
        if (showAssignedTo) {
          doc.text('Task Title', 45, startY + 5, { width: 160 });
          doc.text('Client', 210, startY + 5, { width: 90 });
          doc.text('Assigned To', 305, startY + 5, { width: 110 });
          doc.text('Due Date', 420, startY + 5, { width: 65 });
          doc.text('Status', 490, startY + 5, { width: 60 });
        } else {
          doc.text('Task Title', 45, startY + 5, { width: 180 });
          doc.text('Client', 230, startY + 5, { width: 110 });
          doc.text('Due Date', 350, startY + 5, { width: 70 });
          doc.text('Priority', 430, startY + 5, { width: 50 });
          doc.text('Status', 490, startY + 5, { width: 60 });
        }
        
        let currentY = startY + 20;

        // Truncate helper
        const trunc = (str, len) => str && str.length > len ? str.slice(0, len - 3) + '...' : (str || '-');

        // Table Rows
        taskList.forEach(task => {
          const hasMilestones = task.milestones && Array.isArray(task.milestones) && task.milestones.length > 0;
          const completedMCount = hasMilestones ? task.milestones.filter(m => m.completed).length : 0;
          const totalMCount = hasMilestones ? task.milestones.length : 0;
          const mProgressPct = totalMCount > 0 ? Math.round((completedMCount / totalMCount) * 100) : 0;

          // Estimate vertical height needed for this task including its milestone block
          let taskBlockHeight = 24;
          if (hasMilestones) {
            taskBlockHeight += 18 + (task.milestones.length * 16) + (task.milestones.filter(m => m.needsDiscussion).length * 12) + 8;
          }

          // If block doesn't fit on this page, start new page
          if (currentY + Math.min(taskBlockHeight, 100) > 740) {
            doc.addPage();
            doc.rect(0, 0, 595.28, 12).fill(PRIMARY_COLOR);
            drawCoffeeCup(doc, 540, 20);
            doc.y = 40;
            doc.x = 40;
            doc.fillColor(PRIMARY_COLOR).fontSize(12).font(F_BOLD).text(`${title} (Continued)`);
            doc.moveDown(0.4);
            
            const subStartY = doc.y;
            doc.rect(40, subStartY, 515, 20).fill(CARD_BG);
            doc.fillColor(TEXT_COLOR).fontSize(9).font(F_BOLD);
            
            if (showAssignedTo) {
              doc.text('Task Title', 45, subStartY + 5, { width: 160 });
              doc.text('Client', 210, subStartY + 5, { width: 90 });
              doc.text('Assigned To', 305, subStartY + 5, { width: 110 });
              doc.text('Due Date', 420, subStartY + 5, { width: 65 });
              doc.text('Status', 490, subStartY + 5, { width: 60 });
            } else {
              doc.text('Task Title', 45, subStartY + 5, { width: 180 });
              doc.text('Client', 230, subStartY + 5, { width: 110 });
              doc.text('Due Date', 350, subStartY + 5, { width: 70 });
              doc.text('Priority', 430, subStartY + 5, { width: 50 });
              doc.text('Status', 490, subStartY + 5, { width: 60 });
            }
            
            currentY = subStartY + 20;
          }

          // Row background line
          doc.strokeColor(BORDER_COLOR).lineWidth(0.5).moveTo(40, currentY).lineTo(555, currentY).stroke();

          // Main Task Row Text
          doc.fillColor(TEXT_COLOR).fontSize(8.5).font(F_REGULAR);
          
          let displayTitle = task.title;
          if (hasMilestones) {
            displayTitle = `[★ ${completedMCount}/${totalMCount}] ` + task.title;
          }

          if (showAssignedTo) {
            doc.text(trunc(displayTitle, 35), 45, currentY + 6, { width: 160 });
            doc.text(trunc(task.clientName || 'General', 20), 210, currentY + 6, { width: 90 });
            doc.text(trunc(task.assignedToName || 'Unassigned', 25), 305, currentY + 6, { width: 110 });
            doc.text(task.dueDate || 'No Date', 420, currentY + 6, { width: 65 });
            doc.text(task.status || 'Pending', 490, currentY + 6, { width: 60 });
          } else {
            doc.text(trunc(displayTitle, 38), 45, currentY + 6, { width: 180 });
            doc.text(trunc(task.clientName || 'General', 25), 230, currentY + 6, { width: 110 });
            doc.text(task.dueDate || 'No Date', 350, currentY + 6, { width: 70 });
            
            // Priority badge / text color
            let prioColor = LIGHT_TEXT;
            if (task.priority === 'High' || task.priority === 'Urgent') prioColor = OVERDUE_COLOR;
            doc.fillColor(prioColor).font(F_BOLD).text(task.priority || 'Medium', 430, currentY + 6, { width: 50 });
            
            doc.fillColor(TEXT_COLOR).font(F_REGULAR).text(task.status || 'Pending', 490, currentY + 6, { width: 60 });
          }

          currentY += 22;

          // ==========================================
          // DETAILED MILESTONES SUB-BLOCK (IF PRESENT)
          // ==========================================
          if (hasMilestones) {
            const subX = 52;
            const subWidth = 500;

            // Header for Milestones Sub-Table
            if (currentY > 730) {
              doc.addPage();
              doc.rect(0, 0, 595.28, 12).fill(PRIMARY_COLOR);
              drawCoffeeCup(doc, 540, 20);
              doc.y = 40;
              doc.x = 40;
              currentY = 40;
            }

            // Sub-card header
            doc.roundedRect(subX, currentY, subWidth, 16, 2).fillAndStroke('#EEF2FF', '#C7D2FE');
            doc.fillColor('#3730A3').font(F_BOLD).fontSize(7.5);
            doc.text(`⚡ MILESTONE DELIVERABLES — ${completedMCount}/${totalMCount} COMPLETED (${mProgressPct}%)`, subX + 8, currentY + 4, { width: subWidth - 16 });
            currentY += 18;

            // Render each milestone
            task.milestones.forEach((m, mIdx) => {
              if (currentY > 735) {
                doc.addPage();
                doc.rect(0, 0, 595.28, 12).fill(PRIMARY_COLOR);
                drawCoffeeCup(doc, 540, 20);
                doc.y = 40;
                doc.x = 40;
                currentY = 40;
              }

              // Determine status text and color
              let statusLabel = '[○ PENDING]';
              let statusColor = '#D97706';
              if (m.completed) {
                statusLabel = '[✓ DONE]';
                statusColor = '#059669';
              } else if (m.isOverdue) {
                statusLabel = '[! OVERDUE]';
                statusColor = '#DC2626';
              } else if (m.status === 'In Progress') {
                statusLabel = '[⏳ IN PROGRESS]';
                statusColor = '#2563EB';
              }

              // Background tint for milestone line
              const mRowBg = mIdx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
              const mRowHeight = m.needsDiscussion ? 26 : 15;
              doc.rect(subX, currentY, subWidth, mRowHeight).fill(mRowBg);

              // Left accent line
              doc.rect(subX, currentY, 2.5, mRowHeight).fill(statusColor);

              // 1. Status badge
              doc.fillColor(statusColor).font(F_BOLD).fontSize(7).text(statusLabel, subX + 8, currentY + 3, { width: 75 });

              // 2. Title
              doc.fillColor('#1E293B').font(F_BOLD).fontSize(7.5).text(`M${mIdx + 1}: ${trunc(m.title, 34)}`, subX + 85, currentY + 3, { width: 175 });

              // 3. Due Date
              const dueText = m.dueDate ? `Due: ${m.dueDate}` : 'No Due Date';
              doc.fillColor(m.isOverdue ? '#DC2626' : '#64748B').font(m.isOverdue ? F_BOLD : F_REGULAR).fontSize(7).text(dueText, subX + 265, currentY + 3, { width: 85 });

              // 4. Assignee
              const assigneeText = `👤 ${trunc(m.assignedToName || 'Unassigned', 20)}${m.isAssignedToUser ? ' ★(You)' : ''}`;
              doc.fillColor('#475569').font(F_REGULAR).fontSize(7).text(assigneeText, subX + 355, currentY + 3, { width: 135 });

              // 5. Discussion Note Sub-line (if flagged)
              if (m.needsDiscussion) {
                const discText = `🗣️ DISCUSSION WITH ${m.discussionWithName ? m.discussionWithName.toUpperCase() : 'MANAGER'}${m.discussionNote ? ` — Note: "${trunc(m.discussionNote, 42)}"` : ''}`;
                doc.fillColor('#BE123C').font(F_BOLD).fontSize(6.5).text(discText, subX + 85, currentY + 14, { width: subWidth - 95 });
              }

              // Subtle bottom divider
              doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(subX + 5, currentY + mRowHeight).lineTo(subX + subWidth - 5, currentY + mRowHeight).stroke();

              currentY += mRowHeight;
            });

            currentY += 4;
          }
        });

        // Bottom border
        doc.strokeColor(BORDER_COLOR).lineWidth(1).moveTo(40, currentY).lineTo(555, currentY).stroke();
        doc.moveDown(1.5);
        doc.y = currentY + 12;
        doc.x = 40; // Ensure left margin is completely restored
      };

      // SECTION B: OVERDUE TASKS (HIGHLIGHTED RED)
      renderTaskTable('SECTION A — CRITICAL OVERDUE TASKS', data.overdueTasks || [], OVERDUE_COLOR);

      // SECTION C: DUE TODAY TASKS
      renderTaskTable('SECTION B — TASKS DUE TODAY', data.dueTodayTasks || [], PRIMARY_COLOR);

      // SECTION A: GENERAL PENDING TASKS
      renderTaskTable('SECTION C — ALL OTHER PENDING TASKS (SORTED BY DUE DATE)', data.pendingTasks || []);

      // ==========================================
      // PAGE 3 — ORGANISATION-WISE TEAM TASKBOARD
      // ==========================================
      doc.addPage();
      
      // Header Banner
      doc.rect(0, 0, 595.28, 12).fill(PRIMARY_COLOR);
      
      // Steam coffee cup icon on top right
      drawCoffeeCup(doc, 540, 20);

      doc.y = 40;
      doc.x = 40; // Explicitly align Page 3 title on the left margin
      doc.fillColor(PRIMARY_COLOR).fontSize(18).font(F_BOLD).text('ORGANISATION TEAM WORKLOADS');
      doc.fillColor(LIGHT_TEXT).fontSize(10).font(F_REGULAR).text(`Overview of active tasks across all your registered organizations`);
      doc.moveDown(1.5);

      // Group orgWiseTasks by orgName
      const orgGroups = {};
      if (data.orgNameMap) {
        Object.values(data.orgNameMap).forEach(name => {
          orgGroups[name] = [];
        });
      }

      if (data.orgWiseTasks && data.orgWiseTasks.length > 0) {
        data.orgWiseTasks.forEach(task => {
          const name = task.orgName || 'Other Tasks';
          if (!orgGroups[name]) orgGroups[name] = [];
          orgGroups[name].push(task);
        });
      }

      const orgNames = Object.keys(orgGroups).sort();

      orgNames.forEach(orgName => {
        // Draw a cute sticker before each organization section
        drawSticker(doc, 510, doc.y + 10, '🏢 ' + orgName.slice(0, 10).toUpperCase(), '#6366F1');
        doc.moveDown(0.5);
        renderTaskTable(`TEAM WORKLOAD: ${orgName.toUpperCase()}`, orgGroups[orgName], '#312E81', true);
      });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Send a test WhatsApp message using the task template
 */
export async function sendTestWhatsApp(to, staffName) {
  const params = [
    staffName || 'Staff',
    'Workspace Test Connection',
    new Date().toLocaleDateString(),
    'High'
  ];
  return await sendWhatsAppTemplateMessage(to, TASK_ASSIGNED_TEMPLATE, params);
}

/**
 * Send custom text message to WhatsApp
 */
export async function sendWhatsAppTextMessage(to, text) {
  if (PROVIDER === 'mock' || !ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.log(`[WhatsApp Mock Send Message] To: ${to}\nText:\n${text}`);
    return { success: true, messageId: `mock_wa_msg_${Math.random().toString(36).substring(2, 15)}` };
  }

  try {
    let cleanPhone = to.replace(/[\s\-\+\(\)]/g, '');
    if (!cleanPhone.startsWith('91') && cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone; // Default to India prefix
    }

    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'text',
      text: {
        body: text
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `WhatsApp API error: ${res.status}`);
    }

    const messageId = data.messages?.[0]?.id || 'success';
    return { success: true, messageId };
  } catch (error) {
    console.error(`[WhatsApp Text Send Failed]:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send WhatsApp notification when a new comment is added to a task
 */
export async function sendTaskCommentWhatsApp(db, user, task, comment, commentatorName) {
  if (!user || !user.whatsappNumber || !user.whatsappOptIn || !user.whatsappNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (task && task.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: task.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[WhatsApp Notification Org Lookup Error]', e);
    }
  }

  const text = `💬 New Comment on Task!\n\nTask Title: ${task.title || 'Untitled Task'}\n${orgName ? `Organisation: ${orgName}\n` : ''}By: ${commentatorName}\nComment: ${comment.text || comment}\n\nPlease check your workspace for details.`;

  const res = await sendWhatsAppTextMessage(user.whatsappNumber, text);

  await logNotification(db, {
    type: 'TASK_COMMENT',
    user,
    templateName: 'text_comment_notification',
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

/**
 * Send WhatsApp notification when a new note is added to a lead
 */
export async function sendLeadNoteWhatsApp(db, user, lead, note, commentatorName) {
  if (!user || !user.whatsappNumber || !user.whatsappOptIn || !user.whatsappNotificationsEnabled) {
    return;
  }

  let orgName = '';
  if (lead && lead.orgId) {
    try {
      const org = await db.collection('organisations').findOne({ id: lead.orgId });
      if (org) orgName = org.name;
    } catch (e) {
      console.error('[WhatsApp Notification Org Lookup Error]', e);
    }
  }

  const text = `💬 New Note on Lead!\n\nLead Name: ${lead.name || 'Anonymous'}\n${orgName ? `Organisation: ${orgName}\n` : ''}By: ${commentatorName}\nNote: ${note.text || note}\n\nPlease check your workspace for details.`;

  const res = await sendWhatsAppTextMessage(user.whatsappNumber, text);

  await logNotification(db, {
    type: 'LEAD_NOTE',
    user,
    templateName: 'text_lead_note_notification',
    status: res.success ? 'sent' : 'failed',
    messageId: res.messageId,
    error: res.error
  });
}

