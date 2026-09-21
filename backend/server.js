import "dotenv/config";
import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json({ limit: "20kb" }));
const PORT = Number(process.env.PORT || 8787);
const API_KEY = (process.env.CHECK_API_KEY || "").trim();
const HEADLESS = String(process.env.HEADLESS || "false").toLowerCase() === "true";
console.log(`Starting server on port ${PORT} | HEADLESS=${HEADLESS}`);
let browserPromise;

function authorized(req) {
  console.log(`Authorization check: API_KEY is ${API_KEY ? "set" : "not set"}`, `Provided Authorization: ${req.headers.authorization || "none"}`);
  return !API_KEY || req.headers.authorization === `Bearer ${API_KEY}`;
}

async function browser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: HEADLESS,
      args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-blink-features=AutomationControlled"]
    }).catch(e => { browserPromise = undefined; throw e; });
  }
  return browserPromise;
}

async function inspect(url) {
  const b = await browser();
  const context = await b.newContext({
    viewport: { width: 1365, height: 900 },
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.35));
    await page.waitForTimeout(1500);
    return await page.evaluate(() => {
      const visible = el => { const s=getComputedStyle(el), r=el.getBoundingClientRect(); return s.display!=="none" && s.visibility!=="hidden" && r.width>0 && r.height>0; };
      const controls=[...document.querySelectorAll("button,a,[role='button']")].filter(visible).map(el => ({
        tag: el.tagName.toLowerCase(), text:(el.innerText||el.textContent||"").trim().replace(/\s+/g," "), aria:el.getAttribute("aria-label")||"", disabled:el.hasAttribute("disabled")||el.getAttribute("aria-disabled")==="true"
      })).filter(x=>x.text||x.aria).slice(0,300);
      const bookTickets=controls.filter(x=>/book\s*tickets/i.test(`${x.text} ${x.aria}`)&&!x.disabled);
      console.log({ title:document.title, url:location.href, bookTicketsVisible:bookTickets.length>0, bookTickets, pageText:(document.body?.innerText||"").slice(0,12000) })
      return { title:document.title, url:location.href, bookTicketsVisible:bookTickets.length>0, bookTickets, pageText:(document.body?.innerText||"").slice(0,12000) };
    });
  } finally { await context.close(); }
}

app.get("/health", (_,res)=>res.json({ok:true,service:"personal-alert-backend"}));
app.post("/check", async (req,res)=>{
  console.log(`Received check request for URL: ${req.body?.url}`, `Authorized: ${authorized(req)}`);
  if (!authorized(req)) return res.status(401).json({error:"Unauthorized"});
  const url=String(req.body?.url||"").trim();
  let u; try { u=new URL(url); } catch { return res.status(400).json({error:"Invalid URL"}); }
  if (!["http:","https:"].includes(u.protocol)) return res.status(400).json({error:"Only HTTP/HTTPS URLs are allowed"});
  try { const started=Date.now(); const result=await inspect(u.toString()); res.json({ok:true,checkedAt:new Date().toISOString(),elapsedMs:Date.now()-started,...result}); }
  catch(e) { console.error(e); res.status(502).json({ok:false,error:e?.message||"Browser check failed"}); }
});
const server=app.listen(PORT, "0.0.0.0",()=>console.log(`Listening on http://localhost:${PORT} | HEADLESS=${HEADLESS}`));
async function shutdown(){ try{if(browserPromise)(await browserPromise).close();}finally{server.close(()=>process.exit(0));} }
process.on("SIGINT",shutdown); process.on("SIGTERM",shutdown);
