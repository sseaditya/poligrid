"use strict";

const db = require("../db");
const { requireAuth } = require("./auth");
const { httpError } = require("./utils");

const READ_ROLES  = ["procurement", "admin", "lead_designer", "site_supervisor"];
const WRITE_ROLES = ["admin"];

const VALID_CATEGORIES = [
  "Civil", "Electrical", "Plumbing", "HVAC",
  "Flooring", "Furniture/Joinery", "Doors & Windows", "Miscellaneous",
];

// ─── List vendors (with optional search + category filter) ────────────────────
async function vendorsList(req, searchParams) {
  await requireAuth(req, READ_ROLES);
  const sb = db.getClient();

  const q        = searchParams.get("q") || "";
  const category = searchParams.get("category") || "";
  const includeInactive = searchParams.get("inactive") === "1";

  let query = sb
    .from("vendors")
    .select("id, name, phone, email, location, specialty_categories, is_active")
    .order("name");

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw httpError(500, error.message);

  // Filter by specialty category client-side (array contains)
  let vendors = data || [];
  if (category) {
    vendors = vendors.filter(v =>
      Array.isArray(v.specialty_categories) && v.specialty_categories.includes(category)
    );
  }

  if (!vendors.length) return { vendors: [] };

  // Fetch procured business value per vendor in one query
  const vendorIds = vendors.map(v => v.id);
  const { data: items } = await sb
    .from("material_request_items")
    .select("vendor_id, quantity, estimated_rate")
    .in("vendor_id", vendorIds)
    .eq("procured", true);

  const businessByVendor = {};
  for (const item of items || []) {
    if (!businessByVendor[item.vendor_id]) businessByVendor[item.vendor_id] = 0;
    businessByVendor[item.vendor_id] += (item.quantity || 0) * (item.estimated_rate || 0);
  }

  vendors = vendors.map(v => ({
    ...v,
    total_business_value: businessByVendor[v.id] || 0,
  }));

  return { vendors };
}

// ─── Get a single vendor with business-volume stats ───────────────────────────
async function vendorGet(req, id) {
  await requireAuth(req, READ_ROLES);
  if (!id) throw httpError(400, "id required.");
  const sb = db.getClient();

  const [{ data: vendor, error: vErr }, { data: items, error: iErr }] = await Promise.all([
    sb.from("vendors").select("*").eq("id", id).single(),
    sb.from("material_request_items")
      .select(`
        id, item_name, category, quantity, unit, estimated_rate, procured, procured_at,
        request:material_requests(id, title, project:projects(id, name))
      `)
      .eq("vendor_id", id)
      .order("procured_at", { ascending: false })
      .limit(50),
  ]);

  if (vErr) throw httpError(vErr.code === "PGRST116" ? 404 : 500, vErr.message);
  if (iErr) throw httpError(500, iErr.message);

  const procuredItems = (items || []).filter(i => i.procured);
  const totalBusinessValue = procuredItems.reduce(
    (sum, i) => sum + (i.quantity || 0) * (i.estimated_rate || 0), 0
  );
  const totalOrders = new Set(procuredItems.map(i => i.request?.id).filter(Boolean)).size;

  return {
    vendor,
    stats: {
      total_orders: totalOrders,
      total_business_value: totalBusinessValue,
      total_items_procured: procuredItems.length,
    },
    recent_items: items || [],
  };
}

// ─── Create vendor (admin only) ───────────────────────────────────────────────
async function vendorCreate(req, body) {
  await requireAuth(req, WRITE_ROLES);
  const { name, phone, email, address, location, specialty_categories, gstin, notes } = body;
  if (!name?.trim()) throw httpError(400, "Vendor name is required.");

  // Validate categories
  const cats = Array.isArray(specialty_categories)
    ? specialty_categories.filter(c => VALID_CATEGORIES.includes(c))
    : [];

  const sb = db.getClient();
  const { data, error } = await sb
    .from("vendors")
    .insert({
      name: name.trim(),
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      address: address?.trim() || null,
      location: location?.trim() || null,
      specialty_categories: cats,
      gstin: gstin?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (error) throw httpError(500, error.message);
  return { vendor: data };
}

// ─── Update vendor (admin only) ───────────────────────────────────────────────
async function vendorUpdate(req, body) {
  await requireAuth(req, WRITE_ROLES);
  const { id, name, phone, email, address, location, specialty_categories, gstin, notes, is_active } = body;
  if (!id) throw httpError(400, "id required.");

  const patch = {};
  if (name !== undefined)                  patch.name = name.trim();
  if (phone !== undefined)                 patch.phone = phone?.trim() || null;
  if (email !== undefined)                 patch.email = email?.trim() || null;
  if (address !== undefined)               patch.address = address?.trim() || null;
  if (location !== undefined)              patch.location = location?.trim() || null;
  if (specialty_categories !== undefined)  patch.specialty_categories = Array.isArray(specialty_categories)
    ? specialty_categories.filter(c => VALID_CATEGORIES.includes(c))
    : [];
  if (gstin !== undefined)                 patch.gstin = gstin?.trim() || null;
  if (notes !== undefined)                 patch.notes = notes?.trim() || null;
  if (is_active !== undefined)             patch.is_active = Boolean(is_active);
  patch.updated_at = new Date().toISOString();

  const sb = db.getClient();
  const { data, error } = await sb
    .from("vendors")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw httpError(500, error.message);
  return { vendor: data };
}

// ─── Soft-delete vendor (admin only) ─────────────────────────────────────────
async function vendorDelete(req, body) {
  await requireAuth(req, WRITE_ROLES);
  const { id } = body;
  if (!id) throw httpError(400, "id required.");

  const sb = db.getClient();
  const { error } = await sb
    .from("vendors")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw httpError(500, error.message);
  return { ok: true };
}

module.exports = {
  vendorsList,
  vendorGet,
  vendorCreate,
  vendorUpdate,
  vendorDelete,
  VALID_CATEGORIES,
};
