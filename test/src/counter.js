/**
 * A simple counter widget to verify the Vite dev pipeline.
 * Increments on click — classic vanilla JS test.
 */
export function setupCounter(element) {
  let count = 0;
  const display = document.createElement("span");
  display.className = "text-3xl font-mono tabular-nums text-amber-300";
  display.textContent = count;

  const button = document.createElement("button");
  button.className =
    "mt-3 px-6 py-2 bg-white/20 hover:bg-white/30 rounded-full font-semibold transition-colors cursor-pointer";
  button.textContent = "Click me";

  button.addEventListener("click", () => {
    count++;
    display.textContent = count;
  });

  element.appendChild(display);
  element.appendChild(document.createElement("br"));
  element.appendChild(button);
}
