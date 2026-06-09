#!/usr/bin/env node
/**
 * FCC Covered List 每週摘要寄送
 * 每週五自動抓取頁面內容，透過公司 Outlook SMTP 寄送至指定信箱
 *
 * 必要環境變數：
 *   ANTHROPIC_API_KEY   - Anthropic API 金鑰
 *   SMTP_USER           - 公司 email（寄件者），例如 yourname@netgear.com
 *   SMTP_PASSWORD       - 公司 email 密碼（或 App Password）
 *   ALERT_EMAIL         - 收件者 email
 */

import fetch from "node-fetch";
import nodemailer from "nodemailer";

const FCC_URL = "https://www.fcc.gov/supplychain/coveredlist";
const ALERT_EMAIL = process.env.ALERT_EMAIL || "tliao@netgear.com";

async function fetchFCCContent() {
  console.log("正在擷取 FCC Covered List 內容…");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: `你是網頁擷取助手。請從 FCC 供應鏈 Covered List 頁面完整擷取以下兩個區塊的內容，並以清楚的純文字格式回傳：
1. Covered Equipment and Services List（covered equipment 完整清單，含公司名稱、設備/服務類型、納入日期）
2. Conditional Approvals（條件式核准清單，若有的話）
不要加 markdown，不要加說明，直接回傳清單內容。`,
      messages: [
        {
          role: "user",
          content: `請擷取此頁面的完整清單內容：${FCC_URL}#conditional-approvals`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API 錯誤：${res.status}`);
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("未取得任何內容。");
  console.log(`擷取完成，共 ${text.length} 個字元。`);
  return text;
}

async function sendEmail(content) {
  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: { ciphers: "SSLv3" },
  });

  const today = new Date().toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  const subject = `[每週摘要] FCC 供應鏈 Covered List — ${today}`;
  const body = `以下為本週 FCC 供應鏈 Covered List 內容摘要。

來源網址：${FCC_URL}#conditional-approvals
擷取時間：${new Date().toLocaleString("zh-TW")}

${"─".repeat(60)}

${content}

${"─".repeat(60)}
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
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("未設定 ANTHROPIC_API_KEY");
  if (!process.env.SMTP_USER) throw new Error("未設定 SMTP_USER");
  if (!process.env.SMTP_PASSWORD) throw new Error("未設定 SMTP_PASSWORD");

  const content = await fetchFCCContent();
  await sendEmail(content);
}

main().catch((err) => {
  console.error("執行失敗：", err.message);
  process.exit(1);
});
