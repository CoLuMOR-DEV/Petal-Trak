import { Order } from '../types';

export interface EmailReceiptOptions {
  appUrl?: string;
}

/**
 * Generates an HTML email receipt styled exactly like the LYPetal website:
 * - Warm ivory cream canvas (#FAF6F0)
 * - Pure white artisan cards with delicate blush borders (#F0D9DD)
 * - Elegant serif headings (Playfair Display / Georgia) and charcoal text (#2D2A2E)
 * - Soft blush rose accents (#F4A6B0) and sage green badges (#A8D5C0)
 * - Clickable button linking directly to the live Order Tracker
 */
export function generateReceiptHtml(order: Order, options?: EmailReceiptOptions): string {
  const origin = options?.appUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://lypetal.ph');
  const trackingUrl = `${origin}/?track=${encodeURIComponent(order.id)}`;

  const formattedDate = new Date(order.createdAt).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const itemsHtml = order.items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #F0D9DD;">
        <td style="padding: 14px 0; color: #2D2A2E; font-size: 13px; line-height: 1.4;">
          <strong style="color: #2D2A2E; font-size: 14px; font-family: 'Playfair Display', Georgia, serif;">${item.flowerName}</strong>
          <div style="font-size: 11px; color: #7C7472; margin-top: 4px;">
            ${item.stemsCount} stems • ${item.wrapperColor || 'Classic'} wrapper • ${item.ribbonColor || 'Satin'} ribbon
            ${item.colors && item.colors.length > 0 ? ` • Hues: ${item.colors.join(', ')}` : item.color ? ` • Hue: ${item.color}` : ''}
          </div>
        </td>
        <td style="padding: 14px 10px; text-align: center; color: #5C5552; font-size: 13px;">
          x${item.quantity ?? 1}
        </td>
        <td style="padding: 14px 0; text-align: right; color: #2D2A2E; font-weight: 700; font-size: 13px;">
          ₱${(item.totalPrice ?? 0).toLocaleString()}
        </td>
      </tr>
    `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your LYPetal Order Receipt #${order.id}</title>
</head>
<body style="margin: 0; padding: 32px 12px; background-color: #FAF6F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2D2A2E;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #FFFFFF; border-radius: 24px; border: 1px solid #F0D9DD; padding: 36px 28px; box-shadow: 0 4px 20px rgba(240, 217, 221, 0.45);">
    
    <!-- Brand Header -->
    <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #F0D9DD;">
      <div style="display: inline-block; padding: 4px 12px; background-color: #FAF6F0; border: 1px solid #F0D9DD; border-radius: 20px; font-size: 11px; font-weight: 700; color: #7A4B53; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
        Handcrafted Satin Flowers
      </div>
      <h1 style="margin: 0; font-size: 26px; font-weight: 700; color: #2D2A2E; font-family: 'Playfair Display', Georgia, serif; letter-spacing: 0.5px;">
        LYPetal
      </h1>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #7C7472;">
        Laguna Studio • Hand-folded with precision & care
      </p>
    </div>

    <!-- Thank You Section -->
    <div style="text-align: center; margin-bottom: 28px;">
      <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; border-radius: 50%; background-color: #A8D5C0; color: #1D5E43; font-size: 20px; font-weight: bold; margin-bottom: 12px;">
        ✓
      </div>
      <h2 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 700; color: #2D2A2E; font-family: 'Playfair Display', Georgia, serif;">
        Order Confirmed!
      </h2>
      <p style="margin: 0; font-size: 13px; color: #5C5552; line-height: 1.5;">
        Thank you for ordering with <strong style="color: #2D2A2E;">LYPetal</strong>. We received your order and our artisan studio will begin cutting and folding your satin ribbons shortly.
      </p>
    </div>

    <!-- Order Metadata Card -->
    <div style="background-color: #FCFAF8; border-radius: 16px; border: 1px solid #F0D9DD; padding: 18px 20px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <tr>
          <td style="padding: 6px 0; color: #7C7472;">Order Reference</td>
          <td style="padding: 6px 0; text-align: right; color: #2D2A2E; font-weight: 700; font-family: monospace; font-size: 13px;">
            #${order.id}
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7C7472;">Date Placed</td>
          <td style="padding: 6px 0; text-align: right; color: #2D2A2E;">
            ${formattedDate}
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7C7472;">Customer Name</td>
          <td style="padding: 6px 0; text-align: right; color: #2D2A2E; font-weight: 600;">
            ${order.customerInfo?.name || 'Valued Customer'}
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7C7472;">Delivery Address</td>
          <td style="padding: 6px 0; text-align: right; color: #2D2A2E;">
            ${order.customerInfo?.address || 'Pickup at San Pedro, Laguna'}
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7C7472;">Payment Method</td>
          <td style="padding: 6px 0; text-align: right; color: #2D2A2E; font-weight: 600;">
            ${order.paymentMode}
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7C7472;">Payment Status</td>
          <td style="padding: 6px 0; text-align: right;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; background-color: ${order.paymentStatus === 'paid' ? '#A8D5C0' : '#F5EFC0'}; color: ${order.paymentStatus === 'paid' ? '#1D5E43' : '#70640F'};">
              ${order.paymentStatus.toUpperCase()}
            </span>
          </td>
        </tr>
        ${order.notes ? `
        <tr>
          <td style="padding: 6px 0; color: #7C7472; vertical-align: top;">Note / Instructions</td>
          <td style="padding: 6px 0; text-align: right; color: #5C5552; font-style: italic;">
            "${order.notes}"
          </td>
        </tr>
        ` : ''}
      </table>
    </div>

    <!-- Itemized Bouquet Breakdown -->
    <div style="margin-bottom: 24px;">
      <div style="font-size: 11px; font-weight: 700; color: #7A4B53; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
        Handcrafted Floral Items (${order.items.length})
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        ${itemsHtml}
      </table>

      <!-- Total Price Bar -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 14px; padding-top: 12px; border-top: 2px solid #F0D9DD;">
        <tr>
          <td style="color: #2D2A2E; font-weight: 700; font-size: 15px; font-family: 'Playfair Display', Georgia, serif;">
            Total Amount
          </td>
          <td style="text-align: right; color: #2D2A2E; font-weight: 800; font-size: 18px; font-family: 'Playfair Display', Georgia, serif;">
            ₱${(order.totalAmount ?? 0).toLocaleString()}
          </td>
        </tr>
        ${(order.balance ?? 0) > 0 ? `
        <tr>
          <td style="color: #7C7472; font-size: 12px;">Remaining Balance upon Delivery</td>
          <td style="text-align: right; color: #7A4B53; font-weight: 700; font-size: 13px;">₱${(order.balance ?? 0).toLocaleString()}</td>
        </tr>
        ` : ''}
      </table>
    </div>

    <!-- Prominent Clickable Button to Track the Order -->
    <div style="text-align: center; margin: 32px 0 16px 0;">
      <a href="${trackingUrl}" target="_blank" style="display: block; width: 100%; box-sizing: border-box; background-color: #F4A6B0; color: #2D2A2E; text-align: center; padding: 15px 24px; border-radius: 14px; font-size: 14px; font-weight: 800; text-decoration: none; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 12px rgba(244, 166, 176, 0.45);">
        Track Your Order
      </a>
      <p style="margin: 10px 0 0 0; font-size: 11px; color: #7C7472;">
        Click the button above to follow your bouquet's live progress and chat directly with Allyson.
      </p>
    </div>

    <!-- Studio Footer -->
    <div style="text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #F0D9DD; font-size: 11px; color: #7C7472; line-height: 1.5;">
      <strong>LYPetal Floral Studio</strong> • Handcrafted in San Pedro, Laguna<br>
      Everlasting ribbon blooms made to make your milestones unforgettable.
    </div>

  </div>
</body>
</html>
  `;
}

