import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { AgentToolCall, AgentToolDef, ToolExecution } from '@revelith/agent-core'
import type { OutlineNode } from '../OutlinePanel'
import type { PageEntry, SearchIndex } from '../search'
import { searchInIndex } from '../search'
import { geomDispSize, pdfRectToCss, pdfToView, viewToPdf } from '../annotations'
import type { PageGeom } from '../annotations'
import { EDIT_FONTS } from '../../shared/ipc'
import type {
  CreateDocumentResult,
  ExtractPagesResult,
  FilePageOpResult,
  FormValueInput,
  ImageLayer,
  ImageSearchResponse,
  InsertPdfResult,
  MarkupType,
  MetadataInput,
  PageImageRef,
  ReplacePagesResult,
  TextEditInput,
  TextInsertInput,
  WebSearchResult,
} from '../../shared/ipc'
import { groupPageBlocks } from '../text-block'
import { joinBlockLines, measurePt, wrapText } from '../text-wrap'
import { cropRect, flipPixels, multiplyAlpha } from '../image-bake'
import type { CropFractions } from '../image-bake'
import { removeBackground } from '../cutout'
import type { PixelImage } from '../cutout'
import { t } from '../i18n/locale'
import { buildFormCatalog } from '../form-catalog'
import type { HeaderFooterConfig, WatermarkConfig } from '../stamps'
import { DEFAULT_HEADER_FOOTER, DEFAULT_WATERMARK } from '../stamps'

/** Text cap per read_pages fed back to the model (the payload is resent in full each turn, so volume must be limited) */
const READ_CHUNK_CHARS = 24_000

/** One validated page-structure edit inside an apply_ops batch (all pages 1-based original numbers) */
export type PageOp =
  | { kind: 'rotate'; pages: number[]; dir: 90 | -90 }
  | { kind: 'delete'; pages: number[] }
  | { kind: 'order'; order: number[] }
  | { kind: 'form'; edit: FormValueInput }
  | { kind: 'metadata'; metadata: MetadataInput }
  | { kind: 'removeMarkup'; id: string }
  | { kind: 'removeSavedMarkup'; page: number; objNum: number }
  | { kind: 'removeNote'; id: string }
  | { kind: 'removeInsert'; id: string }

