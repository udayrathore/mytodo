import { DomainError } from "./domain";
// Only formatting used by the editor is accepted. No arbitrary HTML or URLs.
export function validateJournalDocument(document: Record<string, unknown>) {
  if (document.type !== "doc" || JSON.stringify(document).length > 85000)
    throw new DomainError("Document is invalid or too large.");
  const nodes = new Set(["doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "blockquote", "hardBreak", "horizontalRule", "codeBlock"]);
  const marks = new Set(["bold", "italic", "underline", "strike", "code"]);
  let count = 0;
  function visit(value: unknown, depth: number) {
    if (++count > 10000 || depth > 30 || !value || typeof value !== "object" || Array.isArray(value)) throw new DomainError("Invalid document structure.");
    const node = value as Record<string, unknown>;
    if (!nodes.has(String(node.type))) throw new DomainError("Unsupported document formatting.");
    if (node.text !== undefined && typeof node.text !== "string") throw new DomainError("Invalid text.");
    if (node.attrs !== undefined) {
      const attrs = node.attrs as Record<string, unknown>;
      if (!attrs || typeof attrs !== "object" || Array.isArray(attrs) || Object.keys(attrs).some(k => !["level", "start", "language"].includes(k))) throw new DomainError("Invalid formatting attributes.");
      if (attrs.level !== undefined && ![1,2,3].includes(Number(attrs.level))) throw new DomainError("Invalid heading.");
      if (attrs.start !== undefined && (!Number.isInteger(attrs.start) || Number(attrs.start) < 1 || Number(attrs.start) > 100000)) throw new DomainError("Invalid numbering.");
      if (attrs.language != null && (typeof attrs.language !== "string" || attrs.language.length > 50)) throw new DomainError("Invalid code language.");
    }
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks) || node.marks.some(m => !m || !marks.has(m.type) || m.attrs)) throw new DomainError("Unsupported text formatting.");
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) throw new DomainError("Invalid content.");
      node.content.forEach(child => visit(child, depth + 1));
    }
  }
  visit(document, 0);
}
