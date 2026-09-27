import { aiStrings } from './strings-ai'
import { appStrings } from './strings-app'
import { dialogStrings } from './strings-dialogs'

const csvExportStrings = {
  zh: { appExportCsv: '导出为 CSV', appExportCsvTitle: '将当前活动工作表导出为 CSV 文件' },
  en: { appExportCsv: 'Export to CSV', appExportCsvTitle: 'Export active sheet as CSV file' },
  ja: { appExportCsv: 'CSV にエクスポート', appExportCsvTitle: 'アクティブなシートを CSV ファイルとしてエクスポート' },
  ko: { appExportCsv: 'CSV로 내보내기', appExportCsvTitle: '활성 시트를 CSV 파일로 내보내기' },
  fr: { appExportCsv: 'Exporter en CSV', appExportCsvTitle: 'Exporter la feuille active en fichier CSV' },
  de: { appExportCsv: 'Als CSV exportieren', appExportCsvTitle: 'Aktives Blatt als CSV-Datei exportieren' },
  es: { appExportCsv: 'Exportar a CSV', appExportCsvTitle: 'Exportar la hoja activa como archivo CSV' },
  th: { appExportCsv: 'ส่งออกเป็น CSV', appExportCsvTitle: 'ส่งออกแผ่นงานที่ใช้งานเป็นไฟล์ CSV' },
  id: { appExportCsv: 'Ekspor ke CSV', appExportCsvTitle: 'Ekspor lembar aktif sebagai file CSV' },
  ru: { appExportCsv: 'Экспорт в CSV', appExportCsvTitle: 'Экспорт активного листа в файл CSV' },
  ar: { appExportCsv: 'تصدير إلى CSV', appExportCsvTitle: 'تصدير الورقة النشطة كملف CSV' },
  pt: { appExportCsv: 'Exportar para CSV', appExportCsvTitle: 'Exportar a planilha ativa como arquivo CSV' },
  it: { appExportCsv: 'Esporta in CSV', appExportCsvTitle: 'Esporta il foglio attivo come file CSV' },
  pl: { appExportCsv: 'Eksportuj do CSV', appExportCsvTitle: 'Eksportuj aktywny arkusz do pliku CSV' },
  nl: { appExportCsv: 'Exporteren naar CSV', appExportCsvTitle: 'Actief blad exporteren als CSV-bestand' },
  ms: { appExportCsv: 'Eksport ke CSV', appExportCsvTitle: 'Eksport helaian aktif sebagai fail CSV' },
  he: { appExportCsv: 'ייצוא ל-CSV', appExportCsvTitle: 'ייצוא גיליון פעיל כקובץ CSV' },
  hi: { appExportCsv: 'CSV में निर्यात करें', appExportCsvTitle: 'सक्रिय शीट को CSV फ़ाइल के रूप में निर्यात करें' },
  'zh-TW': { appExportCsv: '匯出為 CSV', appExportCsvTitle: '將目前作用中工作表匯出為 CSV 檔案' },
}

export const strings = {
  zh: { ...appStrings.zh, ...dialogStrings.zh, ...aiStrings.zh, ...csvExportStrings.zh },
  en: { ...appStrings.en, ...dialogStrings.en, ...aiStrings.en, ...csvExportStrings.en },
  ja: { ...appStrings.ja, ...dialogStrings.ja, ...aiStrings.ja, ...csvExportStrings.ja },
  ko: { ...appStrings.ko, ...dialogStrings.ko, ...aiStrings.ko, ...csvExportStrings.ko },
  fr: { ...appStrings.fr, ...dialogStrings.fr, ...aiStrings.fr, ...csvExportStrings.fr },
  de: { ...appStrings.de, ...dialogStrings.de, ...aiStrings.de, ...csvExportStrings.de },
  es: { ...appStrings.es, ...dialogStrings.es, ...aiStrings.es, ...csvExportStrings.es },
  th: { ...appStrings.th, ...dialogStrings.th, ...aiStrings.th, ...csvExportStrings.th },
  id: { ...appStrings.id, ...dialogStrings.id, ...aiStrings.id, ...csvExportStrings.id },
  ru: { ...appStrings.ru, ...dialogStrings.ru, ...aiStrings.ru, ...csvExportStrings.ru },
  ar: { ...appStrings.ar, ...dialogStrings.ar, ...aiStrings.ar, ...csvExportStrings.ar },
  pt: { ...appStrings.pt, ...dialogStrings.pt, ...aiStrings.pt, ...csvExportStrings.pt },
  it: { ...appStrings.it, ...dialogStrings.it, ...aiStrings.it, ...csvExportStrings.it },
  pl: { ...appStrings.pl, ...dialogStrings.pl, ...aiStrings.pl, ...csvExportStrings.pl },
  nl: { ...appStrings.nl, ...dialogStrings.nl, ...aiStrings.nl, ...csvExportStrings.nl },
  ms: { ...appStrings.ms, ...dialogStrings.ms, ...aiStrings.ms, ...csvExportStrings.ms },
  he: { ...appStrings.he, ...dialogStrings.he, ...aiStrings.he, ...csvExportStrings.he },
  hi: { ...appStrings.hi, ...dialogStrings.hi, ...aiStrings.hi, ...csvExportStrings.hi },
  'zh-TW': { ...appStrings['zh-TW'], ...dialogStrings['zh-TW'], ...aiStrings['zh-TW'], ...csvExportStrings['zh-TW'] },
}

