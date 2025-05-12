// content/ncbi_api_handler.js

if (typeof window.MDPIFilterNcbiApiHandler === 'undefined') {
  // console.log("[MDPI Filter NCBI API] Initializing NCBI API Handler module...");

  const MDPI_DOMAIN = 'mdpi.com'; // Needed for checking journal names, though not directly used in API call itself for MDPI status
  const MDPI_DOI_PREFIX = '10.3390'; // For identifying MDPI DOIs

  async function checkNcbiIdsForMdpi(ids, idType, runCache, ncbiApiCache) { // ids is an array
    console.log(`[MDPI Filter NCBI API] checkNcbiIdsForMdpi called with ${ids.length} IDs. Type: ${idType}, IDs:`, ids);

    if (!ids || ids.length === 0) {
      console.log("[MDPI Filter NCBI API] No IDs provided to checkNcbiIdsForMdpi.");
      return false;
    }

    const idsToQueryApi = [];
    // First, check the persistent ncbiApiCache
    ids.forEach(id => {
      if (ncbiApiCache.has(id)) {
        runCache.set(id, ncbiApiCache.get(id)); // Populate current runCache from persistent cache
        // console.log(`[MDPI Filter NCBI API] ID ${id} found in ncbiApiCache. Value: ${ncbiApiCache.get(id)}`);
      } else {
        idsToQueryApi.push(id); // This ID needs to be fetched
      }
    });

    console.log(`[MDPI Filter NCBI API] IDs to query API (after cache check): ${idsToQueryApi.length}`, idsToQueryApi);

    if (idsToQueryApi.length === 0) {
      console.log("[MDPI Filter NCBI API] All IDs were found in ncbiApiCache. Skipping API call.");
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

      const apiUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${idsString}&idtype=${encodedIdType}&format=json&versions=no&tool=${encodedToolName}&email=${encodedMaintainerEmail}`;
      console.log(`[MDPI Filter NCBI API] Querying NCBI API for batch. URL: ${apiUrl}`, batchIdsToQuery);

      try {
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          console.log(`[MDPI Filter NCBI API] Received data for batch:`, data);
          const processedInThisBatch = new Set(); // Track IDs successfully processed from records

          if (data.records && data.records.length > 0) {
            data.records.forEach(record => {
              const queriedId = batchIdsToQuery.find(qid =>
                (record.pmid && qid.toString() === record.pmid.toString()) ||
                (record.pmcid && qid.toString().toUpperCase() === record.pmcid.toString().toUpperCase()) ||
                (record.doi && qid.toString().toLowerCase() === record.doi.toString().toLowerCase())
              );

              if (queriedId) {
                processedInThisBatch.add(queriedId.toString()); // Ensure consistent type for Set
                let isMdpi = false;
                if (record.doi && record.doi.startsWith(MDPI_DOI_PREFIX)) {
                  isMdpi = true;
                }
                // Store result in both caches for successfully processed ID
                runCache.set(queriedId, isMdpi);
                ncbiApiCache.set(queriedId, isMdpi); // Persist successful lookup

                if (isMdpi) {
                  overallFoundMdpiInBatches = true;
                  console.log(`[MDPI Filter NCBI API] MDPI article found by DOI for ID ${queriedId}: ${record.doi}`);
                }
              } else {
                console.warn(`[MDPI Filter NCBI API] Could not map API record back to a queried ID. Record:`, record);
              }
            });
          }

          // For any ID in the batch that wasn't found in a returned record (after a successful API call),
          // or if the successful API call returned no records for the batch.
          batchIdsToQuery.forEach(id => {
            if (!processedInThisBatch.has(id.toString())) {
              // This ID was part of a successful API query batch but no record was returned for it,
              // or the entire batch returned no records. Mark as not MDPI in both caches.
              if (!runCache.has(id)) runCache.set(id, false);
              if (!ncbiApiCache.has(id)) ncbiApiCache.set(id, false);
            }
          });

        } else { // API request failed (response.ok is false)
          console.error(`[MDPI Filter NCBI API] NCBI API request failed for batch ${batchIdsToQuery.join(', ')}: ${response.status} ${response.statusText}`);
          // Mark all queried IDs in this batch as not found/not MDPI in runCache only for this attempt.
          // Do NOT write to ncbiApiCache on API failure, to allow retries.
          batchIdsToQuery.forEach(id => {
            if (!runCache.has(id)) runCache.set(id, false);
          });
        }
      } catch (error) { // Network error or other issue during fetch/processing
        console.error(`[MDPI Filter NCBI API] Error fetching or processing NCBI data for batch ${batchIdsToQuery.join(', ')}:`, error);
        // Mark all queried IDs in this batch as not found/not MDPI in runCache only for this attempt.
        // Do NOT write to ncbiApiCache on fetch/processing failure, to allow retries.
        batchIdsToQuery.forEach(id => {
          if (!runCache.has(id)) runCache.set(id, false);
        });
      }
    } // end of for loop for batches

    // After processing API calls (if any), check all original input 'ids' against the now populated runCache.
    return ids.some(id => runCache.get(id) === true);
  }

  window.MDPIFilterNcbiApiHandler = {
    checkNcbiIdsForMdpi
  };

  // console.log("[MDPI Filter NCBI API] NCBI API Handler module loaded.");
} else {
  // console.log("[MDPI Filter NCBI API] NCBI API Handler module already loaded.");
}