/**
 * Sends the receipt to the customer's email via the backend /api/send-receipt endpoint.
 * Also opens the client's email application fallback if offline or as a secondary convenience.
 */
export async function sendReceiptToCustomerEmail(order: Order): Promise<{ success: boolean; message?: string }> {
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const res = await fetch('/api/send-receipt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order,
        recipientEmail: order.customerInfo?.email,
        appUrl: origin,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, message: data.message || 'Receipt sent to your email.' };
    } else {
      console.warn('Backend email endpoint notice:', await res.text());
      return { success: false, message: 'Could not send automated email.' };
    }
  } catch (err: any) {
    console.warn('Network notice while dispatching receipt email:', err);
    return { success: false, message: err?.message || 'Email dispatch notice' };
  }
}

/**
 * Generates an automated order status confirmation email
 */
export function generateStatusUpdateHtml(order: Order, newStatus: string, options?: EmailReceiptOptions): string {
  const origin = options?.appUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://lypetal.ph');
  const trackingUrl = `${origin}/?track=${encodeURIComponent(order.id)}`;

  const statusMeta: Record<string, { title: string; subtitle: string; badgeBg: string; badgeColor: string; icon: string }> = {
    pending: {
      title: 'Order Confirmed & In Queue',
      subtitle: 'Your order was verified and is lined up in Allyson’s crafting queue.',
      badgeBg: '#F5EFC0',
      badgeColor: '#70640F',
      icon: '⏳',
    },
    'in-progress': {
      title: 'Petals In Production!',
      subtitle: 'Allyson is currently hand-folding your satin ribbons into pristine floral stems.',
      badgeBg: '#E3EBF8',
      badgeColor: '#2E5B9A',
      icon: '✂️',
    },
    completed: {
      title: 'Arrangement Completed & Packaged!',
      subtitle: 'Your bouquet has been wrapped with luxury Korean paper and tied with satin ribbons.',
      badgeBg: '#A8D5C0',
      badgeColor: '#1D5E43',
      icon: '🎀',
    },
    delivered: {
      title: 'Delivered / Ready for Pickup!',
      subtitle: 'Your handcrafted satin bouquet is ready and delivered. We hope it blooms forever!',
      badgeBg: '#C3E8D5',
      badgeColor: '#144D34',
      icon: '🌸',
    },
    cancelled: {
      title: 'Order Cancelled & Voided',
      subtitle: 'This order was voided. If you have any inquiries, you can reach out through the live chat.',
      badgeBg: '#FFE0E3',
      badgeColor: '#9E1C2E',
      icon: '✕',
    },
  };

  const currentMeta = statusMeta[newStatus] || {
    title: `Order Status: ${newStatus.toUpperCase()}`,
    subtitle: `Your order status was updated to ${newStatus}.`,
    badgeBg: '#F0D9DD',
    badgeColor: '#7A4B53',
    icon: '✨',
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Status Update #${order.id} - LYPetal</title>
</head>
<body style="margin: 0; padding: 32px 12px; background-color: #FAF6F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2D2A2E;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #FFFFFF; border-radius: 24px; border: 1px solid #F0D9DD; padding: 36px 28px; box-shadow: 0 4px 20px rgba(240, 217, 221, 0.45);">
    
    <!-- Brand Header -->
    <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #F0D9DD;">
      <div style="display: inline-block; padding: 4px 12px; background-color: #FAF6F0; border: 1px solid #F0D9DD; border-radius: 20px; font-size: 11px; font-weight: 700; color: #7A4B53; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
        Handcrafted Satin Flowers
      </div>
      <h1 style="margin: 0; font-size: 26px; font-weight: 700; color: #2D2A2E; font-family: 'Playfair Display', Georgia, serif; letter-spacing: 0.5px;">
        LYPetal
      </h1>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #7C7472;">
        Laguna Studio • Hand-folded with precision & care
      </p>
    </div>

    <!-- Status Update Hero -->
    <div style="text-align: center; margin-bottom: 28px;">
      <div style="display: inline-block; padding: 8px 18px; border-radius: 30px; background-color: ${currentMeta.badgeBg}; color: ${currentMeta.badgeColor}; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px;">
        ${currentMeta.icon} ${newStatus}
      </div>
      <h2 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #2D2A2E; font-family: 'Playfair Display', Georgia, serif;">
        ${currentMeta.title}
      </h2>
      <p style="margin: 0; font-size: 13px; color: #5C5552; line-height: 1.5;">
        ${currentMeta.subtitle}
      </p>
    </div>

    <!-- Details Card -->
    <div style="background-color: #FCFAF8; border-radius: 16px; border: 1px solid #F0D9DD; padding: 18px 20px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <tr>
          <td style="padding: 6px 0; color: #7C7472;">Order Reference</td>
          <td style="padding: 6px 0; text-align: right; color: #2D2A2E; font-weight: 700; font-family: monospace; font-size: 13px;">
            #${order.id}
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7C7472;">Recipient</td>
          <td style="padding: 6px 0; text-align: right; color: #2D2A2E; font-weight: 600;">
            ${order.customerInfo?.name || 'Customer'}
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7C7472;">Total Amount</td>
          <td style="padding: 6px 0; text-align: right; color: #2D2A2E; font-weight: 700;">
            ₱${(order.totalAmount ?? 0).toLocaleString()} (${order.paymentMode || 'N/A'})
          </td>
        </tr>
      </table>
    </div>

    <!-- Live Tracking Button -->
    <div style="text-align: center; margin-bottom: 28px;">
      <a href="${trackingUrl}" style="display: inline-block; padding: 14px 28px; background-color: #2D2A2E; color: #FFFFFF; text-decoration: none; border-radius: 16px; font-size: 13px; font-weight: 700; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(45, 42, 46, 0.25);">
        View Live Status & Chat with Allyson →
      </a>
      <p style="margin: 10px 0 0 0; font-size: 11px; color: #7C7472;">
        Direct link: <a href="${trackingUrl}" style="color: #7A4B53; text-decoration: underline;">${trackingUrl}</a>
      </p>
    </div>

    <!-- Studio Footer -->
    <div style="border-top: 1px solid #F0D9DD; padding-top: 20px; text-align: center; font-size: 11px; color: #7C7472; line-height: 1.5;">
      <p style="margin: 0 0 6px 0; font-weight: 600; color: #2D2A2E;">
        LYPetal Floral Studio • San Pedro, Laguna
      </p>
      <p style="margin: 0;">
        Automated status notification powered by Brevo email dispatch.
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

/**
 * Triggers status update email to the customer
 */
export async function sendStatusUpdateEmail(order: Order, newStatus: string): Promise<{ success: boolean; message: string }> {
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lypetal.ph';
    const res = await fetch('/api/send-status-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order,
        newStatus,
        appUrl: origin,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, message: data.message || `Status update email sent (${newStatus}).` };
    }
    return { success: false, message: 'Could not send automated status update.' };
  } catch (err: any) {
    console.warn('Network notice while dispatching status update email:', err);
    return { success: false, message: err?.message || 'Status update dispatch notice' };
  }
}