/** Capability surface App provides to AI tools; all getters, since the loop outlives render closures */
export interface PdfAiDeps {
  doc(): PDFDocumentProxy | null
  fileName(): string
  pageCount(): number
  /** Original page number of the currently visible page (1-based) */
  currentPage(): number
  readOnly(): boolean
  outline(): OutlineNode[] | null
  searchIndex(): Promise<SearchIndex> | null
  isDeleted(origIdx: number): boolean
  /** Original page number → scroll to that page; returns false if the page was deleted */
  gotoPage(origPage: number): boolean
  addMarkup(type: MarkupType, origIdx: number, rects: [number, number, number, number][]): void
  /** Queue a pending text edit (dry-run validated against the file when possible); null = accepted, string = rejection reason */
  editText(input: TextEditInput): Promise<string | null>
  /** Edit-font ids available on this machine (EDIT_FONTS subset) */
  editFonts(): string[]
  formEdits(): ReadonlyMap<string, FormValueInput>
  applyFormEdit(v: FormValueInput): void
  rotatePage(origIdx: number, dir: 90 | -90): void
  deletePage(origIdx: number): boolean
  /** Page geometry (unrotated size + total display rotation); null while the document is loading */
  pageGeom(origIdx: number): PageGeom | null
  /** Content-stream images currently in the saved file (pending unsaved inserts not included) */
  listImages(): Promise<PageImageRef[]>
  /** True when a pending unsaved edit already targets this image */
  isImageClaimed(ref: PageImageRef): boolean
  /** Queue a pending insert of a PNG (base64, no data: prefix) at rect (PDF user space) */
  insertImage(
    origIdx: number,
    png: string,
    rect: [number, number, number, number],
    layer: ImageLayer,
  ): void
  /** Queue a pending move/resize (and optional z-band change / quarter-turn rotation) of an existing image */
  transformImage(
    ref: PageImageRef,
    rect: [number, number, number, number],
    layer?: ImageLayer,
    quarterTurns?: number,
  ): void
  /** Queue a pending in-place pixel swap of an existing image (footprint/z-order kept) */
  replaceImage(ref: PageImageRef, png: string): void
  /** Queue a pending delete of an existing image */
  deleteImage(ref: PageImageRef): void
  /** Pending (unsaved) text markups queued this session */
  listPendingMarkups(): Array<{ id: string; page: number; type: MarkupType }>
  /** Pending (unsaved) sticky-note pins queued this session */
  listPendingNotes(): Array<{ id: string; page: number; contents: string; replyCount: number }>
  /** Queue a sticky-note pin (same as the user placing a note on the page) */
  addNote(page: number, at: [number, number], contents: string): void
  /** Append a follow-up reply to a pending pin; false when the id is unknown */
  replyNote(id: string, author: string, text: string): boolean
  /** Rewrite the text of a pending sticky-note pin; false when the id is unknown */
  editNote(id: string, contents: string): boolean
  /** Discard a pending sticky-note pin; false when the id is unknown */
  deleteNote(id: string): boolean
  /** Discard a pending text markup; false when the id is unknown */
  deletePendingMarkup(id: string): boolean
  /** Queue deletion of a markup annotation saved in the file; null = queued, string = reason */
  deleteSavedMarkup(page: number, objNum: number): Promise<string | null>
  /** Text blocks inserted this session (pending until save) */
  listTextInserts(): Array<{ id: string; page: number; text: string }>
  /** Queue a new searchable text block (same shape the click-to-place flow commits) */
  insertTextBlock(input: TextInsertInput): void
  /** Patch a pending text block's content/style; false when the id is unknown */
  editTextInsert(
    id: string,
    patch: {
      text?: string
      fontSize?: number
      color?: [number, number, number]
      align?: 'left' | 'center' | 'right'
    },
  ): boolean
  /** Shift a pending text block by dx/dy points as displayed (dy positive = down); false when unknown */
  moveTextInsert(id: string, dx: number, dy: number): boolean
  /** Discard a pending text block; false when the id is unknown */
  deleteTextInsert(id: string): boolean
  /** Render an existing content-stream image to PNG (base64), upscaled for print-sharp bakes; null on failure */
  bakeImagePixels(page: number, rect: [number, number, number, number]): Promise<string | null>
  /** Queue a baked-pixel swap of an existing image (footprint/z-order kept; crop shrinks the footprint) */
  bakeReplace(ref: PageImageRef, png: string, crop?: CropFractions): void
  /** Visible pages in display order (1-based original numbers, deleted hidden) */
  visiblePages(): number[]
  /** Apply a validated page-structure batch as ONE undo step */
  applyPageOps(ops: PageOp[]): Promise<void>
  /** Current watermark/header-footer session config (null = none set) */
  stampConfig(): { wm: WatermarkConfig | null; hf: HeaderFooterConfig | null } | null
  /** Replace the session watermark (null removes it); header-footer is kept */
  setWatermark(wm: WatermarkConfig | null): void
  /** Replace the session header-footer (null removes it); watermark is kept */
  setHeaderFooter(hf: HeaderFooterConfig | null): void
  /** Granted file path, or null for untitled documents */
  filePath(): string | null
  /** Currently selected document text (truncated), or null when nothing is selected */
  selectionText(): string | null
  /** Save pending edits now; false when the save failed */
  flushSave(): Promise<boolean>
  /** Reload the document from disk after a file-level rewrite (clears pending state) */
  reloadAfterFileOp(): Promise<void>
  fileInsertBlankPage(afterPage: number, width?: number, height?: number): Promise<FilePageOpResult>
  fileSetPageSize(pages: number[], width: number, height: number): Promise<FilePageOpResult>
  fileCropPages(pages: number[], box: [number, number, number, number]): Promise<FilePageOpResult>
  /** Extract pages to a new file (save dialog; the current file is untouched) */
  extractFilePages(pages: number[], suggestedName: string): Promise<ExtractPagesResult>
  /** Merge a picked file after a page (open dialog; rewrites in place) */
  mergeFile(afterPage: number): Promise<InsertPdfResult>
  /** Replace pages with a picked file's pages (open dialog; rewrites in place) */
  replaceFilePages(pages: number[]): Promise<ReplacePagesResult>
  /** Build a fresh document (save dialog; the current file is untouched) */
  createFileDocument(pages: number, title?: string, text?: string, suggestedName?: string): Promise<CreateDocumentResult>
  searchWeb(query: string, maxResults: number): Promise<WebSearchResult>
  searchImages(query: string, maxResults: number): Promise<ImageSearchResponse>
  generateImage(op: { prompt: string; aspectRatio?: string }): Promise<{
    url?: string
    error?: string
  }>
  /** Download a URL (main-process, SSRF-guarded) and re-encode as PNG; null on failure */
  fetchImage(url: string): Promise<{ png: string; width: number; height: number } | null>
}

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    name: 'read_pages',
    description:
      'Read the text content of a page range (with [Page N] markers). Read the relevant pages before answering questions; at most 10 pages per call, over-long output is truncated.',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'integer', description: 'Start page number (1-based)' },
        end: {
          type: 'integer',
          description: 'End page number (inclusive); if omitted, only the start page is read',
        },
      },
      required: ['start'],
    },
  },
  {
    name: 'search_text',
    description:
      'Search the full text for a string; returns the page number and a context excerpt for each hit. Prefer this when locating which page something is on.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to search for (case-insensitive)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'goto_page',
    description: 'Scroll the reading view to the given page so the user can see it.',
    inputSchema: {
      type: 'object',
      properties: { page: { type: 'integer', description: 'Page number (1-based)' } },
      required: ['page'],
    },
  },
  {
    name: 'markup_text',
    description:
      'Add a markup (highlight/underline/strikeout) to a text passage on the given page. text must be a verbatim fragment that actually exists on that page (confirm with read_pages or search_text first); by default only the first occurrence is marked, all=true marks every occurrence on that page.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        text: { type: 'string', description: 'Verbatim text fragment from the page' },
        type: {
          type: 'string',
          enum: ['highlight', 'underline', 'strikeout'],
          description: 'Markup type',
        },
        all: {
          type: 'boolean',
          description: 'Whether to mark every occurrence on the page; defaults to false',
        },
      },
      required: ['page', 'text', 'type'],
    },
  },
  {
    name: 'read_annotations',
    description:
      'List the sticky-note pins and text markups (highlight/underline/strikeout) in a page range — both saved in the file and queued unsaved this session. Use the returned ids with edit_note, delete_note, or delete_markup.',
    inputSchema: {
      type: 'object',
      properties: {
        start: { type: 'integer', description: 'First page (1-based); omit to start at page 1' },
        end: { type: 'integer', description: 'Last page (inclusive); omit to read to the end' },
      },
    },
  },
  {
    name: 'add_note',
    description:
      'Attach a sticky-note comment to a page (takes effect on save). Anchor it with anchor_text (a verbatim fragment on the page — the pin lands at its end) or explicit x/y in PDF points.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        text: { type: 'string', description: 'Note contents' },
        anchor_text: {
          type: 'string',
          description: 'Verbatim text fragment on the page the note refers to',
        },
        occurrence: {
          type: 'integer',
          description: 'Which occurrence of anchor_text on the page to use (1-based); defaults to 1',
        },
        x: { type: 'number', description: 'Pin x in PDF points (used when anchor_text is omitted)' },
        y: { type: 'number', description: 'Pin y in PDF points (used when anchor_text is omitted)' },
      },
      required: ['page', 'text'],
    },
  },
  {
    name: 'reply_note',
    description:
      'Append a follow-up reply to a pending sticky-note thread (takes effect on save; authored as "AI Assistant"). note_id is a pending-note id from read_annotations.',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: { type: 'string', description: 'Pending note id from read_annotations' },
        text: { type: 'string', description: 'Reply contents' },
      },
      required: ['note_id', 'text'],
    },
  },
  {
    name: 'edit_note',
    description:
      'Rewrite the text of a pending sticky-note pin (use read_annotations for the id). Only notes queued this session can be edited.',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: { type: 'string', description: 'Note id from read_annotations' },
        text: { type: 'string', description: 'New note contents' },
      },
      required: ['note_id', 'text'],
    },
  },
  {
    name: 'delete_markup',
    description:
      'Remove a highlight/underline/strikeout (use read_annotations for the id). Removes one pending or saved markup.',
    inputSchema: {
      type: 'object',
      properties: {
        markup_id: { type: 'string', description: 'Markup id from read_annotations' },
        page: { type: 'integer', description: 'Page number (1-based) the markup is on' },
      },
      required: ['markup_id', 'page'],
    },
  },
  {
    name: 'delete_note',
    description:
      'Discard a pending sticky-note pin (use read_annotations for the id). Only notes queued this session can be deleted.',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: { type: 'string', description: 'Note id from read_annotations' },
      },
      required: ['note_id'],
    },
  },
  {
    name: 'insert_text',
    description:
      'Write NEW searchable text on a page or blank area (takes effect on save; never touches existing text — use edit_text/edit_block for that). Position with x/y in points from the page top-left as displayed; pass max_width to auto-wrap. After a save the block is ordinary page content: list it with list_inserted_text only while unsaved.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        text: { type: 'string', description: 'Text to write; "\\n" forces a line break' },
        x: { type: 'number', description: 'Placement x in points from the page left edge as displayed' },
        y: { type: 'number', description: 'Placement y in points from the page top as displayed' },
        max_width: { type: 'number', description: 'Wrap width in points; defaults to the page width minus margins' },
        font_size: { type: 'number', description: 'Font size in PDF points; defaults to 14' },
        color: { type: 'string', description: 'Text color as #RRGGBB; defaults to #111111' },
        align: { type: 'string', enum: ['left', 'center', 'right'], description: 'Paragraph alignment; defaults to left' },
      },
      required: ['page', 'text', 'x', 'y'],
    },
  },
  {
    name: 'list_inserted_text',
    description:
      'List the text blocks inserted this session that are still unsaved (with their ids). After a save a block is ordinary page content: edit it with edit_text instead.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based); omit to list every page' },
      },
    },
  },
  {
    name: 'edit_inserted_text',
    description:
      'Change the content or style of an unsaved inserted text block by id (use list_inserted_text for ids).',
    inputSchema: {
      type: 'object',
      properties: {
        block_id: { type: 'string', description: 'Block id from list_inserted_text' },
        text: { type: 'string', description: 'New text; "\\n" forces a line break' },
        font_size: { type: 'number', description: 'New font size in PDF points' },
        color: { type: 'string', description: 'New color as #RRGGBB' },
        align: { type: 'string', enum: ['left', 'center', 'right'], description: 'New alignment' },
      },
      required: ['block_id'],
    },
  },
  {
    name: 'move_inserted_text',
    description:
      'Shift an unsaved inserted text block by dx/dy points as displayed (positive dy = down). One call per block.',
    inputSchema: {
      type: 'object',
      properties: {
        block_id: { type: 'string', description: 'Block id from list_inserted_text' },
        dx: { type: 'number', description: 'Horizontal shift in points (positive = right)' },
        dy: { type: 'number', description: 'Vertical shift in points (positive = down)' },
      },
      required: ['block_id', 'dx', 'dy'],
    },
  },
  {
    name: 'delete_inserted_text',
    description:
      'Discard an unsaved inserted text block by id (use list_inserted_text for ids).',
    inputSchema: {
      type: 'object',
      properties: {
        block_id: { type: 'string', description: 'Block id from list_inserted_text' },
      },
      required: ['block_id'],
    },
  },
  {
    name: 'edit_text',
    description:
      'Replace a short text run on a page (rewrites the PDF content; takes effect on save). old_text must be a verbatim fragment that actually exists on that page (confirm with read_pages or search_text first); only the first occurrence on the page is edited unless occurrence is given. The replacement is drawn from the original position without reflowing the page, so keep it close to the original length; text cannot be deleted (new_text must not be empty).',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        old_text: { type: 'string', description: 'Verbatim text fragment currently on the page' },
        new_text: {
          type: 'string',
          description: 'Replacement text; "\\n" splits it into stacked lines',
        },
        occurrence: {
          type: 'integer',
          description: 'Which occurrence of old_text on the page to edit (1-based); defaults to 1',
        },
        font_size: {
          type: 'number',
          description: 'New font size in PDF points; omit to keep the original size',
        },
        color: {
          type: 'string',
          description: 'New text color as #RRGGBB hex; omit to keep the original color',
        },
        font: {
          type: 'string',
          enum: ['arial', 'times', 'courier'],
          description:
            'Font for the replacement; ignored when the face lacks glyphs for it (e.g. CJK). Omit for automatic',
        },
        bold: { type: 'boolean', description: 'Set the replacement in the bold variant' },
        italic: { type: 'boolean', description: 'Set the replacement in the italic variant' },
      },
      required: ['page', 'old_text', 'new_text'],
    },
  },
  {
    name: 'edit_block',
    description:
      "Rewrite a whole paragraph on a page (rewrites the PDF content; takes effect on save). The paragraph is located by paragraph_text : a distinctive verbatim fragment of it. The ENTIRE paragraph is replaced by new_text, which is re-wrapped automatically within the paragraph's original width (the block grows downward when the text is longer). Use edit_text instead to change a few words without reflowing.",
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        paragraph_text: {
          type: 'string',
          description:
            'Verbatim fragment identifying the paragraph; must match exactly one paragraph on the page',
        },
        new_text: {
          type: 'string',
          description:
            'Full replacement for the paragraph; "\\n" separates paragraphs within the block',
        },
        font_size: {
          type: 'number',
          description: 'New font size in PDF points; omit to keep the original size',
        },
        color: {
          type: 'string',
          description: 'New text color as #RRGGBB hex; omit to keep the original color',
        },
        font: {
          type: 'string',
          enum: ['arial', 'times', 'courier'],
          description:
            'Font for the replacement; ignored when the face lacks glyphs for it (e.g. CJK). Omit for automatic',
        },
        bold: { type: 'boolean', description: 'Set the paragraph in the bold variant' },
        italic: { type: 'boolean', description: 'Set the paragraph in the italic variant' },
      },
      required: ['page', 'paragraph_text', 'new_text'],
    },
  },
  {
    name: 'move_text_block',
    description:
      'Shift a whole paragraph on a page by dx/dy points as displayed (positive dy = down), without changing its text (takes effect on save). The paragraph is located by paragraph_text : a distinctive verbatim fragment of it. Use it to close the gap after a deletion or to reposition a block; one call per paragraph.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        paragraph_text: {
          type: 'string',
          description:
            'Verbatim fragment identifying the paragraph; must match exactly one paragraph on the page',
        },
        dx: { type: 'number', description: 'Horizontal shift in points (positive = right)' },
        dy: { type: 'number', description: 'Vertical shift in points (positive = down)' },
      },
      required: ['page', 'paragraph_text', 'dx', 'dy'],
    },
  },
  {
    name: 'web_search',
    description:
      'Search the web for textual information (references/data/facts). Use when you need up-to-date information or are unsure about a fact. Returns titles/links/snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords' },
        maxResults: { type: 'integer', description: 'Maximum number of results, default 6' },
      },
      required: ['query'],
    },
  },
  {
    name: 'image_search',
    description:
      'Search the web for images. Returns a numbered list with direct imageUrl links; pick one and pass its URL to insert_image. Use for real photos/logos; use generate_image for custom illustrations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Image search keywords (English works better)' },
        max_results: { type: 'integer', description: 'Max results, default 8' },
      },
      required: ['query'],
    },
  },
  {
    name: 'generate_image',
    description:
      'Generate an image with AI from a text prompt; returns an image URL to pass to insert_image. Use for custom illustrations/icons/diagrams; for real photos prefer image_search.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Image description, English works better (keep any text to render in the image verbatim)',
        },
        aspect_ratio: {
          type: 'string',
          description: 'Aspect ratio: 1:1|4:3|16:9|9:16|3:4|2:3|3:2|auto',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'list_page_images',
    description:
      'List the images embedded in the page content: per-page image numbers with position/size in points as displayed (x from the left edge, y from the page TOP, page rotation applied). Call this before transform_image or delete_image. Images inserted in this session but not yet saved are not listed.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'integer',
          description: 'Page number (1-based); omit to list images on every page',
        },
      },
    },
  },
  {
    name: 'insert_image',
    description:
      'Download an image URL (from image_search or generate_image) and place it on a page (takes effect on save). Position it either with anchor_text (a verbatim text fragment on the page) plus placement, or with explicit x/y in points measured from the page top-left as displayed; with neither, the image is centered on the page.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        url: {
          type: 'string',
          description: 'Direct image link (from image_search or generate_image)',
        },
        anchor_text: {
          type: 'string',
          description: 'Verbatim text fragment on the page to position the image relative to',
        },
        placement: {
          type: 'string',
          enum: ['below', 'above', 'right', 'left'],
          description: 'Which side of anchor_text to place the image on; defaults to below',
        },
        x: {
          type: 'number',
          description: 'Left edge in points from the page left edge as displayed',
        },
        y: {
          type: 'number',
          description: 'Top edge in points from the page TOP edge as displayed',
        },
        width: {
          type: 'number',
          description:
            'Display width in PDF points; height follows the aspect ratio. Default: natural size, capped to half the page width',
        },
        layer: {
          type: 'string',
          enum: ['above_text', 'below_text'],
          description: 'Z-order relative to the page text; below_text (default) never covers text',
        },
      },
      required: ['page', 'url'],
    },
  },
  {
    name: 'transform_image',
    description:
      'Move/resize an existing page image, or change its z-order relative to the text (takes effect on save). Call list_page_images first; image_number refers to that listing. Omitted parameters keep their current value; giving only width (or only height) scales the other side by the aspect ratio.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        image_number: {
          type: 'integer',
          description: 'Image number from list_page_images (1-based, per page)',
        },
        x: {
          type: 'number',
          description: 'New left edge in points from the page left edge as displayed',
        },
        y: {
          type: 'number',
          description: 'New top edge in points from the page TOP edge as displayed',
        },
        width: { type: 'number', description: 'New width in PDF points' },
        height: { type: 'number', description: 'New height in PDF points' },
        layer: {
          type: 'string',
          enum: ['above_text', 'below_text'],
          description: 'Z-order relative to the page text',
        },
      },
      required: ['page', 'image_number'],
    },
  },
  {
    name: 'rotate_image',
    description:
      'Rotate an existing page image about its center (takes effect on save). Call list_page_images first; image_number refers to that listing. Quarter turns only; the footprint width/height swap for 90°/270°.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        image_number: {
          type: 'integer',
          description: 'Image number from list_page_images (1-based, per page)',
        },
        direction: {
          type: 'string',
          enum: ['cw', 'ccw', '180'],
          description: 'cw = 90° clockwise (default), ccw = 90° counter-clockwise, 180 = half turn',
        },
      },
      required: ['page', 'image_number'],
    },
  },
  {
    name: 'replace_image',
    description:
      'Swap an existing page image\'s pixels for a downloaded URL (from image_search or generate_image) in place : footprint and z-order survive; the new image stretches to the old footprint (takes effect on save). Call list_page_images first; image_number refers to that listing. This is the tool for "change/AI-edit this image": generate_image with the desired edit, then replace_image with the returned URL.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        image_number: {
          type: 'integer',
          description: 'Image number from list_page_images (1-based, per page)',
        },
        url: { type: 'string', description: 'Direct image link (PNG/JPEG)' },
      },
      required: ['page', 'image_number', 'url'],
    },
  },
  {
    name: 'delete_image',
    description:
      'Delete an existing page image (takes effect on save; the user can undo before saving). Call list_page_images first; image_number refers to that listing.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        image_number: {
          type: 'integer',
          description: 'Image number from list_page_images (1-based, per page)',
        },
      },
      required: ['page', 'image_number'],
    },
  },
  {
    name: 'flip_image',
    description:
      'Mirror an existing page image horizontally or vertically, in place (takes effect on save). Call list_page_images first; image_number refers to that listing. One edit per image per save.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        image_number: {
          type: 'integer',
          description: 'Image number from list_page_images (1-based, per page)',
        },
        direction: {
          type: 'string',
          enum: ['horizontal', 'vertical'],
          description: 'Mirror axis',
        },
      },
      required: ['page', 'image_number', 'direction'],
    },
  },
  {
    name: 'crop_image',
    description:
      'Crop an existing page image to the kept region, given as 0..1 fractions of the displayed image (takes effect on save). Call list_page_images first; image_number refers to that listing. One edit per image per save.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        image_number: {
          type: 'integer',
          description: 'Image number from list_page_images (1-based, per page)',
        },
        left: { type: 'number', description: 'Kept-region left edge (0..1)' },
        top: { type: 'number', description: 'Kept-region top edge (0..1)' },
        right: { type: 'number', description: 'Kept-region right edge (0..1)' },
        bottom: { type: 'number', description: 'Kept-region bottom edge (0..1)' },
      },
      required: ['page', 'image_number', 'left', 'top', 'right', 'bottom'],
    },
  },
  {
    name: 'set_image_opacity',
    description:
      'Make an existing page image semi-transparent, in place (takes effect on save). Opacity 0..100 (100 = fully opaque). Call list_page_images first; image_number refers to that listing. One edit per image per save.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        image_number: {
          type: 'integer',
          description: 'Image number from list_page_images (1-based, per page)',
        },
        opacity: { type: 'number', description: 'Opacity percent 0..100' },
      },
      required: ['page', 'image_number', 'opacity'],
    },
  },
  {
    name: 'remove_image_background',
    description:
      'Remove the background of an existing page image (edge-connected background colors become transparent; takes effect on save). Call list_page_images first; image_number refers to that listing. One edit per image per save.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        image_number: {
          type: 'integer',
          description: 'Image number from list_page_images (1-based, per page)',
        },
        tolerance: {
          type: 'number',
          description: 'Color tolerance 0..100 (higher removes more); defaults to 32',
        },
      },
      required: ['page', 'image_number'],
    },
  },
  {
    name: 'list_form_fields',
    description:
      'List all form fields in the document (name/type/current value/options/page). Must be called before filling forms to learn the fields.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'fill_form_field',
    description:
      'Fill in one form field. For text/choice/radio fields pass value (radio: the exportValue; choice: an option exportValue); for checkboxes pass checked.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Field name (from list_form_fields)' },
        value: { type: 'string', description: 'Value for text/choice/radio fields' },
        checked: { type: 'boolean', description: 'Checked state for checkboxes' },
      },
      required: ['name'],
    },
  },
  {
    name: 'rotate_page',
    description: 'Rotate the given page 90 degrees clockwise or counterclockwise.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Page number (1-based)' },
        direction: {
          type: 'string',
          enum: ['left', 'right'],
          description: 'left = counterclockwise, right = clockwise',
        },
      },
      required: ['page', 'direction'],
    },
  },
  {
    name: 'delete_page',
    description: 'Delete the given page (takes effect on save; the user can undo before saving).',
    inputSchema: {
      type: 'object',
      properties: { page: { type: 'integer', description: 'Page number (1-based)' } },
      required: ['page'],
    },
  },
  {
    name: 'apply_ops',
    description:
      'Apply a batch of page-structure and document-level edits as ONE transaction and ONE undo step (takes effect on save). Rotating, deleting, and reordering pages; filling forms (after list_form_fields); setting document metadata; removing a pending highlight, note, or inserted-text block. Batch related edits instead of calling tools once per page. It cannot add content: markup_text, insert_text, insert_image, and add_note stay the way to create things.',
    inputSchema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: 'Edits applied in order as one transaction',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: [
                  'rotate_pages',
                  'delete_pages',
                  'set_page_order',
                  'set_form_value',
                  'set_metadata',
                  'remove_markup',
                  'remove_note',
                  'remove_inserted_text',
                ],
              },
              pages: { type: 'array', items: { type: 'integer' }, description: 'Pages (1-based) for rotate_pages / delete_pages' },
              direction: { type: 'string', enum: ['left', 'right'], description: 'Turn direction for rotate_pages' },
              order: { type: 'array', items: { type: 'integer' }, description: 'Visible page numbers in their new order for set_page_order' },
              name: { type: 'string', description: 'Field name for set_form_value (from list_form_fields)' },
              value: { type: 'string', description: 'New value for text/radio/choice fields' },
              checked: { type: 'boolean', description: 'New state for checkbox fields' },
              title: { type: 'string', description: 'Document title for set_metadata (empty clears)' },
              author: { type: 'string', description: 'Document author for set_metadata (empty clears)' },
              subject: { type: 'string', description: 'Document subject for set_metadata (empty clears)' },
              keywords: { type: 'string', description: 'Document keywords for set_metadata (empty clears)' },
              markup_id: { type: 'string', description: 'Markup id from read_annotations for remove_markup' },
              page: { type: 'integer', description: 'Page the markup is on (for remove_markup of a saved id)' },
              note_id: { type: 'string', description: 'Note id from read_annotations for remove_note' },
              block_id: { type: 'string', description: 'Block id from list_inserted_text for remove_inserted_text' },
            },
            required: ['op'],
          },
        },
      },
      required: ['operations'],
    },
  },
  {
    name: 'get_outline',
    description:
      'Read the document outline (bookmarks) tree, including entry titles. Returns empty if the document has no outline.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_watermark',
    description:
      'Stamp diagonal watermark text across every page (takes effect on save). Each call replaces what the session set before instead of stacking; empty text removes it. It cannot strip a watermark that belongs to the original document.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Watermark text; empty removes the session watermark' },
        angle: { type: 'number', description: 'Counterclockwise degrees; defaults to 35' },
        opacity: { type: 'number', description: 'Opacity percent 0..100; defaults to 18' },
        color: { type: 'string', description: 'Text color as #RRGGBB; defaults to #d0342c' },
        size_ratio: { type: 'number', description: 'Font size as percent of page width (2..50); defaults to 11' },
      },
      required: ['text'],
    },
  },
  {
    name: 'set_header_footer',
    description:
      'Fill header/footer slots on every page, with optional page numbering (takes effect on save). Each call replaces what the session set before. All slots empty with page_number false removes the session header-footer.',
    inputSchema: {
      type: 'object',
      properties: {
        header_left: { type: 'string', description: 'Header left text' },
        header_center: { type: 'string', description: 'Header center text' },
        header_right: { type: 'string', description: 'Header right text' },
        footer_left: { type: 'string', description: 'Footer left text' },
        footer_center: { type: 'string', description: 'Footer center text (ignored when page_number is true)' },
        footer_right: { type: 'string', description: 'Footer right text' },
        page_number: { type: 'boolean', description: 'Auto page number in the footer center; defaults to true' },
        start_at: { type: 'integer', description: 'First page number; defaults to 1' },
        font_size: { type: 'number', description: 'Font size in PDF points (6..72); defaults to 9' },
        color: { type: 'string', description: 'Text color as #RRGGBB; defaults to #666666' },
      },
    },
  },
  {
    name: 'insert_blank_page',
    description:
      'Insert a blank page after the given page (0 = front; the file on disk is rewritten immediately and cannot be undone — pending edits are saved first). Size defaults to the neighboring page. Pass confirm:true only after the user has agreed.',
    inputSchema: {
      type: 'object',
      properties: {
        after_page: { type: 'integer', description: 'Insert after this page (1-based); 0 = front' },
        width: { type: 'number', description: 'Blank width in pt (36..2880); omit for neighbor size' },
        height: { type: 'number', description: 'Blank height in pt (36..2880); omit for neighbor size' },
        confirm: { type: 'boolean', description: 'Required: true after the user confirms' },
      },
      required: ['after_page', 'confirm'],
    },
  },
  {
    name: 'set_page_size',
    description:
      'Resize pages (content stays glued to the bottom-left corner; the file on disk is rewritten immediately and cannot be undone — pending edits are saved first). Pass confirm:true only after the user has agreed.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Single page (1-based); omit to use pages' },
        pages: { type: 'array', items: { type: 'integer' }, description: 'Pages (1-based)' },
        width: { type: 'number', description: 'New width in pt (36..2880)' },
        height: { type: 'number', description: 'New height in pt (36..2880)' },
        confirm: { type: 'boolean', description: 'Required: true after the user confirms' },
      },
      required: ['width', 'height', 'confirm'],
    },
  },
  {
    name: 'crop_pages',
    description:
      'Crop pages to a display-space box (the file on disk is rewritten immediately and cannot be undone — pending edits are saved first). Pass confirm:true only after the user has agreed.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Single page (1-based); omit to use pages' },
        pages: { type: 'array', items: { type: 'integer' }, description: 'Pages (1-based)' },
        left: { type: 'number', description: 'Kept-region left in points from the displayed left edge' },
        top: { type: 'number', description: 'Kept-region top in points from the displayed top edge' },
        right: { type: 'number', description: 'Kept-region right in points from the displayed left edge' },
        bottom: { type: 'number', description: 'Kept-region bottom in points from the displayed top edge' },
        confirm: { type: 'boolean', description: 'Required: true after the user confirms' },
      },
      required: ['left', 'top', 'right', 'bottom', 'confirm'],
    },
  },
  {
    name: 'extract_pages',
    description:
      'Extract pages into a new PDF file (a save dialog asks where to write; the current file is untouched, pending edits are saved first).',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Single page (1-based); omit to use pages' },
        pages: { type: 'array', items: { type: 'integer' }, description: 'Pages (1-based)' },
        name: { type: 'string', description: 'Suggested file name (without extension)' },
      },
    },
  },
  {
    name: 'split_pdf',
    description:
      'Split the document into two PDFs at a page boundary (two save dialogs; the current file is untouched, pending edits are saved first).',
    inputSchema: {
      type: 'object',
      properties: {
        at_page: { type: 'integer', description: 'First half ends at this page (1-based)' },
      },
      required: ['at_page'],
    },
  },
  {
    name: 'merge_pages',
    description:
      'Merge another PDF file after the given page (a picker asks which file; the file on disk is rewritten immediately and cannot be undone — pending edits are saved first). Pass confirm:true only after the user has agreed.',
    inputSchema: {
      type: 'object',
      properties: {
        after_page: { type: 'integer', description: 'Merge after this page (1-based); 0 = front' },
        confirm: { type: 'boolean', description: 'Required: true after the user confirms' },
      },
      required: ['after_page', 'confirm'],
    },
  },
  {
    name: 'replace_pages',
    description:
      'Replace pages with the pages of another PDF file (a picker asks which file; the file on disk is rewritten immediately and cannot be undone — pending edits are saved first). Pass confirm:true only after the user has agreed.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'integer', description: 'Single page (1-based); omit to use pages' },
        pages: { type: 'array', items: { type: 'integer' }, description: 'Pages (1-based) to replace' },
        confirm: { type: 'boolean', description: 'Required: true after the user confirms' },
      },
      required: ['confirm'],
    },
  },
  {
    name: 'create_document',
    description:
      'Build a new PDF document with the given content (a save dialog asks where to write; the current file is untouched). Use it when the user asks to put results into a NEW/separate document instead of this PDF; do not claim you cannot create files. Body text renders in a latin base font.',
    inputSchema: {
      type: 'object',
      properties: {
        pages: { type: 'integer', description: 'Page count (1..100); defaults to 1' },
        title: { type: 'string', description: 'Title on the first page' },
        text: { type: 'string', description: 'Body text for the first page' },
      },
    },
  },
]

