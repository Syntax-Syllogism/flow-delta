import assert from "node:assert/strict";
import { THEME_STORAGE_KEY } from "../src/render/shell.ts";

export function assertChromeContract(html: string): void {
  for (const mode of ["all", "after", "before", "changes"]) {
    assert.match(html, new RegExp(`class="filter-button[^\"]*" data-view-mode="${mode}"`));
  }
  for (const theme of ["system", "light", "dark"]) {
    assert.match(html, new RegExp(`data-theme-choice="${theme}"`));
  }
  assert.match(html, /aria-label="Color theme"/);
  assert.match(html, /id="panel-toggle"/);
  assert.match(html, /id="panel-reopen"/);
  assert.match(html, /id="panel-resizer"/);
  assert.match(html, /role="separator" aria-orientation="vertical"/);
  assert.ok(html.includes(THEME_STORAGE_KEY), "artifact must use the shared theme storage key");
  assert.doesNotMatch(html, /https?:\/\//);
}
