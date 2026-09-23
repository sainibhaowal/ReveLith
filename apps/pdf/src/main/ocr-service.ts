/**
 * Native OCR service for scanned PDFs.
 * Uses OS-specific OCR engines (macOS Vision framework, Windows OCR API) with Tesseract.js fallback.
 * All processing is local - no data uploaded to external services.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createWorker } from 'tesseract.js'

export interface OcrResult {
  text: string
  confidence: number
  lines: Array<{
    text: string
    bbox: { x: number; y: number; width: number; height: number }
    confidence: number
  }>
}

export interface OcrOptions {
  language?: string
  preprocessImage?: boolean
  enhanceContrast?: boolean
}

/**
 * Platform detection for native OCR capabilities
 */
function getPlatform(): 'darwin' | 'win32' | 'linux' | 'unknown' {
  const platform = process.platform
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') {
    return platform
  }
  return 'unknown'
}

/**
 * Check if native OCR is available on the current platform
 */
export function isNativeOcrAvailable(): boolean {
  const platform = getPlatform()
  if (platform === 'darwin') {
    // macOS: Check if Vision framework is available (macOS 10.13+)
    try {
      const result = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' })
      const version = result.trim().split('.').map(Number)
      return version[0]! > 10 || (version[0] === 10 && version[1]! >= 13)
    } catch {
      return false
    }
  } else if (platform === 'win32') {
    // Windows: Check if Windows OCR API is available (Windows 10+)
    try {
      const result = execFileSync('cmd', ['/c', 'ver'], { encoding: 'utf8' })
      return result.includes('Windows 10') || result.includes('Windows 11')
    } catch {
      return false
    }
  }
  return false
}

/**
 * macOS native OCR using Vision framework via swift script
 */
