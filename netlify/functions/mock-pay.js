// TEST MODE ONLY: simulates a successful Stripe payment. Disabled unless MOCK_STRIPE=true.
const { supabaseAdmin, json, parseBody, MOCK_STRIPE } = require("../../lib/common");

exports.handler = async (event) => {
  if (!MOCK_STRIPE) return json(404, { error: "Not found" });

  const { attemptId, session } = parseBody(event);
  if (!attemptId || !session || !String(session).startsWith("mock_")) {
    return json(400, { error: "Invalid mock payment." });
  }

  const { data, error } = await supabaseAdmin()
    .from("exam_attempts")
    .update({ paid: true })
    .eq("id", attemptId)
    .eq("stripe_session_id", session)
    .select("id")
    .maybeSingle();

  if (error || !data) return json(400, { error: "Attempt not found." });
  return json(200, { redirect: `/?attemptId=${attemptId}&payment=success` });
};
