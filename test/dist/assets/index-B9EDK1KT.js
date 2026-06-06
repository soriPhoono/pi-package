(function(){const o=document.createElement("link").relList;if(o&&o.supports&&o.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))s(e);new MutationObserver(e=>{for(const t of e)if(t.type==="childList")for(const n of t.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&s(n)}).observe(document,{childList:!0,subtree:!0});function i(e){const t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?t.credentials="include":e.crossOrigin==="anonymous"?t.credentials="omit":t.credentials="same-origin",t}function s(e){if(e.ep)return;e.ep=!0;const t=i(e);fetch(e.href,t)}})();function l(r){let o=0;const i=document.createElement("span");i.className="text-3xl font-mono tabular-nums text-amber-300",i.textContent=o;const s=document.createElement("button");s.className="mt-3 px-6 py-2 bg-white/20 hover:bg-white/30 rounded-full font-semibold transition-colors cursor-pointer",s.textContent="Click me",s.addEventListener("click",()=>{o++,i.textContent=o}),r.appendChild(i),r.appendChild(document.createElement("br")),r.appendChild(s)}document.querySelector("#app").innerHTML=`
  <div class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-700 text-white p-8">
    <header class="text-center mb-12">
      <h1 class="text-5xl font-bold mb-4 drop-shadow-lg">Plan Mode Test</h1>
      <p class="text-xl text-indigo-200 max-w-md">
        Built with Vite + Tailwind CSS v4 &mdash; testing the plan mode pipeline.
      </p>
    </header>

    <section class="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full mb-12">
      <div class="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center">
        <div class="text-3xl mb-2">📋</div>
        <h2 class="text-lg font-semibold mb-1">Plan</h2>
        <p class="text-sm text-indigo-200">Structured steps tracked via plan_tool</p>
      </div>
      <div class="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center">
        <div class="text-3xl mb-2">⚡</div>
        <h2 class="text-lg font-semibold mb-1">Execute</h2>
        <p class="text-sm text-indigo-200">[DONE:n] markers track progress</p>
      </div>
      <div class="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center">
        <div class="text-3xl mb-2">✅</div>
        <h2 class="text-lg font-semibold mb-1">Verify</h2>
        <p class="text-sm text-indigo-200">Build output confirms the pipeline works</p>
      </div>
    </section>

    <section class="bg-white/10 backdrop-blur-sm rounded-2xl p-8 max-w-sm w-full text-center">
      <h2 class="text-2xl font-semibold mb-4">Counter Widget</h2>
      <div id="counter-widget"></div>
    </section>

    <footer class="mt-auto pt-12 text-indigo-300 text-sm">
      pi-package &middot; plan-mode extension &middot; v0.1.0
    </footer>
  </div>
`;l(document.querySelector("#counter-widget"));
