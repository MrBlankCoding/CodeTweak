window.addEventListener('message', (event) => {
  const { id, code } = event.data || {};
  if (!id || typeof code !== 'string') return;
  try {
    const evaluator = new Function(`"use strict"; return (${code});`);
    const result = evaluator();
    event.source?.postMessage({ id, success: true, result }, '*');
  } catch (error) {
    event.source?.postMessage({ id, success: false, error: String(error?.message || error) }, '*');
  }
});
