"use client";

import { useState, useMemo } from "react";
import { Search, ExternalLink } from "lucide-react";
import {
  DEFAULT_WARRANTY_INTRO,
  DEFAULT_WARRANTY_ROWS,
  DEFAULT_WARRANTY_TITLE,
  type WarrantyDirectoryRow,
} from "@keenan/services/warranty-directory";

// The rows, title and intro are DATA now (IK hidden-conditionals C14): the channel setting
// `warranty_directory`, edited in the portal (Settings → Storefront Listings → Warranty directory),
// read by the product route and handed in through the natives' bag. With no setting the list is the
// one this component always shipped (`DEFAULT_WARRANTY_ROWS`, now in @keenan/services).
type WarrantyEntry = WarrantyDirectoryRow;

export function WarrantyDirectory({
  rows = DEFAULT_WARRANTY_ROWS,
  title = DEFAULT_WARRANTY_TITLE,
  intro = DEFAULT_WARRANTY_INTRO,
}: {
  rows?: WarrantyEntry[];
  title?: string;
  intro?: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (e) =>
        e.brand.toLowerCase().includes(q) ||
        e.equipment.toLowerCase().includes(q) ||
        e.warranty.toLowerCase().includes(q)
    );
  }, [search, rows]);

  return (
    <div>
      <h3 className="text-lg font-semibold text-zinc-900 mb-1">{title}</h3>
      <p className="text-sm text-zinc-600 mb-4">{intro}</p>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by brand, equipment type, or keyword…"
          className="w-full rounded-lg border border-zinc-300 pl-10 pr-4 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        />
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block border border-zinc-200 overflow-hidden rounded-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 text-zinc-500">
                <th className="px-3 py-2.5 text-left font-medium">Brand / Series</th>
                <th className="px-3 py-2.5 text-left font-medium">Claim</th>
                <th className="px-3 py-2.5 text-left font-medium">Warranty (AU)</th>
                <th className="px-3 py-2.5 text-left font-medium">Registration</th>
                <th className="px-3 py-2.5 text-left font-medium">Service &amp; Travel</th>
                <th className="px-3 py-2.5 text-left font-medium">Equipment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((entry) => (
                <tr key={entry.brand} className="text-zinc-600">
                  <td className="px-3 py-2.5 font-medium text-zinc-900 whitespace-nowrap">
                    {entry.brand}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {entry.claimUrl ? (
                      <a
                        href={entry.claimUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {entry.claimAction}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-zinc-500">{entry.claimAction}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{entry.warranty}</td>
                  <td className="px-3 py-2.5">{entry.registration}</td>
                  <td className="px-3 py-2.5">{entry.service}</td>
                  <td className="px-3 py-2.5 text-zinc-500">{entry.equipment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {filtered.map((entry) => (
          <div key={entry.brand} className="border border-zinc-200 rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-medium text-zinc-900">{entry.brand}</h4>
              {entry.claimUrl ? (
                <a
                  href={entry.claimUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap inline-flex items-center gap-1"
                >
                  {entry.claimAction}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-xs text-zinc-500 whitespace-nowrap">{entry.claimAction}</span>
              )}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-zinc-400 font-medium">Warranty</dt>
              <dd className="text-zinc-600">{entry.warranty}</dd>
              <dt className="text-zinc-400 font-medium">Registration</dt>
              <dd className="text-zinc-600">{entry.registration}</dd>
              <dt className="text-zinc-400 font-medium">Service</dt>
              <dd className="text-zinc-600">{entry.service}</dd>
              <dt className="text-zinc-400 font-medium">Equipment</dt>
              <dd className="text-zinc-500">{entry.equipment}</dd>
            </dl>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-zinc-500 py-8 text-center">
          No brands found matching &ldquo;{search}&rdquo;. Try a different search term.
        </p>
      )}

      {/* Footer note */}
      <div className="mt-6 border-t border-zinc-200 pt-4">
        <p className="text-xs text-zinc-400 leading-relaxed">
          <strong>Brand not listed?</strong> Call 1800 431 323 or email{" "}
          <a href="mailto:cs@industrykitchens.com.au" className="text-blue-600 hover:text-blue-800">
            cs@industrykitchens.com.au
          </a>{" "}
          &mdash; our team will connect you with the right manufacturer or importer
          service department. We work with 160+ suppliers across Australia.
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed mt-2">
          <strong>Important:</strong> &ldquo;On-site&rdquo; generally means metropolitan areas
          during business hours. Most brands apply regional travel charges outside
          metro or beyond a set distance. &ldquo;R2B&rdquo; means Return-to-Base &mdash; the
          customer is responsible for shipping the unit to the service agent.
          Consumables and wear parts (globes, seals, blades, filters) are
          typically excluded from warranty.
        </p>
      </div>
    </div>
  );
}
