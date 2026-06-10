#!/usr/bin/env node
import puppeteer from "puppeteer";
import nodemailer from "nodemailer";

const FCC_URL = "https://www.fcc.gov/supplychain/coveredlist";
const ALERT_EMAIL = process.env.ALERT_EMAIL || "tliao@netgear.com";

async function generatePDF() {
  console.log("啟動瀏覽器，載入 FCC 頁面…");

  const browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--window-size=1280,900",
    ],
    headless: "new",
  });

  const page = await browser.newPage();

  // 模擬真實瀏覽器
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  await page.setViewport({ width: 1280, height: 900 });

  const response = await page.goto(FCC_URL, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  console.log(`頁面狀態碼：${response.status()}`);

  await page.waitForSelector("table, main", { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  // 隱藏導覽、頁首頁尾
  await page.addStyleTag({
    content: `
      header, nav, footer,
      .usa-header, .usa-nav, .usa-footer,
      .usa-banner, .usa-skipnav,
      .site-header, .site-footer { display: none !important; }
      body { font-size: 13px !important; }
      main, #main-content { margin: 0 !important; padding: 10px !important; }
      table { border-collapse: collapse !important; width: 100% !important; }
      th, td { border: 1px solid #999 !important; padding: 6px 8px !important; vertical-align: top !important; }
      th { background-color: #e8e8e8 !important; font-weight: bold !important; }
    `,
  });

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "15mm", left: "12mm", right: "12mm" },
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:9px;width:100%;text-align:center;color:#555;padding:4px 0;">FCC Supply Chain Covered List — Weekly Report — ${today}</div>`,
    footerTemplate: `<div style="font-size:9px;width:100%;text-align:center;color:#555;padding:4px 0;">Source: ${FCC_URL} &nbsp;|&nbsp; Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
  });

  await browser.close();
  console.log(`PDF 產生完成，大小：${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  return pdfBuffer;
}

async function sendEmail(pdfBuffer) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });

  const today = new Date().toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  const filename = `FCC-Covered-List-${new Date().toISOString().slice(0, 10)}.pdf`;

  await transporter.sendMail({
    from: `"FCC Monitor" <${process.env.SMTP_USER}>`,
    to: ALERT_EMAIL,
    subject: `[每週摘要] FCC 供應鏈 Covered List — ${today}`,
    text: `請見附件 PDF：FCC 供應鏈 Covered List 本週完整內容。\n\n來源：${FCC_URL}\n擷取時間：${new Date().toLocaleString("zh-TW")}`,
    attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
  });

  console.log(`PDF 已寄出至 ${ALERT_EMAIL}（${filename}）`);
}

async function main() {
  if (!process.env.SMTP_USER) throw new Error("未設定 SMTP_USER");
  if (!process.env.SMTP_PASSWORD) throw new Error("未設定 SMTP_PASSWORD");
  const pdfBuffer = await generatePDF();
  await sendEmail(pdfBuffer);
}

main().catch(err => { console.error("執行失敗：", err.message); process.exit(1); });