/**
 * Email draft trigger fallback
 */
export function openEmailReceiptDraft(order: Order): void {
  const subject = encodeURIComponent(`Your LYPetal Order Receipt & Tracking #${order.id}`);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lypetal.ph';
  const trackingUrl = `${origin}/?track=${encodeURIComponent(order.id)}`;

  const body = encodeURIComponent(
    `Hello ${order.customerInfo?.name || 'Customer'},\n\n` +
    `Thank you for your order with LYPetal Floral Studio!\n\n` +
    `ORDER SUMMARY:\n` +
    `Order Reference: #${order.id}\n` +
    `Date: ${order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A'}\n` +
    `Payment Method: ${order.paymentMode || 'N/A'}\n` +
    `Payment Status: ${(order.paymentStatus || 'pending').toUpperCase()}\n` +
    `Total Price: ₱${(order.totalAmount ?? 0).toLocaleString()}\n` +
    `Delivery Address: ${order.customerInfo?.address || 'Pickup at San Pedro, Laguna'}\n\n` +
    `HANDCRAFTED BOUQUET ITEMS:\n` +
    (order.items || []).map(i => `- ${i.flowerName} (x${i.quantity}) • ₱${(i.totalPrice ?? 0).toLocaleString()}`).join('\n') +
    `\n\nTRACK YOUR ORDER:\n` +
    `Click below to follow live status and chat with Allyson:\n` +
    `${trackingUrl}\n\n` +
    `Warmly,\nLYPetal Floral Studio`
  );

  const recipient = order.customerInfo?.email || '';
  if (typeof window !== 'undefined') {
    window.open(`mailto:${recipient}?subject=${subject}&body=${body}`, '_blank');
  }
}

