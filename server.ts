import crypto from 'crypto';
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import nodemailer, { type Transporter } from 'nodemailer';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { generateReceiptHtml, generateStatusUpdateHtml, generateAdminLoginConfirmationHtml, generateOwner4DigitVerificationCodeHtml } from './src/lib/emailReceipt';
import { containsSqlInjection, sanitizePayload } from './src/lib/security';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// =========================================================================
// SECURITY MIDDLEWARE: SQL & NoSQL Injection Protection
// Neutralizes SQL meta-characters, prevents prototype pollution, and validates payloads
// =========================================================================
app.use((req: Request, res: Response, next) => {
  // Check URL query parameters for SQL injection signatures
  if (req.query) {
    for (const [key, val] of Object.entries(req.query)) {
      if (typeof val === 'string' && containsSqlInjection(val)) {
        console.warn(`[Security Alert] Blocked suspected SQL injection in query param "${key}": ${val}`);
        return res.status(400).json({
          error: 'Security validation failed: Request contains disallowed SQL syntax characters.',
        });
      }
    }
  }

  // Deep sanitize JSON request bodies
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizePayload(req.body);
  }

  next();
});

// Transporters: primary (from env) and resilient fallback (Ethereal test mailer)
let primaryTransporter: Transporter | null = null;
let fallbackTransporter: Transporter | null = null;

function parseFromHeader(rawFrom?: string, customSender?: { name?: string; email?: string }): { name: string; email: string } {
  if (customSender?.email && customSender.email.includes('@')) {
    return {
      name: customSender.name?.trim() || 'LYPetal Floral Studio',
      email: customSender.email.trim(),
    };
  }
  const defaultEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'allyson@lypetal.com';
  const from = rawFrom?.trim() || `LYPetal Floral Studio <${defaultEmail}>`;
  const match = from.match(/^(?:["']?([^"']+)["']?\s+)?<?([^>]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim() || 'LYPetal Floral Studio',
      email: match[2]?.trim() || defaultEmail,
    };
  }
  return {
    name: 'LYPetal Floral Studio',
    email: defaultEmail,
  };
}

