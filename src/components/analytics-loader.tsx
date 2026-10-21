// GoatCounter loader (ADR 0004 §2, deployment design E). A server component that emits one inline
// script and no client JavaScript, so the first-load bundles do not grow. count.js is injected only
// after the page has loaded and the browser is idle, so it never competes with the journey.
// `goatCounterUrl` is validated by readSiteEnv (https://<code>.goatcounter.com/count) and is null
// unless this is a production build with the variable set; then nothing is rendered at all.
// A visitor who sends Do Not Track or Global Privacy Control gets nothing: tracking stays off, so
// track() is a no-op and queues nothing. A second run of the script is also a no-op.
//
// count.js is pinned to a versioned file with Subresource Integrity, so a change on the CDN cannot
// run in our pages. The hash is the one GoatCounter publishes at
// https://www.goatcounter.com/help/countjs-versions and was re-computed from the downloaded file
// (openssl dgst -sha384 -binary | openssl base64 -A) on 2026-10-21. A newer version means a new
// hash: update both together. gc.zgo.at answers with Access-Control-Allow-Origin: *, which the
// anonymous CORS request needs.
const COUNT_JS = "https://gc.zgo.at/count.v5.js";
const COUNT_JS_INTEGRITY =
  "sha384-atnOLvQb9t+jTSipvd75X2yginT4PjVbqDdlJAmxMm+wYElFmeR6EmLP5bYeoRVQ";

function loaderScript(goatCounterUrl: string): string {
  return `(function(){
if(window.__jisrAnalytics)return;
if(navigator.doNotTrack==="1"||navigator.globalPrivacyControl)return;
var url=${JSON.stringify(goatCounterUrl)};
window.__jisrAnalytics=true;
window.goatcounter={endpoint:url};
var started=false;
function flush(){
var queued=window.__jisrEvents||[];
window.__jisrEvents=[];
var gc=window.goatcounter;
if(gc&&gc.count)for(var i=0;i<queued.length;i++)gc.count({path:queued[i],event:true});
}
function load(){
if(started)return;
started=true;
var s=document.createElement("script");
s.async=true;
s.src=${JSON.stringify(COUNT_JS)};
s.setAttribute("integrity",${JSON.stringify(COUNT_JS_INTEGRITY)});
s.setAttribute("crossorigin","anonymous");
s.setAttribute("data-goatcounter",url);
s.onload=flush;
document.head.appendChild(s);
}
function whenIdle(){
if("requestIdleCallback" in window)window.requestIdleCallback(load,{timeout:5000});
else setTimeout(load,2000);
}
if(document.readyState==="complete")whenIdle();
else window.addEventListener("load",whenIdle);
})();`;
}

export function AnalyticsLoader({ goatCounterUrl }: { goatCounterUrl: string | null }) {
  if (goatCounterUrl === null) return null;
  // biome-ignore lint/security/noDangerouslySetInnerHtml: the script is a fixed template; the only interpolated value is a JSON-encoded URL that readSiteEnv restricts to https://<code>.goatcounter.com/count
  return <script dangerouslySetInnerHTML={{ __html: loaderScript(goatCounterUrl) }} />;
}
