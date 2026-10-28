import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TocProvider } from "@/components/context/toc-context";
import { MarkdownRenderer, transformObsidianSyntax } from "./markdown-editor";

vi.mock("katex/dist/katex.min.css", () => ({}));

const noopFileLinks = {};

function renderMarkdown(content: string) {
    return render(
        <TocProvider>
            <MarkdownRenderer content={content} enableCodeCopy={false} />
        </TocProvider>
    );
}

describe("Flowix fenced containers", () => {
    it("renders an expanded toggle with a title and body", () => {
        const { container } = renderMarkdown(
            "::: toggle\n\nTitle line\n\nBody line\n\n:::"
        );

        const toggle = container.querySelector(".flowix-toggle");
        expect(toggle).not.toBeNull();
        expect(toggle).toHaveAttribute("data-open", "true");
        expect(toggle?.querySelector(".flowix-toggle-title")?.textContent).toContain("Title line");
        expect(toggle?.querySelector(".flowix-toggle-body")?.textContent).toContain("Body line");

        const chevron = screen.getByRole("button", { name: "Collapse" });
        expect(chevron).toHaveAttribute("aria-expanded", "true");
    });

    it("starts collapsed and expands on click", () => {
        const { container } = renderMarkdown(
            "::: toggle collapsed\n\nTitle line\n\nHidden body\n\n:::"
        );

        const body = container.querySelector(".flowix-toggle-body");
        expect(body).toHaveAttribute("hidden");

        fireEvent.click(screen.getByRole("button", { name: "Expand" }));

        expect(body).not.toHaveAttribute("hidden");
        expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();
    });

    it("paints the toggle container background", () => {
        const { container } = renderMarkdown(
            "::: toggle collapsed bg=\"yellow\"\n\nTitle\n\nBody\n\n:::"
        );

        const toggle = container.querySelector(".flowix-toggle");
        expect(toggle).toHaveClass("flowix-block-bg", "flowix-bg-yellow");
    });

    it("renders a Flowix callout with its icon and colour", () => {
        const { container } = renderMarkdown(
            "::: callout icon=\"🔥\" color=\"orange\"\n\nCallout body\n\n:::"
        );

        const callout = container.querySelector(".flowix-callout");
        expect(callout).toHaveClass("flowix-callout-orange");
        expect(callout?.querySelector(".flowix-callout-icon")?.textContent).toBe("🔥");
        expect(callout?.querySelector(".flowix-callout-content")?.textContent).toContain("Callout body");
    });

    it("lays out columns and keeps their widths", () => {
        const { container } = renderMarkdown(
            [
                "::: columns",
                "",
                ":::: column width=40",
                "",
                "Left",
                "",
                "::::",
                "",
                ":::: column width=60",
                "",
                "Right",
                "",
                "::::",
                "",
                ":::",
            ].join("\n")
        );

        const columns = container.querySelectorAll(".flowix-columns > .flowix-column");
        expect(columns).toHaveLength(2);
        expect(columns[0]).toHaveAttribute("data-width", "40");
        expect(columns[1]).toHaveAttribute("data-width", "60");
        expect((columns[0] as HTMLElement).style.flexGrow).toBe("40");
        expect((columns[1] as HTMLElement).style.flexGrow).toBe("60");
        expect(columns[0].textContent).toContain("Left");
        expect(columns[1].textContent).toContain("Right");
    });

    it("balances nested containers inside columns", () => {
        const { container } = renderMarkdown(
            [
                "::: columns",
                "",
                ":::: column width=50",
                "",
                "::: callout icon=\"💡\" color=\"blue\"",
                "",
                "Nested callout",
                "",
                ":::",
                "",
                "::::",
                "",
                ":::: column width=50",
                "",
                "Other",
                "",
                "::::",
                "",
                ":::",
            ].join("\n")
        );

        expect(container.querySelectorAll(".flowix-column")).toHaveLength(2);
        expect(container.querySelector(".flowix-callout")?.textContent).toContain("Nested callout");
    });
});

describe("Flowix inline styles", () => {
    it("lifts a block-background comment onto the paragraph", () => {
        const { container } = renderMarkdown(
            "Coloured line<!-- flowix:block-bg {\"bg\":\"yellow\"} -->"
        );

        const paragraph = container.querySelector("p.flowix-block-bg");
        expect(paragraph).toHaveClass("flowix-bg-yellow");
        expect(paragraph?.textContent).toBe("Coloured line");
    });

    it("lifts a block-background comment onto a heading", () => {
        const { container } = renderMarkdown(
            "## Heading<!-- flowix:block-bg {\"bg\":\"pink\"} -->"
        );

        const heading = container.querySelector("h2.flowix-block-bg");
        expect(heading).toHaveClass("flowix-bg-pink");
        expect(heading?.textContent).toBe("Heading");
    });

    it("keeps the line background of a list item", () => {
        const { container } = renderMarkdown(
            "- item one<!-- flowix:block-bg {\"bg\":\"green\"} -->\n- item two"
        );

        const item = container.querySelector("li.flowix-block-bg");
        expect(item).toHaveClass("flowix-bg-green");
        expect(item?.textContent).toBe("item one");
    });

    it("keeps both the task-list marker and a line background", () => {
        const { container } = renderMarkdown(
            "- [ ] task<!-- flowix:block-bg {\"bg\":\"blue\"} -->"
        );

        const item = container.querySelector("li.task-list-item");
        expect(item).toHaveClass("flowix-block-bg", "flowix-bg-blue");
        expect(item?.querySelector("input[type=\"checkbox\"]")).not.toBeNull();
    });

    it("renders a Tiptap/Flowix underline and keeps it through sanitize", () => {
        const transformed = transformObsidianSyntax(
            "价格 ++下降约 3%++ 左右",
            "vault",
            noopFileLinks,
            "token"
        );
        expect(transformed).toContain("<u>下降约 3%</u>");

        const { container } = renderMarkdown(transformed);
        const underline = container.querySelector("u");
        expect(underline?.textContent).toBe("下降约 3%");
    });

    it("does not treat a lone C++ pair marker as underline", () => {
        const transformed = transformObsidianSyntax(
            "使用 C++ 开发",
            "vault",
            noopFileLinks,
            "token"
        );
        expect(transformed).toBe("使用 C++ 开发");
    });

    it("keeps the text colour of a semantic highlight", () => {
        const transformed = transformObsidianSyntax(
            "a ==marked==<!-- flowix:text {\"bg\":\"yellow\",\"fg\":\"red\"} --> b",
            "vault",
            noopFileLinks,
            "token"
        );

        expect(transformed).toContain('<mark class="flowix-text-bg-yellow flowix-text-fg-red">marked</mark>');
    });

    it("falls back to a plain highlight for unknown colours", () => {
        const transformed = transformObsidianSyntax(
            "==marked==<!-- flowix:text {\"bg\":\"chartreuse\"} -->",
            "vault",
            noopFileLinks,
            "token"
        );

        expect(transformed).toContain("<mark>marked</mark>");
    });
});

