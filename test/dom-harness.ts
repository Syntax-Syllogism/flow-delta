import { Window } from "happy-dom";

export interface DomHarness {
  window: InstanceType<typeof Window>;
  document: InstanceType<typeof Window>["document"];
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
  try {
    for (const [key, value] of Object.entries(storage)) {
      window.localStorage.setItem(key, value);
    }
    window.document.write(html);
    window.document.close();
    await window.happyDOM.waitUntilComplete();
    return {
      window,
      document: window.document,
      close: () => window.close(),
    };
  } catch (error) {
    window.close();
    throw error;
  }
}
