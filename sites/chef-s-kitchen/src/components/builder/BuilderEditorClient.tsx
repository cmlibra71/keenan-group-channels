"use client";
import nextDynamic from "next/dynamic";

// grapesjs touches window/document, so load the editor client-only (no SSR).
const BuilderEditor = nextDynamic(() => import("./BuilderEditor"), { ssr: false });

export default function BuilderEditorClient(props: {
  tokenColors: { id: string; label: string; value: string }[];
}) {
  return <BuilderEditor tokenColors={props.tokenColors} />;
}
