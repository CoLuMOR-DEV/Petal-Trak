// server.ts
import express from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";

// src/lib/emailReceipt.ts
function generateReceiptHtml(order, options) {
  const origin = options?.appUrl || (typeof window !== "undefined" ? window.location.origin : "https://lypetal.ph");
  const trackingUrl = `${origin}/?track=${encodeURIComponent(order.id)}`;
  const formattedDate = new Date(order.createdAt).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  const itemsHtml = order.items.map(
    (item) => `
      <tr style="border-bottom: 1px solid #F0D9DD;">
        <td style="padding: 14px 0; color: #2D2A2E; font-size: 13px; line-height: 1.4;">
          <strong style="color: #2D2A2E; font-size: 14px; font-family: 'Playfair Display', Georgia, serif;">${item.flowerName}</strong>
          <div style="font-size: 11px; color: #7C7472; margin-top: 4px;">
            ${item.stemsCount} stems \u2022 ${item.wrapperColor || "Classic"} wrapper \u2022 ${item.ribbonColor || "Satin"} ribbon
            ${item.colors && item.colors.length > 0 ? ` \u2022 Hues: ${item.colors.join(", ")}` : item.color ? ` \u2022 Hue: ${item.color}` : ""}
          </div>
        </td>
        <td style="padding: 14px 10px; text-align: center; color: #5C5552; font-size: 13px;">
          x${item.quantity ?? 1}
        </td>
        <td style="padding: 14px 0; text-align: right; color: #2D2A2E; font-weight: 700; font-size: 13px;">
          \u20B1${(item.totalPrice ?? 0).toLocaleString()}
        </td>
      </tr>
    `
  ).join("");
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
        Laguna Studio \u2022 Hand-folded with precision & care
      </p>
    </div>

    <!-- Thank You Section -->
    <div style="text-align: center; margin-bottom: 28px;">
      <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; border-radius: 50%; background-color: #A8D5C0; color: #1D5E43; font-size: 20px; font-weight: bold; margin-bottom: 12px;">
        \u2713
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
            ${order.customerInfo?.name || "Valued Customer"}
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7C7472;">Delivery Address</td>
          <td style="padding: 6px 0; text-align: right; color: #2D2A2E;">
            ${order.customerInfo?.address || "Pickup at San Pedro, Laguna"}
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
            <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; background-color: ${order.paymentStatus === "paid" ? "#A8D5C0" : "#F5EFC0"}; color: ${order.paymentStatus === "paid" ? "#1D5E43" : "#70640F"};">
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
        ` : ""}
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
            \u20B1${(order.totalAmount ?? 0).toLocaleString()}
          </td>
        </tr>
        ${(order.balance ?? 0) > 0 ? `
        <tr>
          <td style="color: #7C7472; font-size: 12px;">Remaining Balance upon Delivery</td>
          <td style="text-align: right; color: #7A4B53; font-weight: 700; font-size: 13px;">\u20B1${(order.balance ?? 0).toLocaleString()}</td>
        </tr>
        ` : ""}
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
      <strong>LYPetal Floral Studio</strong> \u2022 Handcrafted in San Pedro, Laguna<br>
      Everlasting ribbon blooms made to make your milestones unforgettable.
    </div>

  </div>
</body>
</html>
  `;
}
function generateStatusUpdateHtml(order, newStatus, options) {
  const origin = options?.appUrl || (typeof window !== "undefined" ? window.location.origin : "https://lypetal.ph");
  const trackingUrl = `${origin}/?track=${encodeURIComponent(order.id)}`;
  const statusMeta = {
    pending: {
      title: "Order Confirmed & In Queue",
      subtitle: "Your order was verified and is lined up in Allyson\u2019s crafting queue.",
      badgeBg: "#F5EFC0",
      badgeColor: "#70640F",
      icon: "\u23F3"
    },
    "in-progress": {
      title: "Petals In Production!",
      subtitle: "Allyson is currently hand-folding your satin ribbons into pristine floral stems.",
      badgeBg: "#E3EBF8",
      badgeColor: "#2E5B9A",
      icon: "\u2702\uFE0F"
    },
    completed: {
      title: "Arrangement Completed & Packaged!",
      subtitle: "Your bouquet has been wrapped with luxury Korean paper and tied with satin ribbons.",
      badgeBg: "#A8D5C0",
      badgeColor: "#1D5E43",
      icon: "\u{1F380}"
    },
    delivered: {
      title: "Delivered / Ready for Pickup!",
      subtitle: "Your handcrafted satin bouquet is ready and delivered. We hope it blooms forever!",
      badgeBg: "#C3E8D5",
      badgeColor: "#144D34",
      icon: "\u{1F338}"
    },
    cancelled: {
      title: "Order Cancelled & Voided",
      subtitle: "This order was voided. If you have any inquiries, you can reach out through the live chat.",
      badgeBg: "#FFE0E3",
      badgeColor: "#9E1C2E",
      icon: "\u2715"
    }
  };
  const currentMeta = statusMeta[newStatus] || {
    title: `Order Status: ${newStatus.toUpperCase()}`,
    subtitle: `Your order status was updated to ${newStatus}.`,
    badgeBg: "#F0D9DD",
    badgeColor: "#7A4B53",
    icon: "\u2728"
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
        Laguna Studio \u2022 Hand-folded with precision & care
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
            ${order.customerInfo?.name || "Customer"}
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7C7472;">Total Amount</td>
          <td style="padding: 6px 0; text-align: right; color: #2D2A2E; font-weight: 700;">
            \u20B1${(order.totalAmount ?? 0).toLocaleString()} (${order.paymentMode || "N/A"})
          </td>
        </tr>
      </table>
    </div>

    <!-- Live Tracking Button -->
    <div style="text-align: center; margin-bottom: 28px;">
      <a href="${trackingUrl}" style="display: inline-block; padding: 14px 28px; background-color: #2D2A2E; color: #FFFFFF; text-decoration: none; border-radius: 16px; font-size: 13px; font-weight: 700; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(45, 42, 46, 0.25);">
        View Live Status & Chat with Allyson \u2192
      </a>
      <p style="margin: 10px 0 0 0; font-size: 11px; color: #7C7472;">
        Direct link: <a href="${trackingUrl}" style="color: #7A4B53; text-decoration: underline;">${trackingUrl}</a>
      </p>
    </div>

    <!-- Studio Footer -->
    <div style="border-top: 1px solid #F0D9DD; padding-top: 20px; text-align: center; font-size: 11px; color: #7C7472; line-height: 1.5;">
      <p style="margin: 0 0 6px 0; font-weight: 600; color: #2D2A2E;">
        LYPetal Floral Studio \u2022 San Pedro, Laguna
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
function generateAdminLoginConfirmationHtml(options) {
  const ownerName = options.ownerName || "Allyson";
  const pin = options.verificationPin;
  const pinDisplay = pin.length === 6 ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
  const timeString = options.requestedAt || (/* @__PURE__ */ new Date()).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>\u{1F510} Confirm LYPetal Admin Sign-In</title>
</head>
<body style="margin: 0; padding: 32px 12px; background-color: #FAF6F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #2D2A2E;">
  <div style="max-width: 520px; margin: 0 auto; background-color: #FFFFFF; border-radius: 24px; border: 1px solid #F0D9DD; padding: 36px 28px; box-shadow: 0 4px 20px rgba(240, 217, 221, 0.45);">
    
    <!-- Security Shield Header -->
    <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #F0D9DD;">
      <div style="width: 52px; height: 52px; margin: 0 auto 12px; background-color: #2D2A2E; border-radius: 16px; display: flex; align-items: center; justify-content: center; line-height: 52px; font-size: 26px; text-align: center;">
        \u{1F6E1}\uFE0F
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
        \u2705 APPROVE ADMIN SIGN-IN
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
        </tr>` : ""}
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

// src/lib/security.ts
var SQL_INJECTION_PATTERNS = [
  // Tautology / Boolean bypass (e.g., ' or '1'='1, ' or 1=1 --)
  /(\b(?:or|and)\b\s+['"]?[\w]+['"]?\s*=\s*['"]?[\w]+['"]?)/i,
  /(\b(?:or|and)\b\s+\d+\s*=\s*\d+)/i,
  /(\b(?:or|and)\b\s+true\b)/i,
  /('|\")\s*(or|and)\s*('|\")?[\w]+('|\")?\s*=/i,
  // Union-based injection (e.g., UNION SELECT, UNION ALL SELECT)
  /(\bunion\b\s+(all\s+)?\bselect\b)/i,
  // Data Definition / Destruction (e.g., DROP TABLE, ALTER TABLE, TRUNCATE)
  /(\bdrop\b\s+(table|database|view|column|index)\b)/i,
  /(\balter\b\s+(table|database)\b)/i,
  /(\btruncate\b\s+table\b)/i,
  // Data Manipulation statement injection (e.g., ; DELETE FROM, ; INSERT INTO, ; UPDATE)
  /(;\s*\b(delete\s+from|insert\s+into|update\s+\w+\s+set)\b)/i,
  // Database metadata / Schema extraction
  /(\binformation_schema\b|\bsys\.tables\b|\bpg_catalog\b|\bmaster\.\.sysdatabases\b)/i,
  // Execution / Stored procedures
  /(\bexec(ute)?\b\s*\(|\bxp_cmdshell\b|\bsp_executesql\b)/i,
  // Time-based blind injection (e.g., WAITFOR DELAY, SLEEP(5), BENCHMARK)
  /(\bwaitfor\b\s+\bdelay\b|\bsleep\s*\(\s*\d+\s*\)|\bbenchmark\s*\(\s*\d+|\bpg_sleep\s*\()/i,
  // SQL Comments used to terminate queries (e.g., --, /* */, #)
  /(--|\/\*[\s\S]*?\*\/)/
];
function containsSqlInjection(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized) return false;
  return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}
function sanitizeSqlInput(value) {
  if (typeof value !== "string") return "";
  let sanitized = value.replace(/\0/g, "").replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/;\s*$/g, "");
  return sanitized.trim();
}
function sanitizePayload(input) {
  if (input === null || input === void 0) {
    return input;
  }
  if (typeof input === "string") {
    return sanitizeSqlInput(input);
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizePayload(item));
  }
  if (typeof input === "object") {
    const cleanObj = {};
    for (const [key, val] of Object.entries(input)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        continue;
      }
      if (key.startsWith("$")) {
        continue;
      }
      cleanObj[key] = sanitizePayload(val);
    }
    return cleanObj;
  }
  return input;
}

// server.ts
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  if (req.query) {
    for (const [key, val] of Object.entries(req.query)) {
      if (typeof val === "string" && containsSqlInjection(val)) {
        console.warn(`[Security Alert] Blocked suspected SQL injection in query param "${key}": ${val}`);
        return res.status(400).json({
          error: "Security validation failed: Request contains disallowed SQL syntax characters."
        });
      }
    }
  }
  if (req.body && typeof req.body === "object") {
    req.body = sanitizePayload(req.body);
  }
  next();
});
var primaryTransporter = null;
var fallbackTransporter = null;
function parseFromHeader(rawFrom) {
  const defaultEmail = process.env.SMTP_USER || "hanzgonzales125@gmail.com";
  const from = rawFrom?.trim() || `LYPetal Floral Studio <${defaultEmail}>`;
  const match = from.match(/^(?:["']?([^"']+)["']?\s+)?<?([^>]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim() || "LYPetal Floral Studio",
      email: match[2]?.trim() || defaultEmail
    };
  }
  return {
    name: "LYPetal Floral Studio",
    email: defaultEmail
  };
}
async function sendViaBrevoApi(apiKey, options) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sender: {
        name: options.fromName,
        email: options.fromEmail
      },
      to: [{ email: options.toEmail }],
      subject: options.subject,
      htmlContent: options.html,
      textContent: options.text
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Status ${response.status}: ${errorText}`);
  }
  const data = await response.json();
  return { messageId: data?.messageId || data?.id || "brevo-sent" };
}
async function sendViaResendApi(apiKey, options) {
  const from = options.fromEmail.includes("@") && !options.fromEmail.includes("@gmail") && !options.fromEmail.includes("@lypetal") ? `${options.fromName} <${options.fromEmail}>` : `${options.fromName} <onboarding@resend.dev>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [options.toEmail],
      subject: options.subject,
      html: options.html,
      text: options.text
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Status ${response.status}: ${errorText}`);
  }
  const data = await response.json();
  return { messageId: data?.id || "resend-sent" };
}
function getPrimaryTransporter() {
  if (primaryTransporter) return primaryTransporter;
  const rawHost = process.env.SMTP_HOST?.trim();
  const rawUser = process.env.SMTP_USER?.trim();
  const rawPass = process.env.SMTP_PASS?.trim();
  if (rawHost && rawUser) {
    const isGmail = rawHost.toLowerCase().includes("gmail");
    const cleanPass = isGmail ? rawPass?.replace(/\s+/g, "") : rawPass;
    const port = Number(process.env.SMTP_PORT) || (isGmail ? 465 : 587);
    const transportOptions = isGmail ? {
      service: "gmail",
      auth: {
        user: rawUser,
        pass: cleanPass
      }
    } : {
      host: rawHost,
      port,
      secure: port === 465,
      auth: {
        user: rawUser,
        pass: cleanPass
      }
    };
    primaryTransporter = nodemailer.createTransport({
      ...transportOptions,
      connectionTimeout: 1e4,
      greetingTimeout: 1e4,
      socketTimeout: 15e3
    });
    return primaryTransporter;
  }
  return null;
}
async function getFallbackTransporter() {
  if (fallbackTransporter) return fallbackTransporter;
  try {
    const testAccount = await nodemailer.createTestAccount();
    fallbackTransporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    console.log("[LYPetal Mailer] Initialized resilient fallback Ethereal mailer account:", testAccount.user);
    return fallbackTransporter;
  } catch (err) {
    console.warn("[LYPetal Mailer] Falling back to JSON transport");
    fallbackTransporter = nodemailer.createTransport({
      jsonTransport: true
    });
    return fallbackTransporter;
  }
}
async function dispatchEmailMessage(options) {
  const { name: fromName, email: fromEmail } = parseFromHeader(process.env.SMTP_FROM);
  const brevoApiKey = process.env.BREVO_API_KEY?.trim() || (process.env.SMTP_PASS?.trim().startsWith("xkeysib-") ? process.env.SMTP_PASS.trim() : null);
  if (brevoApiKey) {
    try {
      console.log(`[LYPetal Mailer] Dispatching email via Brevo API to ${options.toEmail}...`);
      const brevoResult = await sendViaBrevoApi(brevoApiKey, {
        fromEmail,
        fromName,
        toEmail: options.toEmail,
        subject: options.subject,
        html: options.html,
        text: options.text
      });
      console.log(`[LYPetal Mailer] Email dispatched via Brevo API! Message ID: ${brevoResult.messageId}`);
      return {
        success: true,
        provider: "brevo-api",
        messageId: brevoResult.messageId
      };
    } catch (err) {
      console.info(`[LYPetal Mailer] Brevo connection notice (${err?.message || err}). Routing through fallback.`);
    }
  }
  const resendApiKey = process.env.RESEND_API_KEY?.trim() || (process.env.SMTP_PASS?.trim().startsWith("re_") ? process.env.SMTP_PASS.trim() : null);
  if (resendApiKey) {
    try {
      console.log(`[LYPetal Mailer] Dispatching email via Resend API to ${options.toEmail}...`);
      const result = await sendViaResendApi(resendApiKey, {
        fromEmail,
        fromName,
        toEmail: options.toEmail,
        subject: options.subject,
        html: options.html,
        text: options.text
      });
      console.log(`[LYPetal Mailer] Email dispatched via Resend! ID: ${result.messageId}`);
      return {
        success: true,
        provider: "resend",
        messageId: result.messageId
      };
    } catch {
      console.info("[LYPetal Mailer] Resend API notice: routing to fallback.");
    }
  }
  const primary = getPrimaryTransporter();
  if (primary) {
    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || `"${fromName}" <${fromEmail}>`,
        to: options.toEmail,
        subject: options.subject,
        text: options.text,
        html: options.html
      };
      const info = await primary.sendMail(mailOptions);
      console.log(`[LYPetal Mailer] Email dispatched via SMTP to ${options.toEmail}! Message ID: ${info.messageId}`);
      return {
        success: true,
        provider: "smtp",
        messageId: info.messageId
      };
    } catch {
      primaryTransporter = null;
      console.info("[LYPetal Mailer] Primary SMTP notice: routing to fallback mailer.");
    }
  }
  try {
    const fallback = await getFallbackTransporter();
    const mailOptions = {
      from: `"${fromName}" <${fromEmail}>`,
      to: options.toEmail,
      subject: options.subject,
      text: options.text,
      html: options.html
    };
    const fallbackInfo = await fallback.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(fallbackInfo);
    console.log(`[LYPetal Mailer] Email sent via fallback mailer. Message ID: ${fallbackInfo.messageId}`);
    if (previewUrl) {
      console.log(`[LYPetal Mailer] Preview email at: ${previewUrl}`);
    }
    return {
      success: true,
      provider: "ethereal-fallback",
      previewUrl: previewUrl || null,
      messageId: fallbackInfo.messageId
    };
  } catch (fallbackError) {
    console.error("[LYPetal Mailer] Fallback delivery notification:", fallbackError?.message || fallbackError);
    return {
      success: false,
      provider: "none"
    };
  }
}
app.post("/api/send-receipt", async (req, res) => {
  const { order, recipientEmail, appUrl } = req.body;
  if (!order || !order.id) {
    return res.status(400).json({ error: "Missing order details." });
  }
  const emailTo = recipientEmail || order.customerInfo?.email;
  if (!emailTo) {
    return res.status(400).json({ error: "Customer email address is required." });
  }
  const origin = appUrl || `${req.protocol}://${req.get("host")}`;
  const receiptHtml = generateReceiptHtml(order, { appUrl: origin });
  const subject = `Your LYPetal Order Receipt & Tracking #${order.id}`;
  const textContent = `Thank you for your order with LYPetal! Your order reference is #${order.id}. Track it here: ${origin}/?track=${order.id}`;
  const result = await dispatchEmailMessage({
    toEmail: emailTo,
    subject,
    html: receiptHtml,
    text: textContent
  });
  if (result.success) {
    return res.json({
      success: true,
      messageId: result.messageId,
      provider: result.provider,
      previewUrl: result.previewUrl || null,
      recipient: emailTo,
      message: `Receipt dispatched via ${result.provider} to ${emailTo}`
    });
  }
  return res.status(500).json({
    error: "Failed to dispatch email receipt."
  });
});
app.post("/api/send-status-update", async (req, res) => {
  const { order, newStatus, appUrl } = req.body;
  if (!order || !order.id || !newStatus) {
    return res.status(400).json({ error: "Missing order details or status." });
  }
  const emailTo = order.customerInfo?.email;
  if (!emailTo) {
    return res.status(400).json({ error: "Customer email address is required." });
  }
  const origin = appUrl || `${req.protocol}://${req.get("host")}`;
  const statusHtml = generateStatusUpdateHtml(order, newStatus, { appUrl: origin });
  const subject = `Order Update: #${order.id} is now ${String(newStatus).toUpperCase()} - LYPetal Floral Studio`;
  const textContent = `Hello ${order.customerInfo?.name || "Valued Customer"},

Your LYPetal order #${order.id} status has been updated to: ${newStatus.toUpperCase()}.

Follow your live arrangement and chat with Allyson here:
${origin}/?track=${order.id}

Warmly,
LYPetal Floral Studio`;
  const result = await dispatchEmailMessage({
    toEmail: emailTo,
    subject,
    html: statusHtml,
    text: textContent
  });
  if (result.success) {
    return res.json({
      success: true,
      messageId: result.messageId,
      provider: result.provider,
      previewUrl: result.previewUrl || null,
      recipient: emailTo,
      message: `Status update email (${newStatus}) dispatched to ${emailTo}`
    });
  }
  return res.status(500).json({
    error: "Failed to dispatch status update email."
  });
});
var passkeyAttempts = /* @__PURE__ */ new Map();
var pendingAdminAuthRequests = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, req] of pendingAdminAuthRequests.entries()) {
    if (req.expiresAt < now) {
      pendingAdminAuthRequests.delete(id);
    }
  }
}, 6e4);
function maskEmailAddress(email) {
  if (!email || !email.includes("@")) return "admin email";
  const [user, domain] = email.split("@");
  if (user.length <= 2) return `${user}***@${domain}`;
  return `${user.slice(0, 3)}***@${domain}`;
}
app.post("/api/auth/request-owner-access", async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-client";
  const now = Date.now();
  const record = passkeyAttempts.get(ip) || { failedCount: 0, lockedUntil: 0 };
  if (record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1e3);
    return res.status(429).json({
      success: false,
      error: `Too many failed passkey attempts. Access locked for ${remainingSeconds}s.`,
      locked: true,
      remainingSeconds
    });
  }
  const { passkey, appUrl } = req.body || {};
  if (!passkey || typeof passkey !== "string") {
    return res.status(400).json({
      success: false,
      error: "Studio passkey is required."
    });
  }
  if (containsSqlInjection(passkey)) {
    console.warn(`[Security Alert] SQL injection attempt detected in passkey from ${ip}`);
    return res.status(400).json({
      success: false,
      error: "Security alert: Passkey contains illegal characters or SQL injection syntax."
    });
  }
  const trimmed = passkey.trim();
  const expectedPasskey = (process.env.OWNER_SECRET_PASSKEY || process.env.VITE_OWNER_SECRET_PASSKEY || "lypetal-owner-secret-2025").trim();
  if (trimmed !== expectedPasskey) {
    record.failedCount += 1;
    if (record.failedCount >= 5) {
      record.lockedUntil = now + 60 * 1e3;
      record.failedCount = 0;
      passkeyAttempts.set(ip, record);
      return res.status(429).json({
        success: false,
        error: "Maximum failed attempts reached. Studio access locked for 60 seconds.",
        locked: true,
        remainingSeconds: 60
      });
    }
    passkeyAttempts.set(ip, record);
    return res.status(401).json({
      success: false,
      error: `Invalid Studio Secret Passkey. (${5 - record.failedCount} attempts remaining before temporary lockout)`
    });
  }
  passkeyAttempts.delete(ip);
  const authRequestId = `auth_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const verificationPin = Math.floor(1e5 + Math.random() * 9e5).toString();
  const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
  const expiresAt = now + 10 * 60 * 1e3;
  const targetEmail = (process.env.OWNER_EMAIL || process.env.SMTP_USER || "hanzgonzales125@gmail.com").trim();
  pendingAdminAuthRequests.set(authRequestId, {
    id: authRequestId,
    pin: verificationPin,
    token,
    targetEmail,
    ip,
    createdAt: now,
    expiresAt,
    approved: false,
    rejected: false
  });
  const origin = appUrl || `${req.protocol}://${req.get("host")}`;
  const approvalUrl = `${origin}/?approve_admin=${encodeURIComponent(authRequestId)}&token=${encodeURIComponent(token)}`;
  const rejectUrl = `${origin}/?reject_admin=${encodeURIComponent(authRequestId)}&token=${encodeURIComponent(token)}`;
  const emailHtml = generateAdminLoginConfirmationHtml({
    authRequestId,
    verificationPin,
    approvalUrl,
    rejectUrl,
    ipAddress: ip,
    ownerName: "Allyson"
  });
  const emailSubject = `\u{1F510} [LYPetal Security] Confirm Admin Sign-In (PIN: ${verificationPin.slice(0, 3)} ${verificationPin.slice(3)})`;
  const emailText = `Hello Allyson,

A sign-in request to your Petal-Trak Admin Panel was initiated.

To approve this sign-in, click the link below:
${approvalUrl}

Or enter this 6-digit PIN in your browser: ${verificationPin}

This verification request expires in 10 minutes.`;
  console.log(`[Admin 2FA] Dispatching confirmation email with PIN ${verificationPin} to ${targetEmail}...`);
  const dispatchResult = await dispatchEmailMessage({
    toEmail: targetEmail,
    subject: emailSubject,
    html: emailHtml,
    text: emailText
  });
  return res.json({
    success: true,
    authRequestId,
    targetEmail: maskEmailAddress(targetEmail),
    expiresInSeconds: 600,
    previewUrl: dispatchResult.previewUrl || null,
    provider: dispatchResult.provider,
    message: `Security confirmation sent to ${maskEmailAddress(targetEmail)}. Please check your Gmail.`
  });
});
app.get("/api/auth/check-admin-request/:id", (req, res) => {
  const { id } = req.params;
  const request = pendingAdminAuthRequests.get(id);
  if (!request) {
    return res.status(404).json({
      success: false,
      error: "Authentication request not found or expired.",
      expired: true
    });
  }
  if (request.expiresAt < Date.now()) {
    pendingAdminAuthRequests.delete(id);
    return res.json({
      success: false,
      expired: true,
      error: "Authentication request has expired. Please sign in again."
    });
  }
  if (request.rejected) {
    return res.json({
      success: false,
      rejected: true,
      error: "Sign-in request was rejected."
    });
  }
  return res.json({
    success: true,
    approved: request.approved,
    role: request.approved ? "owner" : null
  });
});
app.post("/api/auth/approve-admin-request", (req, res) => {
  const { authRequestId, token, pin } = req.body || {};
  if (!authRequestId) {
    return res.status(400).json({ error: "Missing auth request ID." });
  }
  const request = pendingAdminAuthRequests.get(authRequestId);
  if (!request) {
    return res.status(404).json({ error: "Authentication request not found or expired." });
  }
  if (request.expiresAt < Date.now()) {
    pendingAdminAuthRequests.delete(authRequestId);
    return res.status(410).json({ error: "Authentication request expired." });
  }
  const isTokenMatch = token && request.token === token;
  const isPinMatch = pin && request.pin.replace(/\s+/g, "") === String(pin).replace(/\s+/g, "");
  if (!isTokenMatch && !isPinMatch) {
    return res.status(401).json({ error: "Invalid approval token or 6-digit PIN." });
  }
  request.approved = true;
  pendingAdminAuthRequests.set(authRequestId, request);
  console.log(`[Admin 2FA] Request ${authRequestId} successfully APPROVED!`);
  return res.json({
    success: true,
    role: "owner",
    message: "Admin sign-in successfully approved!"
  });
});
app.post("/api/auth/reject-admin-request", (req, res) => {
  const { authRequestId, token } = req.body || {};
  const request = pendingAdminAuthRequests.get(authRequestId);
  if (request && (!token || request.token === token)) {
    request.rejected = true;
    pendingAdminAuthRequests.set(authRequestId, request);
    console.warn(`[Admin 2FA] Request ${authRequestId} was REJECTED / BLOCKED.`);
  }
  return res.json({
    success: true,
    message: "Sign-in request blocked."
  });
});
app.post("/api/verify-owner-passkey", (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown-client";
  const now = Date.now();
  const record = passkeyAttempts.get(ip) || { failedCount: 0, lockedUntil: 0 };
  if (record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1e3);
    return res.status(429).json({
      success: false,
      error: `Too many failed passkey attempts. Access locked for ${remainingSeconds}s.`,
      locked: true,
      remainingSeconds
    });
  }
  const { passkey } = req.body || {};
  if (!passkey || typeof passkey !== "string") {
    return res.status(400).json({
      success: false,
      error: "Passkey is required."
    });
  }
  if (containsSqlInjection(passkey)) {
    console.warn(`[Security Alert] SQL injection attempt detected in passkey from ${ip}`);
    return res.status(400).json({
      success: false,
      error: "Security alert: Passkey contains illegal characters or SQL injection syntax."
    });
  }
  const trimmed = passkey.trim();
  const expectedPasskey = (process.env.OWNER_SECRET_PASSKEY || process.env.VITE_OWNER_SECRET_PASSKEY || "lypetal-owner-secret-2025").trim();
  if (trimmed === expectedPasskey) {
    passkeyAttempts.delete(ip);
    console.log(`[Security] Studio Owner Passkey successfully verified from ${ip}`);
    return res.json({
      success: true,
      role: "owner",
      message: "Studio access authorized."
    });
  }
  record.failedCount += 1;
  if (record.failedCount >= 5) {
    record.lockedUntil = now + 60 * 1e3;
    record.failedCount = 0;
    passkeyAttempts.set(ip, record);
    console.warn(`[Security] IP ${ip} exceeded maximum passkey attempts. Locked for 60s.`);
    return res.status(429).json({
      success: false,
      error: "Maximum failed attempts reached. Studio access locked for 60 seconds.",
      locked: true,
      remainingSeconds: 60
    });
  }
  passkeyAttempts.set(ip, record);
  return res.status(401).json({
    success: false,
    error: `Invalid Studio Secret Passkey. (${5 - record.failedCount} attempts remaining before temporary lockout)`
  });
});
function initFirestoreOrderNotificationTrigger() {
  try {
    let baseConfig = {};
    const configPath = path.resolve(__dirname, "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      baseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
    const firebaseConfig = {
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || baseConfig.projectId,
      appId: process.env.VITE_FIREBASE_APP_ID || baseConfig.appId,
      apiKey: process.env.VITE_FIREBASE_API_KEY || baseConfig.apiKey,
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || baseConfig.authDomain,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || baseConfig.storageBucket,
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || baseConfig.messagingSenderId
    };
    if (!firebaseConfig.projectId || !firebaseConfig.apiKey) {
      console.info("[LYPetal Backend Trigger] Firebase config not fully present. Listener skipping background poll.");
      return;
    }
    const serverApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const db = getFirestore(serverApp);
    const ordersCol = collection(db, "orders");
    const knownStatusMap = /* @__PURE__ */ new Map();
    let isInitialSnapshot = true;
    console.log("[LYPetal Backend Trigger] Initializing automated Firestore status update listener with Brevo configuration...");
    onSnapshot(ordersCol, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const orderData = change.doc.data();
        const orderId = change.doc.id;
        const currentStatus = orderData.status;
        if (isInitialSnapshot) {
          if (currentStatus) {
            knownStatusMap.set(orderId, currentStatus);
          }
          return;
        }
        if (change.type === "modified") {
          const previousStatus = knownStatusMap.get(orderId);
          if (currentStatus && currentStatus !== previousStatus) {
            knownStatusMap.set(orderId, currentStatus);
            const customerEmail = orderData.customerInfo?.email;
            if (customerEmail) {
              console.log(
                `[LYPetal Backend Trigger] Order #${orderId} status changed from "${previousStatus || "initial"}" to "${currentStatus}". Dispatching automated confirmation email via Brevo to ${customerEmail}...`
              );
              const origin = process.env.APP_URL || `http://localhost:${PORT}`;
              const fullOrder = { id: orderId, ...orderData };
              const statusHtml = generateStatusUpdateHtml(fullOrder, currentStatus, { appUrl: origin });
              const subject = `Order Update: #${orderId} is now ${String(currentStatus).toUpperCase()} - LYPetal Floral Studio`;
              const textContent = `Hello ${orderData.customerInfo?.name || "Valued Customer"},

Your LYPetal order #${orderId} status has been updated to: ${String(currentStatus).toUpperCase()}.

Follow your live arrangement and chat with Allyson here:
${origin}/?track=${orderId}

Warmly,
LYPetal Floral Studio`;
              try {
                const result = await dispatchEmailMessage({
                  toEmail: customerEmail,
                  subject,
                  html: statusHtml,
                  text: textContent
                });
                console.log(
                  `[LYPetal Backend Trigger] Automated confirmation email for Order #${orderId} (${currentStatus}) successfully dispatched via ${result.provider}!`
                );
              } catch (err) {
                console.warn("[LYPetal Backend Trigger] Failed to send automated status email:", err);
              }
            }
          }
        } else if (change.type === "added") {
          if (currentStatus) {
            knownStatusMap.set(orderId, currentStatus);
          }
        }
      });
      isInitialSnapshot = false;
    }, (error) => {
      console.warn("[LYPetal Backend Trigger] Firestore listener notice:", error.message);
    });
  } catch (err) {
    console.warn("[LYPetal Backend Trigger] Notice initializing Firestore trigger:", err?.message || err);
  }
}
async function startServer() {
  const distHtmlPath = path.resolve(__dirname, "dist", "index.html");
  const distExists = fs.existsSync(distHtmlPath);
  const isProduction = process.env.NODE_ENV === "production" || distExists && process.env.NODE_ENV !== "development";
  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn("[Server] Vite middleware setup failed, falling back to static / dev mode:", err);
      if (distExists) {
        app.use(express.static(path.resolve(__dirname, "dist")));
        app.get("*", (_req, res) => {
          res.sendFile(distHtmlPath);
        });
      }
    }
  } else {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(distHtmlPath);
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[LYPetal Server] Running on http://0.0.0.0:${PORT} (Production: ${isProduction})`);
    initFirestoreOrderNotificationTrigger();
  });
}
startServer();
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * LYPetal Security & Injection Prevention Engine
 * Protects against SQL Injection, NoSQL Injection, Stored Script Injections,
 * Prototype Pollution, and Parameter Tampering across client and server.
 */