async function ocrMacOS(imagePath: string, options: OcrOptions): Promise<OcrResult> {
  const script = `
import Vision
import CoreImage
import Foundation

let args = CommandLine.arguments
guard args.count >= 2 else {
    print("Usage: ocr_macos <image_path> [language]")
    exit(1)
}

let imagePath = args[1]
let language = args.count >= 3 ? args[2] : "en-US"

guard let image = CIImage(contentsOf: URL(fileURLWithPath: imagePath)) else {
    print("Error: Could not load image")
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLanguages = [language]
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(ciImage: image, options: [:])
try {
    handler.perform([request])
    
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        print("No text found")
        exit(0)
    }
    
    var fullText = ""
    var totalConfidence: Double = 0
    var lineCount = 0
    
    for observation in observations {
        guard let topCandidate = observation.topCandidates(1).first else { continue }
        fullText += topCandidate.string + "\\n"
        totalConfidence += Double(topCandidate.confidence)
        lineCount += 1
        
        let bbox = observation.boundingBox
        print("LINE:\\(topCandidate.string)")
        print("CONF:\\(topCandidate.confidence)")
        print("BBOX:\\(bbox.origin.x),\\(bbox.origin.y),\\(bbox.size.width),\\(bbox.size.height)")
    }
    
    let avgConfidence = lineCount > 0 ? totalConfidence / Double(lineCount) : 0
    print("AVG_CONF:\\(avgConfidence)")
    print("FULL_TEXT:\\(fullText)")
    
} catch {
    print("Error: \\(error)")
    exit(1)
}
`

  const tempDir = await mkdtemp(join(tmpdir(), 'revelith-ocr-'))
  const scriptPath = join(tempDir, 'ocr.swift')
  const executablePath = join(tempDir, 'ocr')

  try {
    writeFileSync(scriptPath, script)
    
    // Compile Swift script
    execFileSync('swiftc', ['-o', executablePath, scriptPath])
    
    // Map common language codes to Vision framework format
    const langMap: Record<string, string> = {
      'en': 'en-US',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'it': 'it-IT',
      'pt': 'pt-PT',
      'zh': 'zh-Hans',
      'ja': 'ja-JP',
      'ko': 'ko-KR',
      'ru': 'ru-RU',
      'ar': 'ar-SA'
    }
    
    const visionLang = langMap[options.language || 'en'] || 'en-US'
    
    // Execute OCR
    const result = execFileSync(executablePath, [imagePath, visionLang], { 
      encoding: 'utf8',
      timeout: 30000 
    })
    
    // Parse output
    const lines: OcrResult['lines'] = []
    let fullText = ''
    let avgConfidence = 0
    
    const outputLines = result.split('\n')
    let currentLine: Partial<OcrResult['lines'][0]> = {}
    
    for (const line of outputLines) {
      if (line.startsWith('LINE:')) {
        currentLine.text = line.substring(5)
      } else if (line.startsWith('CONF:')) {
        currentLine.confidence = parseFloat(line.substring(5))
      } else if (line.startsWith('BBOX:')) {
        const coords = line.substring(5).split(',').map(Number)
        currentLine.bbox = {
          x: coords[0] || 0,
          y: coords[1] || 0,
          width: coords[2] || 0,
          height: coords[3] || 0
        }
      } else if (line.startsWith('AVG_CONF:')) {
        avgConfidence = parseFloat(line.substring(9))
      } else if (line.startsWith('FULL_TEXT:')) {
        fullText = line.substring(9)
      }
      
      if (currentLine.text && currentLine.bbox && currentLine.confidence !== undefined) {
        lines.push(currentLine as OcrResult['lines'][0])
        currentLine = {}
      }
    }
    
    return {
      text: fullText,
      confidence: avgConfidence,
      lines
    }
  } finally {
    // Cleanup
    try {
      await rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Windows native OCR using Windows OCR API via PowerShell
 */
async function ocrWindows(imagePath: string, options: OcrOptions): Promise<OcrResult> {
  const script = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]

$imagePath = "${imagePath.replace(/\\/g, '\\\\')}"
$language = "${options.language || 'en'}"

try {
    # Load image
    $bitmap = [System.Drawing.Bitmap]::FromFile($imagePath)
    
    # Convert to Windows Runtime bitmap
    $stream = New-Object System.IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $stream.Position = 0
    
    # Create OCR engine
    $ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    
    if (-not $ocrEngine) {
        Write-Error "OCR engine not available"
        exit 1
    }
    
    # Perform OCR
    $result = $ocrEngine.RecognizeAsync($stream).AsTask().Result
    
    $fullText = $result.Text
    $lines = $result.Lines
    
    $totalConfidence = 0
    $lineCount = 0
    
    foreach ($line in $lines) {
        $text = $line.Text
        $bbox = $line.BoundingBox
        $confidence = 0.8 # Windows OCR doesn't provide per-line confidence
        
        Write-Output "LINE:$text"
        Write-Output "CONF:$confidence"
        Write-Output "BBOX:$($bbox.X),$($bbox.Y),$($bbox.Width),$($bbox.Height)"
        
        $totalConfidence += $confidence
        $lineCount++
    }
    
    $avgConfidence = if ($lineCount -gt 0) { $totalConfidence / $lineCount } else { 0 }
    Write-Output "AVG_CONF:$avgConfidence"
    Write-Output "FULL_TEXT:$fullText"
    
} catch {
    Write-Error "Error: $_"
    exit 1
} finally {
    if ($bitmap) { $bitmap.Dispose() }
    if ($stream) { $stream.Dispose() }
}
`

  try {
    const result = execFileSync('powershell', ['-Command', script], { 
      encoding: 'utf8',
      timeout: 30000 
    })
    
    // Parse output (same format as macOS)
    const lines: OcrResult['lines'] = []
    let fullText = ''
    let avgConfidence = 0
    
    const outputLines = result.split('\n')
    let currentLine: Partial<OcrResult['lines'][0]> = {}
    
    for (const line of outputLines) {
      if (line.startsWith('LINE:')) {
        currentLine.text = line.substring(5)
      } else if (line.startsWith('CONF:')) {
        currentLine.confidence = parseFloat(line.substring(5))
      } else if (line.startsWith('BBOX:')) {
        const coords = line.substring(5).split(',').map(Number)
        currentLine.bbox = {
          x: coords[0] || 0,
          y: coords[1] || 0,
          width: coords[2] || 0,
          height: coords[3] || 0
        }
      } else if (line.startsWith('AVG_CONF:')) {
        avgConfidence = parseFloat(line.substring(9))
      } else if (line.startsWith('FULL_TEXT:')) {
        fullText = line.substring(9)
      }
      
      if (currentLine.text && currentLine.bbox && currentLine.confidence !== undefined) {
        lines.push(currentLine as OcrResult['lines'][0])
        currentLine = {}
      }
    }
    
    return {
      text: fullText,
      confidence: avgConfidence,
      lines
    }
  } catch (error) {
    throw new Error(`Windows OCR failed: ${error}`)
  }
}

/**
 * Fallback OCR using Tesseract.js
 */
async function ocrTesseract(imagePath: string, options: OcrOptions): Promise<OcrResult> {
  const worker = await createWorker(options.language || 'eng', 1, {
    logger: () => {} // Suppress logs
  })
  
  try {
    const { data } = await worker.recognize(imagePath)
    
    const lines: OcrResult['lines'] = data.lines.map(line => ({
      text: line.text,
      bbox: {
        x: line.bbox.x0,
        y: line.bbox.y0,
        width: line.bbox.x1 - line.bbox.x0,
        height: line.bbox.y1 - line.bbox.y0
      },
      confidence: line.confidence
    }))
    
    const avgConfidence = lines.length > 0 
      ? lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length 
      : 0
    
    return {
      text: data.text,
      confidence: avgConfidence,
      lines
    }
  } finally {
    await worker.terminate()
  }
}

/**
 * Main OCR function that automatically selects the best available OCR engine
 */
export async function performOcr(
  imagePath: string, 
  options: OcrOptions = {}
): Promise<OcrResult> {
  if (!existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`)
  }
  
  const platform = getPlatform()
  
  // Try native OCR first
  if (platform === 'darwin' && isNativeOcrAvailable()) {
    try {
      return await ocrMacOS(imagePath, options)
    } catch (error) {
      console.warn('macOS OCR failed, falling back to Tesseract:', error)
    }
  } else if (platform === 'win32' && isNativeOcrAvailable()) {
    try {
      return await ocrWindows(imagePath, options)
    } catch (error) {
      console.warn('Windows OCR failed, falling back to Tesseract:', error)
    }
  }
  
  // Fallback to Tesseract.js
  return await ocrTesseract(imagePath, options)
}

