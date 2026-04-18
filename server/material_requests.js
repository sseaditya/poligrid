"use strict";

const db = require("../db");
const { requireAuth } = require("./auth");
const { httpError } = require("./utils");
const { logAuditEvent } = require("./audit");

const SUPERVISOR_ROLES       = ["site_supervisor", "admin"];
const APPROVER_ROLES         = ["lead_designer"];
const PROCUREMENT_ROLES      = ["procurement", "admin"];
const PRICING_APPROVER_ROLES = ["admin"];
const READ_ROLES             = ["site_supervisor", "lead_designer", "admin", "procurement"];

const VALID_ORDER_STATUSES = ["pending", "ordered", "in_transit", "delivered"];

const VALID_CATEGORIES = [
  "Civil",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Flooring",
  "Furniture/Joinery",
  "Doors & Windows",
  "Miscellaneous",
];

// ─── List material requests for a project ─────────────────────────────────────
async function materialRequestsList(req, projectId) {
  await requireAuth(req, READ_ROLES);
  if (!projectId) throw httpError(400, "projectId required.");

  const sb = db.getClient();
  const { data, error } = await sb
    .from("material_requests")
    .select(`
      *,
      submitter:profiles!submitted_by(id, full_name),
      approver:profiles!approved_by(id, full_name),
      item_count:material_request_items(count)
    `)
    .eq("project_id", projectId)
    .order("version_number", { ascending: true });

  if (error) throw httpError(500, error.message);

  // Flatten item_count from [{count}] → number
  const requests = (data || []).map(r => ({
    ...r,
    item_count: r.item_count?.[0]?.count ?? 0,
  }));

  return { requests };
}

// ─── Get a single request with all its items and review history ───────────────
async function materialRequestGet(req, id) {
  await requireAuth(req, READ_ROLES);
  if (!id) throw httpError(400, "id required.");

  const sb = db.getClient();
  const [{ data: request, error: reqErr }, { data: items, error: itemsErr }, { data: reviews, error: revErr }] =
    await Promise.all([
      sb.from("material_requests")
        .select(`
          *,
          submitter:profiles!submitted_by(id, full_name),
          approver:profiles!approved_by(id, full_name),
          project:projects(id, name, client_name, phase)
        `)
        .eq("id", id)
        .single(),
      sb.from("material_request_items")
        .select("*, vendor:vendors(id, name, phone, specialty_categories)")
        .eq("request_id", id)
        .order("category")
        .order("sort_order")
        .order("created_at"),
      sb.from("material_request_reviews")
        .select(`*, reviewer:profiles!reviewed_by(id, full_name)`)
        .eq("request_id", id)
        .order("reviewed_at", { ascending: false }),
    ]);

  if (reqErr) throw httpError(reqErr.code === "PGRST116" ? 404 : 500, reqErr.message);
  if (itemsErr) throw httpError(500, itemsErr.message);
  if (revErr)   throw httpError(500, revErr.message);

  return { request, items: items || [], reviews: reviews || [] };
}

// ─── Create a new draft material request (supervisor / admin) ─────────────────
async function materialRequestCreate(req, body) {
  const { profile } = await requireAuth(req, SUPERVISOR_ROLES);
  const { projectId, title } = body;
  if (!projectId) throw httpError(400, "projectId required.");

  const sb = db.getClient();

  // Compute next version_number
  const { data: existing } = await sb
    .from("material_requests")
    .select("version_number, status")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1);

  const versionNumber = existing?.length ? existing[0].version_number + 1 : 1;
  const requestTitle  = title?.trim() ||
    (versionNumber === 1 ? "Material Request" : `Supplement ${versionNumber - 1}`);

  const { data: row, error } = await sb
    .from("material_requests")
    .insert({
      project_id:     projectId,
      submitted_by:   profile.id,
      version_number: versionNumber,
      title:          requestTitle,
      status:         "draft",
    })
    .select("id, version_number, title, status")
    .single();

  if (error) throw httpError(500, error.message);

  await logAuditEvent({
    category:        "procurement",
    subcategory:     "request_created",
    projectId,
    actionedBy:      profile.id,
    actionedByName:  profile.full_name,
    logMessage:      `${profile.full_name} created material request v${versionNumber} ("${requestTitle}").`,
    metadata:        { requestId: row.id, versionNumber },
  });

  return { request: row };
}

