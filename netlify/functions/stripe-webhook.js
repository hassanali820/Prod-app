const { supabaseAdmin, stripeClient, rawBody } = require("../../lib/common");

exports.handler = async (event) => {
  const headers = event.headers || {};
  const sig = headers["stripe-signature"] || headers["Stripe-Signature"];
  let stripeEvent;

  try {
    stripeEvent = stripeClient().webhooks.constructEvent(
      rawBody(event),
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const type = stripeEvent.type;
  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    const session = stripeEvent.data.object;
    const attemptId = session.metadata?.attemptId;

    // Only unlock when the money has actually been collected.
    if (attemptId && session.payment_status === "paid") {
      const { error } = await supabaseAdmin()
        .from("exam_attempts")
        .update({ paid: true })
        .eq("id", attemptId)
        .eq("stripe_session_id", session.id);
      if (error) {
        console.error("stripe-webhook update failed:", error);
        return { statusCode: 500, body: "DB update failed" }; // Stripe will retry
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
