// content/ncbi_api_handler.js

if (typeof window.MDPIFilterNcbiApiHandler === 'undefined') {
  // console.log("[MDPI Filter NCBI API] Initializing NCBI API Handler module...");

  const MDPI_DOMAIN = 'mdpi.com'; // Needed for checking journal names, though not directly used in API call itself for MDPI status
  const MDPI_DOI_PREFIX = '10.3390'; // For identifying MDPI DOIs

  async function checkNcbiIdsForMdpi(ids, idType, runCache, ncbiApiCache) { // ids is an array
    console.log(`[MDPI Filter NCBI API DEBUG] >>> checkNcbiIdsForMdpi ENTRY. Type: ${idType}, IDs to check:`, JSON.parse(JSON.stringify(ids)));

    if (!ids || ids.length === 0) {
      console.log("[MDPI Filter NCBI API DEBUG] No IDs provided. Returning false.");
      return false;
    }

    const idsToQueryApi = [];
    ids.forEach(id => {
      if (ncbiApiCache.has(id)) {
        const cachedValue = ncbiApiCache.get(id);
        runCache.set(id, cachedValue);
        console.log(`[MDPI Filter NCBI API DEBUG] ID '${id}' (type: ${idType}) found in ncbiApiCache. Value:`, cachedValue);
      } else {
        console.log(`[MDPI Filter NCBI API DEBUG] ID '${id}' (type: ${idType}) NOT in ncbiApiCache. Will query API.`);
        idsToQueryApi.push(id);
      }
    });

    console.log(`[MDPI Filter NCBI API DEBUG] IDs to query API (after ncbiApiCache check): ${idsToQueryApi.length}`, JSON.parse(JSON.stringify(idsToQueryApi)));

    if (idsToQueryApi.length === 0) {
      console.log("[MDPI Filter NCBI API DEBUG] All IDs were found in ncbiApiCache. Skipping API call.");
      const anyMdpiInCache = ids.some(id => runCache.get(id) === true);
      console.log(`[MDPI Filter NCBI API DEBUG] Result based on ncbiApiCache only: ${anyMdpiInCache}`);
      return anyMdpiInCache;
    }

    const BATCH_SIZE = 20;
    let overallFoundMdpiInBatches = false;

    for (let i = 0; i < idsToQueryApi.length; i += BATCH_SIZE) {
      const batchIdsToQuery = idsToQueryApi.slice(i, i + BATCH_SIZE);
      if (batchIdsToQuery.length === 0) continue;

      const idsString = batchIdsToQuery.join(',');
      const encodedIdType = encodeURIComponent(idType);
      const toolName = 'MDPIFilterChromeExtension';
      const maintainerEmail = 'dicing_nastily314@aleeas.com';
      const encodedToolName = encodeURIComponent(toolName);
      const encodedMaintainerEmail = encodeURIComponent(maintainerEmail);

      const apiUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${idsString}&idtype=${encodedIdType}&format=json&versions=no&tool=${encodedToolName}&email=${encodedMaintainerEmail}`;
      console.log(`[MDPI Filter NCBI API DEBUG] Querying NCBI API for batch (type ${idType}). URL: ${apiUrl}`, JSON.parse(JSON.stringify(batchIdsToQuery)));

      try {
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          console.log(`[MDPI Filter NCBI API DEBUG] Received API data for batch (type ${idType}):`, JSON.parse(JSON.stringify(data)));
          const processedInThisBatch = new Set();

          if (data.records && data.records.length > 0) {
            data.records.forEach(record => {
              console.log(`[MDPI Filter NCBI API DEBUG] Processing API record:`, JSON.parse(JSON.stringify(record)));
              const queriedId = batchIdsToQuery.find(qid =>
                (record.pmid && qid.toString() === record.pmid.toString()) ||
                (record.pmcid && qid.toString().toUpperCase() === record.pmcid.toString().toUpperCase()) ||
                (record.doi && qid.toString().toLowerCase() === record.doi.toString().toLowerCase()) ||
                (record.live && record.versions && record.versions[0] && record.versions[0].pmid && qid.toString() === record.versions[0].pmid.toString()) || // Handle cases where ID is in versions
                (record.live && record.versions && record.versions[0] && record.versions[0].pmcid && qid.toString().toUpperCase() === record.versions[0].pmcid.toString().toUpperCase()) ||
                (record.live && record.versions && record.versions[0] && record.versions[0].doi && qid.toString().toLowerCase() === record.versions[0].doi.toString().toLowerCase())
              );


              if (queriedId) {
                processedInThisBatch.add(queriedId.toString());
                let isMdpi = false;
                let effectiveDoi = record.doi;
                if (record.live && record.versions && record.versions[0] && record.versions[0].doi) {
                    effectiveDoi = record.versions[0].doi; // Prefer DOI from version if available
                }

                console.log(`[MDPI Filter NCBI API DEBUG] Matched API record for queried ID '${queriedId}'. Effective DOI: '${effectiveDoi}'`);

                if (effectiveDoi && effectiveDoi.startsWith(MDPI_DOI_PREFIX)) {
                  isMdpi = true;
                  console.log(`[MDPI Filter NCBI API DEBUG] MDPI article FOUND by DOI '${effectiveDoi}' for ID '${queriedId}'. Setting isMdpi = true.`);
                } else {
                  console.log(`[MDPI Filter NCBI API DEBUG] Non-MDPI DOI '${effectiveDoi}' for ID '${queriedId}'. Setting isMdpi = false.`);
                }
                runCache.set(queriedId, isMdpi);
                ncbiApiCache.set(queriedId, isMdpi);
                console.log(`[MDPI Filter NCBI API DEBUG] Updated runCache and ncbiApiCache for ID '${queriedId}' with isMdpi: ${isMdpi}`);

                if (isMdpi) overallFoundMdpiInBatches = true;
              } else {
                console.warn(`[MDPI Filter NCBI API DEBUG] Could not map API record back to a queried ID in batch. Record:`, JSON.parse(JSON.stringify(record)), `Batch IDs:`, JSON.parse(JSON.stringify(batchIdsToQuery)));
              }
            });
          } else {
            console.log(`[MDPI Filter NCBI API DEBUG] API response OK, but no records found in data for batch (type ${idType}).`);
          }

          batchIdsToQuery.forEach(id => {
            if (!processedInThisBatch.has(id.toString())) {
              console.log(`[MDPI Filter NCBI API DEBUG] ID '${id}' (type ${idType}) was in API query batch but not in response records. Marking as non-MDPI (false).`);
              if (!runCache.has(id)) runCache.set(id, false);
              if (!ncbiApiCache.has(id)) ncbiApiCache.set(id, false); // Persist this "not found in NCBI" as false
            }
          });

        } else {
          console.error(`[MDPI Filter NCBI API DEBUG] NCBI API request FAILED for batch (type ${idType}) ${batchIdsToQuery.join(', ')}: ${response.status} ${response.statusText}`);
          batchIdsToQuery.forEach(id => {
            if (!runCache.has(id)) {
              console.log(`[MDPI Filter NCBI API DEBUG] Setting runCache for ID '${id}' (type ${idType}) to false due to API failure.`);
              runCache.set(id, false);
            }
          });
        }
      } catch (error) {
        console.error(`[MDPI Filter NCBI API DEBUG] Network/Processing ERROR for NCBI batch (type ${idType}) ${batchIdsToQuery.join(', ')}:`, error);
        batchIdsToQuery.forEach(id => {
          if (!runCache.has(id)) {
            console.log(`[MDPI Filter NCBI API DEBUG] Setting runCache for ID '${id}' (type ${idType}) to false due to fetch/processing error.`);
            runCache.set(id, false);
          }
        });
      }
    }

    const finalResult = ids.some(id => runCache.get(id) === true);
    console.log(`[MDPI Filter NCBI API DEBUG] <<< checkNcbiIdsForMdpi EXIT. Final result for type ${idType} (any MDPI found): ${finalResult}. RunCache contents for these IDs:`);
    ids.forEach(id => console.log(`    ID: ${id}, MDPI: ${runCache.get(id)}`));
    return finalResult;
  }

  window.MDPIFilterNcbiApiHandler = {
    checkNcbiIdsForMdpi
  };

  // console.log("[MDPI Filter NCBI API] NCBI API Handler module loaded.");
} else {
  // console.log("[MDPI Filter NCBI API] NCBI API Handler module already loaded.");
}