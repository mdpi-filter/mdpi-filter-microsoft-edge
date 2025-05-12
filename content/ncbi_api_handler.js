// content/ncbi_api_handler.js

if (typeof window.MDPIFilterNcbiApiHandler === 'undefined') {
  // console.log("[MDPI Filter NCBI API] Initializing NCBI API Handler module...");

  const MDPI_DOMAIN = 'mdpi.com'; // Needed for checking journal names, though not directly used in API call itself for MDPI status
  const MDPI_DOI_PREFIX = '10.3390'; // For identifying MDPI DOIs

  async function checkNcbiIdsForMdpi(ids, idType, runCache, ncbiApiCache) { // ids is an array
    if (!ids || ids.length === 0) {
      return false;
    }

    const idsToQueryApi = [];
    // First, check the persistent ncbiApiCache
    ids.forEach(id => {
      if (ncbiApiCache.has(id)) {
        runCache.set(id, ncbiApiCache.get(id)); // Populate current runCache from persistent cache
      } else {
        idsToQueryApi.push(id); // This ID needs to be fetched
      }
    });

    if (idsToQueryApi.length === 0) {
      // All IDs were found in the persistent cache.
      // Check if any of the original IDs (now in runCache) are MDPI.
      return ids.some(id => runCache.get(id) === true);
    }

    const BATCH_SIZE = 20; // NCBI E-utils recommend not exceeding 200 PMIDs for efetch, idconv might have similar considerations
    let overallFoundMdpiInBatches = false;

    for (let i = 0; i < idsToQueryApi.length; i += BATCH_SIZE) {
      const batchIdsToQuery = idsToQueryApi.slice(i, i + BATCH_SIZE);
      if (batchIdsToQuery.length === 0) {
        continue;
      }

      const idsString = batchIdsToQuery.join(',');
      const encodedIdType = encodeURIComponent(idType);
      const toolName = 'MDPIFilterChromeExtension';
      const maintainerEmail = 'dicing_nastily314@aleeas.com'; // Replace with a real or placeholder email
      const encodedToolName = encodeURIComponent(toolName);
      const encodedMaintainerEmail = encodeURIComponent(maintainerEmail);

      // Construct the API URL
      // Note: 'retmode=json' and 'version=2.0' are for esummary. 'format=json' is for idconv.
      // 'versions=no' for idconv to get the most current version of IDs.
      const apiUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${idsString}&idtype=${encodedIdType}&format=json&versions=no&tool=${encodedToolName}&email=${encodedMaintainerEmail}`;
      // console.log(`[MDPI Filter NCBI API] Querying NCBI API for ${idType}s:`, batchIdsToQuery.join(', '));

      try {
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          // console.log(`[MDPI Filter NCBI API] Received data for batch:`, data);

          if (data.records && data.records.length > 0) {
            data.records.forEach(record => {
              const originalId = record.pmid || record.pmcid || record.doi; // Determine which ID was used for query if possible
                                                                          // idconv returns pmid, pmcid, doi if available.
                                                                          // We need to map back to the queried ID.
                                                                          // The 'ids' parameter in the request maintains order with response.
                                                                          // However, idconv response records might not be in the same order if some IDs are invalid.
                                                                          // It's safer to iterate batchIdsToQuery and find corresponding record.

              const queriedId = batchIdsToQuery.find(qid =>
                (record.pmid && qid.toString() === record.pmid.toString()) ||
                (record.pmcid && qid.toString().toUpperCase() === record.pmcid.toString().toUpperCase()) ||
                (record.doi && qid.toString().toLowerCase() === record.doi.toString().toLowerCase())
              );


              if (!queriedId) {
                // console.warn(`[MDPI Filter NCBI API] Could not map API record back to a queried ID. Record:`, record);
                return; // Skip this record
              }

              let isMdpi = false;
              // Check 1: Journal name (less reliable, but a good heuristic)
              // idconv doesn't directly provide journal names. This check is more for esummary.
              // For idconv, we rely on DOI.

              // Check 2: DOI prefix
              if (record.doi && record.doi.startsWith(MDPI_DOI_PREFIX)) {
                isMdpi = true;
              }

              // Check 3: Publisher (if available and reliable - idconv doesn't provide this)

              // Store result in both caches
              runCache.set(queriedId, isMdpi);
              ncbiApiCache.set(queriedId, isMdpi); // Persist result

              if (isMdpi) {
                overallFoundMdpiInBatches = true; // If any item in any batch is MDPI
                // console.log(`[MDPI Filter NCBI API] MDPI article found by DOI for ID ${queriedId}: ${record.doi}`);
              }
            });
          } else {
            // console.log(`[MDPI Filter NCBI API] No records returned or empty records array for batch:`, batchIdsToQuery.join(', '));
            // Mark all queried IDs in this batch as not found/not MDPI in caches
            batchIdsToQuery.forEach(id => {
              if (!runCache.has(id)) runCache.set(id, false);
              if (!ncbiApiCache.has(id)) ncbiApiCache.set(id, false);
            });
          }
        } else {
          console.error(`[MDPI Filter NCBI API] NCBI API request failed for batch ${batchIdsToQuery.join(', ')}: ${response.status} ${response.statusText}`);
          // Mark all queried IDs in this batch as not found/not MDPI in caches due to API error
          batchIdsToQuery.forEach(id => {
            if (!runCache.has(id)) runCache.set(id, false); // Default to false on error
            if (!ncbiApiCache.has(id)) ncbiApiCache.set(id, false);
          });
        }
      } catch (error) {
        console.error(`[MDPI Filter NCBI API] Error fetching or processing NCBI data for batch ${batchIdsToQuery.join(', ')}:`, error);
        // Mark all queried IDs in this batch as not found/not MDPI in caches due to fetch error
        batchIdsToQuery.forEach(id => {
          if (!runCache.has(id)) runCache.set(id, false); // Default to false on error
          if (!ncbiApiCache.has(id)) ncbiApiCache.set(id, false);
        });
      }
    } // end of for loop for batches

    // After processing API calls (if any), check all original input 'ids' against the now populated runCache.
    // This ensures that even if some IDs were from cache and some from API, the final check is comprehensive.
    return ids.some(id => runCache.get(id) === true);
  }


  window.MDPIFilterNcbiApiHandler = {
    checkNcbiIdsForMdpi
  };

  // console.log("[MDPI Filter NCBI API] NCBI API Handler module loaded.");
} else {
  // console.log("[MDPI Filter NCBI API] NCBI API Handler module already loaded.");
}