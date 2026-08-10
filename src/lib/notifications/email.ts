/**
 * Smart EDMS — Email delivery service
 *
 * Supports two transports:
 *   1. SMTP (nodemailer) — configured via SMTP_HOST env var
 *   2. Console (dev) — logs email to console when SMTP not configured
 *
 * All emails are HTML + text dual-part with branded templates.
 */

import { promises as fs } from 'fs';

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

let cachedTransporter: any = null;

async function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  if (!process.env.SMTP_HOST) return null;

  const nodemailer = await import('nodemailer');
  const config: SmtpConfig = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Smart EDMS <noreply@smartedms.local>',
  };

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });

  return cachedTransporter;
}

export async function sendEmail(params: EmailParams): Promise<{ ok: boolean; message: string }> {
  const transporter = await getTransporter();

  if (!transporter) {
    // Dev mode — log to console
    console.log('\n📧 EMAIL (dev mode — configure SMTP_HOST for delivery)');
    console.log(`   To: ${params.to}`);
    console.log(`   Subject: ${params.subject}`);
    console.log(`   Text: ${params.text.slice(0, 200)}…`);
    console.log('');
    return { ok: true, message: 'Email logged (dev mode — no SMTP configured)' };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Smart EDMS <noreply@smartedms.local>',
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    return { ok: true, message: 'Email sent' };
  } catch (err: any) {
    console.error('[email] Failed to send:', err.message);
    return { ok: false, message: err.message };
  }
}

// ---------------------------------------------------------------------------
//  Templated emails
// ---------------------------------------------------------------------------

