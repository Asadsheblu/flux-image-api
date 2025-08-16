// utils/sslc.js
import axios from "axios";

export function getSslcBase() {
  const isSandbox = process.env.SSLC_SANDBOX === "true";
  return {
    init: isSandbox
      ? "https://sandbox.sslcommerz.com/gwprocess/v4/api.php"
      : "https://securepay.sslcommerz.com/gwprocess/v4/api.php",
    validate: isSandbox
      ? "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php"
      : "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php",
  };
}

export async function initiatePayment(payload) {
  const { init } = getSslcBase();
  // form-encoded লাগবে
  const body = new URLSearchParams(payload);
  const res = await axios.post(init, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 20000,
  });
  return res.data;
}

export async function validatePayment({ val_id, store_id, store_passwd }) {
  const { validate } = getSslcBase();
  const qs = new URLSearchParams({
    val_id,
    store_id,
    store_passwd,
    format: "json",
  }).toString();
  const url = `${validate}?${qs}`;
  const res = await axios.get(url, { timeout: 20000 });
  return res.data; // status: VALID | VALIDATED | FAILED
}