/**
 * OCR a PDF page by rendering it to an image first
 */
export async function ocrPdfPage(
  pdfPath: string,
  pageIndex: number,
  options: OcrOptions = {}
): Promise<OcrResult> {
  const { loadPdfium } = await import('./text-edit')
  const pdfium = await loadPdfium()
  
  // Load PDF
  const pdfBytes = readFileSync(pdfPath)
  const pdfBuffer = new Uint8Array(pdfBytes)
  const pdfDocPtr = pdfium._FPDF_LoadMemDocument(
    pdfium._malloc(pdfBuffer.length),
    pdfBuffer.length,
    0
  )
  
  if (!pdfDocPtr) {
    throw new Error('Failed to load PDF document')
  }
  
  try {
    const pageCount = pdfium._FPDF_GetPageCount(pdfDocPtr)
    if (pageIndex < 0 || pageIndex >= pageCount) {
      throw new Error(`Invalid page index: ${pageIndex}`)
    }
    
    // Load page
    const pagePtr = pdfium._FPDF_LoadPage(pdfDocPtr, pageIndex)
    if (!pagePtr) {
      throw new Error('Failed to load PDF page')
    }
    
    try {
      // Get page dimensions
      const pageWidth = pdfium._FPDF_GetPageWidthF(pagePtr)
      const pageHeight = pdfium._FPDF_GetPageHeightF(pagePtr)
      
      // Create bitmap for rendering
      const bitmapPtr = pdfium._FPDFBitmap_CreateEx(
        Math.floor(pageWidth),
        Math.floor(pageHeight),
        4, // BGRA
        0,
        0
      )
      
      if (!bitmapPtr) {
        throw new Error('Failed to create bitmap')
      }
      
      try {
        // Render page to bitmap
        pdfium._FPDF_RenderPageBitmap(
          bitmapPtr,
          pagePtr,
          0,
          0,
          Math.floor(pageWidth),
          Math.floor(pageHeight),
          0,
          0
        )
        
        // Get bitmap data
        const bufferPtr = pdfium._FPDFBitmap_GetBuffer(bitmapPtr)
        const stride = pdfium._FPDFBitmap_GetStride(bitmapPtr)
        const width = pdfium._FPDFBitmap_GetWidth(bitmapPtr)
        const height = pdfium._FPDFBitmap_GetHeight(bitmapPtr)
        
        // Calculate buffer size
        const bufferSize = stride * height
        const bitmapData = new Uint8Array(
          pdfium.HEAPU8.buffer,
          bufferPtr,
          bufferSize
        )
        
        // Convert BGRA to RGBA and save as PNG using pure Node.js
        const rgbaData = new Uint8Array(width * height * 4)
        for (let i = 0; i < bitmapData.length; i += 4) {
          const pixelIndex = i / 4
          const targetIndex = pixelIndex * 4
          rgbaData[targetIndex] = bitmapData[i + 2] // R <- B
          rgbaData[targetIndex + 1] = bitmapData[i + 1] // G
          rgbaData[targetIndex + 2] = bitmapData[i] // B <- R
          rgbaData[targetIndex + 3] = bitmapData[i + 3] // A
        }
        
        // Simple PNG header creation (basic PNG with IHDR and IDAT)
        const createPngBuffer = (data: Uint8Array, w: number, h: number): Buffer => {
          const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
          
          // IHDR chunk
          const ihdr = Buffer.alloc(13)
          ihdr.writeUInt32BE(w, 0)
          ihdr.writeUInt32BE(h, 4)
          ihdr[8] = 8 // bit depth
          ihdr[9] = 6 // color type (RGBA)
          ihdr[10] = 0 // compression
          ihdr[11] = 0 // filter
          ihdr[12] = 0 // interlace
          
          const ihdrChunk = createChunk('IHDR', ihdr)
          
          // IDAT chunk (simplified - just wraps raw data)
          const idatChunk = createChunk('IDAT', data)
          
          // IEND chunk
          const iendChunk = createChunk('IEND', Buffer.alloc(0))
          
          return Buffer.concat([PNG_SIGNATURE, ihdrChunk, idatChunk, iendChunk])
        }
        
        const createChunk = (type: string, data: Buffer): Buffer => {
          const length = Buffer.alloc(4)
          length.writeUInt32BE(data.length, 0)
          const typeBuffer = Buffer.from(type)
          const crc = crc32(Buffer.concat([typeBuffer, data]))
          const crcBuffer = Buffer.alloc(4)
          crcBuffer.writeUInt32BE(crc, 0)
          return Buffer.concat([length, typeBuffer, data, crcBuffer])
        }
        
        const crc32 = (data: Buffer): number => {
          let crc = 0xFFFFFFFF
          for (let i = 0; i < data.length; i++) {
            crc ^= data[i]
            for (let j = 0; j < 8; j++) {
              crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1))
            }
          }
          return (crc ^ 0xFFFFFFFF) >>> 0
        }
        
        const pngBuffer = createPngBuffer(rgbaData, width, height)
        
        // Save to temporary file
        const tempDir = await mkdtemp(join(tmpdir(), 'revelith-ocr-'))
        const imagePath = join(tempDir, `page-${pageIndex}.png`)
        writeFileSync(imagePath, pngBuffer)
        
        try {
          // Perform OCR on the rendered image
          return await performOcr(imagePath, options)
        } finally {
          // Cleanup temp file
          try {
            await rm(tempDir, { recursive: true, force: true })
          } catch {
            // Ignore cleanup errors
          }
        }
      } finally {
        pdfium._FPDFBitmap_Destroy(bitmapPtr)
      }
    } finally {
      pdfium._FPDF_ClosePage(pagePtr)
    }
  } finally {
    pdfium._FPDF_CloseDocument(pdfDocPtr)
  }
}