export interface Owner4DigitCodeEmailOptions {
  verificationCode: string;
  expiresInMinutes?: number;
  ipAddress?: string;
  requestedAt?: string;
  ownerName?: string;
  email?: string;
}

/**
 * Generates an HTML 4-Digit 2FA verification email for Petal-Trak Studio Owner (Allyson)
 */
export function generateOwner4DigitVerificationCodeHtml(options: Owner4DigitCodeEmailOptions): string {
  const ownerName = options.ownerName || 'Allyson';
  const code = options.verificationCode;
  const expiryMins = options.expiresInMinutes || 10;
  const timeString = options.requestedAt || new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🔐 Petal-Trak Owner Verification Code</title>
</head>
<body style="margin: 0; padding: 32px 12px; background-color: #FAF6F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2D2A2E;">
  <div style="max-width: 500px; margin: 0 auto; background-color: #FFFFFF; border-radius: 24px; border: 1px solid #F0D9DD; padding: 36px 28px; box-shadow: 0 4px 20px rgba(240, 217, 221, 0.45);">
    
    <!-- Security Shield Header -->
    <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #F0D9DD;">
      <div style="width: 52px; height: 52px; margin: 0 auto 12px; background-color: #2D2A2E; border-radius: 16px; display: flex; align-items: center; justify-content: center; line-height: 52px; font-size: 26px; text-align: center;">
        🛡️
      </div>
      <div style="display: inline-block; padding: 4px 12px; background-color: #FAF6F0; border: 1px solid #E8DF97; border-radius: 20px; font-size: 11px; font-weight: 700; color: #70640F; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
        Owner Two-Factor Verification
      </div>
      <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #2D2A2E; font-family: 'Playfair Display', Georgia, serif;">
        Petal-Trak Owner Sign-In
      </h1>
      <p style="margin: 6px 0 0 0; font-size: 12px; color: #7C7472;">
        Admin Portal Security Verification
      </p>
    </div>

    <!-- Greeting & Notice -->
    <div style="margin-bottom: 20px;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #2D2A2E; line-height: 1.5;">
        Hello <strong>${ownerName}</strong>,
      </p>
      <p style="margin: 0; font-size: 13px; color: #5C5552; line-height: 1.5;">
        You recently initiated a sign-in to the <strong>Petal-Trak Owner Dashboard</strong>. Use the 4-digit verification code below to complete your login:
      </p>
    </div>

    <!-- Big 4-Digit Code Box -->
    <div style="background: linear-gradient(135deg, #FAF6F0 0%, #FCFAF8 100%); border: 1.5px solid #F0D9DD; border-radius: 20px; padding: 24px; text-align: center; margin: 24px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #7C7472; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
        Your Verification Code
      </div>
      <div style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 38px; font-weight: 800; letter-spacing: 12px; color: #2D2A2E; margin: 6px 0; text-indent: 12px;">
        ${code}
      </div>
      <div style="font-size: 12px; font-weight: 600; color: #C53030; margin-top: 10px;">
        ⏱️ This code expires in ${expiryMins} minutes
      </div>
    </div>

    <p style="font-size: 12px; color: #5C5552; line-height: 1.5; margin: 0 0 20px 0; text-align: center;">
      Your Petal-Trak Owner verification code is: <strong>${code}</strong>. This code expires in ${expiryMins} minutes.
    </p>

    <!-- Request Details -->
    <div style="background-color: #FAF6F0; border-radius: 16px; padding: 14px 18px; font-size: 12px; color: #5C5552; margin-bottom: 20px;">
      <div style="font-weight: 700; color: #2D2A2E; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
        Session Security Info
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <tr>
          <td style="padding: 2px 0; color: #7C7472;">Time:</td>
          <td style="padding: 2px 0; text-align: right; color: #2D2A2E; font-weight: 600;">${timeString}</td>
        </tr>
        ${options.ipAddress ? `
        <tr>
          <td style="padding: 2px 0; color: #7C7472;">IP Address:</td>
          <td style="padding: 2px 0; text-align: right; color: #2D2A2E; font-family: monospace;">${options.ipAddress}</td>
        </tr>` : ''}
      </table>
    </div>

    <!-- Security Warning -->
    <div style="border-top: 1px solid #F0D9DD; padding-top: 14px; text-align: center;">
      <p style="margin: 0; font-size: 11px; color: #7C7472; line-height: 1.4;">
        If you did not request this code, someone may be attempting to access your studio dashboard. Please ensure your account password remains secure.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}