const READONLY_OUTPUT =
  'The document is encrypted and read-only; it cannot be modified. Inform the user.'

function err(output: string, summary: string): ToolExecution {
  return { output, isError: true, summary }
}

/** Validate a 1-based page number; returns the original page index or an error */
function resolvePage(deps: PdfAiDeps, raw: unknown): { origIdx: number } | { bad: string } {
  const page = Number(raw)
  if (!Number.isInteger(page) || page < 1 || page > deps.pageCount()) {
    return {
      bad: `Page number ${String(raw)} is out of range (document has ${deps.pageCount()} pages)`,
    }
  }
  if (deps.isDeleted(page - 1)) return { bad: `Page ${page} has been deleted (unsaved)` }
  return { origIdx: page - 1 }
}

async function readPages(deps: PdfAiDeps, input: Record<string, unknown>): Promise<ToolExecution> {
  const doc = deps.doc()
  if (!doc) return err('Document not ready', t('aiToolReadPages', { start: '?', end: '?' }))
  const start = Number(input.start)
  const end = Math.min(Number(input.end ?? start), start + 9)
  const summary = t('aiToolReadPages', { start, end })
  if (!Number.isInteger(start) || start < 1 || end < start || start > doc.numPages) {
    return err(`Invalid page range (document has ${doc.numPages} pages)`, summary)
  }
  let out = ''
  for (let n = start; n <= Math.min(end, doc.numPages); n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    let text = ''
    for (const item of content.items) {
      if ('str' in item) {
        text += item.str
        if (item.hasEOL) text += '\n'
      }
    }
    page.cleanup()
    out += `[Page ${n}]\n${text.trim()}\n\n`
    if (out.length > READ_CHUNK_CHARS) {
      out = `${out.slice(0, READ_CHUNK_CHARS)}\n… (truncated; read the rest in further calls)`
      break
    }
  }
  return {
    output: out.trim() || '(No extractable text in this range; the pages may be scanned images)',
    summary,
  }
}

async function searchText(deps: PdfAiDeps, input: Record<string, unknown>): Promise<ToolExecution> {
  const query = String(input.query ?? '').trim()
  if (!query) return err('query must not be empty', t('aiToolSearch', { query: '', count: 0 }))
  const indexPromise = deps.searchIndex()
  if (!indexPromise) return err('Document not ready', t('aiToolSearch', { query, count: 0 }))
  const index = await indexPromise
  const matches = searchInIndex(index, query)
  const lines: string[] = []
  for (const m of matches.slice(0, 40)) {
    const entry = index[m.pageIndex]!
    const pos = entry.lower.indexOf(query.toLowerCase())
    const from = Math.max(0, pos - 40)
    const snippet = entry.text.slice(from, pos + query.length + 40).replace(/\s+/g, ' ')
    lines.push(`Page ${m.pageIndex + 1}: …${snippet}…`)
  }
  if (matches.length > 40) lines.push(`(${matches.length} matches total; only the first 40 listed)`)
  return {
    output: lines.join('\n') || 'No matches found',
    summary: t('aiToolSearch', { query, count: matches.length }),
  }
}

async function markupText(deps: PdfAiDeps, input: Record<string, unknown>): Promise<ToolExecution> {
  const type = String(input.type) as MarkupType
  const summary = t('aiToolMarkup', { page: Number(input.page) })
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  if (!['highlight', 'underline', 'strikeout'].includes(type))
    return err(`Invalid type: ${type}`, summary)
  const r = resolvePage(deps, input.page)
  if ('bad' in r) return err(r.bad, summary)
  const text = String(input.text ?? '').trim()
  if (!text) return err('text must not be empty', summary)
  const indexPromise = deps.searchIndex()
  if (!indexPromise) return err('Document not ready', summary)
  const index = await indexPromise
  const onPage = searchInIndex(index, text).filter((m) => m.pageIndex === r.origIdx)
  if (onPage.length === 0) {
    return err(
      `"${text}" not found on page ${r.origIdx + 1}; use read_pages to verify the exact text`,
      summary,
    )
  }
  const targets = input.all === true ? onPage : onPage.slice(0, 1)
  for (const m of targets) deps.addMarkup(type, r.origIdx, m.rects)
  deps.gotoPage(r.origIdx + 1)
  return {
    output: `Marked ${targets.length} occurrence(s) on page ${r.origIdx + 1} (unsaved; the user saves with ⌘S)`,
    mutated: true,
    summary,
  }
}

/** nth (1-based, non-overlapping) case-insensitive occurrence of query on a page →
    verbatim text, union rect (PDF space), and line height (≈ font size) */
function locateOccurrence(
  entry: PageEntry,
  query: string,
  occurrence: number,
): { oldText: string; rect: [number, number, number, number]; fontSize: number } | null {
  const q = query.toLowerCase()
  let pos = -1
  let from = 0
  for (let i = 0; i < occurrence; i++) {
    pos = entry.lower.indexOf(q, from)
    if (pos < 0) return null
    from = pos + q.length
  }
  const end = pos + q.length
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  let fontSize = 0
  for (const it of entry.items) {
    if (it.end <= pos || it.start >= end) continue
    const len = it.end - it.start
    const lo = (Math.max(pos, it.start) - it.start) / len
    const hi = (Math.min(end, it.end) - it.start) / len
    x1 = Math.min(x1, it.x + it.w * lo)
    x2 = Math.max(x2, it.x + it.w * hi)
    y1 = Math.min(y1, it.y)
    y2 = Math.max(y2, it.y + it.h)
    fontSize = Math.max(fontSize, it.h)
  }
  if (fontSize <= 0 || x2 - x1 < 0.01) return null
  return { oldText: entry.text.slice(pos, end), rect: [x1, y1, x2, y2], fontSize }
}

const countOccurrences = (entry: PageEntry, query: string): number => {
  const q = query.toLowerCase()
  let n = 0
  for (let from = 0; ; n++) {
    const pos = entry.lower.indexOf(q, from)
    if (pos < 0) return n
    from = pos + q.length
  }
}

const HEX_COLOR = /^#?([0-9a-f]{6})$/i

