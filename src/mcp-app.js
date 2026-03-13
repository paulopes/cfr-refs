import { App } from "@modelcontextprotocol/ext-apps";

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const frameEl = document.getElementById("diagram-frame");

const app = new App({ name: "CFR Refs Diagram", version: "1.0.0" });

/**
 * Render a self-contained HTML diagram inside the iframe.
 */
function renderDiagram(html) {
  statusEl.style.display = "none";
  errorEl.style.display = "none";
  frameEl.style.display = "block";
  frameEl.srcdoc = html;

  // Auto-resize iframe to fit content
  frameEl.addEventListener("load", () => {
    try {
      const body = frameEl.contentDocument?.body;
      if (body) {
        const resize = () => {
          frameEl.style.height = body.scrollHeight + "px";
        };
        resize();
        // Re-check after Mermaid renders (async)
        setTimeout(resize, 1000);
        setTimeout(resize, 3000);
      }
    } catch {
      // cross-origin sandbox may block — fall back to fixed height
      frameEl.style.height = "600px";
    }
  });
}

function showError(msg) {
  statusEl.style.display = "none";
  errorEl.style.display = "block";
  errorEl.textContent = msg;
}

// Handle tool results from the server.
// Set before app.connect() to avoid missing the initial tool result.
app.ontoolresult = (result) => {
  if (result.isError) {
    const errText = result.content?.find((c) => c.type === "text")?.text;
    showError(errText ?? "Unknown error generating diagram.");
    return;
  }
  const html = result.content?.find((c) => c.type === "text")?.text;
  if (html) {
    renderDiagram(html);
  } else {
    showError("No HTML content returned from tool.");
  }
};

// Connect to the host
app.connect().catch((err) => {
  showError("Failed to connect to host: " + err.message);
});
