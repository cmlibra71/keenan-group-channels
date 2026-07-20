"use client";

import * as React from "react";
import { submitContact } from "@/lib/actions/contact";

export function ContactForm() {
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState("");
  const [isPending, startTransition] = React.useTransition();

  if (submitted) {
    return (
      <div className="max-w-xl rounded-md border border-green-600 p-4 text-green-700">
        Thanks — we&apos;ll be in touch shortly.
      </div>
    );
  }

  return (
    <form
      className="max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await submitContact(fd);
          if ("error" in res) setError(res.error);
          else setSubmitted(true);
        });
      }}
    >
      <div className="mb-4">
        <label className="block text-sm font-medium text-text-primary mb-1" htmlFor="contact-name">
          Name
        </label>
        <input
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
          id="contact-name"
          name="name"
          required
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-text-primary mb-1" htmlFor="contact-email">
          Email
        </label>
        <input
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
          id="contact-email"
          name="email"
          type="email"
          required
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-text-primary mb-1" htmlFor="contact-subject">
          Subject
        </label>
        <input
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
          id="contact-subject"
          name="subject"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-text-primary mb-1" htmlFor="contact-message">
          Message
        </label>
        <textarea
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
          id="contact-message"
          name="message"
          rows={5}
          required
        />
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <button className="btn-primary" type="submit" disabled={isPending}>
        Send message
      </button>
    </form>
  );
}
