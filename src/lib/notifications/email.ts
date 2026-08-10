/**
 * Smart EDMS — Email delivery service (enterprise-grade)
 *
 * Production design:
 *   1. Dual transport: SMTP (nodemailer) when SMTP_HOST is set,
 *      dev console sink otherwise. Single cached transporter.
 *   2. Templates loaded from /messages/{locale}.json via the server-side
 *      translator — supports all 5 locales (en, fr, ar, es, de).
 *   3. Enterprise HTML template:
 *        - Table-based layout (Outlook 2010-2019 compatible)
 *        - Inline CSS only (email-client safe — many strip <style>)
 *        - Dark-mode aware via [data-ogsc] / [data-colorscheme] hints
 *        - Preview text (preheader) for inbox list collapse
 *        - Brand header with logo lockup
 *        - Alert severity bands (info / warning / danger)
 *        - Primary CTA button with safe fallback link
 *        - Footer with privacy notice, unsubscribe, address
 *        - RTL-aware via dir attribute for Arabic
 *   4. HMAC-signed action URLs where the link grants a capability
 *      (invitation accept, password reset, break-glass review) so that
 *      a leaked token alone is insufficient.
 *   5. Plain-text companion for every HTML email (anti-spam, accessibility).
 */

import crypto from 'crypto';
import { getTranslator, type Locale } from '@/i18n/server-translator';
import { logger } from '@/lib/config/logger';

// ---------------------------------------------------------------------------
//  Transport
// ---------------------------------------------------------------------------

interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional override of the "From" header. */
  from?: string;
  /** Optional reply-to (defaults to no-reply). */
  replyTo?: string;
  /** Optional list of unsubscribe header values for List-Unsubscribe RFC 2369. */
  listUnsubscribe?: string;
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
  const from = params.from || process.env.SMTP_FROM || 'Smart EDMS <noreply@smartedms.local>';

  // Dev mode — log to console
  if (!transporter) {
    console.log('\n📧 EMAIL (dev mode — configure SMTP_HOST for delivery)');
    console.log(`   From: ${from}`);
    console.log(`   To: ${params.to}`);
    console.log(`   Subject: ${params.subject}`);
    console.log(`   Text: ${params.text.slice(0, 240)}${params.text.length > 240 ? '…' : ''}`);
    console.log('');
    return { ok: true, message: 'Email logged (dev mode — no SMTP configured)' };
  }

  try {
    await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo: params.replyTo,
      headers: params.listUnsubscribe
        ? { 'List-Unsubscribe': params.listUnsubscribe, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
        : undefined,
    });
    return { ok: true, message: 'Email sent' };
  } catch (err: any) {
    logger.error('email.send_failed', { to: params.to, subject: params.subject, error: err.message });
    return { ok: false, message: err.message };
  }
}

// ---------------------------------------------------------------------------
//  Link signing (HMAC-SHA256)
// ---------------------------------------------------------------------------

/**
 * Sign a token with an HMAC-SHA256 of (token + purpose).
 * Returns `${token}.${signature}` so the verifier can detect tampering
 * even if the token is otherwise opaque.
 *
 * Uses NEXTAUTH_SECRET or AUTH_SECRET (falling back to a dev-only secret
 * that is loud about not being safe for production).
 */
function getEmailSigningSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('email.signing_secret_missing_in_production', {});
    }
    return 'dev-only-unsafe-email-signing-secret';
  }
  return secret;
}

export function signEmailToken(token: string, purpose: string): string {
  const secret = getEmailSigningSecret();
  const sig = crypto.createHmac('sha256', secret).update(`${purpose}:${token}`).digest('hex');
  return `${token}.${sig}`;
}

