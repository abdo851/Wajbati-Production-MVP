"use client";

import { Toaster } from "react-hot-toast";

export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 4000,
        success: {
          style: { background: "#2F6B4F", color: "#FAF6EF" },
          iconTheme: { primary: "#FAF6EF", secondary: "#2F6B4F" },
        },
      }}
    />
  );
}
