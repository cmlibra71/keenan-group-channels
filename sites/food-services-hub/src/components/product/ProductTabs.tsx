"use client";

import { useState, useTransition } from "react";
import { RichContent } from "@/components/content/RichContent";
import { submitReview } from "@/lib/actions/reviews";
import { Star } from "lucide-react";

type Review = {
  id: number;
  rating: number;
  title: string | null;
  text: string | null;
  authorName: string | null;
  createdAt: string | Date | null;
};

type Tab = {
  key: string;
  label: string;
};

export function ProductTabs({
  description,
  reviews,
  productId,
}: {
  description: string | null;
  reviews: Review[];
  productId: number;
}) {
  const tabs: Tab[] = [];

  if (description) tabs.push({ key: "description", label: "FEATURES" });
  tabs.push({ key: "reviews", label: `Reviews (${reviews.length})` });

  const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? "description");

  return (
    <div className="mt-12 border-t border-zinc-200 pt-8">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-zinc-900 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="py-6">
        {activeTab === "description" && description && (
          <RichContent
            html={description}
            stripStyles
            className="prose prose-sm max-w-none text-zinc-600"
          />
        )}

        {activeTab === "reviews" && (
          <ReviewsSection reviews={reviews} productId={productId} />
        )}

      </div>
    </div>
  );
}

// ── Stars ──────────────────────────────────────────────────────────────

function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= rating ? "fill-yellow-400 text-yellow-400" : "text-zinc-300"}
        />
      ))}
    </div>
  );
}

function StarPicker({
  rating,
  onChange,
}: {
  rating: number;
  onChange: (rating: number) => void;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
          className="p-0.5"
        >
          <Star
            size={24}
            className={
              i <= (hover || rating)
                ? "fill-yellow-400 text-yellow-400"
                : "text-zinc-300"
            }
          />
        </button>
      ))}
    </div>
  );
}

// ── Reviews Section ────────────────────────────────────────────────────

function ReviewsSection({
  reviews,
  productId,
}: {
  reviews: Review[];
  productId: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);

  const handleSubmit = (formData: FormData) => {
    setError(null);
    const authorName = formData.get("authorName") as string;
    const title = formData.get("title") as string;
    const text = formData.get("text") as string;

    if (rating === 0) {
      setError("Please select a rating");
      return;
    }

    startTransition(async () => {
      const result = await submitReview(productId, {
        rating,
        title,
        text,
        authorName,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSubmitted(true);
      }
    });
  };

  return (
    <div>
      {/* Review list */}
      {reviews.length > 0 ? (
        <div className="space-y-6">
          {reviews.map((review) => (
            <div key={review.id} className="border-b border-zinc-100 pb-6 last:border-0">
              <div className="flex items-center gap-3">
                <StarRating rating={review.rating} />
                {review.title && (
                  <h4 className="font-medium text-zinc-900">{review.title}</h4>
                )}
              </div>
              {review.text && (
                <p className="mt-2 text-sm text-zinc-600">{review.text}</p>
              )}
              <p className="mt-2 text-xs text-zinc-400">
                {review.authorName || "Anonymous"}
                {review.createdAt && (
                  <> &middot; {new Date(review.createdAt).toLocaleDateString()}</>
                )}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Be the first to review this product!
        </p>
      )}

      {/* Review form */}
      {submitted ? (
        <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Thank you for your review! It will appear after approval.
        </div>
      ) : (
        <div className="mt-8 border-t border-zinc-200 pt-6">
          <h3 className="text-base font-semibold text-zinc-900 mb-4">
            Write a Review
          </h3>
          <form action={handleSubmit} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Rating
              </label>
              <StarPicker rating={rating} onChange={setRating} />
            </div>

            <div>
              <label htmlFor="authorName" className="block text-sm font-medium text-zinc-700 mb-1">
                Your Name
              </label>
              <input
                id="authorName"
                name="authorName"
                type="text"
                required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-zinc-700 mb-1">
                Title (optional)
              </label>
              <input
                id="title"
                name="title"
                type="text"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label htmlFor="text" className="block text-sm font-medium text-zinc-700 mb-1">
                Review
              </label>
              <textarea
                id="text"
                name="text"
                rows={4}
                required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isPending ? "Submitting..." : "Submit Review"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
