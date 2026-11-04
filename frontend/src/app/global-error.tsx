"use client";

/** Catches errors in the root layout and providers, which `error.tsx` cannot render. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: "#fbf7f0",
          color: "#14110f",
        }}
      >
        <div role="alert" style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0 0 0.75rem" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 1.25rem", color: "#3d3631" }}>
            The Virasat3D site could not be displayed. Please try again. If the page keeps failing, the archive server
            may still be starting up.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              borderRadius: "999px",
              border: "1px solid #cbb592",
              background: "#ffffff",
              color: "#14110f",
              padding: "0.55rem 1.1rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && <p style={{ marginTop: "1rem", fontSize: "0.75rem", color: "#6b6159" }}>Reference: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