// ─── Upsert (create or update) a single item — live-save while drafting ───────
// Supervisors can edit all fields on draft/revision_requested.
// Procurement/admin can edit estimatedRate on approved/pricing_review requests.
async function materialRequestItemUpsert(req, body) {
  const { profile } = await requireAuth(req, [...SUPERVISOR_ROLES, ...PROCUREMENT_ROLES]);
  const { requestId, itemId, category, itemName, description, quantity, unit, estimatedRate, sortOrder, notes } = body;

  if (!requestId) throw httpError(400, "requestId required.");

  const sb = db.getClient();

  const { data: request, error: reqErr } = await sb
    .from("material_requests")
    .select("id, project_id, status")
    .eq("id", requestId)
    .single();

  if (reqErr || !request) throw httpError(404, "Material request not found.");

  const isSupervisorEdit = SUPERVISOR_ROLES.includes(profile.role);
  const isProcurementEdit = PROCUREMENT_ROLES.includes(profile.role);

  // Procurement: can only update rate on approved or pricing_review requests
  if (!isSupervisorEdit && isProcurementEdit) {
    if (request.status !== "approved" && request.status !== "pricing_review") {
      throw httpError(409, "Procurement can only add pricing on approved requests.");
    }
    if (!itemId) throw httpError(400, "itemId required for rate update.");
    const nowIso = new Date().toISOString();
    const { data, error } = await sb
      .from("material_request_items")
      .update({ estimated_rate: estimatedRate != null ? Number(estimatedRate) : null, updated_at: nowIso })
      .eq("id", itemId)
      .eq("request_id", requestId)
      .select()
      .single();
    if (error) throw httpError(500, error.message);
    return { item: data };
  }

  // Supervisor / admin: full edit on draft or revision_requested
  if (!category)  throw httpError(400, "category required.");
  if (!itemName?.trim()) throw httpError(400, "itemName required.");

  if (request.status !== "draft" && request.status !== "revision_requested") {
    throw httpError(409, "This material request is locked and cannot be edited.");
  }

  // If revision_requested and supervisor starts editing → auto-move back to draft
  if (request.status === "revision_requested") {
    await sb.from("material_requests")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", requestId);
  }

  const payload = {
    request_id:     requestId,
    project_id:     request.project_id,
    category:       category.trim(),
    item_name:      itemName.trim(),
    description:    description?.trim() || null,
    quantity:       quantity != null ? Number(quantity) : null,
    unit:           unit?.trim() || null,
    estimated_rate: estimatedRate != null ? Number(estimatedRate) : null,
    sort_order:     sortOrder != null ? Number(sortOrder) : 0,
    notes:          notes?.trim() || null,
    updated_at:     new Date().toISOString(),
  };

  let savedItem;
  if (itemId) {
    const { data, error } = await sb
      .from("material_request_items")
      .update(payload)
      .eq("id", itemId)
      .eq("request_id", requestId)
      .select()
      .single();
    if (error) throw httpError(500, error.message);
    savedItem = data;
  } else {
    const { data, error } = await sb
      .from("material_request_items")
      .insert(payload)
      .select()
      .single();
    if (error) throw httpError(500, error.message);
    savedItem = data;
  }

  return { item: savedItem };
}

// ─── Delete a single item (draft only) ───────────────────────────────────────
async function materialRequestItemDelete(req, body) {
  await requireAuth(req, SUPERVISOR_ROLES);
  const { itemId, requestId } = body;
  if (!itemId || !requestId) throw httpError(400, "itemId and requestId required.");

  const sb = db.getClient();

  const { data: request } = await sb
    .from("material_requests")
    .select("status")
    .eq("id", requestId)
    .single();

  if (!request) throw httpError(404, "Request not found.");
  if (request.status !== "draft" && request.status !== "revision_requested") {
    throw httpError(409, "Cannot delete items from a locked request.");
  }

  const { error } = await sb
    .from("material_request_items")
    .delete()
    .eq("id", itemId)
    .eq("request_id", requestId);

  if (error) throw httpError(500, error.message);
  return { ok: true };
}