async function editText(deps: PdfAiDeps, input: Record<string, unknown>): Promise<ToolExecution> {
  const summary = t('aiToolEditText', { page: Number(input.page) })
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const r = resolvePage(deps, input.page)
  if ('bad' in r) return err(r.bad, summary)
  const oldText = String(input.old_text ?? '').trim()
  const newText = String(input.new_text ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!oldText) return err('old_text must not be empty', summary)
  if (!newText) return err('new_text must not be empty (edit_text cannot delete text)', summary)
  const occurrence = Math.max(1, Math.trunc(Number(input.occurrence ?? 1)) || 1)
  let newColor: [number, number, number] | undefined
  if (input.color !== undefined) {
    const hex = HEX_COLOR.exec(String(input.color))
    if (!hex) return err(`Invalid color "${String(input.color)}"; use #RRGGBB`, summary)
    const v = parseInt(hex[1]!, 16)
    newColor = [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  }
  const newFontSize = input.font_size === undefined ? undefined : Number(input.font_size)
  if (newFontSize !== undefined && !(newFontSize > 0)) {
    return err('font_size must be a positive number', summary)
  }
  const newFont = input.font === undefined ? undefined : String(input.font)
  if (newFont !== undefined && !deps.editFonts().includes(newFont)) {
    const avail = deps.editFonts()
    return err(
      avail.length > 0
        ? `Font "${newFont}" is not available; choose one of: ${avail.join(', ')}`
        : 'No selectable fonts are available on this machine; omit the font parameter',
      summary,
    )
  }
  const indexPromise = deps.searchIndex()
  if (!indexPromise) return err('Document not ready', summary)
  const index = await indexPromise
  const entry = index[r.origIdx]
  const located = entry ? locateOccurrence(entry, oldText, occurrence) : null
  if (!entry || !located) {
    return err(
      `Occurrence ${occurrence} of "${oldText}" not found on page ${r.origIdx + 1}; use read_pages to verify the exact text`,
      summary,
    )
  }
  const reason = await deps.editText({
    pageIndex: r.origIdx,
    rect: located.rect,
    oldText: located.oldText,
    newText,
    fontSize: located.fontSize,
    newFontSize,
    newColor,
    newFont,
    newBold: input.bold === true ? true : undefined,
    newItalic: input.italic === true ? true : undefined,
  })
  if (reason) return err(`The edit could not be applied: ${reason}`, summary)
  deps.gotoPage(r.origIdx + 1)
  const total = countOccurrences(entry, oldText)
  const note =
    total > 1 && input.occurrence === undefined
      ? ` Note: the page has ${total} occurrences of this text and only the first was edited; pass occurrence to target another.`
      : ''
  return {
    output: `Replaced occurrence ${occurrence} of "${oldText}" on page ${r.origIdx + 1} (unsaved; the user saves with ⌘S).${note}`,
    mutated: true,
    summary,
  }
}

/** Locate the single clustered paragraph containing a verbatim fragment */
async function locateParagraph(
  deps: PdfAiDeps,
  origIdx: number,
  anchor: string,
): Promise<{ block: ReturnType<typeof groupPageBlocks>[number] } | { bad: string }> {
  const indexPromise = deps.searchIndex()
  if (!indexPromise) return { bad: 'Document not ready' }
  const index = await indexPromise
  const entry = index[origIdx]
  if (!entry) return { bad: `Page ${origIdx + 1} has no extractable text` }
  const squash = (s: string) => s.replace(/\s+/g, '')
  const key = squash(anchor)
  const hits = groupPageBlocks(entry).filter((b) =>
    squash(b.lines.map((l) => l.text).join('')).includes(key),
  )
  if (hits.length === 0) {
    return {
      bad: `No paragraph on page ${origIdx + 1} contains "${anchor}"; use read_pages to verify the exact text`,
    }
  }
  if (hits.length > 1) {
    return {
      bad: `${hits.length} paragraphs on page ${origIdx + 1} contain "${anchor}"; pass a longer, unique fragment`,
    }
  }
  return { block: hits[0]! }
}

/** Rewrite one clustered paragraph, reflowed within the block's original width */
async function editBlock(deps: PdfAiDeps, input: Record<string, unknown>): Promise<ToolExecution> {
  const summary = t('aiToolEditText', { page: Number(input.page) })
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const r = resolvePage(deps, input.page)
  if ('bad' in r) return err(r.bad, summary)
  const anchor = String(input.paragraph_text ?? '').trim()
  const newText = String(input.new_text ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!anchor) return err('paragraph_text must not be empty', summary)
  if (!newText) return err('new_text must not be empty (edit_block cannot delete text)', summary)
  let newColor: [number, number, number] | undefined
  if (input.color !== undefined) {
    const hex = HEX_COLOR.exec(String(input.color))
    if (!hex) return err(`Invalid color "${String(input.color)}"; use #RRGGBB`, summary)
    const v = parseInt(hex[1]!, 16)
    newColor = [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  }
  const newFontSize = input.font_size === undefined ? undefined : Number(input.font_size)
  if (newFontSize !== undefined && !(newFontSize > 0)) {
    return err('font_size must be a positive number', summary)
  }
  const newFont = input.font === undefined ? undefined : String(input.font)
  if (newFont !== undefined && !deps.editFonts().includes(newFont)) {
    const avail = deps.editFonts()
    return err(
      avail.length > 0
        ? `Font "${newFont}" is not available; choose one of: ${avail.join(', ')}`
        : 'No selectable fonts are available on this machine; omit the font parameter',
      summary,
    )
  }
  const found = await locateParagraph(deps, r.origIdx, anchor)
  if ('bad' in found) return err(found.bad, summary)
  const block = found.block
  const size = newFontSize ?? block.fontSize
  const widthPt = block.rect[2] - block.rect[0]
  // Measure with the face that will actually be embedded: an explicit font choice
  // wraps in that face's CSS family (same as the UI commit path), else the body font
  const cssFamily =
    (newFont ? EDIT_FONTS.find((f) => f.id === newFont)?.css : undefined) ??
    getComputedStyle(document.body).fontFamily
  const bold = input.bold === true ? true : undefined
  const italic = input.italic === true ? true : undefined
  const cssStyle = `${italic ? 'italic ' : ''}${bold ? 'bold' : ''}`.trim()
  const lines = newText
    .split('\n')
    .flatMap((p) => (p.trim() ? wrapText(p, widthPt, size, cssFamily, cssStyle) : []))
  const reason = await deps.editText({
    pageIndex: r.origIdx,
    rect: block.rect,
    oldText: joinBlockLines(block.lines.map((l) => l.text)),
    newText: lines.join('\n'),
    fontSize: block.fontSize,
    newFontSize,
    newColor,
    newFont,
    newBold: bold,
    newItalic: italic,
    origin: [block.rect[0], block.lines[0]!.y],
    lineLeading: block.lineHeight * (size / block.fontSize),
    lineXOffsets:
      block.align === 'left'
        ? undefined
        : lines.map((l) => {
            const slack = widthPt - measurePt(l, size, cssFamily, cssStyle)
            return Math.max(0, block.align === 'center' ? slack / 2 : slack)
          }),
    align: block.align === 'left' ? undefined : block.align,
  })
  if (reason) return err(`The edit could not be applied: ${reason}`, summary)
  deps.gotoPage(r.origIdx + 1)
  return {
    output: `Replaced the paragraph containing "${anchor}" on page ${r.origIdx + 1} with ${lines.length} reflowed line(s) (unsaved; the user saves with ⌘S).`,
    mutated: true,
    summary,
  }
}

/** Shift one clustered paragraph by a display-space delta, keeping its text */
async function moveTextBlock(deps: PdfAiDeps, input: Record<string, unknown>): Promise<ToolExecution> {
  const summary = `Move paragraph on page ${Number(input.page)}`
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const r = resolvePage(deps, input.page)
  if ('bad' in r) return err(r.bad, summary)
  const anchor = String(input.paragraph_text ?? '').trim()
  const dx = Number(input.dx)
  const dy = Number(input.dy)
  if (!anchor) return err('paragraph_text must not be empty', summary)
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return err('dx and dy must be numbers', summary)
  const g = deps.pageGeom(r.origIdx)
  if (!g) return err('Document not ready', summary)
  const found = await locateParagraph(deps, r.origIdx, anchor)
  if ('bad' in found) return err(found.bad, summary)
  const block = found.block
  const size = block.fontSize
  const widthPt = block.rect[2] - block.rect[0]
  const cssFamily = getComputedStyle(document.body).fontFamily
  const lines = joinBlockLines(block.lines.map((l) => l.text))
    .split('\n')
    .flatMap((p) => (p.trim() ? wrapText(p, widthPt, size, cssFamily) : []))
  // Display-space shift mapped back to PDF space, so page rotation is honored
  const [vx, vy] = pdfToView(g, block.rect[0], block.lines[0]!.y)
  const origin = viewToPdf(g, vx + dx, vy + dy)
  const reason = await deps.editText({
    pageIndex: r.origIdx,
    rect: block.rect,
    oldText: joinBlockLines(block.lines.map((l) => l.text)),
    newText: lines.join('\n'),
    fontSize: block.fontSize,
    origin,
    lineLeading: block.lineHeight,
    lineXOffsets:
      block.align === 'left'
        ? undefined
        : lines.map((l) => {
            const slack = widthPt - measurePt(l, size, cssFamily)
            return Math.max(0, block.align === 'center' ? slack / 2 : slack)
          }),
    align: block.align === 'left' ? undefined : block.align,
  })
  if (reason) return err(`The move could not be applied: ${reason}`, summary)
  deps.gotoPage(r.origIdx + 1)
  return {
    output: `Moved the paragraph containing "${anchor}" on page ${r.origIdx + 1} (unsaved; the user saves with ⌘S).`,
    mutated: true,
    summary,
  }
}

// ── Image tools ─────────────────────────────────────────────────────
// Model-facing coordinates are display-space points: what the user sees, with a
// top-left origin and page rotation applied (viewToPdf/pdfRectToCss, same as the
// UI edit path). Rects handed to deps stay in PDF user space (y-up, unrotated).

const IMAGE_GAP_PT = 8
const px2pt = (px: number) => (px * 72) / 96
const fmt = (n: number) => String(Math.round(n))

/** PDF-space rect → display-space box at scale 1 */
const dispBox = (geom: PageGeom, rect: readonly [number, number, number, number]) =>
  pdfRectToCss(geom, rect, 1)

/** Display-space box (top-left origin) → PDF user-space rect */
function dispToPdfRect(
  geom: PageGeom,
  left: number,
  top: number,
  w: number,
  h: number,
): [number, number, number, number] {
  const [ax, ay] = viewToPdf(geom, left, top)
  const [bx, by] = viewToPdf(geom, left + w, top + h)
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]
}

/** Stable per-page numbering: top-to-bottom, then left-to-right, as displayed */
const sortImageRefs = (refs: PageImageRef[], geom: PageGeom): PageImageRef[] =>
  [...refs].sort((a, b) => {
    const da = dispBox(geom, a.rect)
    const db = dispBox(geom, b.rect)
    return da.top - db.top || da.left - db.left
  })

function describeImage(ref: PageImageRef, geom: PageGeom, n: number, claimed: boolean): string {
  const d = dispBox(geom, ref.rect)
  const state = claimed ? ' : has a pending unsaved edit' : ''
  return `  image ${n}: ${fmt(d.width)} × ${fmt(d.height)} pt at x=${fmt(d.left)}, y=${fmt(d.top)}, ${
    ref.aboveText ? 'above' : 'below'
  } the text${state}`
}

async function listPageImagesTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = t('aiToolListImages')
  let only: number | null = null
  if (input.page !== undefined) {
    const r = resolvePage(deps, input.page)
    if ('bad' in r) return err(r.bad, summary)
    only = r.origIdx
  }
  const refs = await deps.listImages()
  const byPage = new Map<number, PageImageRef[]>()
  for (const ref of refs) {
    if (deps.isDeleted(ref.pageIndex) || (only !== null && ref.pageIndex !== only)) continue
    byPage.set(ref.pageIndex, [...(byPage.get(ref.pageIndex) ?? []), ref])
  }
  const lines: string[] = []
  for (const [pageIdx, group] of [...byPage].sort((a, b) => a[0] - b[0])) {
    const geom = deps.pageGeom(pageIdx)
    if (!geom) continue
    const size = geomDispSize(geom)
    lines.push(`Page ${pageIdx + 1} (${fmt(size.width)} × ${fmt(size.height)} pt):`)
    sortImageRefs(group, geom).forEach((ref, i) =>
      lines.push(describeImage(ref, geom, i + 1, deps.isImageClaimed(ref))),
    )
  }
  return {
    output:
      lines.join('\n') ||
      (only !== null
        ? `Page ${only + 1} has no embedded images (unsaved inserts from this session are not listed)`
        : 'The document has no embedded images (unsaved inserts from this session are not listed)'),
    summary,
  }
}

/** page + 1-based listing number → the actual image, using the same ordering as the listing */
async function resolveImageRef(
  deps: PdfAiDeps,
  origIdx: number,
  geom: PageGeom,
  rawNumber: unknown,
): Promise<PageImageRef | string> {
  const n = Number(rawNumber)
  if (!Number.isInteger(n) || n < 1) return 'image_number must be a positive integer'
  const onPage = sortImageRefs(
    (await deps.listImages()).filter((ref) => ref.pageIndex === origIdx),
    geom,
  )
  if (onPage.length === 0)
    return `Page ${origIdx + 1} has no embedded images; note that unsaved inserts cannot be edited`
  const ref = onPage[n - 1]
  if (!ref)
    return `Page ${origIdx + 1} only has ${onPage.length} image(s); call list_page_images to see them`
  if (deps.isImageClaimed(ref))
    return `Image ${n} on page ${origIdx + 1} already has a pending unsaved edit; it cannot be edited again before the user saves`
  return ref
}

async function webSearchTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const q = String(input.query ?? '').trim()
  const summary = `Web search "${q}"`
  if (!q) return err('query must not be empty', summary)
  const r = await deps.searchWeb(q, Number(input.maxResults) || 6)
  if (r.method === 'error') {
    return err(`web search failed: ${r.error ?? 'unknown error'}`, summary)
  }
  const lines: string[] = []
  if (r.answer) lines.push(`Direct answer: ${r.answer}\n`)
  r.results.forEach((it, i) => lines.push(`${i + 1}. ${it.title}\n   ${it.url}\n   ${it.snippet}`))
  return { output: lines.join('\n') || '(no results)', summary }
}

/** pdf.js AnnotationType codes for the markup subtypes ReveLith tracks (same as the renderer's loader) */
const MARKUP_ANNOT_TYPE: Record<number, MarkupType> = {
  9: 'highlight',
  10: 'underline',
  12: 'strikeout',
}

