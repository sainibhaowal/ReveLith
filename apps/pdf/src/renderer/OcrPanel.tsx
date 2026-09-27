import { useState } from 'react'
import type { OcrPageResponse, OcrPageResult, OcrAvailabilityResult } from '../shared/ipc'

interface OcrPanelProps {
  onOcrPage: (pageIndex: number, language?: string) => Promise<OcrPageResponse>
  currentPage: number
  pageCount: number
  isOcrAvailable: boolean
  ocrAvailability: OcrAvailabilityResult | null
}

export function OcrPanel({
  onOcrPage,
  currentPage,
  pageCount,
  isOcrAvailable,
  ocrAvailability
}: OcrPanelProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [ocrResult, setOcrResult] = useState<OcrPageResponse | null>(null)
  const [selectedLanguage, setSelectedLanguage] = useState('en')
  const [preprocessImage, setPreprocessImage] = useState(true)
  const [enhanceContrast, setEnhanceContrast] = useState(false)

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'zh', name: 'Chinese (Simplified)' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'ru', name: 'Russian' },
    { code: 'ar', name: 'Arabic' }
  ]

  const handleOcrCurrentPage = async () => {
    setIsProcessing(true)
    setOcrResult(null)
    
    try {
      const result = await onOcrPage(currentPage, selectedLanguage)
      setOcrResult(result)
    } catch (error) {
      setOcrResult({
        ok: false,
        error: error instanceof Error ? error.message : 'OCR failed'
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleOcrAllPages = async () => {
    setIsProcessing(true)
    const results: OcrPageResponse[] = []
    
    for (let i = 0; i < pageCount; i++) {
      try {
        const result = await onOcrPage(i, selectedLanguage)
        results.push(result)
      } catch (error) {
        results.push({
          ok: false,
          error: error instanceof Error ? error.message : 'OCR failed'
        })
      }
    }
    
    // Combine results from all pages
    const combinedText = results
      .filter((r): r is OcrPageResult => r.ok)
      .map(r => r.text)
      .join('\n\n--- Page Break ---\n\n')
    
    setOcrResult({
      ok: true,
      text: combinedText,
      confidence: results.reduce((sum, r) => sum + (r.ok ? r.confidence : 0), 0) / results.length,
      lines: []
    })
    setIsProcessing(false)
  }

  const copyTextToClipboard = () => {
    if (ocrResult?.ok && ocrResult.text) {
      navigator.clipboard.writeText(ocrResult.text)
    }
  }

  if (!isOcrAvailable) {
    return (
      <div className="ocr-panel unavailable">
        <div className="ocr-unavailable-message">
          <h3>OCR Not Available</h3>
          <p>
            {ocrAvailability?.method === 'tesseract' 
              ? 'OCR will use Tesseract.js (slower but functional)'
              : 'OCR is not available on this system'}
          </p>
          {ocrAvailability && (
            <p className="ocr-platform-info">
              Platform: {ocrAvailability.platform} | Method: {ocrAvailability.method}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="ocr-panel">
      <div className="ocr-controls">
        <h3>OCR Text Recognition</h3>
        
        <div className="ocr-settings">
          <div className="ocr-setting">
            <label htmlFor="ocr-language">Language:</label>
            <select
              id="ocr-language"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              disabled={isProcessing}
            >
              {languages.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="ocr-setting">
            <label>
              <input
                type="checkbox"
                checked={preprocessImage}
                onChange={(e) => setPreprocessImage(e.target.checked)}
                disabled={isProcessing}
              />
              Preprocess Image
            </label>
          </div>
          
          <div className="ocr-setting">
            <label>
              <input
                type="checkbox"
                checked={enhanceContrast}
                onChange={(e) => setEnhanceContrast(e.target.checked)}
                disabled={isProcessing}
              />
              Enhance Contrast
            </label>
          </div>
        </div>
        
        <div className="ocr-actions">
          <button
            onClick={handleOcrCurrentPage}
            disabled={isProcessing}
            className="ocr-button primary"
          >
            {isProcessing ? 'Processing...' : `OCR Page ${currentPage + 1}`}
          </button>
          
          <button
            onClick={handleOcrAllPages}
            disabled={isProcessing}
            className="ocr-button secondary"
          >
            {isProcessing ? 'Processing...' : `OCR All Pages (${pageCount})`}
          </button>
        </div>
        
        {ocrAvailability && (
          <div className="ocr-status">
            <span className="ocr-platform">
              Platform: {ocrAvailability.platform}
            </span>
            <span className="ocr-method">
              Method: {ocrAvailability.method}
            </span>
          </div>
        )}
      </div>
      
      {ocrResult && (
        <div className="ocr-results">
          <div className="ocr-result-header">
            <h4>OCR Results</h4>
            {ocrResult.ok && (
              <div className="ocr-confidence">
                Confidence: {(ocrResult.confidence * 100).toFixed(1)}%
              </div>
            )}
          </div>
          
          {ocrResult.ok ? (
            <div className="ocr-result-content">
              <div className="ocr-text-area">
                <textarea
                  value={ocrResult.text}
                  readOnly
                  className="ocr-output"
                />
              </div>
              <div className="ocr-result-actions">
                <button
                  onClick={copyTextToClipboard}
                  className="ocr-button small"
                >
                  Copy Text
                </button>
              </div>
              
              {ocrResult.lines.length > 0 && (
                <div className="ocr-lines-info">
                  <p>Detected {ocrResult.lines.length} text lines with position data</p>
                </div>
              )}
            </div>
          ) : (
            <div className="ocr-error">
              <p className="error-message">{ocrResult.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}