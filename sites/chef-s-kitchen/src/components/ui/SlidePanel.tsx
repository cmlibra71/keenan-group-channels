"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { PanelContext } from "./PanelContext";

interface SlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function SlidePanel({ isOpen, onClose, title, children }: SlidePanelProps) {
  const pathname = usePathname();
  const prevPathname = useRef(pathname);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-close when pathname changes while panel is open
  useEffect(() => {
    if (prevPathname.current !== pathname && isOpen) {
      onClose();
    }
    prevPathname.current = pathname;
  }, [pathname, isOpen, onClose]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [isOpen, handleEscape]);

  const panelValue = useMemo(() => ({ isOpen, close: onClose }), [isOpen, onClose]);

  return (
    <PanelContext.Provider value={panelValue}>
      {mounted && createPortal(
        <>
          {/* Backdrop */}
          <div
            className={`fixed inset-0 z-[60] bg-black/30 transition-opacity duration-300 ${
              isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            className={`fixed inset-y-0 right-0 z-[60] w-full max-w-md bg-white shadow-xl transition-transform duration-300 ease-in-out ${
              isOpen ? "translate-x-0" : "translate-x-full"
            }`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="panel-title">{title}</h2>
                <button
                  onClick={onClose}
                  className="text-text-muted hover:text-text-secondary"
                  aria-label="Close panel"
                >
                  <X className="h-5 w-5" strokeWidth={1.5} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {children}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </PanelContext.Provider>
  );
}
