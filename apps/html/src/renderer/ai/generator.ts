import type { AiDesignRequest } from '../components/AiDesignModal'
import type { AiDocumentRequest } from '../components/AiDocumentModal'

export function buildDesignPrompt(req: AiDesignRequest): string {
  return `You are ReveLith HTML's expert AI Design engine. Generate a complete, standalone, production-ready single-file HTML document (with internal <style> tag) based on the user's brief.

Page Type: ${req.layoutType}
Style Direction: ${req.styleDirection}
User Brief:
"""
${req.brief}
"""

Design & Architecture Requirements:
1. Complete HTML5 document: <!DOCTYPE html><html><head><meta charset="utf-8"><title>Page</title><style>...</style></head><body>...</body></html>
2. Embedded modern CSS inside <style>:
   - Modern typography: Use system fonts (-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)
   - Harmonious color palette matching the "${req.styleDirection}" direction
   - Flexbox & CSS Grid layouts, responsive on mobile & desktop
   - Micro-interactions, hover states, subtle card shadows/borders
   ${req.layoutType === 'slides' ? '- Format as consecutive 16:9 slide cards (<div class="slide">) with padding, big titles, bullet takeaways, and page numbers' : ''}
   ${req.layoutType === 'dashboard' ? '- Format with a sleek top navbar, sidebar or filter tabs, KPI metric cards, SVG or CSS chart visuals, and a styled data table' : ''}
   ${req.layoutType === 'landing' ? '- Format with sticky navbar, hero section with call-to-actions, features grid with icons, social proof/testimonials, pricing tiers, and footer' : ''}
3. Clean semantic tags (<header>, <nav>, <main>, <section>, <article>, <footer>, <table>).
4. No external script dependencies or external fonts that require network. Use inline SVG icons.
5. Return ONLY the complete raw HTML code. Do NOT wrap in markdown backticks or explanations.`
}

export function buildDocumentPrompt(req: AiDocumentRequest): string {
  return `You are ReveLith HTML's expert AI Document engine. Write an extensive, beautifully formatted, long-form document in clean semantic HTML.

Document Type: ${req.docType}
Tone: ${req.tone}
Topic & Objectives:
"""
${req.topic}
"""
Include Table of Contents: ${req.includeToc}
Include Data/Comparison Tables: ${req.includeTables}

Document & Formatting Requirements:
1. Complete standalone HTML with embedded <style> designed for optimal long-form reading:
   - Max body width: 840px, centered with generous padding
   - Line height: 1.65, readable high-contrast typography
   - Crisp headings (h1, h2, h3) with anchor IDs
   ${req.includeToc ? '- Navigable Table of Contents list linking to section IDs' : ''}
   - Informative callout boxes / blockquotes for key takeaways
   ${req.includeTables ? '- Styled comparison or data tables with border-collapse and zebra striping' : ''}
   - Metadata header with Document Title, Author, Date, and Reading Time
2. Highly substantive, factual, thorough paragraphs (no shallow placeholders).
3. Return ONLY the complete raw HTML document. Do NOT wrap in markdown backticks or explanations.`
}

export function buildElementRefinePrompt(outerHtml: string, instruction: string): string {
  return `You are ReveLith HTML's targeted element restyler.
The user clicked an element in the live preview and wants to refine just this part.

Target Element:
"""
${outerHtml}
"""

User Instruction:
"""
${instruction}
"""

Requirements:
1. Modify the HTML/inline styles of this element to fulfill the instruction.
2. Return ONLY the replacement HTML for this exact element (the same tag or improved wrapper).
3. Do NOT include markdown code fences or conversational text.`
}
