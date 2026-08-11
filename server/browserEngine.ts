import fs from "node:fs/promises";
import path from "node:path";
import {
  createWorkspaceSession,
  getWorkspaceSession,
} from "./workspaceSession";

export async function getTaskBrowserSession(taskId: number | string) {
  const sessionId = typeof taskId === "number" ? `task-${taskId}` : taskId;
  const workspace =
    getWorkspaceSession(sessionId) ?? (await createWorkspaceSession(sessionId));
  if (!workspace.context || !workspace.page) {
    throw new Error(
      "Playwright browser capability is unavailable for this workspace session."
    );
  }
  return {
    context: workspace.context,
    pages: [workspace.page],
    activeIndex: 0,
  };
}

export async function executeRealBrowserAction(
  taskId: number | string,
  action: string,
  params: Record<string, any>
): Promise<any> {
  const session = await getTaskBrowserSession(taskId);
  const sessionId = typeof taskId === "number" ? `task-${taskId}` : taskId;
  const page = session.pages[session.activeIndex] || session.pages[0];

  try {
    switch (action) {
      case "open_url":
      case "navigate": {
        const url = params.url || params.query;
        if (!url) throw new Error("open_url requires a URL or query");
        const target = String(url).startsWith("http")
          ? String(url)
          : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(String(url))}`;
        await page.goto(target, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        const title = await page.title();
        const text = await page.evaluate(
          () => document.body?.innerText?.slice(0, 4000) || ""
        );
        return {
          success: true,
          action,
          title,
          url: page.url(),
          observation: `Navigated to ${page.url()} (${title})`,
          preview: text,
        };
      }
      case "search_web": {
        const query = String(params.query || "").trim();
        if (!query) throw new Error("search_web requires a query");
        await page.goto(
          `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
          { waitUntil: "domcontentloaded", timeout: 30_000 }
        );
        const results = await page.$$eval(".result", (nodes: Element[]) =>
          nodes.slice(0, 8).map(node => ({
            title:
              node.querySelector(".result__title")?.textContent?.trim() || "",
            snippet:
              node.querySelector(".result__snippet")?.textContent?.trim() || "",
            href:
              (node.querySelector("a.result__a") as HTMLAnchorElement | null)
                ?.href || "",
          }))
        );
        return {
          success: true,
          action,
          query,
          results,
          observation: `Searched for ${JSON.stringify(query)} and extracted ${results.length} live results.`,
        };
      }
      case "extract_page": {
        if (params.url)
          await page.goto(String(params.url), {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          });
        const title = await page.title();
        const text = await page.evaluate(() => document.body?.innerText || "");
        return {
          success: true,
          action,
          title,
          url: page.url(),
          textLength: text.length,
          text: text.slice(0, 20_000),
          observation: `Extracted ${text.length} characters from ${page.url()}`,
        };
      }
      case "screenshot_page": {
        const workspace = getWorkspaceSession(sessionId);
        if (!workspace) throw new Error("Workspace session not found");
        const fileName = `screenshot-${Date.now()}.png`;
        const filePath = path.join(workspace.workspaceDir, fileName);
        await page.screenshot({ path: filePath, fullPage: true });
        return {
          success: true,
          action,
          title: await page.title(),
          url: page.url(),
          filePath,
          observation: `Captured a real screenshot of ${page.url()}`,
        };
      }
      case "click_element": {
        const selector = String(params.selector || "").trim();
        if (!selector) throw new Error("click_element requires a CSS selector");
        await page.locator(selector).first().click({ timeout: 10_000 });
        return {
          success: true,
          action,
          clicked: selector,
          url: page.url(),
          observation: `Clicked ${selector} in the shared browser page.`,
        };
      }
      case "type_form": {
        const selector = String(params.selector || "").trim();
        if (!selector || typeof params.text !== "string")
          throw new Error("type_form requires selector and text");
        await page.locator(selector).first().fill(params.text);
        return {
          success: true,
          action,
          selector,
          typedLength: params.text.length,
          url: page.url(),
          observation: `Filled ${selector} in the shared browser page.`,
        };
      }
      default:
        throw new Error(`Unsupported browser action: ${action}`);
    }
  } catch (err: any) {
    return {
      success: false,
      action,
      error: err.message || String(err),
      observation: `Browser action ${action} failed.`,
    };
  }
}

