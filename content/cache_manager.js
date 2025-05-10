// --- Global Caches for MDPI Filter ---

if (typeof window.MDPIFilterCaches === 'undefined') {
  // console.log("[MDPI Filter CacheManager] Initializing caches.");
  window.MDPIFilterCaches = {
    // --- Global Persistent Cache for NCBI API responses ---
    ncbiApiCache: new Map(), // Stores ID (string) -> isMDPI (boolean)

    // --- Cache for processed citation items to avoid re-evaluating their MDPI status ---
    citationProcessCache: new WeakMap() // Stores Element -> isMDPI (boolean)
  };
} else {
  // console.log("[MDPI Filter CacheManager] Caches already initialized.");
}