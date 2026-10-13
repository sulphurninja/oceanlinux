"use client";

import { useEffect } from "react";

// Adds the `premium-landing-active` class to <html> while a public page is mounted.
// globals.css uses this class to turn on the landing glass styles.
export default function LandingGlassClass() {
  useEffect(() => {
    document.documentElement.classList.add("premium-landing-active");
    return () => {
      document.documentElement.classList.remove("premium-landing-active");
    };
  }, []);

  return null;
}
