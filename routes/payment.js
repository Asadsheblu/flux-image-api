// routes/payments.js
import express from "express";
import { initiatePayment, validatePayment } from "../utils/sslc.js";

const router = express.Router();

// --- In-memory order store (demo) ---
const orderStore = new Map();
// Structure: orderStore.set(tran_id, { status, amount, currency, customer, gateway_response, ... })

// --- Small guard: Domain B -> Domain A internal token (optional but recommended) ---
function verifyInternalToken(req, res, next) {
  const expected = process.env.INTERNAL_SHARED_TOKEN;
  if (!expected) return next(); // disabled
  const received = req.headers["x-internal-token"];
  if (!received || received !== expected) {
    return res.status(401).json({ success: false, message: "Unauthorized (internal token)" });
  }
  next();
}

/**
 * POST /api/payments/initiate
 * Body:
 *  - amount (BDT)
 *  - tran_id? (optional; auto-generate if missing)
 *  - customer {name,email,phone,address?} (optional)
 *  - success_url/fail_url/cancel_url (optional override; otherwise from .env)
 *
 * Flow: Domain B -> Domain A (this route) -> SSLCommerz -> returns GatewayPageURL
 */
router.post("/initiate", verifyInternalToken, async (req, res) => {
  try {
    const {
      amount,
      tran_id,
      customer = {},
      success_url,
      fail_url,
      cancel_url,
      meta = {}, // anything you want to carry
      currency = "BDT",
      product_name = "Order",
      product_category = "General",
      product_profile = "general",
    } = req.body || {};

    if (!amount) {
      return res.status(400).json({ success: false, message: "amount is required" });
    }
    const finalTranId = tran_id || `ORD_${Date.now()}`;
    const SSLC_STORE_ID = process.env.SSLC_STORE_ID;
    const SSLC_STORE_PASSWORD = process.env.SSLC_STORE_PASSWORD;

    const payload = {
      store_id: SSLC_STORE_ID,
      store_passwd: SSLC_STORE_PASSWORD,
      total_amount: amount,
      currency,
      tran_id: finalTranId,
      success_url: success_url || process.env.SUCCESS_URL,
      fail_url: fail_url || process.env.FAIL_URL,
      cancel_url: cancel_url || process.env.CANCEL_URL,
      product_name,
      product_category,
      product_profile,

      // Basic customer fields (SSLCommerz requires a few)
      cus_name: customer.name || "Customer",
      cus_email: customer.email || "customer@example.com",
      cus_add1: customer.address || "Dhaka",
      cus_city: customer.city || "Dhaka",
      cus_country: customer.country || "Bangladesh",
      cus_phone: customer.phone || "01700000000",

      // shipping info can be same
      ship_name: customer.name || "Customer",
      ship_add1: customer.address || "Dhaka",
      ship_city: customer.city || "Dhaka",
      ship_country: customer.country || "Bangladesh",
    };

    const initRes = await initiatePayment(payload);

    if (!initRes || initRes.status !== "SUCCESS" || !initRes.GatewayPageURL) {
      return res.status(400).json({
        success: false,
        message: initRes?.failedreason || "SSLCommerz initiation failed",
        gateway: initRes,
      });
    }

    // Save order (DB replace)
    orderStore.set(finalTranId, {
      status: "initiated",
      amount: Number(amount),
      currency,
      customer,
      meta,
      gateway_response: initRes,
      createdAt: new Date(),
    });
    // TODO: DB upsert here

    return res.json({ success: true, tran_id: finalTranId, paymentUrl: initRes.GatewayPageURL });
  } catch (e) {
    console.error("initiate error:", e?.response?.data || e.message);
    return res.status(500).json({ success: false, message: e.message || "Internal error" });
  }
});

/**
 * POST /api/payments/ipn
 * SSLCommerz IPN/Webhook hits here with form-urlencoded fields.
 * We must VALIDATE using validation API (val_id + store credentials).
 */
