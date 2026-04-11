"use strict";

// ─── Notification stubs ───────────────────────────────────────────────────────
// WhatsApp (and any other channel) notifications will be wired here.
// Each function is called at the relevant business event; right now they just log.
// When you're ready to integrate, replace the console.log bodies with real API calls.

// Drawing uploaded — notify lead designers
async function notifyDrawingUploaded({ projectName, drawingTitle, drawingType, uploaderName, leadDesigners }) {
  const message =
    `📐 New ${drawingType} drawing submitted\n` +
    `Project: ${projectName}\n` +
    `Drawing: ${drawingTitle}\n` +
    `By: ${uploaderName}\n` +
    `Action needed: Review & approve`;

  console.log("[Notify] Drawing uploaded →", { to: leadDesigners.map(u => u.email), message });
  // TODO: for each lead, send WhatsApp via Twilio / Meta Cloud API:
  // await sendWhatsApp(lead.phone, message);
}

// Drawing reviewed — notify the designer
async function notifyDrawingReviewed({ projectName, drawingTitle, status, reviewerName, comments, designerEmail }) {
  const emoji = status === "approved" ? "✅" : status === "rejected" ? "❌" : "🔁";
  const statusLabel = { approved: "Approved", rejected: "Rejected", revision_requested: "Revision Requested" }[status] || status;

  const message =
    `${emoji} Drawing ${statusLabel}\n` +
    `Project: ${projectName}\n` +
    `Drawing: ${drawingTitle}\n` +
    `By: ${reviewerName}` +
    (comments ? `\nNote: ${comments}` : "");

  console.log("[Notify] Drawing reviewed →", { to: designerEmail, message });
  // TODO: sendWhatsApp(designer.phone, message);
}

// Generic task assigned — notify assignee
async function notifyTaskAssigned({ taskTitle, assigneeName, assigneeEmail, projectName }) {
  const message =
    `📋 New task assigned\n` +
    `Task: ${taskTitle}` +
    (projectName ? `\nProject: ${projectName}` : "");

  console.log("[Notify] Task assigned →", { to: assigneeEmail, message });
  // TODO: sendWhatsApp(assignee.phone, message);
}

// Placeholder for the actual send call
// async function sendWhatsApp(phone, message) {
//   await fetch("https://api.twilio.com/...", { ... });
// }

module.exports = { notifyDrawingUploaded, notifyDrawingReviewed, notifyTaskAssigned };
