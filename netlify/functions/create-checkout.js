const crypto = require("crypto");
const { supabaseAdmin, stripeClient, json, getUser, MOCK_STRIPE } = require("../../lib/common");

exports.handler = async (event) => {
  try {
    const user = await getUser(event);
    if (!user) return json(401, { error: "Please log in again." });

    const supabase = supabaseAdmin();

    const { data: candidate } = await supabase
      .from("candidates")
      .select("id, email")
      .eq("id", user.id)
      .single();
    if (!candidate) return json(400, { error: "Please complete your candidate profile first." });

    const { data: attempt, error } = await supabase
      .from("exam_attempts")
      .insert({ candidate_id: user.id, paid: false })
      .select()
      .single();
    if (error) throw error;

    if (MOCK_STRIPE) {
      // Test mode: fake checkout page instead of Stripe. Unguessable token ties the page to this attempt.
      const mockSession = `mock_${crypto.randomBytes(18).toString("hex")}`;
      await supabase.from("exam_attempts").update({ stripe_session_id: mockSession }).eq("id", attempt.id);
      return json(200, {
        url: `/mock-checkout.html?attemptId=${attempt.id}&session=${mockSession}`,
        attemptId: attempt.id
      });
    }

    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      customer_email: candidate.email || user.email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: 100, // 100 cents = 1.00 EUR
            product_data: {
              name: "GerLinx German Oral Proficiency Test (5 Min)",
              description: "AI-evaluated German speaking assessment (Pass mark: 70/100)"
            }
          },
          quantity: 1
        }
      ],
      metadata: { attemptId: attempt.id, candidateId: user.id },
      client_reference_id: attempt.id,
      success_url: `${process.env.SITE_URL}/?attemptId=${attempt.id}&payment=success`,
      cancel_url: `${process.env.SITE_URL}/?payment=cancelled`
    });

    await supabase
      .from("exam_attempts")
      .update({ stripe_session_id: session.id })
      .eq("id", attempt.id);

    return json(200, { url: session.url, attemptId: attempt.id });
  } catch (err) {
    console.error("create-checkout error:", err);
    return json(500, { error: "Could not start payment. Please try again." });
  }
};
