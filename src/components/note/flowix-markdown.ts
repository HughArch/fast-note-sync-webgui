/**
 * Flowix rich-content Markdown compatibility for the read-only renderer.
 *
 * Flowix stores several editor blocks as fenced divs on top of standard
 * Markdown (the same format its own editor and CLI use):
 *
 * - `::: toggle [collapsed] [bg="yellow"]` — collapsible list, the first
 *   child block is the title and the rest is the body.
 * - `::: callout icon="💡" color="orange"` — highlighted callout.
 * - `::: columns` with nested `:::: column width=40` — multi-column layout.
 * - `<!-- flowix:block-bg {"bg":"yellow"} -->` trailing a paragraph/heading —
 *   line background colour.
 *
 * remark parses every fence line as a plain paragraph, so this plugin
 * re-groups those siblings into virtual block nodes and maps them onto plain
 * `<div>` elements. The React renderer then upgrades those divs into the
 * actual toggle/columns components. Everything else (block backgrounds)
 * becomes a class on the existing paragraph/heading node.
 *
 * The fence balancing follows Flowix's `fenced-div.ts`: a closing fence only
 * closes the innermost opener when it has at least as many colons, so
 * `:::: column` can live inside `::: columns`.
 */

export const FLOWIX_COLORS = [
    "red",
    "orange",
    "yellow",
    "green",
    "cyan",
    "blue",
    "purple",
    "pink",
    "gray",
] as const;

export type FlowixColor = (typeof FLOWIX_COLORS)[number];

export const DEFAULT_CALLOUT_ICON = "💡";
export const DEFAULT_CALLOUT_COLOR: FlowixColor = "gray";
export const DEFAULT_COLUMN_WIDTH = 100;
export const MIN_COLUMN_WIDTH = 25;
export const MAX_COLUMN_WIDTH = 1000;
const MAX_ICON_LENGTH = 64;

// ─── Markdown AST (minimal shape) ──────────────────────────

type HProperties = Record<string, unknown> & {
    className?: string | string[];
};

interface FlowixNode {
    type: string;
    value?: string;
    children?: FlowixNode[];
    data?: {
        hName?: string;
        hProperties?: HProperties;
        hChildren?: FlowixNode[];
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

interface FenceInfo {
    kind: string;
    fenceLength: number;
    rest: string;
}

// ─── Palette helpers ───────────────────────────────────────

export function isFlowixColor(value: unknown): value is FlowixColor {
    return typeof value === "string" && (FLOWIX_COLORS as readonly string[]).includes(value);
}

export interface FlowixTextStyle {
    bg: FlowixColor | null;
    fg: FlowixColor | null;
}

/** Parse the JSON payload of an inline `<!-- flowix:text {…} -->` comment. */
export function parseFlowixTextStylePayload(payload: string): FlowixTextStyle | null {
    try {
        const parsed = JSON.parse(payload) as { bg?: unknown; fg?: unknown };
        const bg = isFlowixColor(parsed?.bg) ? parsed.bg : null;
        const fg = isFlowixColor(parsed?.fg) ? parsed.fg : null;
        return bg || fg ? { bg, fg } : null;
    } catch {
        return null;
    }
}

/** CSS classes implementing a Flowix semantic text style on a `<mark>`. */
export function flowixTextMarkClasses(style: FlowixTextStyle | null): string[] {
    if (!style) return [];
    const classes: string[] = [];
    if (style.bg) classes.push(`flowix-text-bg-${style.bg}`);
    if (style.fg) classes.push(`flowix-text-fg-${style.fg}`);
    return classes;
}

// ─── Fence parsing ─────────────────────────────────────────

const FENCE_OPEN_RE = /^(:{3,})[ \t]+([A-Za-z][\w-]*)(.*)$/;
const FENCE_CLOSE_RE = /^(:{3,})[ \t]*$/;
const ATTRIBUTE_RE = /([A-Za-z][\w-]*)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s]+)/g;
const BLOCK_BG_COMMENT_RE = /^<!--\s*flowix:block-bg\s+(\{[\s\S]*\})\s*-->$/;
const COLLAPSED_FLAG_RE = /(?:^|\s)collapsed(?:\s|$)/;

function paragraphText(node: FlowixNode): string | null {
    if (node.type !== "paragraph") return null;
    const children = node.children ?? [];
    if (children.length !== 1 || children[0].type !== "text") return null;
    return (children[0].value ?? "").trim();
}