// ─── Submit a draft for approval ──────────────────────────────────────────────
async function materialRequestSubmit(req, body) {
  const { profile } = await requireAuth(req, SUPERVISOR_ROLES);
  const { requestId } = body;
  if (!requestId) throw httpError(400, "requestId required.");

  const sb = db.getClient();

  const { data: request, error: reqErr } = await sb
    .from("material_requests")
    .select("*, project:projects(id, name)")
    .eq("id", requestId)
    .single();

  if (reqErr || !request) throw httpError(404, "Material request not found.");
  if (request.status !== "draft" && request.status !== "revision_requested") {
    throw httpError(409, "Only draft or revision-requested requests can be submitted.");
  }

  // Need at least one item
  const { count: itemCount } = await sb
    .from("material_request_items")
    .select("id", { count: "exact", head: true })
    .eq("request_id", requestId);

  if (!itemCount) throw httpError(400, "Cannot submit an empty material request. Add at least one item.");

  const nowIso = new Date().toISOString();
  await sb.from("material_requests")
    .update({ status: "pending_approval", submitted_at: nowIso, updated_at: nowIso })
    .eq("id", requestId);

  // Auto-create review tasks for all active lead designers on this project
  const { data: assignments } = await sb
    .from("project_assignments")
    .select("user:profiles!user_id(id, full_name, role)")
    .eq("project_id", request.project_id);

  const leads = (assignments || [])
    .map(a => a.user)
    .filter(u => u && (u.role === "lead_designer" || u.role === "admin"));

  // Also include globally active lead designers if none assigned
  let notifyLeads = leads;
  if (!leads.length) {
    const { data: globalLeads } = await sb
      .from("profiles")
      .select("id, full_name, role")
      .eq("role", "lead_designer")
      .eq("is_active", true);
    notifyLeads = globalLeads || [];
  }

  if (notifyLeads.length) {
    const tasks = notifyLeads.map(ld => ({
      assigned_to:  ld.id,
      assigned_by:  profile.id,
      project_id:   request.project_id,
      title:        `Review material request v${request.version_number}: ${request.title}`,
      description:  `Submitted by ${profile.full_name}. ${itemCount} item(s) awaiting approval.`,
      priority:     "medium",
    }));
    await sb.from("tasks").insert(tasks);
  }

  await logAuditEvent({
    category:       "procurement",
    subcategory:    "request_submitted",
    projectId:      request.project_id,
    actionedBy:     profile.id,
    actionedByName: profile.full_name,
    logMessage:     `${profile.full_name} submitted material request v${request.version_number} ("${request.title}") for approval.`,
    metadata:       { requestId, versionNumber: request.version_number, itemCount },
  });

  return { ok: true };
}

// ─── Lead designer / admin reviews a request ──────────────────────────────────
async function materialRequestReview(req, body) {
  const { profile } = await requireAuth(req, APPROVER_ROLES);
  const { requestId, status, comments } = body;

  if (!requestId || !status) throw httpError(400, "requestId and status required.");
  const validStatuses = ["approved", "revision_requested"];
  if (!validStatuses.includes(status)) throw httpError(400, "status must be 'approved' or 'revision_requested'.");

  const sb = db.getClient();

  const { data: request, error: reqErr } = await sb
    .from("material_requests")
    .select("*, project:projects(id, name), submitter:profiles!submitted_by(id, full_name)")
    .eq("id", requestId)
    .single();

  if (reqErr || !request) throw httpError(404, "Material request not found.");
  if (request.status !== "pending_approval") {
    throw httpError(409, "Only pending-approval requests can be reviewed.");
  }

  // Insert review record
  await sb.from("material_request_reviews").insert({
    request_id:  requestId,
    reviewed_by: profile.id,
    status,
    comments:    comments || null,
  });

  const nowIso = new Date().toISOString();
  const patch = {
    status,
    updated_at: nowIso,
    ...(status === "approved" ? { approved_at: nowIso, approved_by: profile.id } : {}),
  };
  await sb.from("material_requests").update(patch).eq("id", requestId);

  const subcategory = status === "approved" ? "request_approved" : "request_revision";
  const actionLabel = status === "approved"
    ? "approved"
    : "requested revision on";

  await logAuditEvent({
    category:       "procurement",
    subcategory,
    projectId:      request.project_id,
    actionedBy:     profile.id,
    actionedByName: profile.full_name,
    logMessage:     `${profile.full_name} ${actionLabel} material request v${request.version_number} ("${request.title}") for ${request.project?.name || "project"}.`,
    metadata:       { requestId, status, comments: comments || null, versionNumber: request.version_number },
  });

  // If revision requested → create task for the supervisor
  if (status === "revision_requested" && request.submitter) {
    await sb.from("tasks").insert({
      assigned_to:  request.submitter.id,
      assigned_by:  profile.id,
      project_id:   request.project_id,
      title:        `Revise material request v${request.version_number}: ${request.title}`,
      description:  comments || "Your material request needs revision.",
      priority:     "high",
    });
  }

  return { ok: true };
}

