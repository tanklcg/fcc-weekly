#!/usr/bin/env node
/**
 * FCC Covered List 每週摘要寄送（無需 Anthropic API）
 * 直接用 node-fetch 抓取網頁，擷取清單內容，透過 Gmail 寄出
 *
 * 必要環境變數：
 *   SMTP_USER      - Gmail 地址
 *   SMTP_PASSWORD  - Gmail App Password（16碼）
 *   ALERT_EMAIL    - 收件者 email
 */

import fetch from "node-fetch";
import * as cheerio from "cheerio";
import nodemailer from "nodemailer";

const FCC_URL = "https://www.fcc.gov/supplychain/coveredlist";
const ALERT_EMAIL = process.env.ALERT_EMAIL || "tliao@netgear.com";

async function fetchFCCContent() {
  console.log("正在擷取 FCC Covered List 頁面…");

  const res = await fetch(FCC_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; FCC-Monitor/1.0)",
    },
  });

  if (!res.ok) throw new Error(`HTTP 錯誤：${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  let output = "";

  // 擷取頁面主要內容區塊
  $("h2, h3, h4, p, li, td, th").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 2) {
      const tag = el.tagName.toLowerCase();
      if (["h2", "h3", "h4"].includes(tag)) {
        output += `\n${"─".repeat(50)}\n${text}\n${"─".repeat(50)}\n`;
      } else if (tag === "li") {
        output += `  • ${text}\n`;
      } else if (tag === "th") {
        output += `[${text}]  `;
      } else if (tag === "td") {
        output += `${text}  `;
      } else {
        output += `${text}\n`;
      }
    }
  });

  console.log(`擷取完成，共 ${output.length} 個字元。`);
  return output.trim();
}

async function sendEmail(content) {
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

  const subject = `[每週摘要] FCC 供應鏈 Covered List — ${today}`;
  const body = `以下為本週 FCC 供應鏈 Covered List 內容摘要。

來源網址：${FCC_URL}
擷取時間：${new Date().toLocaleString("zh-TW")}

${"═".repeat(60)}

${content}

${"═".repeat(60)}
此為每週五自動發送的摘要，由 GitHub Actions 排程執行。`;

  await transporter.sendMail({
    from: `"FCC Monitor" <${process.env.SMTP_USER}>`,
    to: ALERT_EMAIL,
    subject,
    text: body,
  });

  console.log(`信件已成功寄出至 ${ALERT_EMAIL}`);
}

async function main() {
  if (!process.env.SMTP_USER) throw new Error("未設定 SMTP_USER");
  if (!process.env.SMTP_PASSWORD) throw new Error("未設定 SMTP_PASSWORD");

  const content = await fetchFCCContent();
  await sendEmail(content);
}

main().catch((err) => {
  console.error("執行失敗：", err.message);
  process.exit(1);
});