function readFenceOpen(node: FlowixNode): FenceInfo | null {
    const text = paragraphText(node);
    if (!text) return null;
    const match = FENCE_OPEN_RE.exec(text);
    if (!match) return null;
    return {
        kind: match[2].toLowerCase(),
        fenceLength: match[1].length,
        rest: match[3] ?? "",
    };
}

function readFenceClose(node: FlowixNode): number | null {
    const text = paragraphText(node);
    if (!text) return null;
    const match = FENCE_CLOSE_RE.exec(text);
    return match ? match[1].length : null;
}

function decodeAttributeValue(raw: string): string {
    const quote = raw[0];
    if (quote !== '"' && quote !== "'") return raw;
    const inner = raw.slice(1, -1);
    if (quote === '"') {
        try {
            return JSON.parse(`"${inner}"`) as string;
        } catch {
            return inner;
        }
    }
    return inner.replace(/\\(.)/g, "$1");
}

function parseAttributes(rest: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    let match: RegExpExecArray | null;
    ATTRIBUTE_RE.lastIndex = 0;
    while ((match = ATTRIBUTE_RE.exec(rest)) !== null) {
        attributes[match[1].toLowerCase()] = decodeAttributeValue(match[2]);
    }
    return attributes;
}

/**
 * Index of the sibling that closes a container opened before `start`.
 * Returns null for malformed input so the caller can leave the source intact.
 */
function findFenceClose(children: FlowixNode[], start: number, openLength: number): number | null {
    const nested: number[] = [];
    for (let index = start; index < children.length; index += 1) {
        const node = children[index];
        const open = readFenceOpen(node);
        if (open) {
            nested.push(open.fenceLength);
            continue;
        }

        const closeLength = readFenceClose(node);
        if (closeLength === null) continue;

        if (nested.length > 0) {
            if (closeLength >= nested[nested.length - 1]) nested.pop();
            continue;
        }
        if (closeLength >= openLength) return index;
    }
    return null;
}

// ─── Virtual node helpers ──────────────────────────────────

function elementNode(
    type: string,
    tagName: string,
    className: string[],
    children: FlowixNode[],
    extraProperties: Record<string, unknown> = {},
): FlowixNode {
    return {
        type,
        children,
        data: {
            hName: tagName,
            hProperties: { className, ...extraProperties },
        },
    };
}

function emptyParagraph(): FlowixNode {
    return { type: "paragraph", children: [] };
}

function normalizeIcon(value: unknown): string {
    if (typeof value !== "string") return DEFAULT_CALLOUT_ICON;
    const icon = value.replace(/[\r\n]+/g, "").trim();
    if (!icon || icon.length > MAX_ICON_LENGTH) return DEFAULT_CALLOUT_ICON;
    return icon;
}

function normalizeColumnWidth(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) return DEFAULT_COLUMN_WIDTH;
    return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(parsed)));
}

function backgroundClass(color: FlowixColor | null): string[] {
    return color ? ["flowix-block-bg", `flowix-bg-${color}`] : [];
}

// ─── Container builders ────────────────────────────────────

function buildToggle(info: FenceInfo, body: FlowixNode[]): FlowixNode {
    const content = body.length > 0 ? body : [];
    // Mirror Flowix: the first block is the title. When the body starts with a
    // list/table/code block, keep it in the body behind an empty title.
    const first = content[0];
    if (!first || (first.type !== "paragraph" && first.type !== "heading")) {
        content.unshift(emptyParagraph());
    }

    const attributes = parseAttributes(info.rest);
    const open = !COLLAPSED_FLAG_RE.test(info.rest);
    const bg = isFlowixColor(attributes.bg) ? attributes.bg : null;

    return elementNode(
        "flowixToggle",
        "div",
        ["flowix-toggle", ...backgroundClass(bg)],
        content,
        { "data-open": open ? "true" : "false" },
    );
}

function buildCallout(info: FenceInfo, body: FlowixNode[]): FlowixNode {
    const attributes = parseAttributes(info.rest);
    const icon = normalizeIcon(attributes.icon);
    const color = isFlowixColor(attributes.color) ? attributes.color : DEFAULT_CALLOUT_COLOR;

    const iconNode = elementNode(
        "flowixCalloutIcon",
        "span",
        ["flowix-callout-icon"],
        [{ type: "text", value: icon }],
    );
    const contentNode = elementNode(
        "flowixCalloutContent",
        "div",
        ["flowix-callout-content"],
        body.length > 0 ? body : [emptyParagraph()],
    );

    return elementNode(
        "flowixCallout",
        "div",
        ["flowix-callout", `flowix-callout-${color}`],
        [iconNode, contentNode],
    );
}

