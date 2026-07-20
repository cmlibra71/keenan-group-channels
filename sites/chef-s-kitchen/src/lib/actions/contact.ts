"use server";

import { sendStaffNotification } from "@/lib/staff-email";

export async function submitContact(
  formData: FormData
): Promise<{ success: true } | { error: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!email) return { error: "Email is required." };
  if (!email.includes("@")) return { error: "Please enter a valid email address." };
  if (!message) return { error: "Message is required." };

  try {
    await sendStaffNotification({
      subject: `Contact enquiry: ${subject || "General"}`,
      heading: "New contact enquiry",
      rows: [
        ["Name", name],
        ["Email", email],
        ["Subject", subject || "General"],
        ["Message", message],
      ],
      portalPath: "/dashboard",
      linkLabel: "Open dashboard",
    });
    return { success: true };
  } catch {
    return { error: "Could not send your message. Please try again." };
  }
}
