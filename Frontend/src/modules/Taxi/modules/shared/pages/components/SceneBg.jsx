import React from "react";
import SectionScene from "./SectionScene";

export function Aurora({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <div className="animate-blob absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[#ff8a00]/15 blur-3xl" />
      <div className="animate-blob animation-delay-2000 absolute top-1/2 -right-40 h-96 w-96 rounded-full bg-[#35c7ff]/15 blur-3xl" />
      <div className="animate-blob animation-delay-4000 absolute -bottom-40 left-1/3 h-96 w-96 rounded-full bg-[#4fe08a]/12 blur-3xl" />
    </div>
  );
}

export default function SceneBg({ variant = "orbs", className = "" }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <SectionScene variant={variant} />
      <Aurora />
    </div>
  );
}