/** Saved text markups on one page, read straight from the open document (mirrors the renderer's lazy loader) */
async function savedMarkupsOnPage(
  deps: PdfAiDeps,
  page: number,
): Promise<Array<{ objNum: number; type: MarkupType }>> {
  const doc = deps.doc()
  if (!doc) return []
  try {
    const pdfPage = await doc.getPage(page)
    const annots = (await pdfPage.getAnnotations()) as {
      id: string
      annotationType: number
    }[]
    if (typeof pdfPage.cleanup === 'function') pdfPage.cleanup()
    const out: Array<{ objNum: number; type: MarkupType }> = []
    for (const a of annots) {
      const type = MARKUP_ANNOT_TYPE[a.annotationType]
      const objNum = /^(\d+)R$/.exec(a.id)
      if (type && objNum) out.push({ objNum: Number(objNum[1]), type })
    }
    return out
  } catch {
    return []
  }
}

/** Saved sticky notes on one page (contents only; ReveLith renders its own pins, so file notes are read-only) */
async function savedNotesOnPage(
  deps: PdfAiDeps,
  page: number,
): Promise<Array<{ objNum: number; contents: string }>> {
  const doc = deps.doc()
  if (!doc) return []
  try {
    const pdfPage = await doc.getPage(page)
    const annots = (await pdfPage.getAnnotations()) as {
      id: string
      annotationType: number
      contents?: unknown
    }[]
    if (typeof pdfPage.cleanup === 'function') pdfPage.cleanup()
    const out: Array<{ objNum: number; contents: string }> = []
    for (const a of annots) {
      if (a.annotationType !== 1 || typeof a.contents !== 'string' || !a.contents.trim()) continue
      const objNum = /^(\d+)R$/.exec(a.id)
      if (!objNum) continue
      out.push({ objNum: Number(objNum[1]), contents: a.contents })
    }
    return out
  } catch {
    return []
  }
}

async function readAnnotations(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Read annotations'
  const total = deps.pageCount()
  const start = input.start === undefined ? 1 : Number(input.start)
  const end = input.end === undefined ? total : Number(input.end)
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || start > total) {
    return err(`Invalid page range (document has ${total} pages)`, summary)
  }
  const last = Math.min(end, total)
  if (last - start > 49) {
    return err('Range too wide; read at most 50 pages per call', summary)
  }
  const pendingMarkups = deps.listPendingMarkups()
  const pendingNotes = deps.listPendingNotes()
  const lines: string[] = []
  for (let n = start; n <= last; n++) {
    const parts: string[] = []
    for (const m of pendingMarkups.filter((m) => m.page === n)) {
      parts.push(`- [pending ${m.type}] id=P${m.id}`)
    }
    for (const note of pendingNotes.filter((p) => p.page === n)) {
      const preview = note.contents.replace(/\s+/g, ' ').slice(0, 120)
      const replies = note.replyCount > 0 ? ` (${note.replyCount} replies)` : ''
      parts.push(`- [pending note] id=N${note.id} "${preview}"${replies}`)
    }
    for (const s of await savedMarkupsOnPage(deps, n)) {
      parts.push(`- [saved ${s.type}] id=S${s.objNum}`)
    }
    for (const note of await savedNotesOnPage(deps, n)) {
      const preview = note.contents.replace(/\s+/g, ' ').slice(0, 120)
      parts.push(`- [saved note] id=S${note.objNum} "${preview}" (read-only)`)
    }
    if (parts.length > 0) lines.push(`[Page ${n}]\n${parts.join('\n')}`)
  }
  return { output: lines.join('\n\n') || '(no notes or markups in this range)', summary }
}

async function addNoteTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = `Add note on page ${Number(input.page)}`
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const r = resolvePage(deps, input.page)
  if ('bad' in r) return err(r.bad, summary)
  const text = String(input.text ?? '').trim()
  if (!text) return err('text must not be empty', summary)
  let at: [number, number] | null = null
  const anchor = String(input.anchor_text ?? '').trim()
  if (anchor) {
    const indexPromise = deps.searchIndex()
    if (!indexPromise) return err('Document not ready', summary)
    const entry = (await indexPromise)[r.origIdx]
    if (!entry) return err('Document not ready', summary)
    const occ = Number(input.occurrence) || 1
    const found = locateOccurrence(entry, anchor, occ)
    if (!found) {
      return err(
        `"${anchor}" not found on page ${r.origIdx + 1}; use read_pages to verify the exact text`,
        summary,
      )
    }
    at = [found.rect[2], found.rect[3]]
  } else {
    const x = Number(input.x)
    const y = Number(input.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return err('pass anchor_text or explicit x/y in PDF points', summary)
    }
    at = [x, y]
  }
  deps.addNote(r.origIdx + 1, at, text)
  deps.gotoPage(r.origIdx + 1)
  return { output: `Note added on page ${r.origIdx + 1} (unsaved; the user saves with ⌘S)`, mutated: true, summary }
}

async function editNoteTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Edit note'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const id = String(input.note_id ?? '').replace(/^N/, '')
  const text = String(input.text ?? '').trim()
  if (!id) return err('note_id must not be empty', summary)
  if (!text) return err('text must not be empty', summary)
  if (!deps.editNote(id, text)) {
    return err(
      `Unknown note "${String(input.note_id)}"; use read_annotations for pending note ids (only notes queued this session can be edited)`,
      summary,
    )
  }
  return { output: 'Note updated (unsaved)', mutated: true, summary }
}

async function replyNoteTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Reply to note'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const id = String(input.note_id ?? '').replace(/^N/, '')
  const text = String(input.text ?? '').trim()
  if (!id) return err('note_id must not be empty', summary)
  if (!text) return err('text must not be empty', summary)
  if (!deps.replyNote(id, 'AI Assistant', text)) {
    return err(
      `Unknown note "${String(input.note_id)}"; use read_annotations for pending note ids (only notes queued this session take replies)`,
      summary,
    )
  }
  return { output: 'Reply added (unsaved; the user saves with ⌘S)', mutated: true, summary }
}

async function deleteMarkupTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Delete markup'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const raw = String(input.markup_id ?? '')
  const r = resolvePage(deps, input.page)
  if ('bad' in r) return err(r.bad, summary)
  if (raw.startsWith('P')) {
    if (!deps.deletePendingMarkup(raw.slice(1))) {
      return err(`Unknown markup "${raw}"; use read_annotations for pending markup ids`, summary)
    }
    return { output: 'Pending markup removed', mutated: true, summary }
  }
  if (raw.startsWith('S')) {
    const objNum = Number(raw.slice(1))
    if (!Number.isInteger(objNum)) return err(`Invalid markup id "${raw}"`, summary)
    const reason = await deps.deleteSavedMarkup(r.origIdx + 1, objNum)
    if (reason) return err(reason, summary)
    return { output: `Saved markup removed from page ${r.origIdx + 1} (unsaved)`, mutated: true, summary }
  }
  return err(`Invalid markup id "${raw}"; use read_annotations for markup ids`, summary)
}

async function deleteNoteTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Delete note'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const id = String(input.note_id ?? '').replace(/^N/, '')
  if (!id) return err('note_id must not be empty', summary)
  if (!deps.deleteNote(id)) {
    return err(
      `Unknown note "${String(input.note_id)}"; use read_annotations for pending note ids (only notes queued this session can be deleted)`,
      summary,
    )
  }
  return { output: 'Note discarded', mutated: true, summary }
}

/** #RRGGBB → 0-255 RGB triple (same mapping as the text-edit color path) */
function hexToRgb255(hex: string): [number, number, number] | null {
  const m = HEX_COLOR.exec(hex.trim())
  if (!m) return null
  const v = Number.parseInt(m[1]!, 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

async function insertTextTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = `Insert text on page ${Number(input.page)}`
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const r = resolvePage(deps, input.page)
  if ('bad' in r) return err(r.bad, summary)
  const text = String(input.text ?? '').trim()
  if (!text) return err('text must not be empty', summary)
  const x = Number(input.x)
  const y = Number(input.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return err('x and y must be numbers (points from the page top-left as displayed)', summary)
  }
  const g = deps.pageGeom(r.origIdx)
  if (!g) return err('Document not ready', summary)
  const fontSize = Number(input.font_size) || 14
  if (!(fontSize >= 4 && fontSize <= 144)) {
    return err('font_size must be between 4 and 144', summary)
  }
  const colorHex = String(input.color ?? '#111111')
  const color = hexToRgb255(colorHex)
  if (!color) return err(`Invalid color "${colorHex}"; use #RRGGBB`, summary)
  const align = String(input.align ?? 'left')
  if (align !== 'left' && align !== 'center' && align !== 'right') {
    return err(`Invalid align "${align}"`, summary)
  }
  // Same wrapping the click-to-place flow applies: hard breaks stay, long
  // paragraphs wrap to max_width, per-line offsets carry the alignment
  const disp = geomDispSize(g)
  const maxWidth = Math.max(200, Number(input.max_width) || disp.width - 144)
  const family = 'Helvetica, Arial, sans-serif'
  const wrapped = text.split('\n').flatMap((para) => wrapText(para, maxWidth, fontSize, family))
  const lineXOffsets = wrapped.map((line) =>
    align === 'left' ? 0 : measurePt(line, fontSize, family) * (align === 'center' ? -0.5 : -1),
  )
  deps.insertTextBlock({
    pageIndex: r.origIdx,
    origin: viewToPdf(g, x, y),
    text: wrapped.join('\n'),
    fontSize,
    color,
    lineLeading: fontSize * 1.2,
    lineXOffsets,
    align,
    rotate: ((g.rot % 360) + 360) % 360,
  })
  deps.gotoPage(r.origIdx + 1)
  return {
    output: `Text inserted on page ${r.origIdx + 1} (unsaved; the user saves with ⌘S)`,
    mutated: true,
    summary,
  }
}

async function listInsertedText(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'List inserted text'
  const all = deps.listTextInserts()
  const page = input.page === undefined ? null : Number(input.page)
  if (page !== null && (!Number.isInteger(page) || page < 1 || page > deps.pageCount())) {
    return err(`Invalid page (document has ${deps.pageCount()} pages)`, summary)
  }
  const rows = all
    .filter((b) => page === null || b.page === page)
    .map((b) => `- id=T${b.id} [Page ${b.page}] "${b.text.replace(/\s+/g, ' ').slice(0, 120)}"`)
  return { output: rows.join('\n') || '(no unsaved inserted text blocks)', summary }
}

async function editInsertedText(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Edit inserted text'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const id = String(input.block_id ?? '').replace(/^T/, '')
  if (!id) return err('block_id must not be empty', summary)
  const patch: { text?: string; fontSize?: number; color?: [number, number, number]; align?: 'left' | 'center' | 'right' } = {}
  if (input.text !== undefined) {
    const text = String(input.text).trim()
    if (!text) return err('text must not be empty', summary)
    patch.text = text
  }
  if (input.font_size !== undefined) {
    const fontSize = Number(input.font_size)
    if (!(fontSize >= 4 && fontSize <= 144)) return err('font_size must be between 4 and 144', summary)
    patch.fontSize = fontSize
  }
  if (input.color !== undefined) {
    const color = hexToRgb255(String(input.color))
    if (!color) return err(`Invalid color "${String(input.color)}"; use #RRGGBB`, summary)
    patch.color = color
  }
  if (input.align !== undefined) {
    const align = String(input.align)
    if (align !== 'left' && align !== 'center' && align !== 'right') {
      return err(`Invalid align "${align}"`, summary)
    }
    patch.align = align
  }
  if (!deps.editTextInsert(id, patch)) {
    return err(
      `Unknown block "${String(input.block_id)}"; use list_inserted_text for ids (only unsaved blocks can be edited)`,
      summary,
    )
  }
  return { output: 'Inserted text updated (unsaved)', mutated: true, summary }
}

async function moveInsertedText(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Move inserted text'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const id = String(input.block_id ?? '').replace(/^T/, '')
  const dx = Number(input.dx)
  const dy = Number(input.dy)
  if (!id) return err('block_id must not be empty', summary)
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return err('dx and dy must be numbers', summary)
  if (!deps.moveTextInsert(id, dx, dy)) {
    return err(
      `Unknown block "${String(input.block_id)}"; use list_inserted_text for ids (only unsaved blocks can be moved)`,
      summary,
    )
  }
  return { output: 'Inserted text moved (unsaved)', mutated: true, summary }
}

async function deleteInsertedText(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Delete inserted text'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const id = String(input.block_id ?? '').replace(/^T/, '')
  if (!id) return err('block_id must not be empty', summary)
  if (!deps.deleteTextInsert(id)) {
    return err(
      `Unknown block "${String(input.block_id)}"; use list_inserted_text for ids (only unsaved blocks can be deleted)`,
      summary,
    )
  }
  return { output: 'Inserted text discarded', mutated: true, summary }
}

/** Decode a base64 PNG into pixels (same glue as the renderer's bake pipeline) */
function decodePngPixels(b64: string): Promise<PixelImage | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      if (!ctx || !w || !h) return resolve(null)
      ctx.drawImage(img, 0, 0)
      try {
        const d = ctx.getImageData(0, 0, w, h)
        resolve({ data: d.data, width: w, height: h })
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = `data:image/png;base64,${b64}`
  })
}

function encodePixels(
  data: Uint8ClampedArray<ArrayBufferLike>,
  w: number,
  h: number,
): string | null {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx || !w || !h) return null
  // Fresh ArrayBuffer-backed copy: DOM ImageData rejects SharedArrayBuffer views
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0)
  return c.toDataURL('image/png').split(',')[1] ?? null
}

/** page + image_number → claimed-checked ref, using the same ordering as the listing */
async function bakeTarget(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<{ ref: PageImageRef } | { bad: string }> {
  const r = resolvePage(deps, input.page)
  if ('bad' in r) return r
  const geom = deps.pageGeom(r.origIdx)
  if (!geom) return { bad: 'Document not ready' }
  const ref = await resolveImageRef(deps, r.origIdx, geom, input.image_number)
  if (typeof ref === 'string') return { bad: ref }
  return { ref }
}

async function flipImageTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Flip image'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const direction = String(input.direction)
  if (direction !== 'horizontal' && direction !== 'vertical') {
    return err('direction must be "horizontal" or "vertical"', summary)
  }
  const target = await bakeTarget(deps, input)
  if ('bad' in target) return err(target.bad, summary)
  const b64 = await deps.bakeImagePixels(target.ref.pageIndex + 1, target.ref.rect)
  if (!b64) return err('Could not render that image (the file may be unreadable)', summary)
  const img = await decodePngPixels(b64)
  if (!img) return err('Could not decode that image', summary)
  const png = encodePixels(flipPixels(img, direction === 'horizontal' ? 'h' : 'v'), img.width, img.height)
  if (!png) return err('Could not encode the flipped image', summary)
  deps.bakeReplace(target.ref, png)
  return { output: `Image flipped ${direction}ly (unsaved; the user saves with ⌘S)`, mutated: true, summary }
}

