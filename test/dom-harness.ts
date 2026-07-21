import { Window } from "happy-dom";

export interface DomHarness {
  window: InstanceType<typeof Window>;
  document: InstanceType<typeof Window>["document"];
  errors: readonly string[];
  close(): void;
}

export async function renderDom(
  html: string,
  storage: Record<string, string> = {},
): Promise<DomHarness> {
  const window = new Window({
    url: "http://flow-delta.test/",
    settings: {
      // The rendered artifact's inline client script is the unit under test.
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
  const scriptErrors: string[] = [];
  window.addEventListener("error", (event) => {
    const errorEvent = event as unknown as ErrorEvent;
    scriptErrors.push(errorEvent.message || String(errorEvent.error || "Unknown client script error"));
  });
  try {
    for (const [key, value] of Object.entries(storage)) {
      window.localStorage.setItem(key, value);
    }
    window.document.write(html);
    window.document.close();
    await window.happyDOM.waitUntilComplete();
    if (scriptErrors.length > 0) {
      throw new Error("Rendered client script error: " + scriptErrors.join("; "));
    }
    return {
      window,
      document: window.document,
      errors: scriptErrors,
      close: () => window.close(),
    };
  } catch (error) {
    window.close();
    throw error;
  }
}
