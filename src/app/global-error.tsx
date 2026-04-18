"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error:", error);
    void fetch("/api/alerts/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "GLOBAL_ERROR_BOUNDARY",
        message: error.message,
        digest: error.digest,
        stack: error.stack,
        url: typeof window !== "undefined" ? window.location.href : "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      }),
    }).catch(() => null);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#fffbf0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          margin: 0,
        }}
      >
        <div
          style={{
            border: "8px solid black",
            padding: "3rem",
            maxWidth: "480px",
            width: "100%",
            textAlign: "center",
            boxShadow: "8px 8px 0 black",
            background: "white",
          }}
        >
          <h1
            style={{
              fontSize: "3rem",
              fontWeight: 900,
              textTransform: "uppercase",
              margin: "0 0 1rem",
              color: "#ef4444",
            }}
          >
            Critical Failure
          </h1>
          <p
            style={{
              fontWeight: 700,
              fontStyle: "italic",
              marginBottom: "2rem",
              opacity: 0.6,
            }}
          >
            &quot;The root layout encountered an unhandled exception.&quot;
          </p>
          <button
            onClick={reset}
            style={{
              border: "4px solid black",
              padding: "1rem 2rem",
              background: "#facc15",
              fontWeight: 900,
              textTransform: "uppercase",
              cursor: "pointer",
              boxShadow: "4px 4px 0 black",
              fontSize: "1rem",
            }}
          >
            Restart Protocol
          </button>
        </div>
      </body>
    </html>
  );
}
