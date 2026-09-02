import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const orderInput = z.object({
  /** Amount in rupees. */
  amount: z.number().positive().max(500000),
});

export const createRazorpayOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => orderInput.parse(data))
  .handler(async ({ data }) => {
    const keyId = process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keyId || !keySecret) throw new Error("Razorpay API keys are not configured");

    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      },
      body: JSON.stringify({
        amount: Math.round(data.amount * 100),
        currency: "INR",
        notes: { source: "revenue-risk-radar-test-checkout" },
      }),
    });

    const body = (await res.json()) as { id?: string; error?: { description?: string } };
    if (!res.ok || !body.id) {
      console.error("Razorpay order creation failed", res.status, body?.error?.description);
      throw new Error(body?.error?.description ?? "Could not create Razorpay order");
    }

    return { orderId: body.id, keyId, amountPaise: Math.round(data.amount * 100) };
  });