async function cropImageTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Crop image'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const crop: CropFractions = {
    l: Number(input.left),
    t: Number(input.top),
    r: Number(input.right),
    b: Number(input.bottom),
  }
  if (![crop.l, crop.t, crop.r, crop.b].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) {
    return err('left/top/right/bottom must each be 0..1 fractions of the displayed image', summary)
  }
  if (!(crop.l < crop.r && crop.t < crop.b)) {
    return err('kept region must have left < right and top < bottom', summary)
  }
  if ((crop.r - crop.l) * (crop.b - crop.t) < 0.0025) {
    return err('kept region is too small (under 0.25% of the image)', summary)
  }
  const target = await bakeTarget(deps, input)
  if ('bad' in target) return err(target.bad, summary)
  const b64 = await deps.bakeImagePixels(target.ref.pageIndex + 1, target.ref.rect)
  if (!b64) return err('Could not render that image (the file may be unreadable)', summary)
  const img = await decodePngPixels(b64)
  if (!img) return err('Could not decode that image', summary)
  const x0 = Math.floor(crop.l * img.width)
  const x1 = Math.ceil(crop.r * img.width)
  const y0 = Math.floor(crop.t * img.height)
  const y1 = Math.ceil(crop.b * img.height)
  if (x1 - x0 < 1 || y1 - y0 < 1) return err('kept region is empty at this resolution', summary)
  const src = document.createElement('canvas')
  src.width = img.width
  src.height = img.height
  const sctx = src.getContext('2d')
  if (!sctx) return err('Could not process that image', summary)
  sctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0)
  const out = document.createElement('canvas')
  out.width = x1 - x0
  out.height = y1 - y0
  const octx = out.getContext('2d')
  if (!octx) return err('Could not process that image', summary)
  octx.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0)
  const png = out.toDataURL('image/png').split(',')[1]
  if (!png) return err('Could not encode the cropped image', summary)
  deps.bakeReplace(target.ref, png, crop)
  return { output: 'Image cropped (unsaved; the user saves with ⌘S)', mutated: true, summary }
}

async function setImageOpacityTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Set image opacity'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const opacity = Number(input.opacity)
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) {
    return err('opacity must be 0..100 (100 = fully opaque)', summary)
  }
  const target = await bakeTarget(deps, input)
  if ('bad' in target) return err(target.bad, summary)
  const b64 = await deps.bakeImagePixels(target.ref.pageIndex + 1, target.ref.rect)
  if (!b64) return err('Could not render that image (the file may be unreadable)', summary)
  const img = await decodePngPixels(b64)
  if (!img) return err('Could not decode that image', summary)
  const png = encodePixels(multiplyAlpha(img, opacity / 100), img.width, img.height)
  if (!png) return err('Could not encode the faded image', summary)
  deps.bakeReplace(target.ref, png)
  return { output: `Image opacity set to ${opacity}% (unsaved; the user saves with ⌘S)`, mutated: true, summary }
}

async function removeImageBackgroundTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Remove image background'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const tolerance = input.tolerance === undefined ? 32 : Number(input.tolerance)
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 100) {
    return err('tolerance must be 0..100', summary)
  }
  const target = await bakeTarget(deps, input)
  if ('bad' in target) return err(target.bad, summary)
  const b64 = await deps.bakeImagePixels(target.ref.pageIndex + 1, target.ref.rect)
  if (!b64) return err('Could not render that image (the file may be unreadable)', summary)
  const img = await decodePngPixels(b64)
  if (!img) return err('Could not decode that image', summary)
  const cut = removeBackground(img, tolerance)
  if (cut.removedCount === 0) {
    return err('No background found (nothing edge-connected matched the tolerance; try a higher tolerance)', summary)
  }
  const png = encodePixels(cut.data, img.width, img.height)
  if (!png) return err('Could not encode the cut-out image', summary)
  deps.bakeReplace(target.ref, png)
  return {
    output: `Background removed (${cut.removedCount} pixels; unsaved; the user saves with ⌘S)`,
    mutated: true,
    summary,
  }
}

async function imageSearchTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const query = String(input.query ?? '').trim()
  const summary = t('aiToolImageSearch', { query })
  if (!query) return err('query must not be empty', summary)
  const r = await deps.searchImages(query, Number(input.max_results) || 8)
  // a backend failure must not read as an empty gallery : the model would fabricate image choices
  if (r.method === 'error') {
    return err(
      `image search failed (service error, not an empty result : you may retry): ${r.error ?? 'unknown error'}`,
      summary,
    )
  }
  const lines = r.images.map(
    (im, i) =>
      `${i + 1}. ${im.title || '(untitled)'} [${im.width ?? '?'}x${im.height ?? '?'}]\n   ${im.imageUrl}`,
  )
  return { output: lines.join('\n') || '(no images found)', summary }
}

async function generateImageTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = t('aiToolGenImage')
  const prompt = String(input.prompt ?? '').trim()
  if (!prompt) return err('prompt must not be empty', summary)
  const r = await deps.generateImage({
    prompt,
    aspectRatio: input.aspect_ratio === undefined ? undefined : String(input.aspect_ratio),
  })
  if (!r.url) return err(`image generation failed: ${r.error ?? 'unknown error'}`, summary)
  return {
    output: `Generated image URL: ${r.url}\nInsert it into the document with insert_image.`,
    summary,
  }
}

async function insertImageTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolExecution> {
  const summary = t('aiToolInsertImage', { page: Number(input.page) })
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const r = resolvePage(deps, input.page)
  if ('bad' in r) return err(r.bad, summary)
  const url = String(input.url ?? '')
  if (!/^https?:\/\//.test(url))
    return err('invalid url; pass an imageUrl from image_search or generate_image', summary)
  const geom = deps.pageGeom(r.origIdx)
  if (!geom) return err('Document not ready', summary)
  const size = geomDispSize(geom)
  const fetched = await deps.fetchImage(url)
  // never write after the user hit stop (the download may resolve long after the abort)
  if (signal?.aborted) return err('stopped by the user; the image was not inserted', summary)
  if (!fetched)
    return err(
      'downloading the image failed (it may not be accessible); try another search result or regenerate',
      summary,
    )

  let w: number
  if (input.width !== undefined) {
    w = Number(input.width)
    if (!(w > 0)) return err('width must be a positive number', summary)
  } else {
    w = Math.min(px2pt(fetched.width), size.width / 2)
  }
  let h = (w * fetched.height) / fetched.width
  // never overflow the page box
  const fitK = Math.min(1, size.width / w, size.height / h)
  w *= fitK
  h *= fitK

  // top-left-origin position (tx from left, ty from page top)
  let tx: number
  let ty: number
  const anchor = String(input.anchor_text ?? '').trim()
  if (anchor) {
    const indexPromise = deps.searchIndex()
    if (!indexPromise) return err('Document not ready', summary)
    const entry = (await indexPromise)[r.origIdx]
    const located = entry ? locateOccurrence(entry, anchor, 1) : null
    if (!located) {
      return err(
        `"${anchor}" not found on page ${r.origIdx + 1}; use read_pages to verify the exact text`,
        summary,
      )
    }
    const a = dispBox(geom, located.rect)
    const placement = String(input.placement ?? 'below')
    if (placement === 'above') {
      tx = a.left
      ty = a.top - IMAGE_GAP_PT - h
    } else if (placement === 'right') {
      tx = a.left + a.width + IMAGE_GAP_PT
      ty = a.top + a.height / 2 - h / 2
    } else if (placement === 'left') {
      tx = a.left - IMAGE_GAP_PT - w
      ty = a.top + a.height / 2 - h / 2
    } else {
      tx = a.left
      ty = a.top + a.height + IMAGE_GAP_PT
    }
  } else if (input.x !== undefined || input.y !== undefined) {
    tx = Number(input.x ?? 0)
    ty = Number(input.y ?? 0)
    if (!Number.isFinite(tx) || !Number.isFinite(ty))
      return err('x and y must be numbers (points from the page top-left as displayed)', summary)
  } else {
    tx = (size.width - w) / 2
    ty = (size.height - h) / 2
  }
  tx = Math.min(Math.max(tx, 0), size.width - w)
  ty = Math.min(Math.max(ty, 0), size.height - h)

  const rect = dispToPdfRect(geom, tx, ty, w, h)
  const layer: ImageLayer = input.layer === 'above_text' ? 'aboveText' : 'belowText'
  deps.insertImage(r.origIdx, fetched.png, rect, layer)
  deps.gotoPage(r.origIdx + 1)
  return {
    output: `Inserted the image on page ${r.origIdx + 1}: ${fmt(w)} × ${fmt(h)} pt at x=${fmt(tx)}, y=${fmt(ty)}, ${
      layer === 'aboveText' ? 'above' : 'below'
    } the text (unsaved; the user can drag/resize it, undo with ⌘Z, save with ⌘S).`,
    mutated: true,
    summary,
  }
}

async function transformImageTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolExecution> {
  const summary = t('aiToolMoveImage', { page: Number(input.page) })
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const r = resolvePage(deps, input.page)
  if ('bad' in r) return err(r.bad, summary)
  const geom = deps.pageGeom(r.origIdx)
  if (!geom) return err('Document not ready', summary)
  const size = geomDispSize(geom)
  const ref = await resolveImageRef(deps, r.origIdx, geom, input.image_number)
  if (signal?.aborted) return err('stopped by the user; nothing was changed', summary)
  if (typeof ref === 'string') return err(ref, summary)
  const cur = dispBox(geom, ref.rect)

  let w = input.width === undefined ? undefined : Number(input.width)
  let h = input.height === undefined ? undefined : Number(input.height)
  if ((w !== undefined && !(w > 0)) || (h !== undefined && !(h > 0)))
    return err('width/height must be positive numbers', summary)
  if (w === undefined && h === undefined) {
    w = cur.width
    h = cur.height
  } else {
    // one side given → keep the aspect ratio
    w ??= (h! * cur.width) / cur.height
    h ??= (w * cur.height) / cur.width
  }
  const fitK = Math.min(1, size.width / w, size.height / h)
  w *= fitK
  h *= fitK

  let tx = input.x === undefined ? cur.left : Number(input.x)
  let ty = input.y === undefined ? cur.top : Number(input.y)
  if (!Number.isFinite(tx) || !Number.isFinite(ty))
    return err('x and y must be numbers (points from the page top-left as displayed)', summary)
  tx = Math.min(Math.max(tx, 0), size.width - w)
  ty = Math.min(Math.max(ty, 0), size.height - h)

  const layer: ImageLayer | undefined =
    input.layer === undefined ? undefined : input.layer === 'above_text' ? 'aboveText' : 'belowText'
  deps.transformImage(ref, dispToPdfRect(geom, tx, ty, w, h), layer)
  deps.gotoPage(r.origIdx + 1)
  return {
    output: `Adjusted image ${Number(input.image_number)} on page ${r.origIdx + 1}: now ${fmt(w)} × ${fmt(h)} pt at x=${fmt(tx)}, y=${fmt(ty)}${
      layer ? `, moved ${layer === 'aboveText' ? 'above' : 'below'} the text` : ''
    } (unsaved; the user saves with ⌘S).`,
    mutated: true,
    summary,
  }
}

async function rotateImageTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolExecution> {
  const summary = t('aiToolRotateImage', { page: Number(input.page) })
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const r = resolvePage(deps, input.page)
  if ('bad' in r) return err(r.bad, summary)
  const geom = deps.pageGeom(r.origIdx)
  if (!geom) return err('Document not ready', summary)
  const ref = await resolveImageRef(deps, r.origIdx, geom, input.image_number)
  if (signal?.aborted) return err('stopped by the user; nothing was changed', summary)
  if (typeof ref === 'string') return err(ref, summary)
  const dir = input.direction === undefined ? 'cw' : String(input.direction)
  if (dir !== 'cw' && dir !== 'ccw' && dir !== '180')
    return err("direction must be 'cw', 'ccw' or '180'", summary)
  const turns = dir === 'cw' ? 1 : dir === 'ccw' ? 3 : 2
  const [x1, y1, x2, y2] = ref.rect
  const rect: [number, number, number, number] =
    turns % 2 === 1
      ? [
          (x1 + x2) / 2 - (y2 - y1) / 2,
          (y1 + y2) / 2 - (x2 - x1) / 2,
          (x1 + x2) / 2 + (y2 - y1) / 2,
          (y1 + y2) / 2 + (x2 - x1) / 2,
        ]
      : [x1, y1, x2, y2]
  deps.transformImage(ref, rect, undefined, turns)
  deps.gotoPage(r.origIdx + 1)
  return {
    output: `Rotated image ${Number(input.image_number)} on page ${r.origIdx + 1} ${
      dir === '180' ? '180°' : dir === 'cw' ? '90° clockwise' : '90° counter-clockwise'
    } about its center (unsaved; the user saves with ⌘S).`,
    mutated: true,
    summary,
  }
}

async function replaceImageTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolExecution> {
  const summary = t('aiToolReplaceImage', { page: Number(input.page) })
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const r = resolvePage(deps, input.page)
  if ('bad' in r) return err(r.bad, summary)
  const geom = deps.pageGeom(r.origIdx)
  if (!geom) return err('Document not ready', summary)
  const ref = await resolveImageRef(deps, r.origIdx, geom, input.image_number)
  if (typeof ref === 'string') return err(ref, summary)
  const url = String(input.url ?? '')
  if (!/^https?:\/\//.test(url)) return err('url must be a direct http(s) image link', summary)
  const fetched = await deps.fetchImage(url)
  if (signal?.aborted) return err('stopped by the user; nothing was changed', summary)
  if (!fetched)
    return err(
      'The image could not be downloaded or decoded (the link may be inaccessible or not a raster image); pick another result or generate a new one.',
      summary,
    )
  deps.replaceImage(ref, fetched.png)
  deps.gotoPage(r.origIdx + 1)
  return {
    output: `Replaced the pixels of image ${Number(input.image_number)} on page ${r.origIdx + 1} in place; footprint and z-order kept (unsaved; the user saves with ⌘S).`,
    mutated: true,
    summary,
  }
}

async function deleteImageTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolExecution> {
  const summary = t('aiToolDeleteImage', { page: Number(input.page) })
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const r = resolvePage(deps, input.page)
  if ('bad' in r) return err(r.bad, summary)
  const geom = deps.pageGeom(r.origIdx)
  if (!geom) return err('Document not ready', summary)
  const ref = await resolveImageRef(deps, r.origIdx, geom, input.image_number)
  if (signal?.aborted) return err('stopped by the user; nothing was changed', summary)
  if (typeof ref === 'string') return err(ref, summary)
  deps.deleteImage(ref)
  deps.gotoPage(r.origIdx + 1)
  return {
    output: `Deleted image ${Number(input.image_number)} on page ${r.origIdx + 1} (unsaved; the user can undo with ⌘Z and saves with ⌘S).`,
    mutated: true,
    summary,
  }
}

/** Whole-document form field inventory (radios aggregate exportValue lists by field name) */
async function collectFields(
  doc: PDFDocumentProxy,
): Promise<Map<string, { kind: string; page: number; value: string; options: string[] }>> {
  const catalog = await buildFormCatalog(doc)
  const fields = new Map<string, { kind: string; page: number; value: string; options: string[] }>()
  for (const field of catalog.fields.values()) {
    if (field.readOnly || field.kind === 'signature') continue
    fields.set(field.name, {
      kind: field.kind,
      page: field.pageIndex + 1,
      value: field.kind === 'checkbox' ? String(field.checked) : field.value,
      options: field.options,
    })
  }
  return fields
}

async function listFormFields(deps: PdfAiDeps): Promise<ToolExecution> {
  const doc = deps.doc()
  if (!doc) return err('Document not ready', t('aiToolFields', { count: 0 }))
  const fields = await collectFields(doc)
  const edits = deps.formEdits()
  const lines = [...fields].map(([name, f]) => {
    const edit = edits.get(name)
    const value = edit
      ? edit.kind === 'checkbox'
        ? String(!!edit.checked)
        : (edit.value ?? '')
      : f.value
    const opts = f.options.length > 0 ? ` options[${f.options.join(', ')}]` : ''
    return `${name} (${f.kind}, page ${f.page})${opts} current value: ${value || '(empty)'}`
  })
  return {
    output: lines.join('\n') || 'The document has no form fields',
    summary: t('aiToolFields', { count: fields.size }),
  }
}

async function fillFormField(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const name = String(input.name ?? '')
  const summary = t('aiToolFill', { name })
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const doc = deps.doc()
  if (!doc || !name) return err('Document not ready or name is empty', summary)
  const fields = await collectFields(doc)
  const field = fields.get(name)
  if (!field)
    return err(`No field named "${name}"; use list_form_fields to see the fields`, summary)
  let edit: FormValueInput
  if (field.kind === 'checkbox') {
    if (typeof input.checked !== 'boolean')
      return err('Checkbox requires the checked parameter', summary)
    edit = { name, kind: 'checkbox', checked: input.checked }
  } else {
    const value = String(input.value ?? '')
    if (field.kind !== 'text' && value && !field.options.includes(value)) {
      return err(
        `Value "${value}" is not among the options: [${field.options.join(', ')}]`,
        summary,
      )
    }
    edit = { name, kind: field.kind as 'text' | 'radio' | 'choice', value }
  }
  deps.applyFormEdit(edit)
  deps.gotoPage(field.page)
  return { output: `Filled ${name} (unsaved; the user saves with ⌘S)`, mutated: true, summary }
}

async function setWatermarkTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Set watermark'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const text = String(input.text ?? '')
  if (!text.trim()) {
    deps.setWatermark(null)
    return { output: 'Session watermark removed', mutated: true, summary }
  }
  const angle = input.angle === undefined ? DEFAULT_WATERMARK.angle : Number(input.angle)
  const opacity = input.opacity === undefined ? DEFAULT_WATERMARK.opacity * 100 : Number(input.opacity)
  const sizeRatio =
    input.size_ratio === undefined ? DEFAULT_WATERMARK.sizeRatio * 100 : Number(input.size_ratio)
  const color = String(input.color ?? DEFAULT_WATERMARK.color)
  if (!Number.isFinite(angle) || angle < -180 || angle > 180) {
    return err('angle must be -180..180', summary)
  }
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) {
    return err('opacity must be 0..100', summary)
  }
  if (!Number.isFinite(sizeRatio) || sizeRatio < 2 || sizeRatio > 50) {
    return err('size_ratio must be 2..50', summary)
  }
  if (!HEX_COLOR.test(color)) return err(`Invalid color "${color}"; use #RRGGBB`, summary)
  deps.setWatermark({ text, angle, opacity: opacity / 100, color, sizeRatio: sizeRatio / 100 })
  return { output: `Watermark "${text}" set (unsaved; the user saves with ⌘S)`, mutated: true, summary }
}