export interface AdminLoginConfirmationOptions {
  approvalUrl: string;
  verificationPin: string;
  expiresInMinutes?: number;
  ipAddress?: string;
  requestedAt?: string;
  ownerName?: string;
  rejectUrl?: string;
}

export function generateAdminLoginConfirmationHtml(options: AdminLoginConfirmationOptions): string {
  const ownerName = options.ownerName || 'Allyson';
  const pin = options.verificationPin;
  const pinDisplay = pin.length === 6 ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
  const timeString = options.requestedAt || new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🔐 Confirm LYPetal Admin Sign-In</title>
</head>
<body style="margin: 0; padding: 32px 12px; background-color: #FAF6F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2D2A2E;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #FFFFFF; border-radius: 24px; border: 1px solid #F0D9DD; padding: 36px 28px; box-shadow: 0 4px 20px rgba(240, 217, 221, 0.45);">
    
    <!-- Security Shield Header -->
    <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #F0D9DD;">
      <div style="width: 52px; height: 52px; margin: 0 auto 12px; background-color: #2D2A2E; border-radius: 16px; display: flex; align-items: center; justify-content: center; line-height: 52px; font-size: 26px; text-align: center;">
        🛡️
      </div>
      <div style="display: inline-block; padding: 4px 12px; background-color: #FAF6F0; border: 1px solid #E8DF97; border-radius: 20px; font-size: 11px; font-weight: 700; color: #70640F; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
        Owner Security Verification
      </div>
      <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #2D2A2E; font-family: 'Playfair Display', Georgia, serif;">
        Admin Sign-In Confirmation
      </h1>
      <p style="margin: 6px 0 0 0; font-size: 12px; color: #7C7472;">
        LYPetal Petal-Trak Studio Portal
      </p>
    </div>

    <!-- Greeting & Notice -->
    <div style="margin-bottom: 24px;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #2D2A2E; line-height: 1.5;">
        Hello <strong>${ownerName}</strong>,
      </p>
      <p style="margin: 0; font-size: 13px; color: #5C5552; line-height: 1.5;">
        A sign-in request to your <strong>Petal-Trak Studio Admin Dashboard</strong> was initiated. To prevent unauthorized public access, please approve this sign-in below.
      </p>
    </div>

    <!-- 1-Click Approval Button -->
    <div style="text-align: center; margin: 28px 0; padding: 24px; background: linear-gradient(135deg, #FAF6F0 0%, #FCFAF8 100%); border-radius: 20px; border: 1px solid #F0D9DD;">
      <div style="font-size: 12px; font-weight: 700; color: #7A4B53; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 14px;">
        Click to Approve Sign-In
      </div>
      <a href="${options.approvalUrl}" target="_blank" style="display: inline-block; background-color: #2D2A2E; color: #F5EFC0; font-size: 14px; font-weight: 700; text-decoration: none; padding: 15px 32px; border-radius: 14px; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(45, 42, 46, 0.25);">
        ✅ APPROVE ADMIN SIGN-IN
      </a>
      <p style="margin: 12px 0 0 0; font-size: 11px; color: #7C7472;">
        Clicking this button will instantly grant access to your studio session.
      </p>
    </div>

    <!-- Alternative: 6-Digit One-Time PIN -->
    <div style="background-color: #FFFFFF; border: 1px dashed #E8E2DA; border-radius: 16px; padding: 18px; text-align: center; margin-bottom: 24px;">
      <div style="font-size: 11px; font-weight: 600; color: #7C7472; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
        Or enter this 6-Digit PIN in your browser
      </div>
      <div style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #2D2A2E; margin: 4px 0;">
        ${pinDisplay}
      </div>
      <div style="font-size: 11px; color: #A89E9C;">
        Valid for 10 minutes
      </div>
    </div>

    <!-- Request Details -->
    <div style="background-color: #FAF6F0; border-radius: 16px; padding: 16px 20px; font-size: 12px; color: #5C5552; margin-bottom: 24px;">
      <div style="font-weight: 700; color: #2D2A2E; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
        Request Details
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <tr>
          <td style="padding: 3px 0; color: #7C7472;">Time:</td>
          <td style="padding: 3px 0; text-align: right; color: #2D2A2E; font-weight: 600;">${timeString}</td>
        </tr>
        ${options.ipAddress ? `
        <tr>
          <td style="padding: 3px 0; color: #7C7472;">IP Address:</td>
          <td style="padding: 3px 0; text-align: right; color: #2D2A2E; font-family: monospace;">${options.ipAddress}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 3px 0; color: #7C7472;">Status:</td>
          <td style="padding: 3px 0; text-align: right; color: #D97706; font-weight: 700;">Awaiting Approval</td>
        </tr>
      </table>
    </div>

    <!-- Security Warning & Deny -->
    <div style="border-top: 1px solid #F0D9DD; padding-top: 16px; text-align: center;">
      <p style="margin: 0; font-size: 11px; color: #7C7472; line-height: 1.4;">
        Did not attempt to sign in? Someone may be trying to access your admin portal. You can safely ignore this email or click 
        ${options.rejectUrl ? `<a href="${options.rejectUrl}" style="color: #C53030; font-weight: 600; text-decoration: underline;">Deny Access</a>` : '<strong style="color: #C53030;">Deny Access</strong>'} to block this request.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}
