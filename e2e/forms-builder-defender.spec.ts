import { expect, test } from '@playwright/test'
import { launchShell, closeAndSaveVideo } from './helpers'

test('Windows Forms uploads require a clean Defender scan and reject the EICAR test signature', async () => {
  test.setTimeout(120_000)
  const launched = await launchShell({ onboardingSeen: true, videoDir: 'forms-defender' })
  const { app } = launched
  const mainLog: string[] = []
  app.process().stdout?.on('data', (chunk) => mainLog.push(chunk.toString()))
  app.process().stderr?.on('data', (chunk) => mainLog.push(chunk.toString()))
  try {
    await app.evaluate(async ({ BrowserWindow }) => { await BrowserWindow.getAllWindows()[0]?.webContents.executeJavaScript('window.aiOffice.newFormsBuilder()') })
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => Boolean(BrowserWindow.getAllWindows()[0]?.contentView.children.find((candidate) => candidate.webContents.getURL().toLowerCase().includes('forms-builder'))))).toBe(true)
    const scan = <T,>(script: string) => app.evaluate(async ({ BrowserWindow }, source) => {
      const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find((candidate) => candidate.webContents.getURL().toLowerCase().includes('forms-builder'))
      if (!view) throw new Error('Forms Builder view did not open.')
      return view.webContents.executeJavaScript(source) as Promise<T>
    }, script) as Promise<T>
    await expect.poll(() => scan<boolean>('typeof window.electronAPI?.scanFile === "function"')).toBe(true)

    const clean = await scan<{ status: string }>(`window.electronAPI.scanFile(new TextEncoder().encode('ReveLith local Defender clean-file verification'))`)
    expect(clean, `Defender clean-file result; logs: ${mainLog.join('')}`).toMatchObject({ status: 'clean' })

    // EICAR is the industry anti-malware test signature: it is inert test data,
    // not live malware. It exercises the host's real Defender detection path.
    const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
    expect(new TextEncoder().encode(eicar)).toHaveLength(68)
    const detected = await scan<{ status: string }>(`window.electronAPI.scanFile(new TextEncoder().encode(${JSON.stringify(eicar)}))`)
    expect(detected, `Defender EICAR result; logs: ${mainLog.join('')}`).toMatchObject({ status: 'threat' })
  } finally {
    await closeAndSaveVideo(launched, 'forms-defender')
  }
})