async function setHeaderFooterTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Set header/footer'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const str = (v: unknown) => (v === undefined ? '' : String(v))
  const hf: HeaderFooterConfig = {
    headerLeft: str(input.header_left),
    headerCenter: str(input.header_center),
    headerRight: str(input.header_right),
    footerLeft: str(input.footer_left),
    footerCenter: str(input.footer_center),
    footerRight: str(input.footer_right),
    pageNumber: input.page_number === undefined ? true : input.page_number === true,
    startAt: input.start_at === undefined ? 1 : Number(input.start_at),
    fontSize: input.font_size === undefined ? DEFAULT_HEADER_FOOTER.fontSize : Number(input.font_size),
    color: str(input.color) || DEFAULT_HEADER_FOOTER.color,
  }
  if (!Number.isInteger(hf.startAt) || hf.startAt < 1) {
    return err('start_at must be a positive integer', summary)
  }
  if (!Number.isFinite(hf.fontSize) || hf.fontSize < 6 || hf.fontSize > 72) {
    return err('font_size must be 6..72', summary)
  }
  if (!HEX_COLOR.test(hf.color)) return err(`Invalid color "${hf.color}"; use #RRGGBB`, summary)
  const empty =
    !hf.headerLeft && !hf.headerCenter && !hf.headerRight &&
    !hf.footerLeft && !hf.footerCenter && !hf.footerRight && !hf.pageNumber
  deps.setHeaderFooter(empty ? null : hf)
  return {
    output: empty ? 'Session header-footer removed' : 'Header-footer set (unsaved; the user saves with ⌘S)',
    mutated: true,
    summary,
  }
}

/** Validate one apply_ops batch and run it as a single undo step */
async function applyOps(deps: PdfAiDeps, input: Record<string, unknown>): Promise<ToolExecution> {
  const summary = 'Apply page operations'
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  if (!Array.isArray(input.operations) || input.operations.length === 0) {
    return err('operations must be a non-empty array', summary)
  }
  const doc = deps.doc()
  if (!doc) return err('Document not ready', summary)
  const total = deps.pageCount()
  const visible = deps.visiblePages()
  const fields = await collectFields(doc)
  const pendingIds = new Set(deps.listPendingMarkups().map((m) => `P${m.id}`))
  const pendingNotes = new Set(deps.listPendingNotes().map((p) => `N${p.id}`))
  const pendingBlocks = new Set(deps.listTextInserts().map((b) => `T${b.id}`))
  const ops: PageOp[] = []
  const notes: string[] = []
  const validPage = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= total

  for (const [i, raw] of (input.operations as unknown[]).entries()) {
    const o = (raw ?? {}) as Record<string, unknown>
    const tag = `#${i + 1} (${String(o.op)})`
    switch (o.op) {
      case 'rotate_pages': {
        const pages = Array.isArray(o.pages) ? o.pages : []
        if (pages.length === 0 || !pages.every(validPage)) {
          return err(`${tag}: pages must be 1..${total}`, summary)
        }
        if (o.direction !== 'left' && o.direction !== 'right') {
          return err(`${tag}: direction must be "left" or "right"`, summary)
        }
        ops.push({ kind: 'rotate', pages: pages as number[], dir: o.direction === 'left' ? -90 : 90 })
        notes.push(`rotated ${pages.length} page(s) ${o.direction}`)
        break
      }
      case 'delete_pages': {
        const pages = Array.isArray(o.pages) ? o.pages : []
        if (pages.length === 0 || !pages.every(validPage)) {
          return err(`${tag}: pages must be 1..${total}`, summary)
        }
        const remaining = visible.filter((p) => !(pages as number[]).includes(p)).length
        if (remaining < 1) return err(`${tag}: at least one page must remain`, summary)
        ops.push({ kind: 'delete', pages: pages as number[] })
        notes.push(`deleted ${pages.length} page(s)`)
        break
      }
      case 'set_page_order': {
        const order = Array.isArray(o.order) ? o.order : []
        const sorted = [...order].sort((a, b) => (a as number) - (b as number))
        const want = [...visible].sort((a, b) => a - b)
        if (
          order.length !== visible.length ||
          !order.every(validPage) ||
          sorted.some((v, k) => v !== want[k])
        ) {
          return err(`${tag}: order must list each visible page exactly once: [${visible.join(', ')}]`, summary)
        }
        ops.push({ kind: 'order', order: order as number[] })
        notes.push('reordered pages')
        break
      }
      case 'set_form_value': {
        const name = String(o.name ?? '')
        const field = fields.get(name)
        if (!name || !field) {
          return err(`${tag}: no field named "${name}"; use list_form_fields first`, summary)
        }
        let edit: FormValueInput
        if (field.kind === 'checkbox') {
          if (typeof o.checked !== 'boolean') return err(`${tag}: checkbox requires the checked parameter`, summary)
          edit = { name, kind: 'checkbox', checked: o.checked }
        } else {
          const value = String(o.value ?? '')
          if (field.kind !== 'text' && value && !field.options.includes(value)) {
            return err(`${tag}: value "${value}" is not among the options: [${field.options.join(', ')}]`, summary)
          }
          edit = { name, kind: field.kind as 'text' | 'radio' | 'choice', value }
        }
        ops.push({ kind: 'form', edit })
        notes.push(`set ${name}`)
        break
      }
      case 'set_metadata': {
        const metadata: MetadataInput = {}
        for (const k of ['title', 'author', 'subject', 'keywords'] as const) {
          if (o[k] !== undefined) metadata[k] = String(o[k])
        }
        if (Object.keys(metadata).length === 0) return err(`${tag}: pass at least one of title/author/subject/keywords`, summary)
        ops.push({ kind: 'metadata', metadata })
        notes.push('set document properties')
        break
      }
      case 'remove_markup': {
        const id = String(o.markup_id ?? '')
        if (id.startsWith('P')) {
          if (!pendingIds.has(id)) return err(`${tag}: unknown pending markup "${id}"`, summary)
          ops.push({ kind: 'removeMarkup', id: id.slice(1) })
        } else if (id.startsWith('S')) {
          const page = Number(o.page)
          const objNum = Number(id.slice(1))
          if (!Number.isInteger(page) || page < 1 || page > total || !Number.isInteger(objNum)) {
            return err(`${tag}: saved ids need the page they are on`, summary)
          }
          ops.push({ kind: 'removeSavedMarkup', page, objNum })
        } else {
          return err(`${tag}: invalid markup id "${id}"`, summary)
        }
        notes.push(`removed ${id}`)
        break
      }
      case 'remove_note': {
        const id = String(o.note_id ?? '')
        if (!pendingNotes.has(id)) {
          return err(`${tag}: unknown pending note "${id}" (only session notes can be removed)`, summary)
        }
        ops.push({ kind: 'removeNote', id: id.slice(1) })
        notes.push(`removed ${id}`)
        break
      }
      case 'remove_inserted_text': {
        const id = String(o.block_id ?? '')
        if (!pendingBlocks.has(id)) {
          return err(`${tag}: unknown inserted block "${id}" (only unsaved blocks can be removed)`, summary)
        }
        ops.push({ kind: 'removeInsert', id: id.slice(1) })
        notes.push(`removed ${id}`)
        break
      }
      default:
        return err(`${tag}: unknown op "${String(o.op)}"`, summary)
    }
  }

  // Saved-markup removals resolve against the file; fail the batch before mutating
  for (const op of ops) {
    if (op.kind === 'removeSavedMarkup') {
      const found = await savedMarkupsOnPage(deps, op.page)
      if (!found.some((s) => s.objNum === op.objNum)) {
        return err(`No saved markup S${op.objNum} on page ${op.page}`, summary)
      }
    }
  }

  await deps.applyPageOps(ops)
  return {
    output: `Applied ${ops.length} operation(s) as one undo step (unsaved): ${notes.join('; ')}`,
    mutated: true,
    summary,
  }
}
/** Pages for a file op: single `page` or `pages` (1-based as displayed) */
function fileOpPages(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): { pages: number[] } | { bad: string } {
  const raw = input.page !== undefined ? [input.page] : Array.isArray(input.pages) ? input.pages : []
  const total = deps.pageCount()
  const pages = raw.map(Number)
  if (pages.length === 0 || !pages.every((p) => Number.isInteger(p) && p >= 1 && p <= total)) {
    return { bad: `pages must be 1..${total}` }
  }
  return { pages }
}

/** Flush → run an immediate file rewrite → reload. Never chains without re-reading. */
async function runFilePageOp(
  deps: PdfAiDeps,
  summary: string,
  effect: string,
  input: Record<string, unknown>,
  run: () => Promise<FilePageOpResult>,
): Promise<ToolExecution> {
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  if (input.confirm !== true) {
    return {
      output:
        `${effect} This saves every unsaved change, then rewrites the file on disk immediately and cannot be undone. ` +
        `Describe this to the user in one plain sentence and only proceed when they confirm (then call again with confirm:true).`,
      summary,
    }
  }
  const path = deps.filePath()
  if (!path) return err('The document must be saved to a file first', summary)
  if (!(await deps.flushSave())) {
    return err('Could not save pending edits; resolve the save error first', summary)
  }
  const r = await run()
  if (!r.ok) return err(`File operation failed: ${r.error}`, summary)
  await deps.reloadAfterFileOp()
  return { output: 'ok', mutated: true, summary }
}

