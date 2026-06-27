const FRONTEND_CHUNKS = [
  './state/storage.js',
  './api/backend-bridge.js',
  './ui/utilities.js',
  './state/inventory-helpers.js',
  './ui/csv.js',
  './ui/shell.js',
  './ui/modal.js',
  './modules/dashboard/index.js',
  './modules/purchase-orders/index.js',
  './modules/supply-chain/index.js',
  './modules/procurement/index.js',
  './modules/production/index.js',
  './modules/shipping/index.js',
  './modules/suppliers/index.js',
  './modules/catalog/index.js',
  './modules/users/index.js',
  './modules/customer-portal/index.js',
  './modules/inventory/index.js',
  './modules/content-library/index.js',
  './modules/team-chat/index.js',
  './modules/food-safety/index.js',
  './modules/machinery/index.js',
  './modules/quality/index.js',
  './modules/pick-pack/index.js',
  './api/research-backend.js',
  './modules/feedback/index.js',
  './modules/research/index.js',
  './ui/init.js',
];

function loadFrontendChunk(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(path, import.meta.url).href;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load frontend chunk: ${path}`));
    document.head.appendChild(script);
  });
}

try {
  for (const chunk of FRONTEND_CHUNKS) {
    await loadFrontendChunk(chunk);
  }
} catch (error) {
  console.error(error);
  const content = document.getElementById('content');
  if (content) {
    content.innerHTML = '<div class="empty-state"><h3>Unable to load the ERP frontend.</h3><p>Refresh the page. If this continues, check the browser console for the failed module path.</p></div>';
  }
}