interface ParsedColumn {
    width: number;
    nodes: FlowixNode[];
}

/** Split a columns body into its `:::: column` segments. */
function parseColumns(children: FlowixNode[]): ParsedColumn[] {
    const columns: ParsedColumn[] = [];
    let index = 0;
    while (index < children.length) {
        const open = readFenceOpen(children[index]);
        if (!open || open.kind !== "column" || open.fenceLength !== 4) {
            index += 1;
            continue;
        }

        const end = findFenceClose(children, index + 1, open.fenceLength);
        if (end === null) break;

        const widthMatch = /(?:^|\s)width=(\S+)/.exec(open.rest);
        columns.push({
            width: normalizeColumnWidth(widthMatch?.[1]),
            nodes: children.slice(index + 1, end),
        });
        index = end + 1;
    }
    return columns;
}

function buildColumns(_info: FenceInfo, body: FlowixNode[]): FlowixNode[] | null {
    const columns = parseColumns(body);
    if (columns.length === 0) return null;
    // A single column is not a layout; hoist its content like Flowix does.
    if (columns.length < 2) {
        return columns.flatMap((column) => column.nodes);
    }

    const columnNodes = columns.map((column) =>
        elementNode(
            "flowixColumn",
            "div",
            ["flowix-column"],
            column.nodes.length > 0 ? column.nodes : [emptyParagraph()],
            { "data-width": String(column.width) },
        ));

    return [elementNode("flowixColumns", "div", ["flowix-columns"], columnNodes)];
}

// ─── Web card ──────────────────────────────────────────────

const WEB_CARD_RE = /^::webcard\s*(\{[\s\S]*\})\s*$/;

interface WebCardAttributes {
    url: string;
    title: string;
    description: string;
    image: string;
}

function paragraphPlainText(node: FlowixNode): string | null {
    if (node.type !== "paragraph") return null;

    let text = "";
    const append = (child: FlowixNode): boolean => {
        if (
            child.type === "text"
            || child.type === "inlineCode"
            || child.type === "html"
            || child.type === "image"
        ) {
            text += child.value ?? "";
            return true;
        }
        if (child.type === "break") {
            text += "\n";
            return true;
        }
        if (child.children) {
            return child.children.every(append);
        }
        return false;
    };

    return (node.children ?? []).every(append) ? text : null;
}

function readWebCard(node: FlowixNode): WebCardAttributes | null {
    const raw = paragraphPlainText(node);
    if (!raw) return null;
    const match = WEB_CARD_RE.exec(raw.trim());
    // Malformed JSON stays as literal text instead of hiding content.
    return match ? webCardAttributes(match) : null;
}

function buildWebCard(card: WebCardAttributes): FlowixNode {
    return elementNode("flowixWebCard", "div", ["flowix-webcard"], [], {
        "data-url": card.url,
        "data-title": card.title,
        "data-description": card.description,
        "data-image": card.image,
    });
}

function escapeAttribute(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function webCardAttributes(match: RegExpExecArray): WebCardAttributes | null {
    try {
        const parsed = JSON.parse(match[1]) as Record<string, unknown>;
        const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
        const card: WebCardAttributes = {
            url: text(parsed.url),
            title: text(parsed.title),
            description: text(parsed.description),
            image: text(parsed.image),
        };
        return card.url || card.title || card.description || card.image ? card : null;
    } catch {
        return null;
    }
}

/**
 * Convert a protected `::webcard{…}` source block into the raw HTML that the
 * preview/export pipeline renders. Emitting HTML (instead of restoring the
 * plain text) keeps remark from interpreting URLs/JSON punctuation as
 * Markdown (e.g. GFM autolinks).
 */
export function flowixWebCardHtml(raw: string): string {
    const match = WEB_CARD_RE.exec(raw.trim());
    if (!match) return raw;
    const card = webCardAttributes(match);
    if (!card) return raw;

    return [
        '<div class="flowix-webcard"',
        ` data-url="${escapeAttribute(card.url)}"`,
        ` data-title="${escapeAttribute(card.title)}"`,
        ` data-description="${escapeAttribute(card.description)}"`,
        ` data-image="${escapeAttribute(card.image)}"`,
        "></div>",
    ].join("");
}

// ─── Line background comments ──────────────────────────────

function applyBlockBackground(node: FlowixNode): void {
    if (node.type !== "paragraph" && node.type !== "heading") return;
    const children = node.children;
    if (!children || children.length === 0) return;

    let color: FlowixColor | null = null;
    for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child.type !== "html") continue;
        const match = BLOCK_BG_COMMENT_RE.exec(String(child.value ?? "").trim());
        if (!match) continue;

        try {
            const payload = JSON.parse(match[1]) as { bg?: unknown };
            if (isFlowixColor(payload?.bg)) color = payload.bg;
        } catch {
            // Malformed payload: still drop the comment so it never renders.
        }
        children.splice(index, 1);
    }

    if (!color) return;

    const data = (node.data ??= {});
    const properties = (data.hProperties ??= {});
    properties.className = [...backgroundClass(color), ...normalizeClassName(properties.className)];
}

