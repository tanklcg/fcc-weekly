#!/usr/bin/env node
/**
 * FCC Covered List 每週摘要 — 用 Puppeteer 直接列印網頁為 PDF 寄出
 *
 * 必要環境變數：
 *   SMTP_USER      - Gmail 地址
 *   SMTP_PASSWORD  - Gmail App Password（16碼）
 *   ALERT_EMAIL    - 收件者 email
 */

import puppeteer from "puppeteer";
import nodemailer from "nodemailer";

const FCC_URL = "https://www.fcc.gov/supplychain/coveredlist#conditional-approvals";
const ALERT_EMAIL = process.env.ALERT_EMAIL || "tliao@netgear.com";

// ── 1. 用 Puppeteer 列印網頁為 PDF ────────────────────────────────────────────

async function generatePDF() {
  console.log("啟動瀏覽器，載入 FCC 頁面…");

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: "new",
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  await page.goto(FCC_URL, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  // 等待主要內容載入
  await page.waitForSelector("table, main, #main-content", { timeout: 15000 }).catch(() => {});

  // 隱藏導覽列、頁首頁尾，讓列印內容更乾淨
  await page.addStyleTag({
    content: `
      header, nav, footer,
      .usa-header, .usa-nav, .usa-footer,
      .usa-banner, .usa-skipnav,
      #header, #footer, #nav,
      .site-header, .site-footer,
      .breadcrumb, .usa-breadcrumb { display: none !important; }
      body { font-size: 13px !important; }
      main, #main-content { margin: 0 !important; padding: 10px !important; }
      table { border-collapse: collapse !important; width: 100% !important; }
      th, td { border: 1px solid #ccc !important; padding: 6px 8px !important; }
      th { background-color: #f0f0f0 !important; font-weight: bold !important; }
    `,
  });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-size:9px; width:100%; text-align:center; color:#555; padding:5px 0;">
        FCC Supply Chain Covered List — Weekly Report
      </div>`,
    footerTemplate: `
      <div style="font-size:9px; width:100%; text-align:center; color:#555; padding:5px 0;">
        Source: ${FCC_URL} &nbsp;|&nbsp; <span class="date"></span> &nbsp;|&nbsp; Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>`,
  });

  await browser.close();
  console.log(`PDF 產生完成，大小：${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  return pdfBuffer;
}

// ── 2. 寄送 Email（PDF 附件）─────────────────────────────────────────────────

async function sendEmail(pdfBuffer) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
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
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  console.log(`PDF 附件已成功寄出至 ${ALERT_EMAIL}（${filename}）`);
}

// ── 3. 主程式 ─────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.SMTP_USER) throw new Error("未設定 SMTP_USER");
  if (!process.env.SMTP_PASSWORD) throw new Error("未設定 SMTP_PASSWORD");

  const pdfBuffer = await generatePDF();
  await sendEmail(pdfBuffer);
}

main().catch(err => {
  console.error("執行失敗：", err.message);
  process.exit(1);
});