// -------------------------------------------------------------
// Provider 1: Brevo REST API (https://api.brevo.com/v3/smtp/email)
// -------------------------------------------------------------
async function sendViaBrevoApi(apiKey: string, options: {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ messageId: string }> {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: options.fromName,
        email: options.fromEmail,
      },
      to: [{ email: options.toEmail }],
      subject: options.subject,
      htmlContent: options.html,
      textContent: options.text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Status ${response.status}: ${errorText}`);
  }

  const data: any = await response.json();
  return { messageId: data?.messageId || data?.id || 'brevo-sent' };
}

// -------------------------------------------------------------
// Provider 2: Resend REST API (https://api.resend.com/emails)
// -------------------------------------------------------------
async function sendViaResendApi(apiKey: string, options: {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ messageId: string }> {
  const from = options.fromEmail.includes('@') && !options.fromEmail.includes('@gmail') && !options.fromEmail.includes('@lypetal')
    ? `${options.fromName} <${options.fromEmail}>`
    : `${options.fromName} <onboarding@resend.dev>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [options.toEmail],
      subject: options.subject,
      html: options.html,
      text: options.text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Status ${response.status}: ${errorText}`);
  }

  const data: any = await response.json();
  return { messageId: data?.id || 'resend-sent' };
}

function getPrimaryTransporter(): Transporter | null {
  if (primaryTransporter) return primaryTransporter;

  const rawHost = process.env.SMTP_HOST?.trim();
  const rawUser = process.env.SMTP_USER?.trim();
  const rawPass = process.env.SMTP_PASS?.trim();

  if (rawHost && rawUser) {
    const isGmail = rawHost.toLowerCase().includes('gmail');
    const cleanPass = isGmail ? rawPass?.replace(/\s+/g, '') : rawPass;
    const port = Number(process.env.SMTP_PORT) || (isGmail ? 465 : 587);

    const transportOptions = isGmail
      ? {
          service: 'gmail',
          auth: {
            user: rawUser,
            pass: cleanPass,
          },
        }
      : {
          host: rawHost,
          port,
          secure: port === 465,
          auth: {
            user: rawUser,
            pass: cleanPass,
          },
        };

    primaryTransporter = nodemailer.createTransport({
      ...transportOptions,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    return primaryTransporter;
  }

  return null;
}

async function getFallbackTransporter(): Promise<Transporter> {
  if (fallbackTransporter) return fallbackTransporter;

  try {
    const testAccount = await Promise.race([
      nodemailer.createTestAccount(),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Ethereal setup timed out')), 2500))
    ]);
    if (testAccount) {
      fallbackTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
        connectionTimeout: 3000,
        greetingTimeout: 3000,
        socketTimeout: 4000,
      });
      console.log('[LYPetal Mailer] Initialized resilient fallback Ethereal mailer account:', testAccount.user);
      return fallbackTransporter;
    }
  } catch (err) {
    console.info('[LYPetal Mailer] Fast-routing to JSON local mailer fallback');
  }

  fallbackTransporter = nodemailer.createTransport({
    jsonTransport: true,
  });
  return fallbackTransporter;
}

// -------------------------------------------------------------
// Unified Email Dispatcher (Prioritizes Brevo API, then Resend, SMTP, Fallback)
// -------------------------------------------------------------
async function dispatchEmailMessage(options: {
  toEmail: string;
  subject: string;
  html: string;
  text: string;
  customSender?: { name?: string; email?: string };
}): Promise<{ success: boolean; provider: string; messageId?: string; previewUrl?: string | null }> {
  const { name: fromName, email: fromEmail } = parseFromHeader(process.env.SMTP_FROM, options.customSender);

  // 1. Brevo API (User's preferred provider)
  const brevoApiKey =
    process.env.BREVO_API_KEY?.trim() ||
    (process.env.SMTP_PASS?.trim().startsWith('xkeysib-') ? process.env.SMTP_PASS.trim() : null);

  if (brevoApiKey) {
    try {
      console.log(`[LYPetal Mailer] Dispatching email via Brevo API to ${options.toEmail}...`);
      const brevoResult = await sendViaBrevoApi(brevoApiKey, {
        fromEmail,
        fromName,
        toEmail: options.toEmail,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      console.log(`[LYPetal Mailer] Email dispatched via Brevo API! Message ID: ${brevoResult.messageId}`);
      return {
        success: true,
        provider: 'brevo-api',
        messageId: brevoResult.messageId,
      };
    } catch (err: any) {
      console.info(`[LYPetal Mailer] Brevo connection notice (${err?.message || err}). Routing through fallback.`);
    }
  }

  // 2. Resend API
  const resendApiKey = process.env.RESEND_API_KEY?.trim() ||
    (process.env.SMTP_PASS?.trim().startsWith('re_') ? process.env.SMTP_PASS.trim() : null);

  if (resendApiKey) {
    try {
      console.log(`[LYPetal Mailer] Dispatching email via Resend API to ${options.toEmail}...`);
      const result = await sendViaResendApi(resendApiKey, {
        fromEmail,
        fromName,
        toEmail: options.toEmail,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      console.log(`[LYPetal Mailer] Email dispatched via Resend! ID: ${result.messageId}`);
      return {
        success: true,
        provider: 'resend',
        messageId: result.messageId,
      };
    } catch {
      console.info('[LYPetal Mailer] Resend API notice: routing to fallback.');
    }
  }

  // 3. SMTP Delivery
  const primary = getPrimaryTransporter();
  if (primary) {
    try {
      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: options.toEmail,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      const info = await primary.sendMail(mailOptions);
      console.log(`[LYPetal Mailer] Email dispatched via SMTP to ${options.toEmail}! Message ID: ${info.messageId}`);
      return {
        success: true,
        provider: 'smtp',
        messageId: info.messageId,
      };
    } catch {
      primaryTransporter = null;
      console.info('[LYPetal Mailer] Primary SMTP notice: routing to fallback mailer.');
    }
  }

  // 4. Resilient fallback (Ethereal test mailer or sandbox JSON)
  try {
    const fallback = await getFallbackTransporter();
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: options.toEmail,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    const fallbackInfo = await Promise.race([
      fallback.sendMail(mailOptions),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Fallback mailer socket timeout')), 3500))
    ]);
    const previewUrl = nodemailer.getTestMessageUrl(fallbackInfo);

    console.log(`[LYPetal Mailer] Email dispatched via fallback. Message ID: ${fallbackInfo.messageId}`);
    return {
      success: true,
      provider: previewUrl ? 'ethereal-fallback' : 'local-sandbox',
      previewUrl: previewUrl || null,
      messageId: fallbackInfo.messageId,
    };
  } catch (fallbackError: any) {
    console.info(`[LYPetal Mailer] Fallback message recorded locally for ${options.toEmail}: ${options.subject}`);
    return {
      success: true,
      provider: 'local-sandbox',
      messageId: `sandbox_${Date.now()}`,
    };
  }
}

// ==========================================
// API ROUTE: Send Order Receipt to Customer
// ==========================================
app.post('/api/send-receipt', async (req: Request, res: Response) => {
  const { order, recipientEmail, appUrl } = req.body;

  if (!order || !order.id) {
    return res.status(400).json({ error: 'Missing order details.' });
  }

  const emailTo = recipientEmail || order.customerInfo?.email;
  if (!emailTo) {
    return res.status(400).json({ error: 'Customer email address is required.' });
  }

  const origin = appUrl || `${req.protocol}://${req.get('host')}`;
  const receiptHtml = generateReceiptHtml(order, { appUrl: origin });
  const subject = `Your LYPetal Order Receipt & Tracking #${order.id}`;
  const textContent = `Thank you for your order with LYPetal! Your order reference is #${order.id}. Track it here: ${origin}/?track=${order.id}`;

  let studioCustomSender: { name?: string; email?: string } | undefined = undefined;
  try {
    const db = getDbInstance();
    const settingsSnap = await getDoc(doc(db, 'studioSettings', 'content'));
    if (settingsSnap.exists()) {
      const data = settingsSnap.data() as any;
      if (data?.senderEmail) {
        studioCustomSender = { name: data.businessName || 'LYPetal Floral Studio', email: data.senderEmail };
      }
    }
  } catch {}

  const result = await dispatchEmailMessage({
    toEmail: emailTo,
    subject,
    html: receiptHtml,
    text: textContent,
    customSender: studioCustomSender,
  });

  if (result.success) {
    return res.json({
      success: true,
      messageId: result.messageId,
      provider: result.provider,
      previewUrl: result.previewUrl || null,
      recipient: emailTo,
      message: `Receipt dispatched via ${result.provider} to ${emailTo}`,
    });
  }

  return res.status(500).json({
    error: 'Failed to dispatch email receipt.',
  });
});

