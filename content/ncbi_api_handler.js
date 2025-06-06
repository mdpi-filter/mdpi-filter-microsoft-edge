// content/ncbi_api_handler.js

if (typeof window.MDPIFilterNcbiApiHandler === 'undefined') {
  // console.log("[MDPI Filter NCBI API] Initializing NCBI API Handler module...");

  const MDPI_DOMAINS = ['mdpi.com', 'mdpi.org']; // Needed for checking journal names, though not directly used in API call itself for MDPI status
  const MDPI_DOI_PREFIX = '10.3390'; // For identifying MDPI DOIs

  async function checkNcbiIdsForMdpi(ids, idType, runCache, ncbiApiCache) {
    // Respect user opt-out for NCBI API
    if (window.MDPIFilterSettings && window.MDPIFilterSettings.ncbiApiEnabled === false) {
      console.log("[MDPI Filter NCBI API] Skipping lookup: user opt-out");
      return false;
    }
    // Filter out DOIs with fragments or invalid chars
    if (idType === 'doi') {
      ids = ids.map(id => id.split('#')[0].split('?')[0].trim())
               .filter(id => /^[0-9.]+\/[^\s"'<>&]+$/.test(id));
    }

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

    const BATCH_SIZE = 200;
    const PAUSE_MS = 350;   // ~3 calls/sec

    for (let i = 0; i < idsToQueryApi.length; i += BATCH_SIZE) {
      const batchIdsToQuery = idsToQueryApi.slice(i, i + BATCH_SIZE);
      if (batchIdsToQuery.length === 0) continue;

      const idsString = batchIdsToQuery.join(',');
      const encodedIdType = encodeURIComponent(idType);
      const toolName = '%%NCBI_TOOL_NAME%%'; // Placeholder for tool name
      const maintainerEmail = '%%NCBI_API_EMAIL%%'; // Placeholder for email
      const encodedToolName = encodeURIComponent(toolName);
      const encodedMaintainerEmail = encodeURIComponent(maintainerEmail);

      const apiUrl = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${idsString}&idtype=${encodedIdType}&format=json&versions=no&tool=${encodedToolName}&email=${encodedMaintainerEmail}`;
      console.log(`[MDPI Filter NCBI API DEBUG] Querying NCBI API for batch (type ${idType}). URL: ${apiUrl}`, JSON.parse(JSON.stringify(batchIdsToQuery)));

      try {
        const response = await fetch(apiUrl);
        if (response.ok) {
          // Defensive: check content-type
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            console.error(`[MDPI Filter NCBI API DEBUG] NCBI API did not return JSON. Content-Type: ${contentType}`);
            batchIdsToQuery.forEach(id => {
              if (!runCache.has(id)) runCache.set(id, false);
              if (!ncbiApiCache.has(id)) ncbiApiCache.set(id, false);
            });
            continue;
          }
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
                (record.live && record.versions && record.versions[0] && record.versions[0].pmid && qid.toString() === record.versions[0].pmid.toString()) || 
                (record.live && record.versions && record.versions[0] && record.versions[0].pmcid && qid.toString().toUpperCase() === record.versions[0].pmcid.toString().toUpperCase()) ||
                (record.live && record.versions && record.versions[0] && record.versions[0].doi && qid.toString().toLowerCase() === record.versions[0].doi.toString().toLowerCase())
              );

              if (queriedId) {
                processedInThisBatch.add(queriedId.toString());
                let isMdpi = false;
                const effectiveDoi = record.doi || (record.versions && record.versions[0] ? record.versions[0].doi : null);
                if (effectiveDoi) {
                  if (effectiveDoi.startsWith(MDPI_DOI_PREFIX)) {
                    isMdpi = true;
                  }
                } else if (record.journal && typeof record.journal === 'string') {
                  const journalHost = record.journal.toLowerCase();
                  for (const domain of MDPI_DOMAINS) {
                    if (journalHost === domain || journalHost.endsWith('.' + domain)) {
                      isMdpi = true;
                      break; // Found a match, no need to check other domains
                    }
                  }
                }

                console.log(`[MDPI Filter NCBI API DEBUG] DIAGNOSTIC: Before runCache.set for ID '${queriedId}'. runCache type: ${typeof runCache}, is Map: ${runCache instanceof Map}, runCache value:`, runCache);
                
                runCache.set(queriedId, isMdpi);
                ncbiApiCache.set(queriedId, isMdpi);
                if (isMdpi) {
                  overallFoundMdpiInBatches = true;
                }
              } else {
                console.log(`[MDPI Filter NCBI API DEBUG] API record did not match any queried ID in this batch:`, JSON.parse(JSON.stringify(record)));
              }
            });
          } else {
            console.log(`[MDPI Filter NCBI API DEBUG] API response OK, but no records found in data for batch (type ${idType}).`);
          }

          batchIdsToQuery.forEach(id => {
            if (!processedInThisBatch.has(id.toString())) {
              console.log(`[MDPI Filter NCBI API DEBUG] ID '${id}' (type ${idType}) was in API query batch but not in response records. Marking as non-MDPI (false).`);
              console.log(`[MDPI Filter NCBI API DEBUG] DIAGNOSTIC: Before runCache.set (unprocessed ID) for ID '${id}'. runCache type: ${typeof runCache}, is Map: ${runCache instanceof Map}`);
              if (!runCache.has(id)) runCache.set(id, false);
              if (!ncbiApiCache.has(id)) ncbiApiCache.set(id, false);
            }
          });

        } else {
          console.error(`[MDPI Filter NCBI API DEBUG] NCBI API request FAILED for batch (type ${idType}) ${batchIdsToQuery.join(', ')}: ${response.status} ${response.statusText}`);
          batchIdsToQuery.forEach(id => {
            console.log(`[MDPI Filter NCBI API DEBUG] DIAGNOSTIC: Before runCache.set (API failure) for ID '${id}'. runCache type: ${typeof runCache}, is Map: ${runCache instanceof Map}`);
            if (!runCache.has(id)) {
              runCache.set(id, false);
            }
          });
        }
      } catch (error) {
        console.error(`[MDPI Filter NCBI API DEBUG] Network/Processing ERROR for NCBI batch (type ${idType}) ${batchIdsToQuery.join(', ')}:`, error);
        batchIdsToQuery.forEach(id => {
          console.log(`[MDPI Filter NCBI API DEBUG] DIAGNOSTIC: Before runCache.set (catch block) for ID '${id}'. runCache type: ${typeof runCache}, is Map: ${runCache instanceof Map}`);
          if (!runCache.has(id)) {
            runCache.set(id, false);
          }
        });
      }

      // throttle: wait before next request if more batches remain
      if (i + BATCH_SIZE < idsToQueryApi.length) {
        await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
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