async function insertBlankPageTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Insert blank page'
  const after = Number(input.after_page)
  if (!Number.isInteger(after) || after < 0 || after > deps.pageCount()) {
    return err(`after_page must be 0..${deps.pageCount()}`, summary)
  }
  const size = (v: unknown): number | undefined => (v === undefined ? undefined : Number(v))
  const width = size(input.width)
  const height = size(input.height)
  if (
    (width !== undefined && !(width >= 36 && width <= 2880)) ||
    (height !== undefined && !(height >= 36 && height <= 2880))
  ) {
    return err('width/height must each be 36..2880 pt', summary)
  }
  if (width === undefined !== (height === undefined)) {
    return err('pass both width and height, or neither (neighbor size)', summary)
  }
  const done = await runFilePageOp(
    deps,
    summary,
    `I'll insert a blank page after page ${after} (this saves and rewrites the file).`,
    input,
    () => deps.fileInsertBlankPage(after - 1, width, height),
  )
  if (done.mutated) {
    return { output: `Blank page inserted after page ${after}; the document reloaded`, mutated: true, summary }
  }
  return done
}

async function setPageSizeTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Set page size'
  const pages = fileOpPages(deps, input)
  if ('bad' in pages) return err(pages.bad, summary)
  const width = Number(input.width)
  const height = Number(input.height)
  if (!(width >= 36 && width <= 2880 && height >= 36 && height <= 2880)) {
    return err('width/height must each be 36..2880 pt', summary)
  }
  const done = await runFilePageOp(
    deps,
    summary,
    `I'll resize ${pages.pages.length} page(s) to ${width} x ${height} pt (content stays bottom-left; this saves and rewrites the file).`,
    input,
    () => deps.fileSetPageSize(pages.pages.map((p) => p - 1), width, height),
  )
  if (done.mutated) {
    return { output: `Resized ${pages.pages.length} page(s); the document reloaded`, mutated: true, summary }
  }
  return done
}

async function cropPagesTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Crop pages'
  const pages = fileOpPages(deps, input)
  if ('bad' in pages) return err(pages.bad, summary)
  const nums = [input.left, input.top, input.right, input.bottom].map(Number)
  if (!nums.every(Number.isFinite)) return err('left/top/right/bottom must be numbers', summary)
  const [left, top, right, bottom] = nums as [number, number, number, number]
  // Display-space box → PDF rect from the first page; every other target page
  // must share its size (crop equal-sized pages together)
  const firstGeom = deps.pageGeom(pages.pages[0]! - 1)
  if (!firstGeom) return err('Document not ready', summary)
  const firstDisp = geomDispSize(firstGeom)
  if (
    !(left < right && top < bottom && left >= 0 && top >= 0 && right <= firstDisp.width && bottom <= firstDisp.height)
  ) {
    return err(`Box exceeds page ${pages.pages[0]} (${firstDisp.width} x ${firstDisp.height} pt as displayed)`, summary)
  }
  for (const p of pages.pages.slice(1)) {
    const g = deps.pageGeom(p - 1)
    if (!g) return err('Document not ready', summary)
    const disp = geomDispSize(g)
    if (disp.width !== firstDisp.width || disp.height !== firstDisp.height) {
      return err(`Page ${p} differs in size; crop equal-sized pages together`, summary)
    }
  }
  const [ax, ay] = viewToPdf(firstGeom, left, top)
  const [bx, by] = viewToPdf(firstGeom, right, bottom)
  const box: [number, number, number, number] = [
    Math.min(ax, bx),
    Math.min(ay, by),
    Math.max(ax, bx),
    Math.max(ay, by),
  ]
  const done = await runFilePageOp(
    deps,
    summary,
    `I'll crop ${pages.pages.length} page(s) to the selected region (this saves and rewrites the file).`,
    input,
    () => deps.fileCropPages(pages.pages.map((p) => p - 1), box),
  )
  if (done.mutated) {
    return { output: `Cropped ${pages.pages.length} page(s); the document reloaded`, mutated: true, summary }
  }
  return done
}

/** Flush pending edits, then run a dialog-based export that leaves the file untouched */
async function runExportOp(
  deps: PdfAiDeps,
  summary: string,
  run: (path: string) => Promise<ToolExecution>,
): Promise<ToolExecution> {
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  const path = deps.filePath()
  if (!path) return err('The document must be saved to a file first', summary)
  if (!(await deps.flushSave())) {
    return err('Could not save pending edits; resolve the save error first', summary)
  }
  return run(path)
}

async function extractPagesTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Extract pages'
  const pages = fileOpPages(deps, input)
  if ('bad' in pages) return err(pages.bad, summary)
  return runExportOp(deps, summary, async () => {
    const base = deps.fileName().replace(/\.pdf$/i, '') || 'pages'
    const name = String(input.name ?? `${base}-p${pages.pages[0]}-p${pages.pages[pages.pages.length - 1]}`)
    const r = await deps.extractFilePages(
      pages.pages.map((p) => p - 1),
      name,
    )
    if (!r.ok) return err(`Extract failed: ${r.error}`, summary)
    if ('canceled' in r) return { output: 'Extract canceled; nothing changed', summary }
    return { output: `Extracted ${pages.pages.length} page(s) to ${r.savedPath}`, mutated: false, summary }
  })
}

async function splitPdfTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Split PDF'
  const at = Number(input.at_page)
  const total = deps.pageCount()
  if (!Number.isInteger(at) || at < 1 || at >= total) {
    return err(`at_page must be 1..${total - 1}`, summary)
  }
  return runExportOp(deps, summary, async () => {
    const base = deps.fileName().replace(/\.pdf$/i, '') || 'split'
    const first = await deps.extractFilePages(
      Array.from({ length: at }, (_, i) => i),
      `${base}-part1`,
    )
    if (!first.ok) return err(`Split failed: ${first.error}`, summary)
    if ('canceled' in first) return { output: 'Split canceled; nothing changed', summary }
    const second = await deps.extractFilePages(
      Array.from({ length: total - at }, (_, i) => at + i),
      `${base}-part2`,
    )
    if (!second.ok) return err(`Split failed on the second half: ${second.error}`, summary)
    if ('canceled' in second) {
      return { output: `First half saved to ${first.savedPath}; second half canceled`, summary }
    }
    return {
      output: `Split into ${first.savedPath} and ${second.savedPath}; the current file is unchanged`,
      mutated: false,
      summary,
    }
  })
}

async function mergePagesTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Merge PDF'
  const after = Number(input.after_page)
  if (!Number.isInteger(after) || after < 0 || after > deps.pageCount()) {
    return err(`after_page must be 0..${deps.pageCount()}`, summary)
  }
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  if (input.confirm !== true) {
    return {
      output:
        `I'll merge another PDF after page ${after} (a picker asks which file; this saves and rewrites the file and cannot be undone). ` +
        `Describe this to the user in one plain sentence and only proceed when they confirm (then call again with confirm:true).`,
      summary,
    }
  }
  const path = deps.filePath()
  if (!path) return err('The document must be saved to a file first', summary)
  if (!(await deps.flushSave())) {
    return err('Could not save pending edits; resolve the save error first', summary)
  }
  const r = await deps.mergeFile(after - 1)
  if (!r.ok) return err(`Merge failed: ${r.error}`, summary)
  if ('canceled' in r) return { output: 'Merge canceled; nothing changed', summary }
  await deps.reloadAfterFileOp()
  return {
    output: `Merged ${r.insertedCount} page(s) after page ${after}; the document reloaded`,
    mutated: true,
    summary,
  }
}

async function replacePagesTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Replace pages'
  const pages = fileOpPages(deps, input)
  if ('bad' in pages) return err(pages.bad, summary)
  if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
  if (input.confirm !== true) {
    return {
      output:
        `I'll replace ${pages.pages.length} page(s) with the pages of another PDF (a picker asks which file; this saves and rewrites the file and cannot be undone). ` +
        `Describe this to the user in one plain sentence and only proceed when they confirm (then call again with confirm:true).`,
      summary,
    }
  }
  const path = deps.filePath()
  if (!path) return err('The document must be saved to a file first', summary)
  if (!(await deps.flushSave())) {
    return err('Could not save pending edits; resolve the save error first', summary)
  }
  const r = await deps.replaceFilePages(pages.pages.map((p) => p - 1))
  if (!r.ok) return err(`Replace failed: ${r.error}`, summary)
  if ('canceled' in r) return { output: 'Replace canceled; nothing changed', summary }
  await deps.reloadAfterFileOp()
  return { output: `Replaced ${pages.pages.length} page(s); the document reloaded`, mutated: true, summary }
}

async function createDocumentTool(
  deps: PdfAiDeps,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const summary = 'Create document'
  const pages = input.pages === undefined ? 1 : Number(input.pages)
  if (!Number.isInteger(pages) || pages < 1 || pages > 100) {
    return err('pages must be 1..100', summary)
  }
  const title = String(input.title ?? '').slice(0, 120)
  const text = String(input.text ?? '').slice(0, 20000)
  const r = await deps.createFileDocument(pages, title || undefined, text || undefined, title || undefined)
  if (!r.ok) return err(`Create failed: ${r.error}`, summary)
  if ('canceled' in r) return { output: 'Create canceled; nothing changed', summary }
  return { output: `Created ${r.savedPath} (${pages} page(s))`, mutated: false, summary }
}

export async function executePdfTool(
  deps: PdfAiDeps,
  call: AgentToolCall,
  signal?: AbortSignal,
): Promise<ToolExecution> {
  const input = call.input
  switch (call.name) {
    case 'read_pages':
      return readPages(deps, input)
    case 'search_text':
      return searchText(deps, input)
    case 'goto_page': {
      const summary = t('aiToolGoto', { page: Number(input.page) })
      const r = resolvePage(deps, input.page)
      if ('bad' in r) return err(r.bad, summary)
      deps.gotoPage(r.origIdx + 1)
      return { output: `Jumped to page ${r.origIdx + 1}`, summary }
    }
    case 'markup_text':
      return markupText(deps, input)
    case 'read_annotations':
      return readAnnotations(deps, input)
    case 'add_note':
      return addNoteTool(deps, input)
    case 'reply_note':
      return replyNoteTool(deps, input)
    case 'edit_note':
      return editNoteTool(deps, input)
    case 'delete_markup':
      return deleteMarkupTool(deps, input)
    case 'delete_note':
      return deleteNoteTool(deps, input)
    case 'move_text_block':
      return moveTextBlock(deps, input)
    case 'insert_text':
      return insertTextTool(deps, input)
    case 'list_inserted_text':
      return listInsertedText(deps, input)
    case 'edit_inserted_text':
      return editInsertedText(deps, input)
    case 'move_inserted_text':
      return moveInsertedText(deps, input)
    case 'delete_inserted_text':
      return deleteInsertedText(deps, input)
    case 'edit_text':
      return editText(deps, input)
    case 'edit_block':
      return editBlock(deps, input)
    case 'web_search':
      return webSearchTool(deps, input)
    case 'image_search':
      return imageSearchTool(deps, input)
    case 'generate_image':
      return generateImageTool(deps, input)
    case 'list_page_images':
      return listPageImagesTool(deps, input)
    case 'insert_image':
      return insertImageTool(deps, input, signal)
    case 'transform_image':
      return transformImageTool(deps, input, signal)
    case 'rotate_image':
      return rotateImageTool(deps, input, signal)
    case 'replace_image':
      return replaceImageTool(deps, input, signal)
    case 'delete_image':
      return deleteImageTool(deps, input, signal)
    case 'flip_image':
      return flipImageTool(deps, input)
    case 'crop_image':
      return cropImageTool(deps, input)
    case 'set_image_opacity':
      return setImageOpacityTool(deps, input)
    case 'remove_image_background':
      return removeImageBackgroundTool(deps, input)
    case 'list_form_fields':
      return listFormFields(deps)
    case 'fill_form_field':
      return fillFormField(deps, input)
    case 'rotate_page': {
      const summary = t('aiToolRotate', { page: Number(input.page) })
      if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
      const r = resolvePage(deps, input.page)
      if ('bad' in r) return err(r.bad, summary)
      deps.rotatePage(r.origIdx, input.direction === 'left' ? -90 : 90)
      deps.gotoPage(r.origIdx + 1)
      return { output: `Rotated page ${r.origIdx + 1} (unsaved)`, mutated: true, summary }
    }
    case 'delete_page': {
      const summary = t('aiToolDelete', { page: Number(input.page) })
      if (deps.readOnly()) return err(READONLY_OUTPUT, summary)
      const r = resolvePage(deps, input.page)
      if ('bad' in r) return err(r.bad, summary)
      if (!deps.deletePage(r.origIdx)) return err('At least one page must remain', summary)
      return {
        output: `Deleted page ${r.origIdx + 1} (unsaved; can be undone)`,
        mutated: true,
        summary,
      }
    }
    case 'apply_ops':
      return applyOps(deps, input)
    case 'set_watermark':
      return setWatermarkTool(deps, input)
    case 'set_header_footer':
      return setHeaderFooterTool(deps, input)
    case 'insert_blank_page':
      return insertBlankPageTool(deps, input)
    case 'set_page_size':
      return setPageSizeTool(deps, input)
    case 'crop_pages':
      return cropPagesTool(deps, input)
    case 'extract_pages':
      return extractPagesTool(deps, input)
    case 'split_pdf':
      return splitPdfTool(deps, input)
    case 'merge_pages':
      return mergePagesTool(deps, input)
    case 'replace_pages':
      return replacePagesTool(deps, input)
    case 'create_document':
      return createDocumentTool(deps, input)
    case 'get_outline': {
      const outline = deps.outline()
      const lines: string[] = []
      const walk = (nodes: OutlineNode[], depth: number) => {
        for (const n of nodes) {
          lines.push(`${'  '.repeat(depth)}${n.title}`)
          if (n.items) walk(n.items, depth + 1)
        }
      }
      if (outline) walk(outline, 0)
      return {
        output: lines.join('\n') || 'The document has no outline',
        summary: t('aiToolOutline'),
      }
    }
    default:
      return err(`Unknown tool: ${call.name}`, call.name)
  }
}