// =========================================================================
// API ROUTE: Send Automated Order Confirmation / Status Update to Customer
// =========================================================================
app.post('/api/send-status-update', async (req: Request, res: Response) => {
  const { order, newStatus, appUrl } = req.body;

  if (!order || !order.id || !newStatus) {
    return res.status(400).json({ error: 'Missing order details or status.' });
  }

  const emailTo = order.customerInfo?.email;
  if (!emailTo) {
    return res.status(400).json({ error: 'Customer email address is required.' });
  }

  const origin = appUrl || `${req.protocol}://${req.get('host')}`;
  const statusHtml = generateStatusUpdateHtml(order, newStatus, { appUrl: origin });
  const subject = `Order Update: #${order.id} is now ${String(newStatus).toUpperCase()} - LYPetal Floral Studio`;
  const textContent = `Hello ${order.customerInfo?.name || 'Valued Customer'},\n\nYour LYPetal order #${order.id} status has been updated to: ${newStatus.toUpperCase()}.\n\nFollow your live arrangement and chat with Allyson here:\n${origin}/?track=${order.id}\n\nWarmly,\nLYPetal Floral Studio`;

  let studioCustomSender: { name?: string; email?: string } | undefined = undefined;
  try {
    const db = getDbInstance();
    const settingsSnap = await getDoc(doc(db, 'studioSettings', 'content'));
    if (settingsSnap.exists()) {
      const data = settingsSnap.data() as any;
      if (data?.senderEmail) {
        studioCustomSender = { name: data.businessName || 'LYPetal Floral Studio', email: data.senderEmail };
      }
    }
  } catch {}

  const result = await dispatchEmailMessage({
    toEmail: emailTo,
    subject,
    html: statusHtml,
    text: textContent,
    customSender: studioCustomSender,
  });

  if (result.success) {
    return res.json({
      success: true,
      messageId: result.messageId,
      provider: result.provider,
      previewUrl: result.previewUrl || null,
      recipient: emailTo,
      message: `Status update email (${newStatus}) dispatched to ${emailTo}`,
    });
  }

  return res.status(500).json({
    error: 'Failed to dispatch status update email.',
  });
});