export async function executeComputerControl(
  taskIdOrAction: number | string,
  actionOrParams: string | Record<string, any>,
  maybeParams?: Record<string, any>
): Promise<any> {
  const taskId = typeof taskIdOrAction === "number" ? taskIdOrAction : 0;
  const action =
    typeof taskIdOrAction === "number"
      ? String(actionOrParams)
      : taskIdOrAction;
  const params =
    typeof taskIdOrAction === "number"
      ? maybeParams || {}
      : (actionOrParams as Record<string, any>);
  const effectiveTaskId = taskId > 0 ? taskId : 0;
  const sessionId =
    effectiveTaskId > 0 ? `task-${effectiveTaskId}` : `computer-ad-hoc`;
  const workspace =
    getWorkspaceSession(sessionId) ?? (await createWorkspaceSession(sessionId));
  if (!workspace.page)
    throw new Error("Playwright page unavailable for computer control.");
  const page = workspace.page;

  try {
    const point = (value: any, name: string) => {
      const n = Number(value);
      if (!Number.isFinite(n))
        throw new Error(`${name} must be a finite number`);
      return n;
    };
    switch (action) {
      case "screenshot": {
        const filePath = path.join(
          workspace.workspaceDir,
          `computer-screenshot-${Date.now()}.png`
        );
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await page.screenshot({ path: filePath });
        return {
          success: true,
          action,
          filePath,
          url: page.url(),
          observation:
            "Captured a real screenshot from the shared browser page.",
        };
      }
      case "click":
        await page.mouse.click(point(params.x, "x"), point(params.y, "y"), {
          button: "left",
        });
        return {
          success: true,
          action,
          url: page.url(),
          observation: "Clicked real browser coordinates.",
        };
      case "double_click":
        await page.mouse.dblclick(point(params.x, "x"), point(params.y, "y"));
        return {
          success: true,
          action,
          url: page.url(),
          observation: "Double-clicked real browser coordinates.",
        };
      case "right_click":
        await page.mouse.click(point(params.x, "x"), point(params.y, "y"), {
          button: "right",
        });
        return {
          success: true,
          action,
          url: page.url(),
          observation: "Right-clicked real browser coordinates.",
        };
      case "mouse_move":
        await page.mouse.move(point(params.x, "x"), point(params.y, "y"));
        return {
          success: true,
          action,
          url: page.url(),
          observation: "Moved the real browser pointer.",
        };
      case "keyboard_type":
        if (typeof params.text !== "string")
          throw new Error("keyboard_type requires text");
        await page.keyboard.type(params.text);
        return {
          success: true,
          action,
          typedLength: params.text.length,
          observation: "Typed into the real shared browser page.",
        };
      case "scroll":
        await page.mouse.wheel(
          Number(params.deltaX || 0),
          Number(params.deltaY || 500)
        );
        return {
          success: true,
          action,
          observation: "Scrolled the real shared browser page.",
        };
      case "drag_drop":
        await page.mouse.move(
          point(params.from?.x, "from.x"),
          point(params.from?.y, "from.y")
        );
        await page.mouse.down();
        await page.mouse.move(
          point(params.to?.x, "to.x"),
          point(params.to?.y, "to.y")
        );
        await page.mouse.up();
        return {
          success: true,
          action,
          observation: "Dragged between real browser coordinates.",
        };
      default:
        throw new Error(`Unsupported computer control action: ${action}`);
    }
  } catch (err: any) {
    return {
      success: false,
      action,
      error: err.message || String(err),
      observation: `Computer control ${action} failed.`,
    };
  }
}

export async function closeTaskBrowserSession(taskId: number) {
  const workspace = getWorkspaceSession(`task-${taskId}`);
  if (workspace?.browser)
    await workspace.browser.close().catch(() => undefined);
}