// ─── Procurement marks an item as procured ────────────────────────────────────
async function materialRequestItemMarkProcured(req, body) {
  const { profile } = await requireAuth(req, PROCUREMENT_ROLES);
  const { itemId, procured } = body;
  if (!itemId || procured == null) throw httpError(400, "itemId and procured (boolean) required.");

  const sb = db.getClient();

  const { data: item } = await sb
    .from("material_request_items")
    .select("request_id, material_requests(status)")
    .eq("id", itemId)
    .single();

  if (!item) throw httpError(404, "Item not found.");
  const reqStatus = item.material_requests?.status;
  if (reqStatus !== "approved" && reqStatus !== "procurement_active") {
    throw httpError(409, "Items can only be marked procured on approved or active procurement requests.");
  }

  const nowIso = new Date().toISOString();
  const patch = procured
    ? { procured: true,  procured_at: nowIso,  procured_by: profile.id, updated_at: nowIso }
    : { procured: false, procured_at: null,     procured_by: null,       updated_at: nowIso };

  const { error } = await sb
    .from("material_request_items")
    .update(patch)
    .eq("id", itemId);

  if (error) throw httpError(500, error.message);
  return { ok: true };
}

// ─── Procurement sets vendor on an item ──────────────────────────────────────
async function materialRequestItemSetVendor(req, body) {
  await requireAuth(req, PROCUREMENT_ROLES);
  const { itemId, vendorId } = body;
  if (!itemId) throw httpError(400, "itemId required.");

  const sb = db.getClient();

  // Verify item exists and request is in procurement_active
  const { data: item } = await sb
    .from("material_request_items")
    .select("request_id, material_requests(status)")
    .eq("id", itemId)
    .single();

  if (!item) throw httpError(404, "Item not found.");
  const reqStatus = item.material_requests?.status;
  if (reqStatus !== "approved" && reqStatus !== "procurement_active") {
    throw httpError(409, "Vendor can only be assigned on approved or active procurement requests.");
  }

  const patch = {
    vendor_id: vendorId || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb
    .from("material_request_items")
    .update(patch)
    .eq("id", itemId);

  if (error) throw httpError(500, error.message);
  return { ok: true };
}

// ─── Procurement submits pricing for admin approval ───────────────────────────
async function materialRequestSubmitPricing(req, body) {
  const { profile } = await requireAuth(req, PROCUREMENT_ROLES);
  const { requestId } = body;
  if (!requestId) throw httpError(400, "requestId required.");

  const sb = db.getClient();

  const { data: request, error: reqErr } = await sb
    .from("material_requests")
    .select("*, project:projects(id, name)")
    .eq("id", requestId)
    .single();

  if (reqErr || !request) throw httpError(404, "Material request not found.");
  if (request.status !== "approved") {
    throw httpError(409, "Pricing can only be submitted on approved requests.");
  }

  // Validate all items have a rate
  const { data: items } = await sb
    .from("material_request_items")
    .select("id, item_name, estimated_rate")
    .eq("request_id", requestId);

  const unpriced = (items || []).filter(i => i.estimated_rate == null);
  if (unpriced.length) {
    throw httpError(400, `${unpriced.length} item(s) still need a rate before submitting for approval.`);
  }

  const nowIso = new Date().toISOString();
  await sb.from("material_requests")
    .update({ status: "pricing_review", updated_at: nowIso })
    .eq("id", requestId);

  // Create task for all admin users
  const { data: admins } = await sb
    .from("profiles")
    .select("id, full_name")
    .eq("role", "admin")
    .eq("is_active", true);

  if (admins?.length) {
    const tasks = admins.map(a => ({
      assigned_to:  a.id,
      assigned_by:  profile.id,
      project_id:   request.project_id,
      title:        `Approve procurement pricing: ${request.title}`,
      description:  `${profile.full_name} has submitted pricing for ${items.length} item(s) in "${request.title}". Please review and approve.`,
      priority:     "high",
    }));
    await sb.from("tasks").insert(tasks);
  }

  await logAuditEvent({
    category:       "procurement",
    subcategory:    "pricing_submitted",
    projectId:      request.project_id,
    actionedBy:     profile.id,
    actionedByName: profile.full_name,
    logMessage:     `${profile.full_name} submitted pricing for ${request.title} (${items.length} items) for admin approval.`,
    metadata:       { requestId, itemCount: items.length },
  });

  return { ok: true };
}

// ─── Admin approves or rejects procurement pricing ────────────────────────────
async function materialRequestApprovePricing(req, body) {
  const { profile } = await requireAuth(req, PRICING_APPROVER_ROLES);
  const { requestId, status, comments } = body;

  if (!requestId || !status) throw httpError(400, "requestId and status required.");
  const validStatuses = ["procurement_active", "approved"]; // approved = send back for revision
  if (!validStatuses.includes(status)) {
    throw httpError(400, "status must be 'procurement_active' (approve) or 'approved' (send back).");
  }

  const sb = db.getClient();

  const { data: request, error: reqErr } = await sb
    .from("material_requests")
    .select("*, project:projects(id, name), submitter:profiles!submitted_by(id, full_name)")
    .eq("id", requestId)
    .single();

  if (reqErr || !request) throw httpError(404, "Material request not found.");
  if (request.status !== "pricing_review") {
    throw httpError(409, "Only pricing_review requests can be approved.");
  }

  const nowIso = new Date().toISOString();
  const patch = {
    status,
    updated_at: nowIso,
    ...(status === "procurement_active"
      ? { pricing_approved_by: profile.id, pricing_approved_at: nowIso }
      : {}),
  };
  await sb.from("material_requests").update(patch).eq("id", requestId);

  // Find procurement users assigned to project
  const { data: assignments } = await sb
    .from("project_assignments")
    .select("user:profiles!user_id(id, full_name, role)")
    .eq("project_id", request.project_id);

  const procurers = (assignments || [])
    .map(a => a.user)
    .filter(u => u && u.role === "procurement");

  if (!procurers.length) {
    const { data: globalProcure } = await sb
      .from("profiles")
      .select("id, full_name")
      .eq("role", "procurement")
      .eq("is_active", true);
    procurers.push(...(globalProcure || []));
  }

  if (procurers.length) {
    const taskTitle = status === "procurement_active"
      ? `Pricing approved — begin ordering: ${request.title}`
      : `Pricing needs revision: ${request.title}`;
    const taskDesc = status === "procurement_active"
      ? `Admin has approved your pricing. You can now start placing orders.`
      : `Admin sent back pricing for revision. ${comments || "Please review and resubmit."}`;

    const tasks = procurers.map(u => ({
      assigned_to:  u.id,
      assigned_by:  profile.id,
      project_id:   request.project_id,
      title:        taskTitle,
      description:  taskDesc,
      priority:     "high",
    }));
    await sb.from("tasks").insert(tasks);
  }

  const actionLabel = status === "procurement_active" ? "approved pricing for" : "sent back pricing for revision on";
  await logAuditEvent({
    category:       "procurement",
    subcategory:    status === "procurement_active" ? "pricing_approved" : "pricing_revision",
    projectId:      request.project_id,
    actionedBy:     profile.id,
    actionedByName: profile.full_name,
    logMessage:     `${profile.full_name} ${actionLabel} "${request.title}".${comments ? ` Comments: ${comments}` : ""}`,
    metadata:       { requestId, status, comments: comments || null },
  });

  return { ok: true };
}

// ─── Procurement updates order status for item(s) ─────────────────────────────
async function materialRequestItemUpdateOrderStatus(req, body) {
  const { profile } = await requireAuth(req, PROCUREMENT_ROLES);
  const { itemId, category, requestId, orderStatus } = body;

  if (!requestId) throw httpError(400, "requestId required.");
  if (!orderStatus || !VALID_ORDER_STATUSES.includes(orderStatus)) {
    throw httpError(400, `orderStatus must be one of: ${VALID_ORDER_STATUSES.join(", ")}`);
  }
  if (!itemId && !category) throw httpError(400, "Either itemId or category is required.");

  const sb = db.getClient();

  // Verify request is procurement_active
  const { data: request } = await sb
    .from("material_requests")
    .select("status")
    .eq("id", requestId)
    .single();

  if (!request) throw httpError(404, "Material request not found.");
  if (request.status !== "procurement_active") {
    throw httpError(409, "Order status can only be updated on procurement-active requests.");
  }

  const nowIso = new Date().toISOString();
  let query = sb.from("material_request_items")
    .update({ order_status: orderStatus, updated_at: nowIso })
    .eq("request_id", requestId);

  if (itemId) {
    query = query.eq("id", itemId);
  } else {
    query = query.eq("category", category);
  }

  const { error } = await query;
  if (error) throw httpError(500, error.message);

  return { ok: true };
}

// ─── Get categories constant ──────────────────────────────────────────────────
function materialRequestCategories() {
  return { categories: VALID_CATEGORIES };
}

// ─── Summary counts per project (for home page cards) ─────────────────────────
async function materialRequestSummary(req, projectIds) {
  await requireAuth(req, READ_ROLES);
  if (!projectIds?.length) return { summary: {} };

  const sb = db.getClient();
  const { data, error } = await sb
    .from("material_requests")
    .select("project_id, status")
    .in("project_id", projectIds);

  if (error) throw httpError(500, error.message);

  const summary = {};
  for (const row of data || []) {
    if (!summary[row.project_id]) {
      summary[row.project_id] = {
        total: 0, draft: 0, pending_approval: 0, approved: 0,
        revision_requested: 0, pricing_review: 0, procurement_active: 0,
      };
    }
    summary[row.project_id].total++;
    summary[row.project_id][row.status] = (summary[row.project_id][row.status] || 0) + 1;
  }
  return { summary };
}

// ─── Admin queue: pricing approvals + active deliveries ──────────────────────
async function materialRequestAdminQueue(req) {
  await requireAuth(req, ["admin"]);
  const sb = db.getClient();

  const [{ data: pricingRequests }, { data: activeItems }] = await Promise.all([
    // All requests awaiting pricing approval
    sb.from("material_requests")
      .select(`
        id, title, version_number, status, created_at,
        project:projects(id, name, client_name),
        item_count:material_request_items(count)
      `)
      .eq("status", "pricing_review")
      .order("created_at", { ascending: true }),

    // All items in ordered / in_transit states
    sb.from("material_request_items")
      .select(`
        id, item_name, description, category, quantity, unit, order_status, updated_at,
        vendor:vendors(id, name),
        request:material_requests(
          id, title,
          project:projects(id, name, client_name)
        )
      `)
      .in("order_status", ["ordered", "in_transit"])
      .order("updated_at", { ascending: false }),
  ]);

  const pricing = (pricingRequests || []).map(r => ({
    ...r,
    item_count: r.item_count?.[0]?.count ?? 0,
  }));

  return { pricingApprovals: pricing, activeDeliveries: activeItems || [] };
}

// ─── Pending approval queue for lead designer home ───────────────────────────
async function materialRequestPendingApproval(req) {
  await requireAuth(req, [...APPROVER_ROLES, "admin"]);
  const sb = db.getClient();

  const { data, error } = await sb
    .from("material_requests")
    .select(`
      id, title, version_number, status, submitted_at,
      project:projects(id, name, client_name),
      submitted_by_profile:profiles!material_requests_submitted_by_fkey(full_name),
      item_count:material_request_items(count)
    `)
    .eq("status", "pending_approval")
    .order("submitted_at", { ascending: true })
    .limit(20);

  if (error) throw httpError(500, error.message);

  const requests = (data || []).map(r => ({
    ...r,
    item_count: r.item_count?.[0]?.count ?? 0,
  }));

  return { requests };
}

module.exports = {
  materialRequestsList,
  materialRequestGet,
  materialRequestCreate,
  materialRequestItemUpsert,
  materialRequestItemDelete,
  materialRequestSubmit,
  materialRequestReview,
  materialRequestItemMarkProcured,
  materialRequestSubmitPricing,
  materialRequestApprovePricing,
  materialRequestItemUpdateOrderStatus,
  materialRequestItemSetVendor,
  materialRequestCategories,
  materialRequestSummary,
  materialRequestAdminQueue,
  materialRequestPendingApproval,
};