function normalizeClassName(value: HProperties["className"]): string[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

/**
 * Tight list items are unwrapped by mdast-util-to-hast (their single
 * paragraph becomes the `<li>`'s content), so a class on that paragraph would
 * disappear. Move the background up to the item itself, which also matches
 * Flowix painting the bullet/task checkbox as part of the coloured row.
 */
function liftListItemBackground(node: FlowixNode): void {
    const children = node.children;
    if (children?.length !== 1 || children[0].type !== "paragraph") return;

    const paragraph = children[0];
    const classes = normalizeClassName(paragraph.data?.hProperties?.className);
    const background = classes.filter(
        (name) => name === "flowix-block-bg" || name.startsWith("flowix-bg-"),
    );
    if (background.length === 0) return;

    const paragraphData = (paragraph.data ??= {});
    const properties = (paragraphData.hProperties ??= {});
    properties.className = classes.filter((name) => !background.includes(name));

    const nodeData = (node.data ??= {});
    const itemProperties = (nodeData.hProperties ??= {});
    const itemClasses = normalizeClassName(itemProperties.className);
    // `mdast-util-to-hast` would otherwise replace (not merge) its own
    // `task-list-item` class when applyData writes our properties.
    const taskClass = typeof node.checked === "boolean" ? ["task-list-item"] : [];
    itemProperties.className = [...background, ...taskClass, ...itemClasses];
}

// ─── Traversal ─────────────────────────────────────────────

const BLOCK_CONTAINERS = new Set([
    "root",
    "blockquote",
    "list",
    "listItem",
    "footnoteDefinition",
]);

const FLOWIX_CONTAINER_KIND = new Set(["toggle", "callout", "columns"]);

function transformBlockChildren(parent: FlowixNode): void {
    const children = parent.children;
    if (!children || children.length === 0) return;

    const output: FlowixNode[] = [];
    for (let index = 0; index < children.length; index += 1) {
        const node = children[index];
        const webCard = readWebCard(node);
        if (webCard) {
            output.push(buildWebCard(webCard));
            continue;
        }

        const open = readFenceOpen(node);

        if (open && FLOWIX_CONTAINER_KIND.has(open.kind)) {
            const end = findFenceClose(children, index + 1, open.fenceLength);
            if (end !== null) {
                const body = children.slice(index + 1, end);
                const virtualRoot: FlowixNode = { type: "root", children: body };
                transformBlockChildren(virtualRoot);
                const transformed = virtualRoot.children ?? [];

                let built: FlowixNode[] | null;
                if (open.kind === "toggle") built = [buildToggle(open, transformed)];
                else if (open.kind === "callout") built = [buildCallout(open, transformed)];
                else built = buildColumns(open, transformed);

                if (built) {
                    output.push(...built);
                    index = end;
                    continue;
                }
            }
        }

        if (BLOCK_CONTAINERS.has(node.type)) {
            transformBlockChildren(node);
        }
        applyBlockBackground(node);
        if (node.type === "listItem") liftListItemBackground(node);

        // ` ```json collapsed ` persists code folding in the fence info.
        if (node.type === "code" && typeof node.meta === "string" && COLLAPSED_FLAG_RE.test(node.meta)) {
            const data = (node.data ??= {});
            const properties = (data.hProperties ??= {});
            properties["data-flowix-collapsed"] = "true";
        }

        output.push(node);
    }

    parent.children = output;
}

/**
 * remark plugin: group Flowix fenced divs and lift block-background comments.
 */
export function remarkFlowixBlocks() {
    return (tree: FlowixNode) => {
        transformBlockChildren(tree);
    };
}