function wrapTemplate(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 32px 24px; }
    .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .logo { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }
    .logo-icon { width: 28px; height: 28px; background: linear-gradient(135deg, #0f172a, #334155); border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; color: white; font-size: 14px; }
    h1 { font-size: 20px; color: #0f172a; margin: 0 0 16px 0; }
    p { color: #475569; line-height: 1.6; margin: 0 0 16px 0; }
    .btn { display: inline-block; padding: 10px 24px; background: linear-gradient(135deg, #0f172a, #334155); color: white; text-decoration: none; border-radius: 8px; font-weight: 500; margin: 8px 0; }
    .alert { padding: 12px 16px; border-radius: 8px; margin: 16px 0; }
    .alert-warning { background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; }
    .alert-danger { background: #fee2e2; border: 1px solid #ef4444; color: #991b1b; }
    .alert-info { background: #dbeafe; border: 1px solid #3b82f6; color: #1e40af; }
    .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">
        <span class="logo-icon">S</span>
        Smart EDMS
      </div>
      ${bodyHtml}
    </div>
    <p class="footer">Smart EDMS — Secure Document Governance Platform<br>This is an automated message. Do not reply.</p>
  </div>
</body>
</html>`;
}

export async function sendInvitationEmail(
  to: string,
  tenantName: string,
  inviteUrl: string,
  inviterEmail: string,
  locale: string = 'en',
): Promise<void> {
  const isArabic = locale === 'ar';
  const title = isArabic ? 'دعوة' : "You're invited";
  const heading = isArabic
    ? `تمت دعوتك إلى ${tenantName}`
    : `You've been invited to ${tenantName}`;
  const bodyText = isArabic
    ? `<strong>${inviterEmail}</strong> دعاك للانضمام إلى Smart EDMS في <strong>${tenantName}</strong>.`
    : `<strong>${inviterEmail}</strong> has invited you to join Smart EDMS at <strong>${tenantName}</strong>.`;
  const btnText = isArabic ? 'قبول الدعوة' : 'Accept invitation';
  const expiresText = isArabic ? 'تنتهي صلاحية الدعوة خلال 7 أيام.' : 'Your invitation expires in 7 days.';
  const subject = isArabic ? `دعوة إلى ${tenantName} على Smart EDMS` : `Invitation to ${tenantName} on Smart EDMS`;

  const html = wrapTemplate(title, `
    <h1>${heading}</h1>
    <p>${bodyText}</p>
    <p>${expiresText}</p>
    <a href="${inviteUrl}" class="btn">${btnText}</a>
    <p style="font-size: 13px; color: #64748b; margin-top: 16px;">
      <code>${inviteUrl}</code>
    </p>
  `);
  const text = isArabic
    ? `تمت دعوتك إلى ${tenantName} بواسطة ${inviterEmail}.\n\nاقبل الدعوة: ${inviteUrl}\n\nتنتهي الصلاحية خلال 7 أيام.`
    : `You've been invited to ${tenantName} by ${inviterEmail}.\n\nAccept: ${inviteUrl}\n\nExpires in 7 days.`;
  await sendEmail({ to, subject, html, text });
}

export async function sendFailedLoginAlert(
  to: string,
  ip: string,
  attemptCount: number,
): Promise<void> {
  const html = wrapTemplate('Failed login attempts', `
    <h1>Failed login attempts on your account</h1>
    <div class="alert alert-warning">
      <strong>${attemptCount}</strong> failed login attempt(s) were recorded on your Smart EDMS account.
    </div>
    <p><strong>IP address:</strong> <code>${ip}</code></p>
    <p>If this was not you, consider changing your password immediately and enabling MFA if you haven't already.</p>
    <p>Your account will be temporarily locked after 5 failed attempts.</p>
  `);
  const text = `${attemptCount} failed login attempts on your account from IP ${ip}.\n\nIf this was not you, change your password and enable MFA.`;
  await sendEmail({ to, subject: `[Smart EDMS] ${attemptCount} failed login attempts`, html, text });
}

export async function sendAccountLockedAlert(
  to: string,
  email: string,
  ip: string,
): Promise<void> {
  const html = wrapTemplate('Account locked', `
    <h1>Account locked</h1>
    <div class="alert alert-danger">
      The account <strong>${email}</strong> has been locked after 5 failed login attempts.
    </div>
    <p><strong>IP address:</strong> <code>${ip}</code></p>
    <p>The account will be automatically unlocked after 15 minutes. If you believe this is an attack, contact your administrator immediately.</p>
  `);
  const text = `Account ${email} locked after 5 failed logins from ${ip}. Auto-unlocks in 15 minutes.`;
  await sendEmail({ to, subject: `[Smart EDMS] Account locked: ${email}`, html, text });
}

export async function sendBreakGlassAlert(
  to: string,
  userName: string,
  userEmail: string,
  reason: string,
  expiresAt: Date,
): Promise<void> {
  const html = wrapTemplate('⚠️ Break-glass access granted', `
    <h1>Break-glass emergency access granted</h1>
    <div class="alert alert-danger">
      <strong>${userEmail}</strong> was granted emergency administrative access.
    </div>
    <p><strong>User:</strong> ${userName} (${userEmail})</p>
    <p><strong>Reason:</strong> ${reason}</p>
    <p><strong>Expires:</strong> ${expiresAt.toISOString()}</p>
    <p>All actions taken during this session are audit-logged with break-glass attribution. Please review the audit trail after the session expires.</p>
  `);
  const text = `Break-glass access granted to ${userEmail}. Reason: ${reason}. Expires: ${expiresAt.toISOString()}. Review audit trail.`;
  await sendEmail({ to, subject: `[Smart EDMS] ⚠️ Break-glass access by ${userEmail}`, html, text });
}

export async function sendWorkflowAssignedEmail(
  to: string,
  documentTitle: string,
  workflowName: string,
  workflowUrl: string,
): Promise<void> {
  const html = wrapTemplate('Approval requested', `
    <h1>You have a document to approve</h1>
    <p>An approval has been assigned to you in Smart EDMS.</p>
    <p><strong>Document:</strong> ${documentTitle}</p>
    <p><strong>Workflow:</strong> ${workflowName}</p>
    <a href="${workflowUrl}" class="btn">Review &amp; approve</a>
  `);
  const text = `Approval requested for "${documentTitle}" (${workflowName}).\n\nReview: ${workflowUrl}`;
  await sendEmail({ to, subject: `[Smart EDMS] Approval requested: ${documentTitle}`, html, text });
}

export async function sendShareNotificationEmail(
  to: string,
  documentTitle: string,
  sharedBy: string,
  shareUrl: string,
): Promise<void> {
  const html = wrapTemplate('Document shared with you', `
    <h1>A document has been shared with you</h1>
    <p><strong>${sharedBy}</strong> shared a document with you on Smart EDMS.</p>
    <p><strong>Document:</strong> ${documentTitle}</p>
    <a href="${shareUrl}" class="btn">View document</a>
  `);
  const text = `${sharedBy} shared "${documentTitle}" with you.\n\nView: ${shareUrl}`;
  await sendEmail({ to, subject: `[Smart EDMS] Document shared: ${documentTitle}`, html, text });
}

export async function sendDispositionApprovalEmail(
  to: string,
  documentTitle: string,
  action: string,
  url: string,
): Promise<void> {
  const html = wrapTemplate('Disposition approval required', `
    <h1>Disposition approval required</h1>
    <div class="alert alert-warning">
      A document is pending <strong>${action}</strong> disposition and requires your approval.
    </div>
    <p><strong>Document:</strong> ${documentTitle}</p>
    <a href="${url}" class="btn">Review disposition</a>
  `);
  const text = `Disposition approval required for "${documentTitle}" (action: ${action}).\n\nReview: ${url}`;
  await sendEmail({ to, subject: `[Smart EDMS] Disposition approval: ${documentTitle}`, html, text });
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<void> {
  const html = wrapTemplate('Password reset', `
    <h1>Password reset request</h1>
    <p>We received a request to reset your Smart EDMS password.</p>
    <div class="alert alert-info">
      This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.
    </div>
    <a href="${resetUrl}" class="btn">Reset password</a>
    <p style="font-size: 13px; color: #64748b; margin-top: 16px;">
      Or copy this link: <code>${resetUrl}</code>
    </p>
  `);
  const text = `Password reset request.\n\nReset your password: ${resetUrl}\n\nThis link expires in 30 minutes.`;
  await sendEmail({ to, subject: '[Smart EDMS] Password reset', html, text });
}