router.post("/ipn", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const payload = req.body || {};
    // Common fields from IPN: status, tran_id, val_id, amount, store_amount, bank_tran_id, card_type, etc.
    const { tran_id, val_id, status } = payload;

    if (!tran_id || !val_id) {
      return res.status(400).json({ success: false, message: "Missing tran_id or val_id" });
    }

    // Validate with SSLCommerz
    const validation = await validatePayment({
      val_id,
      store_id: process.env.SSLC_STORE_ID,
      store_passwd: process.env.SSLC_STORE_PASSWORD,
    });

    // VALID / VALIDATED → success; others → failed
    const isPaid = ["VALID", "VALIDATED"].includes((validation?.status || "").toUpperCase());

    // Update order (DB replace)
    const before = orderStore.get(tran_id) || {};
    orderStore.set(tran_id, {
      ...before,
      status: isPaid ? "paid" : "failed",
      validated: validation,
      ipn_payload: payload,
      updatedAt: new Date(),
    });
    // TODO: DB update here
    // TODO: if (isPaid && !before.credits_added) then add credits to user, mark credits_added=true

    return res.json({
      success: true,
      message: isPaid ? "Payment successful" : "Payment failed",
      status_from_ipn: status,
      validated_status: validation?.status,
    });
  } catch (e) {
    console.error("ipn error:", e?.response?.data || e.message);
    return res.status(500).json({ success: false, message: e.message || "Internal error" });
  }
});

/**
 * GET /api/payments/success
 * GET /api/payments/fail
 * GET /api/payments/cancel
 * SSLCommerz user redirect endpoints; optional: you can also run validation here if val_id present.
 */
router.get("/success", async (req, res) => {
  try {
    const { tran_id, val_id } = req.query || {};
    if (tran_id && val_id) {
      const validation = await validatePayment({
        val_id,
        store_id: process.env.SSLC_STORE_ID,
        store_passwd: process.env.SSLC_STORE_PASSWORD,
      });
      const isPaid = ["VALID", "VALIDATED"].includes((validation?.status || "").toUpperCase());
      const before = orderStore.get(tran_id) || {};
      orderStore.set(tran_id, {
        ...before,
        status: isPaid ? "paid" : "failed",
        validated: validation,
        updatedAt: new Date(),
      });
    }
    // এখানে তুমি Domain B এর ফ্রন্টএন্ডে redirect করে দিতে পারো:
    // return res.redirect(`https://domainb.com/payment-success?tran_id=${tran_id}`);
    return res.json({ success: true, message: "Success redirect captured", tran_id, val_id });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

router.get("/fail", (req, res) => {
  const { tran_id } = req.query || {};
  const before = tran_id ? orderStore.get(tran_id) : null;
  if (tran_id) {
    orderStore.set(tran_id, { ...before, status: "failed", updatedAt: new Date() });
  }
  // return res.redirect(`https://domainb.com/payment-fail?tran_id=${tran_id}`);
  return res.json({ success: false, message: "Payment failed", tran_id });
});

router.get("/cancel", (req, res) => {
  const { tran_id } = req.query || {};
  const before = tran_id ? orderStore.get(tran_id) : null;
  if (tran_id) {
    orderStore.set(tran_id, { ...before, status: "cancelled", updatedAt: new Date() });
  }
  // return res.redirect(`https://domainb.com/payment-cancel?tran_id=${tran_id}`);
  return res.json({ success: false, message: "Payment cancelled", tran_id });
});

/**
 * (Optional) GET /api/payments/order/:tran_id
 * Check an order status (useful for Domain B polling)
 */
router.get("/order/:tran_id", (req, res) => {
  const o = orderStore.get(req.params.tran_id);
  if (!o) return res.status(404).json({ success: false, message: "Order not found" });
  return res.json({ success: true, order: o });
});

export default router;
