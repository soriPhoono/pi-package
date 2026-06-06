import "./style.css";
import { setupCounter } from "./counter.js";

document.querySelector("#app").innerHTML = `
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
`;

setupCounter(document.querySelector("#counter-widget"));
