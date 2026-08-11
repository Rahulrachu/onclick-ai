import { describe, expect, it } from "vitest";
import {
  addSseClient,
  broadcastSseEvent,
  removeSseClient,
  TOOL_REGISTRY,
} from "./agentRuntime";

describe("OnClick AI tool registry", () => {
  it("preserves the required tool names and permission tiers", () => {
    expect(TOOL_REGISTRY.open_url.permissionTier).toBe("SAFE");
    expect(TOOL_REGISTRY.search_web.name).toBe("search_web");
    expect(TOOL_REGISTRY.execute_python.permissionTier).toBe("RESTRICTED");
    expect(TOOL_REGISTRY.create_pdf.permissionTier).toBe("SAFE");
    expect(TOOL_REGISTRY.generate_chart.name).toBe("generate_chart");
    expect(TOOL_REGISTRY.download.permissionTier).toBe("CONFIRM");
    expect(TOOL_REGISTRY.delete.permissionTier).toBe("RESTRICTED");
  });

  it("includes every documented tool family", () => {
    expect(Object.keys(TOOL_REGISTRY)).toEqual(expect.arrayContaining([
      "open_url", "search_web", "click_element", "extract_page", "screenshot_page", "download", "upload",
      "list", "read", "write", "edit", "move", "delete",
      "execute_command", "execute_python", "execute_script",
      "create_document", "create_pdf", "create_spreadsheet",
      "parse_csv", "analyze_dataset", "generate_chart",
    ]));
  });
});

describe("SSE task event publisher", () => {
  it("publishes exact event names and JSON payloads", () => {
    const writes: string[] = [];
    const client = { write: (payload: string) => writes.push(payload) };
    addSseClient(9001, client);

    broadcastSseEvent(9001, "approval requested", { toolName: "download", permissionTier: "CONFIRM" });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("event: approval requested\n");
    expect(writes[0]).toContain('"toolName":"download"');
    expect(writes[0]?.endsWith("\n\n")).toBe(true);

    removeSseClient(9001, client);
    broadcastSseEvent(9001, "result observed", { ok: true });
    expect(writes).toHaveLength(1);
  });
});