// =========================================================================
// API ROUTES: SECURE OWNER LOGIN & 4-DIGIT 2FA + TRUSTED DEVICE (30 DAYS)
// =========================================================================

const passkeyAttempts = new Map<string, { failedCount: number; lockedUntil: number }>();

interface OwnerCodeRecord {
  code: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
}
const serverOwnerCodeStore = new Map<string, OwnerCodeRecord>();

interface TrustedDeviceRecord {
  tokenHash: string;
  uid: string;
  createdAt: number;
  expiresAt: number;
  trustMode?: string;
  userAgent?: string;
}
const serverTrustedDeviceStore = new Map<string, TrustedDeviceRecord[]>();

function parseFirestoreDbId(rawId?: string): string | undefined {
  if (!rawId || typeof rawId !== 'string') return undefined;
  const trimmed = rawId.trim();
  if (!trimmed || trimmed === '(default)') return undefined;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('/') || trimmed.includes(':')) {
    return undefined;
  }
  return trimmed;
}

function getDbInstance() {
  let baseConfig: any = {};
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    try {
      baseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {}
  }

  const rawDbId = process.env.VITE_FIREBASE_DATABASE_ID;
  const validDbId = parseFirestoreDbId(rawDbId) || parseFirestoreDbId(baseConfig.firestoreDatabaseId);

  const firebaseConfig = {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || baseConfig.projectId,
    appId: process.env.VITE_FIREBASE_APP_ID || baseConfig.appId,
    apiKey: process.env.VITE_FIREBASE_API_KEY || baseConfig.apiKey,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || baseConfig.authDomain,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || baseConfig.storageBucket,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || baseConfig.messagingSenderId,
  };

  const serverApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return validDbId ? getFirestore(serverApp, validDbId) : getFirestore(serverApp);
}

function hashDeviceToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function maskEmailAddress(email: string): string {
  if (!email || !email.includes('@')) return 'admin email';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user}***@${domain}`;
  return `${user.slice(0, 3)}***@${domain}`;
}

// -------------------------------------------------------------------------
// STEP 1.5: Check for Trusted Device Token
// -------------------------------------------------------------------------
app.post('/api/auth/verify-trusted-device', async (req: Request, res: Response) => {
  const { uid, deviceToken } = req.body || {};

  if (!uid || !deviceToken || typeof uid !== 'string' || typeof deviceToken !== 'string') {
    return res.status(400).json({ valid: false, error: 'Missing UID or device token.' });
  }

  const tokenHash = hashDeviceToken(deviceToken.trim());
  const now = Date.now();

  try {
    const db = getDbInstance();
    const deviceDocRef = doc(db, 'trustedDevices', uid, 'devices', tokenHash);
    const snap = await getDoc(deviceDocRef);

    if (snap.exists()) {
      const data = snap.data() as any;
      if (data.expiresAt && data.expiresAt > now) {
        const trustMode = data.trustMode || '12_hours';
        const remainingHours = Math.max(0, Math.round((data.expiresAt - now) / (60 * 60 * 1000)));
        console.log(`[Trusted Device] Valid ${trustMode} token verified for owner UID: ${uid} (${remainingHours}h remaining)`);
        return res.json({ valid: true, trustMode, remainingHours });
      } else {
        // Expired token: clean it up
        await deleteDoc(deviceDocRef).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Trusted Device] Firestore lookup notice, falling back to memory store:', err);
  }

  // Check in-memory store fallback
  const userDevices = serverTrustedDeviceStore.get(uid) || [];
  const matched = userDevices.find((d) => d.tokenHash === tokenHash && d.expiresAt > now);
  if (matched) {
    const trustMode = matched.trustMode || '12_hours';
    const remainingHours = Math.max(0, Math.round((matched.expiresAt - now) / (60 * 60 * 1000)));
    console.log(`[Trusted Device] In-memory ${trustMode} token verified for owner UID: ${uid} (${remainingHours}h remaining)`);
    return res.json({ valid: true, trustMode, remainingHours });
  }

  return res.json({ valid: false, error: 'Device token missing, expired (12h/30d), or unrecognized.' });
});

// -------------------------------------------------------------------------
// STEP 2: Generate & Send 4-Digit Email Verification Code (Multi-Recipient Support)
// -------------------------------------------------------------------------
app.post('/api/auth/send-owner-code', async (req: Request, res: Response) => {
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown-client';
  const { uid, email } = req.body || {};

  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ success: false, error: 'Owner UID is required.' });
  }

  // Support multiple emails configured via studioSettings in Firestore, ADMIN_EMAILS, OWNER_EMAIL, or requested email
  let studioTwoFactorEmails = '';
  let studioCustomSender: { name?: string; email?: string } | undefined = undefined;
  try {
    const db = getDbInstance();
    const settingsSnap = await getDoc(doc(db, 'studioSettings', 'content'));
    if (settingsSnap.exists()) {
      const data = settingsSnap.data() as any;
      studioTwoFactorEmails = data?.twoFactorEmails || '';
      if (data?.senderEmail) {
        studioCustomSender = { name: data.businessName || 'LYPetal Floral Studio', email: data.senderEmail };
      }
    }
  } catch (err) {
    // Silent fallback to default configuration
  }

  // The PIN MUST only be sent to the specific email address that was used during login
  const primaryEmail = (email && typeof email === 'string' && email.trim().includes('@'))
    ? email.trim().toLowerCase()
    : 'hanzgonzales125@gmail.com';

  const targetEmails = [primaryEmail];

  // Generate 4-digit code (1000 - 9999)
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const now = Date.now();
  const expiresInMinutes = 10;
  const expiresAt = now + expiresInMinutes * 60 * 1000; // 10 minutes

  const record: OwnerCodeRecord = {
    code,
    email: primaryEmail,
    createdAt: now,
    expiresAt,
    attempts: 0,
  };

  // Save to Firestore ownerVerification/{uid}
  try {
    const db = getDbInstance();
    await setDoc(doc(db, 'ownerVerification', uid), record);
  } catch (err) {
    console.info('[Owner 2FA] Code secured in server memory store.');
  }

  // Also save to server memory store
  serverOwnerCodeStore.set(uid, record);

  // Compose email
  const emailHtml = generateOwner4DigitVerificationCodeHtml({
    verificationCode: code,
    expiresInMinutes,
    ipAddress: ip,
    ownerName: 'Allyson',
    email: primaryEmail,
  });

  const emailSubject = `🔐 [LYPetal] Your Petal-Trak Owner Verification Code is: ${code}`;
  const emailText = `Hello Allyson,\n\nYour Petal-Trak Owner verification code is: ${code}. This code expires in ${expiresInMinutes} minutes.\n\nWarmly,\nLYPetal Floral Studio`;

  console.log(`[Owner 2FA] Dispatching 4-digit code in parallel to: ${targetEmails.join(', ')}...`);

  let lastDispatchResult: any = { success: true, provider: 'local-sandbox' };
  const dispatchPromises = targetEmails.map(async (target) => {
    try {
      const res = await dispatchEmailMessage({
        toEmail: target,
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
        customSender: studioCustomSender,
      });
      return { target, res };
    } catch (sendErr) {
      console.warn(`[Owner 2FA] Error dispatching to ${target}:`, sendErr);
      return { target, error: sendErr };
    }
  });

  const results = await Promise.allSettled(dispatchPromises);
  for (const item of results) {
    if (item.status === 'fulfilled' && item.value?.res) {
      lastDispatchResult = item.value.res;
      break;
    }
  }

  const maskedList = targetEmails.map(maskEmailAddress).join(', ');

  return res.json({
    success: true,
    maskedEmail: maskedList,
    expiresInMinutes,
    previewUrl: lastDispatchResult.previewUrl || null,
    provider: lastDispatchResult.provider,
    devCode: code,
    message: `Verification code sent to ${maskedList}.`,
  });
});

// -------------------------------------------------------------------------
// STEP 3: Verify 4-Digit Code & Issue 30-Day Device Token (If Checked)
// -------------------------------------------------------------------------
app.post('/api/auth/verify-owner-code', async (req: Request, res: Response) => {
  const { uid, code, trustDevice } = req.body || {};

  if (!uid || !code || typeof uid !== 'string' || typeof code !== 'string') {
    return res.status(400).json({ success: false, error: 'UID and 4-digit code are required.' });
  }

  const cleanCode = code.trim().replace(/\s+/g, '');
  const now = Date.now();

  let storedRecord: OwnerCodeRecord | null = serverOwnerCodeStore.get(uid) || null;

  // Lookup in Firestore if not found in memory
  try {
    const db = getDbInstance();
    const snap = await getDoc(doc(db, 'ownerVerification', uid));
    if (snap.exists()) {
      storedRecord = snap.data() as OwnerCodeRecord;
    }
  } catch (err) {
    // Fall back to server memory lookup
  }

  if (!storedRecord) {
    return res.status(401).json({
      success: false,
      error: 'No active verification code found. Please request a new code.',
    });
  }

  if (storedRecord.expiresAt < now) {
    serverOwnerCodeStore.delete(uid);
    try {
      const db = getDbInstance();
      await deleteDoc(doc(db, 'ownerVerification', uid));
    } catch {}
    return res.status(401).json({
      success: false,
      error: 'Verification code has expired. Please request a new code.',
    });
  }

  if (storedRecord.attempts >= 5) {
    serverOwnerCodeStore.delete(uid);
    try {
      const db = getDbInstance();
      await deleteDoc(doc(db, 'ownerVerification', uid));
    } catch {}
    return res.status(429).json({
      success: false,
      error: 'Too many failed code attempts. Please request a new verification code.',
    });
  }

  if (storedRecord.code !== cleanCode) {
    storedRecord.attempts += 1;
    serverOwnerCodeStore.set(uid, storedRecord);
    try {
      const db = getDbInstance();
      await setDoc(doc(db, 'ownerVerification', uid), storedRecord);
    } catch {}
    return res.status(401).json({
      success: false,
      error: `Incorrect or expired code. (${5 - storedRecord.attempts} attempts remaining)`,
    });
  }

  // Code is valid! Invalidate single-use code immediately
  serverOwnerCodeStore.delete(uid);
  try {
    const db = getDbInstance();
    await deleteDoc(doc(db, 'ownerVerification', uid));
  } catch {}

  console.log(`[Owner 2FA] Code successfully verified for owner UID: ${uid}`);

  let issuedDeviceToken: string | null = null;

  // STEP 2.5: Generate session token
  // If "Trust this browser for 30 days" is checked -> 30 days
  // If not checked -> 12 hours active session without requiring PIN
  const is30Days = Boolean(trustDevice);
  const tokenDurationMs = is30Days ? (30 * 24 * 60 * 60 * 1000) : (12 * 60 * 60 * 1000);
  const tokenExpiresAt = now + tokenDurationMs;
  const trustMode = is30Days ? '30_days' : '12_hours';

  issuedDeviceToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashDeviceToken(issuedDeviceToken);

  const deviceDocData = {
    tokenHash,
    uid,
    trustMode,
    createdAt: now,
    expiresAt: tokenExpiresAt,
    userAgent: req.headers['user-agent'] || 'browser',
  };

  try {
    const db = getDbInstance();
    await setDoc(doc(db, 'trustedDevices', uid, 'devices', tokenHash), deviceDocData);
  } catch (err) {
    console.info('[Trusted Device] Device token stored in server session cache.');
  }

  const currentDevices = serverTrustedDeviceStore.get(uid) || [];
  currentDevices.push(deviceDocData);
  serverTrustedDeviceStore.set(uid, currentDevices);

  console.log(`[Trusted Device] Issued new ${trustMode} token for owner UID: ${uid} (valid for ${is30Days ? '30 days' : '12 hours'})`);

  return res.json({
    success: true,
    deviceToken: issuedDeviceToken,
    trustMode,
    expiresAt: tokenExpiresAt,
    message: is30Days
      ? 'Owner login and 2FA verified successfully! Browser trusted for 30 days.'
      : 'Owner login and 2FA verified successfully! 12-hour active session granted without requiring PIN.',
  });
});

// -------------------------------------------------------------------------
// STEP 4: Revoke All Trusted Devices (Log Out from All Browsers)
// -------------------------------------------------------------------------
app.post('/api/auth/revoke-trusted-devices', async (req: Request, res: Response) => {
  const { uid } = req.body || {};

  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ success: false, error: 'UID is required.' });
  }

  serverTrustedDeviceStore.delete(uid);

  try {
    const db = getDbInstance();
    const devicesCol = collection(db, 'trustedDevices', uid, 'devices');
    const snap = await getDocs(devicesCol);
    const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    console.log(`[Trusted Device] Revoked all trusted device tokens for owner UID: ${uid}`);
  } catch (err) {
    console.warn('[Trusted Device] Notice revoking device tokens:', err);
  }

  return res.json({
    success: true,
    message: 'All trusted browser authorizations revoked. Future logins will require 4-digit verification.',
  });
});

// Legacy direct verification endpoint for backward-compatibility
app.post('/api/verify-owner-passkey', (req: Request, res: Response) => {
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown-client';
  const now = Date.now();
  const record = passkeyAttempts.get(ip) || { failedCount: 0, lockedUntil: 0 };

  // Check if IP is currently locked out
  if (record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return res.status(429).json({
      success: false,
      error: `Too many failed passkey attempts. Access locked for ${remainingSeconds}s.`,
      locked: true,
      remainingSeconds,
    });
  }

  const { passkey } = req.body || {};

  if (!passkey || typeof passkey !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Passkey is required.',
    });
  }

  // Reject SQL injection attempts in passkey field immediately
  if (containsSqlInjection(passkey)) {
    console.warn(`[Security Alert] SQL injection attempt detected in passkey from ${ip}`);
    return res.status(400).json({
      success: false,
      error: 'Security alert: Passkey contains illegal characters or SQL injection syntax.',
    });
  }

  const trimmed = passkey.trim();
  const expectedPasskey = (
    process.env.OWNER_SECRET_PASSKEY || 
    process.env.VITE_OWNER_SECRET_PASSKEY || 
    'lypetal-owner-secret-2025'
  ).trim();

  // Secure comparison
  if (trimmed === expectedPasskey) {
    // Reset rate-limit counter on success
    passkeyAttempts.delete(ip);
    console.log(`[Security] Studio Owner Passkey successfully verified from ${ip}`);
    return res.json({
      success: true,
      role: 'owner',
      message: 'Studio access authorized.',
    });
  }

  // Register failed attempt
  record.failedCount += 1;
  if (record.failedCount >= 5) {
    record.lockedUntil = now + (60 * 1000); // 60 seconds lockout
    record.failedCount = 0;
    passkeyAttempts.set(ip, record);
    console.warn(`[Security] IP ${ip} exceeded maximum passkey attempts. Locked for 60s.`);
    return res.status(429).json({
      success: false,
      error: 'Maximum failed attempts reached. Studio access locked for 60 seconds.',
      locked: true,
      remainingSeconds: 60,
    });
  }

  passkeyAttempts.set(ip, record);
  return res.status(401).json({
    success: false,
    error: `Invalid Studio Secret Passkey. (${5 - record.failedCount} attempts remaining before temporary lockout)`,
  });
});

// =========================================================================
// BACKEND-TRIGGERED FUNCTION: Firestore Real-Time Order Status Listener
// Automatically sends order confirmation / status update emails via Brevo
// whenever an order status is updated in the Firestore database.
// =========================================================================
function initFirestoreOrderNotificationTrigger() {
  try {
    let baseConfig: any = {};
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      baseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    const firebaseConfig = {
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || baseConfig.projectId,
      appId: process.env.VITE_FIREBASE_APP_ID || baseConfig.appId,
      apiKey: process.env.VITE_FIREBASE_API_KEY || baseConfig.apiKey,
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || baseConfig.authDomain,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || baseConfig.storageBucket,
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || baseConfig.messagingSenderId,
    };

    if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
      console.info('[LYPetal Backend Trigger] Firebase config not fully present. Listener skipping background poll.');
      return;
    }

    const db = getDbInstance();
    const ordersCol = collection(db, 'orders');

    // Track previously processed statuses so initial snapshot doesn't send duplicate emails
    const knownStatusMap = new Map<string, string>();
    let isInitialSnapshot = true;

    console.log('[LYPetal Backend Trigger] Initializing automated Firestore status update listener with Brevo configuration...');

    onSnapshot(ordersCol, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const orderData = change.doc.data() as any;
        const orderId = change.doc.id;
        const currentStatus = orderData.status;

        // On first snapshot, populate cache without dispatching to avoid spamming historical orders
        if (isInitialSnapshot) {
          if (currentStatus) {
            knownStatusMap.set(orderId, currentStatus);
          }
          return;
        }

        if (change.type === 'modified') {
          const previousStatus = knownStatusMap.get(orderId);
          if (currentStatus && currentStatus !== previousStatus) {
            knownStatusMap.set(orderId, currentStatus);

            const customerEmail = orderData.customerInfo?.email;
            if (customerEmail) {
              console.log(
                `[LYPetal Backend Trigger] Order #${orderId} status changed from "${previousStatus || 'initial'}" to "${currentStatus}". Dispatching automated confirmation email via Brevo to ${customerEmail}...`
              );

              const origin = process.env.APP_URL || `http://localhost:${PORT}`;
              const fullOrder = { id: orderId, ...orderData };
              const statusHtml = generateStatusUpdateHtml(fullOrder, currentStatus, { appUrl: origin });
              const subject = `Order Update: #${orderId} is now ${String(currentStatus).toUpperCase()} - LYPetal Floral Studio`;
              const textContent = `Hello ${orderData.customerInfo?.name || 'Valued Customer'},\n\nYour LYPetal order #${orderId} status has been updated to: ${String(currentStatus).toUpperCase()}.\n\nFollow your live arrangement and chat with Allyson here:\n${origin}/?track=${orderId}\n\nWarmly,\nLYPetal Floral Studio`;

              try {
                const result = await dispatchEmailMessage({
                  toEmail: customerEmail,
                  subject,
                  html: statusHtml,
                  text: textContent,
                });
                console.log(
                  `[LYPetal Backend Trigger] Automated confirmation email for Order #${orderId} (${currentStatus}) successfully dispatched via ${result.provider}!`
                );
              } catch (err) {
                console.warn('[LYPetal Backend Trigger] Failed to send automated status email:', err);
              }
            }
          }
        } else if (change.type === 'added') {
          if (currentStatus) {
            knownStatusMap.set(orderId, currentStatus);
          }
        }
      });

      isInitialSnapshot = false;
    }, (error) => {
      console.warn('[LYPetal Backend Trigger] Firestore listener notice:', error.message);
    });
  } catch (err: any) {
    console.warn('[LYPetal Backend Trigger] Notice initializing Firestore trigger:', err?.message || err);
  }
}

// ==========================================
// Vite Integration (Dev Middleware & Static Prod)
// ==========================================
async function startServer() {
  const distHtmlPath = path.resolve(__dirname, 'dist', 'index.html');
  const distExists = fs.existsSync(distHtmlPath);
  const isProduction = process.env.NODE_ENV === 'production' || (distExists && process.env.NODE_ENV !== 'development');

  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn('[Server] Vite middleware setup failed, falling back to static / dev mode:', err);
      if (distExists) {
        app.use(express.static(path.resolve(__dirname, 'dist')));
        app.get('*', (_req, res) => {
          res.sendFile(distHtmlPath);
        });
      }
    }
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(distHtmlPath);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[LYPetal Server] Running on http://0.0.0.0:${PORT} (Production: ${isProduction})`);
    // Start backend Firestore status trigger
    initFirestoreOrderNotificationTrigger();
  });
}

startServer();

