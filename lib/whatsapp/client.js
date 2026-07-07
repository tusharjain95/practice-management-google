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

  // Template placeholders: Staff Name, Task Title, Due Date, Priority
  const params = [
    user.name || 'Staff',
    task.title || 'Untitled Task',
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

  // Template placeholders: Staff Name, Task Title, Due Date, Priority
  const params = [
    user.name || 'Staff',
    task.title || 'Untitled Task',
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

      // Title & Metadata
      doc.fillColor(PRIMARY_COLOR).fontSize(24).font(F_BOLD).text('DAILY TASK ROSTER', { tracking: 1 });
      doc.fillColor(LIGHT_TEXT).fontSize(10).font(F_REGULAR).text(`Generated on: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST`);
      doc.moveDown(1.5);

      // Staff Header Card
      const cardY = doc.y;
      doc.rect(40, cardY, 515, 60).fillAndStroke(CARD_BG, BORDER_COLOR);
      doc.fillColor(TEXT_COLOR).fontSize(14).font(F_BOLD).text('STAFF MEMBER:', 55, cardY + 15);
      doc.fontSize(16).fillColor(PRIMARY_COLOR).text(staffName.toUpperCase(), 55, cardY + 32);
      
      doc.fillColor(TEXT_COLOR).fontSize(14).font(F_BOLD).text('ROSTER DATE:', 350, cardY + 15);
      doc.fontSize(16).fillColor(LIGHT_TEXT).text(date, 350, cardY + 32);
      
      doc.y = cardY + 90;

      // KPI Metrics Header
      doc.fillColor(TEXT_COLOR).fontSize(14).font(F_BOLD).text('PERFORMANCE & WORKLOAD SUMMARY');
      doc.moveDown(0.5);

      // KPI Boxes Grid
      const kpiY = doc.y;
      const boxWidth = 91;
      const boxHeight = 70;
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
        doc.fillColor(kpi.color).fontSize(20).font(F_BOLD).text(String(kpi.value), x + 5, kpiY + 15, { width: boxWidth - 10, align: 'center' });
        // Label
        doc.fillColor(LIGHT_TEXT).fontSize(7.5).font(F_REGULAR).text(kpi.label, x + 3, kpiY + 45, { width: boxWidth - 6, align: 'center' });
      });

      doc.y = kpiY + 100;

      // Productivity Summary Notes
      doc.fillColor(TEXT_COLOR).fontSize(12).font(F_BOLD).text('Productivity Analysis & Focus Area');
      doc.moveDown(0.5);
      
      const textX = 40;
      const textWidth = 515;
      doc.fillColor(TEXT_COLOR).fontSize(10).font(F_REGULAR);
      
      let analysisText = `Hello ${staffName}, today is ${date}. You have ${data.pendingCount} pending tasks in your pipeline. `;
      if (data.overdueCount > 0) {
        analysisText += `CRITICAL ACTION REQUIRED: You currently have ${data.overdueCount} overdue tasks. Please prioritize these immediately to avoid compliance and client delays. `;
      } else {
        analysisText += `Great job! You have no overdue tasks in your roster today. Keep up the high standard of delivery! `;
      }

      if (data.dueTodayCount > 0) {
        analysisText += `You have ${data.dueTodayCount} tasks due today. Ensure they are addressed before the close of business.`;
      } else {
        analysisText += `No tasks are explicitly due today, allowing you to focus on your general backlog and overdue items.`;
      }
      
      doc.text(analysisText, textX, doc.y, { width: textWidth, align: 'justify', lineGap: 4 });

      // Visual Divider / Footer of Page 1
      doc.moveDown(3);
      doc.strokeColor(BORDER_COLOR).lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(1);
      doc.fillColor(LIGHT_TEXT).fontSize(9).font(F_REGULAR).text('Please refer to Page 2 for a complete breakdown of all your tasks and priorities.', { align: 'center' });

      // ==========================================
      // PAGE 2 — DETAILED TASK BREAKDOWN
      // ==========================================
      doc.addPage();
      
      // Header Banner
      doc.rect(0, 0, 595.28, 12).fill(PRIMARY_COLOR);
      doc.y = 40;

      doc.fillColor(PRIMARY_COLOR).fontSize(18).font(F_BOLD).text('DETAILED TASK WORKLOAD');
      doc.fillColor(LIGHT_TEXT).fontSize(10).font(F_REGULAR).text(`Staff: ${staffName}  |  Date: ${date}`);
      doc.moveDown(1.5);

      const renderTaskTable = (title, taskList, highlightColor = TEXT_COLOR) => {
        doc.fillColor(highlightColor).fontSize(12).font(F_BOLD).text(title);
        doc.moveDown(0.4);

        if (!taskList || taskList.length === 0) {
          doc.fillColor(LIGHT_TEXT).fontSize(9).font(F_REGULAR).text('No tasks in this category.');
          doc.moveDown(1.5);
          return;
        }

        // Table Header
        const startY = doc.y;
        doc.rect(40, startY, 515, 20).fill(CARD_BG);
        doc.fillColor(TEXT_COLOR).fontSize(9).font(F_BOLD);
        doc.text('Task Title', 45, startY + 5, { width: 180 });
        doc.text('Client', 230, startY + 5, { width: 110 });
        doc.text('Due Date', 350, startY + 5, { width: 70 });
        doc.text('Priority', 430, startY + 5, { width: 50 });
        doc.text('Status', 490, startY + 5, { width: 60 });
        
        let currentY = startY + 20;

        // Table Rows
        taskList.forEach(task => {
          // Check if overflow page needed
          if (currentY > 740) {
            doc.addPage();
            doc.rect(0, 0, 595.28, 12).fill(PRIMARY_COLOR);
            doc.y = 40;
            doc.fillColor(PRIMARY_COLOR).fontSize(12).font(F_BOLD).text(`${title} (Continued)`);
            doc.moveDown(0.4);
            
            const subStartY = doc.y;
            doc.rect(40, subStartY, 515, 20).fill(CARD_BG);
            doc.fillColor(TEXT_COLOR).fontSize(9).font(F_BOLD);
            doc.text('Task Title', 45, subStartY + 5, { width: 180 });
            doc.text('Client', 230, subStartY + 5, { width: 110 });
            doc.text('Due Date', 350, subStartY + 5, { width: 70 });
            doc.text('Priority', 430, subStartY + 5, { width: 50 });
            doc.text('Status', 490, subStartY + 5, { width: 60 });
            
            currentY = subStartY + 20;
          }

          // Row background alternating or subtle line
          doc.strokeColor(BORDER_COLOR).lineWidth(0.5).moveTo(40, currentY).lineTo(555, currentY).stroke();

          doc.fillColor(TEXT_COLOR).fontSize(8.5).font(F_REGULAR);
          
          // Truncate function
          const trunc = (str, len) => str && str.length > len ? str.slice(0, len - 3) + '...' : (str || '-');
          
          doc.text(trunc(task.title, 40), 45, currentY + 6, { width: 180 });
          doc.text(trunc(task.clientName || 'General', 25), 230, currentY + 6, { width: 110 });
          doc.text(task.dueDate || 'No Date', 350, currentY + 6, { width: 70 });
          
          // Priority badge / text color
          let prioColor = LIGHT_TEXT;
          if (task.priority === 'High' || task.priority === 'Urgent') prioColor = OVERDUE_COLOR;
          doc.fillColor(prioColor).font(F_BOLD).text(task.priority || 'Medium', 430, currentY + 6, { width: 50 });
          
          doc.fillColor(TEXT_COLOR).font(F_REGULAR).text(task.status || 'Pending', 490, currentY + 6, { width: 60 });

          currentY += 22;
        });

        // Bottom border
        doc.strokeColor(BORDER_COLOR).lineWidth(1).moveTo(40, currentY).lineTo(555, currentY).stroke();
        doc.moveDown(2);
        doc.y = currentY + 15;
      };

      // SECTION B: OVERDUE TASKS (HIGHLIGHTED RED)
      renderTaskTable('SECTION A — CRITICAL OVERDUE TASKS', data.overdueTasks || [], OVERDUE_COLOR);

      // SECTION C: DUE TODAY TASKS
      renderTaskTable('SECTION B — TASKS DUE TODAY', data.dueTodayTasks || [], PRIMARY_COLOR);

      // SECTION A: GENERAL PENDING TASKS
      renderTaskTable('SECTION C — ALL OTHER PENDING TASKS (SORTED BY DUE DATE)', data.pendingTasks || []);

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
