// Sends email through Resend. Returns true on success, false on failure (logged).
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "tools@complyiv.com";
const FROM_EMAIL = process.env.FROM_EMAIL || "TCPA Base Rate Frequency <onboarding@resend.dev>";

export async function sendMail({ to, subject, text, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.error("Mail not sent: RESEND_API_KEY is not set");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, text, html }),
    });
    if (!res.ok) {
      console.error("Resend error", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend request failed", err);
    return false;
  }
}