describe("Flowix web cards", () => {
    it("renders a single-line web card", () => {
        const { container } = renderMarkdown(
            '::webcard{"url":"https://example.com/page","title":"Example","description":"Desc","image":"https://cdn.example.com/a.png"}'
        );

        const link = container.querySelector("a.flowix-webcard");
        expect(link).toHaveAttribute("href", "https://example.com/page");
        expect(link?.querySelector(".flowix-webcard-title")?.textContent).toBe("Example");
        expect(link?.querySelector(".flowix-webcard-description")?.textContent).toBe("Desc");
        expect(link?.querySelector(".flowix-webcard-host")?.textContent).toBe("example.com");
        expect(link?.querySelector("img.flowix-webcard-image")).toHaveAttribute(
            "src",
            "https://cdn.example.com/a.png"
        );
    });

    it("renders a pretty-printed web card", () => {
        const { container } = renderMarkdown(
            [
                "::webcard{",
                '  "url": "https://example.com",',
                '  "title": "Multi line",',
                '  "description": "Still parsed",',
                '  "image": ""',
                "}",
            ].join("\n")
        );

        const card = container.querySelector(".flowix-webcard");
        expect(card?.querySelector(".flowix-webcard-title")?.textContent).toBe("Multi line");
    });

    it("does not link non-http URLs", () => {
        const { container } = renderMarkdown(
            '::webcard{"url":"javascript:alert(1)","title":"Unsafe","description":"","image":""}'
        );

        expect(container.querySelector("a.flowix-webcard")).toBeNull();
        expect(container.querySelector("div.flowix-webcard")?.textContent).toContain("Unsafe");
    });

    it("renders the card after the share-page transformation", () => {
        const content = [
            "::webcard{",
            '  "url": "https://example.com/page",',
            '  "title": "Transformed",',
            '  "description": "Uses #tag and ==highlight==",',
            '  "image": ""',
            "}",
        ].join("\n");

        const transformed = transformObsidianSyntax(content, "vault", noopFileLinks, "token");
        const { container } = renderMarkdown(transformed);

        const link = container.querySelector("a.flowix-webcard");
        expect(link).toHaveAttribute("href", "https://example.com/page");
        expect(link?.querySelector(".flowix-webcard-title")?.textContent).toBe("Transformed");
        expect(link?.querySelector(".flowix-webcard-description")?.textContent).toBe(
            "Uses #tag and ==highlight=="
        );
    });

    it("protects the JSON from Obsidian syntax conversion", () => {
        const content = [
            "::webcard{",
            '  "url": "https://example.com",',
            '  "title": "Tags",',
            '  "description": "Uses #tag and ==highlight==",',
            '  "image": ""',
            "}",
        ].join("\n");

        const transformed = transformObsidianSyntax(content, "vault", noopFileLinks, "token");

        expect(transformed).toContain('data-description="Uses #tag and ==highlight=="');
        expect(transformed).not.toContain("<mark>");
    });
});

describe("Flowix code block folding", () => {
    it("renders a collapsed fence and expands it on click", () => {
        const { container } = render(
            <TocProvider>
                <MarkdownRenderer content={"```json collapsed\n{\"a\": 1}\n```"} />
            </TocProvider>
        );

        const codeBox = container.querySelector("pre")?.parentElement;
        expect(codeBox).toHaveAttribute("hidden");

        fireEvent.click(screen.getByRole("button", { name: "Expand code" }));

        expect(codeBox).not.toHaveAttribute("hidden");
        expect(container.textContent).toContain("\"a\": 1");
    });
});

describe("Flowix table styling", () => {
    it("keeps GFM column alignment", () => {
        const { container } = renderMarkdown(
            "| Name | Value |\n| :--- | ---: |\n| a | 1 |"
        );

        const headers = container.querySelectorAll("th");
        expect((headers[0] as HTMLElement).style.textAlign).toBe("left");
        expect((headers[1] as HTMLElement).style.textAlign).toBe("right");
        expect(container.querySelector("table")).toHaveClass("flowix-table");
    });
});
