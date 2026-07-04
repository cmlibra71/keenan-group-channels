"use client";

// CMS v2.1 tab shell — the interactive bar + active-panel switching for the
// decomposed product_tabs block. Markup mirrors ProductTabs.tsx exactly;
// panels arrive server-rendered (KTL templates / widgets), labels are the
// editable sub-block labels.

import { useState, type ReactNode } from "react";

export function TabsShell({
  tabs,
}: {
  tabs: { key: string; label: string; node: ReactNode }[];
}) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? "");
  if (tabs.length === 0) return null;

  return (
    <div className="mt-12 border-t border-border pt-8">
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors duration-300 ${
              activeTab === tab.key
                ? "border-b-2 border-text-primary text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="py-6">
        {tabs.map((tab) => (
          <div key={tab.key} className={activeTab === tab.key ? "" : "hidden"}>
            {tab.node}
          </div>
        ))}
      </div>
    </div>
  );
}
