"use client";
import type { NativeComponents } from "@keenan/services/builder-react";
import { ContactForm } from "@/components/contact/ContactForm";

// Chefs Depot's sealed leaves for content pages. `contact-form` is the
// pre-builder React form: published trees still reference it, so it must stay
// registered even though new pages use the builder-composed enquiry form.
export function contentNatives(): NativeComponents {
  return { "contact-form": () => <ContactForm /> };
}