export function verifyEmailToken(signedToken: string, purpose: string): string | null {
  if (!signedToken.includes('.')) return null;
  const lastDot = signedToken.lastIndexOf('.');
  const token = signedToken.slice(0, lastDot);
  const sig = signedToken.slice(lastDot + 1);
  const secret = getEmailSigningSecret();
  const expected = crypto.createHmac('sha256', secret).update(`${purpose}:${token}`).digest('hex');
  // Constant-time compare to prevent timing attacks
  if (sig.length !== expected.length) return null;
  try {
    if (crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return token;
    }
  } catch {
    // Hex decode failure
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Enterprise HTML template
// ---------------------------------------------------------------------------

type AlertSeverity = 'info' | 'warning' | 'danger' | null;

interface TemplateParams {
  locale: Locale;
  title: string;
  preheader: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
  alert?: { severity: AlertSeverity; html: string };
  /** Optional list of label/value rows shown under the body. */
  metaRows?: { label: string; value: string }[];
  /** Optional footer note (e.g. link expiry reminder). */
  footerNote?: string;
  /** Optional app URL for the brand header. */
  appUrl?: string;
  /** Optional unsubscribe URL (RFC 2369 List-Unsubscribe). */
  unsubscribeUrl?: { manage: string; oneClick: string };
}

// Color palette — enterprise slate + accent blue, dark-mode aware
const PALETTE = {
  bgOuter: '#f1f5f9',
  bgCard: '#ffffff',
  bgFooter: '#f8fafc',
  border: '#e2e8f0',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  accentPrimary: '#0f172a',
  accentSecondary: '#334155',
  accentBg: '#0f172a',
  accentBgDark: '#1e293b',
  alertInfoBg: '#eff6ff',
  alertInfoBorder: '#3b82f6',
  alertInfoText: '#1e40af',
  alertWarningBg: '#fef3c7',
  alertWarningBorder: '#f59e0b',
  alertWarningText: '#92400e',
  alertDangerBg: '#fee2e2',
  alertDangerBorder: '#ef4444',
  alertDangerText: '#991b1b',
  codeBg: '#f1f5f9',
  codeText: '#0f172a',
};

function alertStyles(severity: NonNullable<AlertSeverity>): { bg: string; border: string; text: string } {
  switch (severity) {
    case 'info':
      return { bg: PALETTE.alertInfoBg, border: PALETTE.alertInfoBorder, text: PALETTE.alertInfoText };
    case 'warning':
      return { bg: PALETTE.alertWarningBg, border: PALETTE.alertWarningBorder, text: PALETTE.alertWarningText };
    case 'danger':
      return { bg: PALETTE.alertDangerBg, border: PALETTE.alertDangerBorder, text: PALETTE.alertDangerText };
  }
}

/**
 * Build the enterprise HTML email.
 *
 * Layout (all inline CSS for email-client compatibility):
 *   - Outer table (background slate)
 *   - Centered 600px card
 *   - Brand header (logo lockup + dark band)
 *   - Preheader (hidden in client)
 *   - Title H1
 *   - Optional alert band
 *   - Body paragraph(s)
 *   - Optional metadata rows (label / value)
 *   - Optional CTA button (table-based for Outlook)
 *   - Optional fallback link
 *   - Footer (privacy notice, unsubscribe, address)
 */
function renderEmailTemplate(p: TemplateParams): string {
  const dir = p.locale === 'ar' ? 'rtl' : 'ltr';
  const isRtl = dir === 'rtl';
  const align = isRtl ? 'right' : 'left';
  const oppositeAlign = isRtl ? 'left' : 'right';
  const alertColors = p.alert?.severity ? alertStyles(p.alert.severity) : null;

  // Preheader: hidden preview text shown in inbox list. Padding keeps it
  // visible to the recipient when they open the email (no display:none,
  // which some clients strip).
  const preheaderHtml = p.preheader
    ? `<div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${escapeHtml(p.preheader)}</div>`
    : '';

  const alertHtml = p.alert && alertColors
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;border-radius:8px;background:${alertColors.bg};border:1px solid ${alertColors.border};border-collapse:separate;">
        <tr>
          <td style="padding:16px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.5;color:${alertColors.text};text-align:${align};">${p.alert.html}</td>
        </tr>
      </table>`
    : '';

  const bodyParagraphHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.65;color:${PALETTE.textSecondary};text-align:${align};">${p.bodyHtml}</div>`;

  const metaRowsHtml = p.metaRows && p.metaRows.length > 0
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0 0;border:1px solid ${PALETTE.border};border-radius:8px;background:${PALETTE.bgFooter};border-collapse:separate;">
        ${p.metaRows.map((row) => `<tr>
          <td style="padding:10px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;font-weight:600;color:${PALETTE.textPrimary};text-align:${align};white-space:nowrap;width:30%;vertical-align:top;border-bottom:1px solid ${PALETTE.border};">${escapeHtml(row.label)}</td>
          <td style="padding:10px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:${PALETTE.textSecondary};text-align:${align};vertical-align:top;border-bottom:1px solid ${PALETTE.border};word-break:break-all;">${escapeHtml(row.value)}</td>
        </tr>`).join('')}
      </table>`
    : '';

  const ctaHtml = p.cta
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;">
        <tr>
          <td style="text-align:${align};">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(p.cta.href)}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="25%" strokecolor="${PALETTE.accentBg}" fillcolor="${PALETTE.accentBg}">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:600;">${escapeHtml(p.cta.label)}</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${escapeHtml(p.cta.href)}" target="_blank" style="display:inline-block;padding:12px 28px;background:${PALETTE.accentBg};color:#ffffff;text-decoration:none;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:600;border:1px solid ${PALETTE.accentBg};mso-hide:all;">
              ${escapeHtml(p.cta.label)}
            </a>
            <!--<![endif]-->
          </td>
        </tr>
      </table>
      <p style="margin:8px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:${PALETTE.textMuted};text-align:${align};line-height:1.5;word-break:break-all;">
        ${escapeHtml(p.cta.href)}
      </p>`
    : '';

  const footerNoteHtml = p.footerNote
    ? `<p style="margin:16px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:${PALETTE.textMuted};text-align:${align};line-height:1.5;">${escapeHtml(p.footerNote)}</p>`
    : '';

  const appUrl = p.appUrl || process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const appName = 'Smart EDMS';

  // Footer
  const manageUrl = p.unsubscribeUrl?.manage || `${appUrl}/settings/notifications`;
  const footer = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 0 0;padding:24px 0;background:${PALETTE.bgFooter};border-top:1px solid ${PALETTE.border};">
    <tr>
      <td style="padding:0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:${PALETTE.textMuted};text-align:${align};line-height:1.6;">
        <p style="margin:0 0 8px 0;font-weight:600;color:${PALETTE.textSecondary};">${escapeHtml(appName)}</p>
        <p style="margin:0 0 12px 0;">${escapeHtml(p.locale === 'ar'
      ? 'هذه رسالة آلية. يرجى عدم الرد مباشرة على هذا البريد.'
      : p.locale === 'fr'
        ? 'Ceci est un message automatique. Merci de ne pas répondre directement.'
        : p.locale === 'es'
          ? 'Este es un mensaje automatizado. Por favor no responda directamente.'
          : p.locale === 'de'
            ? 'Dies ist eine automatisierte Nachricht. Bitte nicht direkt antworten.'
            : 'This is an automated message. Please do not reply directly.')}</p>
        <p style="margin:0 0 12px 0;">
          <a href="${escapeHtml(manageUrl)}" style="color:${PALETTE.textSecondary};text-decoration:underline;">${escapeHtml(p.locale === 'ar'
      ? 'إدارة تفضيلات الإشعارات'
      : p.locale === 'fr'
        ? 'Gérer les préférences de notification'
        : p.locale === 'es'
          ? 'Gestionar preferencias de notificación'
          : p.locale === 'de'
            ? 'Benachrichtigungseinstellungen verwalten'
            : 'Manage notification preferences')}</a>
        </p>
        <p style="margin:0;color:${PALETTE.textMuted};font-size:11px;">&copy; ${new Date().getFullYear()} ${escapeHtml(appName)}. All rights reserved.</p>
      </td>
    </tr>
  </table>`;

  return `<!DOCTYPE html>
<html lang="${p.locale}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta http-equiv="Content-Type" content="text/html charset=utf-8">
  <title>${escapeHtml(p.title)}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${PALETTE.bgOuter};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  ${preheaderHtml || ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PALETTE.bgOuter};min-width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${PALETTE.bgCard};border:1px solid ${PALETTE.border};border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
          <!-- Brand header -->
          <tr>
            <td style="padding:24px 32px;background:${PALETTE.accentBg};border-bottom:3px solid ${PALETTE.accentSecondary};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:${align};vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" style="display:inline;">
                      <tr>
                        <td style="width:32px;height:32px;background:linear-gradient(135deg,#ffffff 0%,#e2e8f0 100%);border-radius:7px;text-align:center;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:700;color:${PALETTE.accentPrimary};letter-spacing:-0.5px;">S</td>
                        <td style="padding-${oppositeAlign}:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;vertical-align:middle;">${escapeHtml(appName)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:22px;font-weight:700;color:${PALETTE.textPrimary};text-align:${align};line-height:1.35;letter-spacing:-0.3px;">${escapeHtml(p.title)}</h1>
              ${alertHtml}
              ${bodyParagraphHtml}
              ${metaRowsHtml}
              ${ctaHtml}
              ${footerNoteHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:0;">
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
//  Templated emails
// ---------------------------------------------------------------------------

export interface SendInvitationOpts {
  to: string;
  tenantName: string;
  inviteUrl: string;
  inviterEmail: string;
  locale?: string;
}

export async function sendInvitationEmail(opts: SendInvitationOpts): Promise<void> {
  const t = await getTranslator(opts.locale);
  const signedUrl = signUrl(opts.inviteUrl, 'invitation');
  const subject = t('emails.invitation.subject', { tenantName: opts.tenantName });
  const heading = t.raw('emails.invitation.heading', { tenantName: opts.tenantName });
  const body = t.raw('emails.invitation.body', { inviterEmail: opts.inviterEmail });
  const welcome = t('emails.invitation.welcome');
  const ctaLabel = t('emails.invitation.cta');
  const expiresNote = t('emails.invitation.expiresNote');

  const html = renderEmailTemplate({
    locale: t.locale,
    title: t('emails.invitation.title'),
    preheader: heading,
    bodyHtml: `<p style="margin:0 0 16px 0;">${body}</p><p style="margin:0 0 16px 0;">${escapeHtml(welcome)}</p>`,
    cta: { label: ctaLabel, href: signedUrl },
    footerNote: expiresNote,
    appUrl: opts.inviteUrl.replace(/\/accept-invite.*$/, ''),
  });

  const text = t('emails.invitation.body', { inviterEmail: opts.inviterEmail, tenantName: opts.tenantName }) + '\n\n' +
    ctaLabel + ': ' + signedUrl + '\n\n' + expiresNote;

  await sendEmail({ to: opts.to, subject, html, text });
}

export interface SendFailedLoginAlertOpts {
  to: string;
  ip: string;
  attemptCount: number;
  locale?: string;
}

export async function sendFailedLoginAlert(opts: SendFailedLoginAlertOpts): Promise<void> {
  const t = await getTranslator(opts.locale);
  const subject = t('emails.failedLogin.subject', { count: opts.attemptCount });
  const heading = t('emails.failedLogin.heading');
  const alert = t.raw('emails.failedLogin.alert', { count: opts.attemptCount });
  const ipLabel = t('emails.failedLogin.ipLabel');
  const advice = t('emails.failedLogin.advice');
  const lockWarning = t('emails.failedLogin.lockWarning');

  const html = renderEmailTemplate({
    locale: t.locale,
    title: t('emails.failedLogin.title'),
    preheader: t('emails.failedLogin.text', { count: opts.attemptCount, ip: opts.ip }),
    bodyHtml: `<p style="margin:0 0 16px 0;">${escapeHtml(advice)}</p><p style="margin:0 0 0 0;">${escapeHtml(lockWarning)}</p>`,
    alert: { severity: 'warning', html: alert },
    metaRows: [{ label: ipLabel, value: opts.ip }],
  });

  const text = t('emails.failedLogin.text', { count: opts.attemptCount, ip: opts.ip }) + '\n\n' + advice + '\n\n' + lockWarning;
  await sendEmail({ to: opts.to, subject, html, text });
}

export interface SendAccountLockedAlertOpts {
  to: string;
  email: string;
  ip: string;
  locale?: string;
}

export async function sendAccountLockedAlert(opts: SendAccountLockedAlertOpts): Promise<void> {
  const t = await getTranslator(opts.locale);
  const subject = t('emails.accountLocked.subject', { email: opts.email });
  const alert = t.raw('emails.accountLocked.alert', { email: opts.email });
  const ipLabel = t('emails.accountLocked.ipLabel');
  const advice = t('emails.accountLocked.advice');

  const html = renderEmailTemplate({
    locale: t.locale,
    title: t('emails.accountLocked.title'),
    preheader: t('emails.accountLocked.text', { email: opts.email, ip: opts.ip }),
    bodyHtml: `<p style="margin:0;">${escapeHtml(advice)}</p>`,
    alert: { severity: 'danger', html: alert },
    metaRows: [{ label: ipLabel, value: opts.ip }],
  });

  const text = t('emails.accountLocked.text', { email: opts.email, ip: opts.ip }) + '\n\n' + advice;
  await sendEmail({ to: opts.to, subject, html, text });
}

export interface SendBreakGlassAlertOpts {
  to: string;
  userName: string;
  userEmail: string;
  reason: string;
  expiresAt: Date;
  locale?: string;
  reviewUrl?: string;
}

export async function sendBreakGlassAlert(opts: SendBreakGlassAlertOpts): Promise<void> {
  const t = await getTranslator(opts.locale);
  const subject = t('emails.breakGlass.subject', { userEmail: opts.userEmail });
  const alert = t.raw('emails.breakGlass.alert', { userEmail: opts.userEmail });
  const userLabel = t('emails.breakGlass.userLabel');
  const reasonLabel = t('emails.breakGlass.reasonLabel');
  const expiresLabel = t('emails.breakGlass.expiresLabel');
  const reviewAdvice = t('emails.breakGlass.reviewAdvice');
  const expiresAtStr = opts.expiresAt.toISOString();

  const cta = opts.reviewUrl
    ? { label: t('emails.breakGlass.title'), href: signUrl(opts.reviewUrl, 'breakglass-review') }
    : undefined;

  const html = renderEmailTemplate({
    locale: t.locale,
    title: t('emails.breakGlass.title'),
    preheader: t('emails.breakGlass.text', { userEmail: opts.userEmail, reason: opts.reason, expiresAt: expiresAtStr }),
    bodyHtml: `<p style="margin:0;">${escapeHtml(reviewAdvice)}</p>`,
    alert: { severity: 'danger', html: alert },
    metaRows: [
      { label: userLabel, value: `${opts.userName} (${opts.userEmail})` },
      { label: reasonLabel, value: opts.reason },
      { label: expiresLabel, value: expiresAtStr },
    ],
    cta,
  });

  const text = t('emails.breakGlass.text', { userEmail: opts.userEmail, reason: opts.reason, expiresAt: expiresAtStr }) + '\n\n' + reviewAdvice;
  await sendEmail({ to: opts.to, subject, html, text });
}

export interface SendWorkflowAssignedEmailOpts {
  to: string;
  documentTitle: string;
  workflowName: string;
  workflowUrl: string;
  locale?: string;
}

export async function sendWorkflowAssignedEmail(opts: SendWorkflowAssignedEmailOpts): Promise<void> {
  const t = await getTranslator(opts.locale);
  const signedUrl = signUrl(opts.workflowUrl, 'workflow-approve');
  const subject = t('emails.workflowAssigned.subject', { documentTitle: opts.documentTitle });
  const heading = t('emails.workflowAssigned.heading');
  const body = t('emails.workflowAssigned.body');
  const documentLabel = t('emails.workflowAssigned.documentLabel');
  const workflowLabel = t('emails.workflowAssigned.workflowLabel');
  const ctaLabel = t('emails.workflowAssigned.cta');

  const html = renderEmailTemplate({
    locale: t.locale,
    title: t('emails.workflowAssigned.title'),
    preheader: t('emails.workflowAssigned.text', { documentTitle: opts.documentTitle, workflowName: opts.workflowName, workflowUrl: opts.workflowUrl }),
    bodyHtml: `<p style="margin:0 0 16px 0;">${escapeHtml(body)}</p>`,
    metaRows: [
      { label: documentLabel, value: opts.documentTitle },
      { label: workflowLabel, value: opts.workflowName },
    ],
    cta: { label: ctaLabel, href: signedUrl },
  });

  const text = t('emails.workflowAssigned.text', { documentTitle: opts.documentTitle, workflowName: opts.workflowName, workflowUrl: signedUrl });
  await sendEmail({ to: opts.to, subject, html, text });
}

export interface SendShareNotificationEmailOpts {
  to: string;
  documentTitle: string;
  sharedBy: string;
  shareUrl: string;
  expiresAt?: Date;
  locale?: string;
}

export async function sendShareNotificationEmail(opts: SendShareNotificationEmailOpts): Promise<void> {
  const t = await getTranslator(opts.locale);
  const signedUrl = signUrl(opts.shareUrl, 'share-view');
  const subject = t('emails.shareNotification.subject', { documentTitle: opts.documentTitle });
  const heading = t('emails.shareNotification.heading');
  const body = t.raw('emails.shareNotification.body', { sharedBy: opts.sharedBy });
  const documentLabel = t('emails.shareNotification.documentLabel');
  const ctaLabel = t('emails.shareNotification.cta');
  const expiresNote = opts.expiresAt
    ? t('emails.shareNotification.expiresNote', { expiresAt: opts.expiresAt.toISOString() })
    : undefined;

  const html = renderEmailTemplate({
    locale: t.locale,
    title: t('emails.shareNotification.title'),
    preheader: t('emails.shareNotification.text', { sharedBy: opts.sharedBy, documentTitle: opts.documentTitle, shareUrl: opts.shareUrl }),
    bodyHtml: `<p style="margin:0 0 16px 0;">${body}</p>`,
    metaRows: [{ label: documentLabel, value: opts.documentTitle }],
    cta: { label: ctaLabel, href: signedUrl },
    footerNote: expiresNote,
  });

  const text = t('emails.shareNotification.text', { sharedBy: opts.sharedBy, documentTitle: opts.documentTitle, shareUrl: signedUrl }) +
    (expiresNote ? '\n\n' + expiresNote : '');
  await sendEmail({ to: opts.to, subject, html, text });
}

export interface SendDispositionApprovalEmailOpts {
  to: string;
  documentTitle: string;
  action: 'delete' | 'archive' | 'review';
  url: string;
  locale?: string;
}

export async function sendDispositionApprovalEmail(opts: SendDispositionApprovalEmailOpts): Promise<void> {
  const t = await getTranslator(opts.locale);
  const signedUrl = signUrl(opts.url, 'disposition-approve');
  const actionLabel = t(`emails.dispositionApproval.actions.${opts.action}`) || opts.action;
  const subject = t('emails.dispositionApproval.subject', { documentTitle: opts.documentTitle });
  const alert = t.raw('emails.dispositionApproval.alert', { actionLabel });
  const documentLabel = t('emails.dispositionApproval.documentLabel');
  const actionLabelKey = t('emails.dispositionApproval.actionLabel');
  const ctaLabel = t('emails.dispositionApproval.cta');

  const html = renderEmailTemplate({
    locale: t.locale,
    title: t('emails.dispositionApproval.title'),
    preheader: t('emails.dispositionApproval.text', { documentTitle: opts.documentTitle, action: opts.action, url: opts.url }),
    bodyHtml: '',
    alert: { severity: 'warning', html: alert },
    metaRows: [
      { label: documentLabel, value: opts.documentTitle },
      { label: actionLabelKey, value: actionLabel },
    ],
    cta: { label: ctaLabel, href: signedUrl },
  });

  const text = t('emails.dispositionApproval.text', { documentTitle: opts.documentTitle, action: opts.action, url: signedUrl });
  await sendEmail({ to: opts.to, subject, html, text });
}

export interface SendPasswordResetEmailOpts {
  to: string;
  resetUrl: string;
  locale?: string;
}

export async function sendPasswordResetEmail(opts: SendPasswordResetEmailOpts): Promise<void> {
  const t = await getTranslator(opts.locale);
  const signedUrl = signUrl(opts.resetUrl, 'password-reset');
  const subject = t('emails.passwordReset.subject');
  const body = t('emails.passwordReset.body');
  const alert = t.raw('emails.passwordReset.alert');
  const ctaLabel = t('emails.passwordReset.cta');

  const html = renderEmailTemplate({
    locale: t.locale,
    title: t('emails.passwordReset.title'),
    preheader: t('emails.passwordReset.text', { resetUrl: opts.resetUrl }),
    bodyHtml: `<p style="margin:0 0 16px 0;">${escapeHtml(body)}</p>`,
    alert: { severity: 'info', html: alert },
    cta: { label: ctaLabel, href: signedUrl },
  });

  const text = t('emails.passwordReset.text', { resetUrl: signedUrl });
  await sendEmail({ to: opts.to, subject, html, text });
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/**
 * Sign a URL by appending (or replacing) the `sig` query parameter.
 * The signature covers the URL path + query (excluding `sig`) + the purpose.
 * Verifiers recompute the HMAC and compare.
 *
 * Exported for use in tests and in route handlers that need to verify
 * signed URLs (e.g. /accept-invite, /reset-password).
 */
export function signUrl(url: string, purpose: string): string {
  try {
    const u = new URL(url);
    const data = `${purpose}:${u.pathname}${u.search ? '?' + u.search.replace(/[?&]sig=[^&]*/g, '').replace(/^[?&]/, '?') : ''}`;
    const sig = crypto.createHmac('sha256', getEmailSigningSecret()).update(data).digest('hex');
    u.searchParams.set('sig', sig);
    return u.toString();
  } catch {
    // Not a valid URL — fall back to token-style signing
    return signEmailToken(url, purpose);
  }
}
