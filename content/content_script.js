// content/content_script.js

if (!window.mdpiFilterInjected) {
  window.mdpiFilterInjected = true;
  // console.log("[MDPI Filter] Content script executing (mdpiFilterInjected set).");

  // --- Dependencies Check ---
  if (typeof window.MDPIFilterDomains === 'undefined') {
    console.error("[MDPI Filter] CRITICAL: window.MDPIFilterDomains is undefined. domains.js might not have loaded correctly.");
  }
  if (typeof window.sanitize === 'undefined') {
    console.error("[MDPI Filter] CRITICAL: window.sanitize is undefined. sanitizer.js might not have loaded correctly.");
  }
  // Add debounce dependency check if utils.js is separate
  if (typeof window.debounce === 'undefined') {
    // Basic debounce implementation if utils.js isn't guaranteed
    window.debounce = (fn, ms = 200) => {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
      };
    };
    console.warn("[MDPI Filter] Basic debounce function created as window.debounce was undefined.");
  }
  // ---

  // --- Constants, Selectors, State ---
  const MDPI_DOMAIN = 'mdpi.com';
  const MDPI_DOI    = '10.3390';
  const domains     = window.MDPIFilterDomains || {};
  const sanitize    = window.sanitize || (html => html);
  const uniqueMdpiReferences = new Set();
  let collectedMdpiReferences = []; // Array to store detailed reference info
  let refIdCounter = 0; // Counter for unique reference IDs

  const referenceListSelectors = [
    'li.c-article-references__item',
    'div.References p.ReferencesCopy1',
    'li.html-x',
    'li.html-xx',
    'div.citation',
    'div.reference',
    'li.separated-list-item',
    'li[id^="CR"]', // Springer
    'li[id^="ref-"]', // Generic
    'li[id^="reference-"]', // Generic
    'li[id^="B"]', // NCBI/PMC specific Bxx-journal-id format
    'li:has(> span > a[id^="ref-id-"])', // Some other format
    'li:has(a[name^="bbib"])', // Another format
    'li[data-bib-id]', // Wiley
    'span[aria-owns^="pdfjs_internal_id_"]', // PDF.js rendered spans
    'li[id^="cite_note-"]', // Wikipedia reference list items
    'div.refbegin li' // Wikipedia "Sources" or "Further reading" list items
  ].join(',');
  // ---

  chrome.storage.sync.get({ mode: 'highlight' }, ({ mode }) => {
    // console.log("[MDPI Filter] Mode:", mode);

    // --- Styling Functions ---
    const highlightStyle = '2px solid red';

    const styleSearch = el => {
      if (!el) return;
      if (mode === 'hide') el.style.display = 'none';
      else {
        el.style.border  = highlightStyle;
        el.style.padding = '5px';
      }
    };

    const styleSup = supOrA => {
      if (!supOrA) return;

      // Style the main element (sup or a)
      supOrA.style.color      = '#E2211C'; // MDPI Red
      supOrA.style.fontWeight = 'bold';

      // If supOrA is a sup element, specifically style any anchor tag and its content within it
      if (supOrA.tagName.toLowerCase() === 'sup') {
        const anchorElement = supOrA.querySelector('a');
        if (anchorElement) {
          anchorElement.style.color = '#E2211C'; // Ensure link text is red
          anchorElement.style.fontWeight = 'bold'; // Ensure link text is bold

          // Wikipedia uses spans for brackets, ensure they are also red
          const bracketSpans = anchorElement.querySelectorAll('span.cite-bracket');
          bracketSpans.forEach(span => {
            span.style.color = '#E2211C';
            // fontWeight will be inherited from the anchor or sup
          });
        }
      }
      // If supOrA is an anchor itself that contains a sup (less common for this specific issue)
      else if (supOrA.tagName.toLowerCase() === 'a') {
        const supElementInside = supOrA.querySelector('sup');
        if (supElementInside) {
            supElementInside.style.color = '#E2211C';
            supElementInside.style.fontWeight = 'bold';
        }
      }
    };

    const styleRef = (item, refId) => { // Accept refId
      item.style.color = '#E2211C';
      // Assign the unique ID as a data attribute
      item.dataset.mdpiFilterRefId = refId;

      let currentSibling = item.previousElementSibling;
      const referenceStartRegex = /^\s*\d+\.\s*/;

      while (currentSibling) {
        if (currentSibling.matches('span[aria-owns^="pdfjs_internal_id_"]')) {
          break;
        }

        if (currentSibling.matches('span')) {
          // Also assign the ID to preceding spans for potential targeting
          currentSibling.dataset.mdpiFilterRefId = refId;
          if (referenceStartRegex.test(currentSibling.textContent || '')) {
            currentSibling.style.color = '#E2211C';
            break;
          } else {
            currentSibling.style.color = '#E2211C';
          }
        } else if (currentSibling.tagName !== 'BR') {
          break;
        }
        currentSibling = currentSibling.previousElementSibling;
      }
    };

    const styleDirectLink = link => {
      const titleElement = link.querySelector('h3');
      const targetElement = titleElement || link;
      targetElement.style.color = '#E2211C';
      targetElement.style.borderBottom = '1px dotted #E2211C';
      if (targetElement !== link) {
        link.style.textDecoration = 'none';
      }
      if (window.getComputedStyle(targetElement).display === 'inline') {
        targetElement.style.display = 'inline-block';
      }
    };

    const styleLinkElement = link => {
      if (!link) return;
      link.style.color = '#E2211C';
      link.style.borderBottom = '1px dotted #E2211C';
      link.style.textDecoration = 'none';
      if (window.getComputedStyle(link).display === 'inline') {
        link.style.display = 'inline-block';
      }
    };
    // ---

    // --- Core Logic Functions ---

    // New helper: Just checks content, no side effects on datasets or global lists.
    const isMdpiItemByContent = (item) => {
      if (!item) return false; // Added a guard for null item
      const textContent = item.textContent || '';
      const innerHTML = item.innerHTML || '';

      // MDPI_DOMAIN = 'mdpi.com'; MDPI_DOI = '10.3390';

      // Priority 1: Check for direct MDPI links
      // Links to mdpi.com domain
      if (item.querySelector(`a[href*="${MDPI_DOMAIN}"]`)) {
        return true;
      }

      // Links containing specific MDPI DOI patterns (e.g., "10.3390/" or "doi.org/10.3390/")
      // This pattern looks for MDPI_DOI followed by a slash, or within a doi.org/dx.doi.org URL.
      const mdpiDoiPatternInLink = new RegExp(`${MDPI_DOI.replace(/\./g, '\\.')}/|doi\\.org/${MDPI_DOI.replace(/\./g, '\\.')}/|dx\\.doi\\.org/${MDPI_DOI.replace(/\./g, '\\.')}/`);
      const allLinksQuery = item.querySelectorAll('a[href], a[data-track-item_id]');

      for (const link of allLinksQuery) {
        const href = link.getAttribute('href');
        const dataTrackId = link.getAttribute('data-track-item_id');
        if ((href && mdpiDoiPatternInLink.test(href)) || 
            (dataTrackId && dataTrackId.includes(`${MDPI_DOI}/`))) { // data-track-item_id usually contains the DOI directly
          return true;
        }
      }

      // Priority 2: Check for MDPI DOI string in text content (e.g., "DOI: 10.3390/...")
      // Use "MDPI_DOI}/" to be more specific.
      if (textContent.includes(`${MDPI_DOI}/`)) {
        let hasConflictingNonMdpiDoiLink = false;
        // Check all 'a' tags with an href attribute
        const allLinks = item.querySelectorAll('a[href]');
        for (const link of allLinks) {
          const href = link.getAttribute('href');
          // A link is a conflicting non-MDPI DOI if it's a DOI link and doesn't contain MDPI_DOI string at all
          if (href && (href.includes('doi.org/') || href.includes('dx.doi.org/')) && !href.includes(MDPI_DOI)) {
            hasConflictingNonMdpiDoiLink = true;
            break;
          }
        }
        if (!hasConflictingNonMdpiDoiLink) {
          return true; // MDPI DOI text found, and no definitive non-MDPI DOI link.
        }
        // If MDPI DOI text is present but also a non-MDPI DOI link, it's ambiguous. Fall through.
      }
      
      // Priority 3: If a definitive non-MDPI DOI link exists, this item is NOT MDPI.
      // This is crucial for preventing false positives from the journal name match.
      let hasDefinitiveNonMdpiDoiLink = false;
      const allLinksForNonMdpiCheck = item.querySelectorAll('a[href]');
      for (const link of allLinksForNonMdpiCheck) {
        const href = link.getAttribute('href');
        // If the link is a DOI link (contains doi.org/ or dx.doi.org/)
        // AND it does not contain the MDPI_DOI string anywhere in its href,
        // it's considered a definitive non-MDPI DOI link.
        if (href && (href.includes('doi.org/') || href.includes('dx.doi.org/'))) {
          if (!href.includes(MDPI_DOI)) { 
            hasDefinitiveNonMdpiDoiLink = true;
            break;
          }
        }
      }

      if (hasDefinitiveNonMdpiDoiLink) {
        return false; // Found a non-MDPI DOI link, so this item is not MDPI.
      }

      // Priority 4: Journal name check (last resort if no conclusive DOI info)
      // Updated journalRegex to be more specific and avoid partial matches if possible
      const journalRegex = new RegExp(`\\b(${['Nutrients', 'Int J Mol Sci', 'IJMS', 'Molecules', /* add other known MDPI journals if needed */].join('|')})\\b`, 'i');
      const hasMdpiJournal = journalRegex.test(innerHTML); // Check innerHTML for journal titles that might be in italics

      return hasMdpiJournal; // True if an MDPI journal name is found and not overridden by prior checks.
    };

    const extractReferenceData = (item) => {
      let refId = item.dataset.mdpiFilterRefId;
      // Ensure refId is assigned if not already present
      if (!refId) {
        // refIdCounter is defined in the outer scope
        refId = `mdpi-ref-${refIdCounter++}`;
        item.dataset.mdpiFilterRefId = refId;
      }

      let number = null;
      let text = '';
      let link = null;
      const localSanitize = window.sanitize || (htmlInput => htmlInput.replace(/<[^>]+>/g, ''));

      // 1. Try data-counter attribute (e.g., BMC "data-counter='1'")
      if (item.dataset.counter) {
        const parsedCounter = parseInt(item.dataset.counter, 10);
        if (!isNaN(parsedCounter)) {
          number = parsedCounter;
        }
      }

      // 2. Try to parse from ID of the item or its relevant parent (e.g., ref-CR1, B1, r1)
      if (number === null) {
        let idSource = item;
        // For PNAS, the ID like "r1" might be on the parent of div.citation
        if (item.matches && item.matches('div.citation, div.citation-content') && item.parentElement && item.parentElement.id) {
            idSource = item.parentElement;
        } else if (!item.id && item.closest && item.closest('[id^="r"], [id^="ref-"], [id^="cite_note-"]')) {
            idSource = item.closest('[id^="r"], [id^="ref-"], [id^="cite_note-"]');
        }

        if (idSource && idSource.id) {
            const idMatch = idSource.id.match(/(?:CR|B|ref-|reference-|cite_note-|r)(\d+)/i);
            if (idMatch && idMatch[1]) {
                const parsedIdNum = parseInt(idMatch[1], 10);
                if (!isNaN(parsedIdNum)) {
                    number = parsedIdNum;
                }
            }
        }
      }


      // 3. Try specific label elements for numbers
      if (number === null) {
        let labelTextContent = null;
        const labelSelectors = '.reference-label, .ref-count, .c-article-references__counter, .refnumber, .citation-number, .label, .ref-label, .ref-num, .ref-number';

        // First, try finding a label within the current item
        let labelElement = item.querySelector(labelSelectors);
        if (labelElement && labelElement.textContent) {
          labelTextContent = labelElement.textContent;
        }

        // If not found, and item might be nested (e.g., PNAS div.citation), try finding label in closest list item ancestor
        if (!labelTextContent) {
          // Common list item selectors including PNAS specific div[role="listitem"]
          const commonListItemSelectors = 'li, div[role="listitem"], tr';
          const closestListItem = item.closest(commonListItemSelectors);
          if (closestListItem) {
            labelElement = closestListItem.querySelector(labelSelectors);
            if (labelElement && labelElement.textContent) {
              labelTextContent = labelElement.textContent;
            }
          }
        }
        
        // If still not found, check immediate previous sibling of the item or its citation container
        if(!labelTextContent) {
            let targetPreviousSiblingOf = item;
            // If item is citation content, check sibling of its container
            if (item.matches && item.matches('div.citation-content, div.csl-entry') && item.parentElement) {
                targetPreviousSiblingOf = item.parentElement;
            }
            if (targetPreviousSiblingOf.previousElementSibling) {
                const prevSibling = targetPreviousSiblingOf.previousElementSibling;
                // Check if the previous sibling itself is a label-like element
                if (prevSibling.matches && prevSibling.matches(labelSelectors.split(',').map(s => s.trim() + ':not(a)').join(','))) { // Avoid matching if it's an anchor
                    if (prevSibling.textContent) {
                        labelTextContent = prevSibling.textContent;
                    }
                }
            }
        }

        if (labelTextContent) {
          // Extract leading digits, remove trailing non-digits (like dots, brackets).
          // Handles "1.", "[1]", "1. Author", "1"
          const cleanedText = labelTextContent.trim().replace(/[\[\]]/g, ''); // Remove brackets first
          const numMatch = cleanedText.match(/^(\d+)/); // Match leading digits
          if (numMatch && numMatch[1]) {
            number = parseInt(numMatch[1], 10);
          }
        }
      }
      
      const referenceStartRegex = /^\s*\[?(\d+)\]?\s*\.?\s*/; // For matching numbers like "1. ", "[1]", "1 "

      // 4. Extract raw text content for number parsing and final text
      let rawTextContent = '';
      const specificTextElement = item.querySelector(
        // Prioritize specific text container elements
        'p.c-article-references__text, div.reference-content, div.citation-text, span.reference-text, div.citation__summary, li > p, .c-bibliographic-information__title, .hlFld-Title'
      );

      if (specificTextElement) {
        rawTextContent = specificTextElement.textContent || '';
      } else {
        // Fallback: Clone item, remove known non-content children, then get textContent
        const clone = item.cloneNode(true);
        const selectorsToRemove = [
            '.c-article-references__links', '.reference-links', '.ref-label', 
            '.reference-label', '.ref-count', '.c-article-references__counter', 
            '.refnumber', '.citation-number', '.label', 'ul.c-article-references__links',
            '.c-article-references__links-list', '.access-options', '.icon-file-pdf', '.extra-links'
        ];
        clone.querySelectorAll(selectorsToRemove.join(', ')).forEach(el => el.remove());
        rawTextContent = clone.textContent || '';
      }
      rawTextContent = rawTextContent.trim();

      // 5. Try to extract number from the start of the rawTextContent if not found yet
      if (number === null) {
        const textNumMatch = rawTextContent.match(referenceStartRegex);
        if (textNumMatch && textNumMatch[1]) {
          const parsedTextNum = parseInt(textNumMatch[1], 10);
          if (!isNaN(parsedTextNum)) {
            number = parsedTextNum;
          }
        }
      }

      // 6. Prepare the final display text: remove the number prefix if we successfully extracted it
      text = rawTextContent;
      if (number !== null) {
        // More robustly remove the prefix, considering variations
        const prefixRegex = new RegExp(`^\\s*\\[?${number}\\]?\\s*\\.?\\s*`);
        text = text.replace(prefixRegex, '');
      }
      text = localSanitize(text); // Sanitize after potential number removal

      // 7. Extract link
      const linkSelectors = [
        'a[data-doi]', // Specific data-doi attribute
        'a[href*="doi.org"]', // Links containing doi.org
        'a[href*="/10."]', // Links that look like DOIs, e.g. /10.xxxx/yyyy
        'a.c-bibliographic-information__link[href*="springer.com"]', // Springer article links
        'a.article-link', // Common class for article links
        'a[data-track-action="article reference"]', // Tracking attributes
        'div.citation-content > a[href]', // First link in citation content
        'p > a[href]', // First link in a paragraph (generic)
        'a[href^="http"]:not([href*="#"])', // Any http link not an anchor
        '.c-article-references__text a[href]', // Link within reference text (e.g. Wiley)
        '.citation__title a[href]', // Link on citation title
        '.hlFld-Fulltext > a[href]', // e.g. Taylor & Francis
      ];
      
      for (const selector of linkSelectors) {
        const linkElement = item.querySelector(selector);
        if (linkElement && linkElement.href && !linkElement.href.startsWith('javascript:')) {
          // Prioritize DOI links or links that seem like primary article links
          if (linkElement.href.includes('doi.org') || (link === null || !link.includes('doi.org'))) {
            link = linkElement.href;
            if (link.includes('doi.org')) break; // Found a DOI link, prefer this.
          }
        }
      }
      
      // For Wikipedia, the main link might be inside the text.
      // This is often the first link if not a citation link (e.g. #cite_note-X)
      if (!link && item.closest && item.closest('li[id^="cite_note-"]')) {
        const wikiLink = item.querySelector('.reference-text > a:not([href^="#"])');
        if (wikiLink && wikiLink.href) {
            link = wikiLink.href;
        }
      }
      // If no link found yet, take the first valid HTTP link within the item
      if (!link) {
          const genericLink = item.querySelector('a[href^="http"]:not([href*="#"])');
          if (genericLink && genericLink.href && !genericLink.href.startsWith('javascript:')) {
              link = genericLink.href;
          }
      }

      // 8. Generate fingerprint
      // Use a combination of the beginning of the text and the link for uniqueness.
      // Normalize text by removing extra whitespace and taking a substring.
      const normalizedTextForFingerprint = (text || '').replace(/\s+/g, ' ').trim().substring(0, 100);
      const fingerprint = `${normalizedTextForFingerprint}|${link || ''}`;
      // console.log(`[MDPI Filter] extractReferenceData - Generated fingerprint: "${fingerprint}" for item ID: ${refId}, Number: ${number}, Text (start): "${text.substring(0,50)}..."`);

      return { id: refId, number, text, link, rawHTML: sanitize(item.innerHTML), fingerprint };
    };

    const isSearchSite = () => {
      if (!window.MDPIFilterDomains) {
        // console.warn("[MDPI Filter] isSearchSite check skipped: domains not loaded.");
        return false;
      }
      const host = location.hostname;
      const path = location.pathname;
      for (const cfg of Object.values(domains)) {
        const matchHost = cfg.host
          ? host === cfg.host
          : cfg.hostRegex?.test(host);
        const matchPath = !cfg.path || cfg.path.test(path);
        if (matchHost && matchPath) {
          // console.log(`[MDPI Filter] isSearchSite: Matched ${cfg.host || cfg.hostRegex}`);
          return true;
        }
      }
      // console.log("[MDPI Filter] isSearchSite: No match");
      return false;
    };

    const updateBadgeAndReferences = () => {
      // console.log("[MDPI Filter - Top Frame] Processing updateBadgeAndReferences.");
      if (isSearchSite()) {
        // console.log("[MDPI Filter - Top Frame] On search site. Badge update handled by processSearchSites.");
        return; 
      }

      // console.log("[MDPI Filter - Top Frame] Not on search site. Processing collected references.");
      // Sort collectedMdpiReferences by number, then by original discovery order (using refId as a proxy)
      const sortedReferences = [...collectedMdpiReferences].sort((a, b) => {
        // Prioritize items with numbers
        if (a.number !== null && b.number === null) return -1;
        if (a.number === null && b.number !== null) return 1;
        
        // If both have numbers, sort by number
        if (a.number !== null && b.number !== null) {
          if (a.number !== b.number) {
            return a.number - b.number;
          }
        }
        // If numbers are the same, or both are null, sort by refId (discovery order)
        // refId is "mdpi-ref-X", extract X for numeric sort
        const numA = parseInt(a.id.split('-').pop(), 10);
        const numB = parseInt(b.id.split('-').pop(), 10);
        
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        } else if (!isNaN(numA)) {
            return -1; 
        } else if (!isNaN(numB)) {
            return 1;  
        }
        return a.id.localeCompare(b.id); // Fallback to string compare of ID if parsing fails
      });

      // console.log(`[MDPI Filter - Top Frame] Sending message type: mdpiUpdate, count: ${uniqueMdpiReferences.size}, refs: ${sortedReferences.length}`);
      chrome.runtime.sendMessage({
        type: 'mdpiUpdate',
        count: uniqueMdpiReferences.size, 
        references: sortedReferences     
      });
    };

    function processSearchSites() {
      if (!window.MDPIFilterDomains) {
        console.warn("[MDPI Filter] processSearchSites skipped: domains not loaded.");
        return;
      }
      const host = location.hostname;
      for (const cfg of Object.values(domains)) {
        const matchHost = cfg.host
          ? host === cfg.host
          : cfg.hostRegex?.test(host);
        const matchPath = !cfg.path || cfg.path.test(location.pathname);
        if (!matchHost || !matchPath) continue;

        if (cfg.itemSelector && cfg.doiPattern) {
          document.querySelectorAll(cfg.itemSelector).forEach(item => {
            if (item.textContent.includes(cfg.doiPattern)) {
              styleSearch(item);
            }
          });

        } else if (cfg.itemSelector && cfg.htmlContains) {
          document.querySelectorAll(cfg.itemSelector).forEach(item => {
            if (item.innerHTML.includes(cfg.htmlContains)) {
              styleSearch(item);
            }
          });

        } else if (cfg.container) {
          document.querySelectorAll(cfg.container).forEach(row => {
            const rowText = row.textContent || '';
            const hasMdpiDoiText = rowText.includes(MDPI_DOI);
            const mdpiLink = row.querySelector(cfg.linkSelector);
            const hasLinkWithMdpiDoi = row.querySelector(`a[href*="${MDPI_DOI}"], a[data-doi*="${MDPI_DOI}"], a[data-article-id*="${MDPI_DOI}"]`);

            if (hasMdpiDoiText || mdpiLink || hasLinkWithMdpiDoi) {
              styleSearch(row);

              let titleContainer = null;
              const isScholar = cfg.host === 'scholar.google.com';

              if (isScholar) {
                titleContainer = row.querySelector('h3.gs_rt');
              } else {
                titleContainer = row.querySelector('.yuRUbf h3');
              }

              if (titleContainer) {
                titleContainer.querySelectorAll('a').forEach(styleLinkElement);
              } else if (!isScholar) {
                const primaryLink = row.querySelector('a[jsname="UWckNb"]') || row.querySelector('.yuRUbf a');
                styleLinkElement(primaryLink);
              }

              if (mdpiLink && (!titleContainer || !titleContainer.contains(mdpiLink))) {
                styleLinkElement(mdpiLink);
              }
            }
          });
        }
      }
    }

    const debouncedProcessCitedByEntries = window.debounce(() => {
      // console.log("[MDPI Filter] Debounced processCitedByEntries running.");
      document.querySelectorAll('li.citedByEntry').forEach(item => {
        if (item.dataset.mdpiCitedByProcessed) return;

        if (item.textContent?.includes(MDPI_DOI)) {
          // console.log("[MDPI Filter] Found MDPI citedBy entry:", item);
          styleSearch(item);
          const viewLink = item.querySelector('.extra-links a.getFTR__btn');
          if (viewLink) {
            styleLinkElement(viewLink);
          }
          item.dataset.mdpiCitedByProcessed = 'true';
        }
      });
    }, 300);

    function processCitedByEntries() {
      // console.log("[MDPI Filter] Initial processCitedByEntries running.");
      document.querySelectorAll('li.citedByEntry').forEach(item => {
        if (item.dataset.mdpiCitedByProcessed) return;

        if (item.textContent?.includes(MDPI_DOI)) {
          // console.log("[MDPI Filter] Found MDPI citedBy entry (initial):", item);
          styleSearch(item);
          const viewLink = item.querySelector('.extra-links a.getFTR__btn');
          if (viewLink) {
            styleLinkElement(viewLink);
          }
          item.dataset.mdpiCitedByProcessed = 'true';
        }
      });
    }

    function styleInlineFootnotes() {
      document.querySelectorAll('a[href*="#"]').forEach(a => {
        const href = a.getAttribute('href');
        const rid = a.dataset.xmlRid; // xml:id from some JATS XML, often used for <ref>
        let targetEl = null;
        let frag = null;

        if (rid) {
          try {
            targetEl = document.getElementById(rid);
          } catch (e) {
            console.warn(`[MDPI Filter] Error finding element by rid "${rid}":`, e);
          }
        }

        if (!targetEl && href && href.includes('#')) {
          const hashIndex = href.lastIndexOf('#');
          if (hashIndex !== -1 && hashIndex < href.length - 1) {
            frag = href.slice(hashIndex + 1);
            if (frag) {
              try {
                if (!targetEl) {
                  targetEl = document.getElementById(frag);
                }
                if (!targetEl) {
                  const namedElements = document.getElementsByName(frag);
                  if (namedElements.length > 0) {
                    targetEl = namedElements[0];
                  }
                }
                // Ensure CSS.escape is available or polyfilled if targeting older environments
                // For modern extensions, it should be fine.
                const escapedFrag = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(frag) : frag.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');

                if (!targetEl) {
                  targetEl = document.querySelector(`a[id$="-${escapedFrag}"]`);
                }
                if (!targetEl && frag.startsWith('core-')) {
                  const potentialId = frag.substring(5);
                  if (potentialId) {
                    targetEl = document.getElementById(potentialId);
                  }
                }
                if (!targetEl) {
                  targetEl = document.querySelector(`li[data-bib-id="${escapedFrag}"]`);
                }
              } catch (e) {
                console.warn(`[MDPI Filter] DOMException while finding target for fragment "${frag}" (href: "${href}"):`, e);
                return; 
              }
            }
          }
        }

        if (!targetEl) {
          return; 
        }

        let listItem = null;
        try {
          if (targetEl.matches(referenceListSelectors)) {
            listItem = targetEl;
          } else {
            // Attempt to find a specific reference element within targetEl,
            // e.g., if targetEl is a wrapper like <div id="r23"> containing <div class="citation">
            // Query for a descendant that matches one of the reference selectors.
            const innerRefElement = targetEl.querySelector(referenceListSelectors);
            if (innerRefElement) {
              listItem = innerRefElement;
            } else {
              // Fallback: targetEl might be inside a reference item, so find closest ancestor
              listItem = targetEl.closest(referenceListSelectors);
            }
          }
        } catch (e) {
          console.warn(`[MDPI Filter] DOMException with matches/closest for targetEl (href: "${href}", frag: "${frag}"):`, targetEl, e);
          return; 
        }

        // Check if this listItem was identified as MDPI by processAllReferences
        // by looking for the mdpiFilterRefId dataset attribute.
        if (listItem && listItem.dataset.mdpiFilterRefId) {
          const supElement = a.closest('sup'); 
          if (supElement) {
            styleSup(supElement);
          } else { 
            // If no <sup> parent, try to style <sup> child or the <a> tag itself.
            const supInsideA = a.querySelector('sup');
            styleSup(supInsideA || a); // styleSup can handle 'a' tag directly
          }
        }
      });
    }

    function processAllReferences() {
      document.querySelectorAll(referenceListSelectors).forEach(item => {
        let currentAncestor = item.parentElement;
        let skipItemDueToProcessedAncestor = false; // Fixed typo: "Due to" to "DueTo"
        while (currentAncestor && currentAncestor !== document.body) {
          if (currentAncestor.matches(referenceListSelectors)) {
            const ancestorRefId = currentAncestor.dataset.mdpiFilterRefId;
            // Check if ancestor was processed and its fingerprint is in uniqueMdpiReferences
            if (ancestorRefId && currentAncestor.dataset.mdpiFingerprint && uniqueMdpiReferences.has(currentAncestor.dataset.mdpiFingerprint)) {
              skipItemDueToProcessedAncestor = true;
              break;
            }
          }
          currentAncestor = currentAncestor.parentElement;
        }

        if (skipItemDueToProcessedAncestor) {
          return; 
        }

        if (isMdpiItemByContent(item)) {
          const refData = extractReferenceData(item); 
          item.dataset.mdpiFingerprint = refData.fingerprint; // Store fingerprint on the element
          // console.log(`[MDPI Filter] processAllReferences - Processing item. ID: ${refData.id}, Fingerprint: "${refData.fingerprint}"`);

          if (!uniqueMdpiReferences.has(refData.fingerprint)) {
            // console.log(`[MDPI Filter] processAllReferences - New fingerprint. Before add, uniqueMdpiReferences.size: ${uniqueMdpiReferences.size}`); // Corrected malformed comment
            uniqueMdpiReferences.add(refData.fingerprint);
            collectedMdpiReferences.push(refData); 
            // console.log(`[MDPI Filter] processAllReferences - After add, uniqueMdpiReferences.size: ${uniqueMdpiReferences.size}. Added to collected:`, JSON.stringify(refData));


            if (mode === 'highlight') {
              styleRef(item, refData.id); 
            } else if (mode === 'hide') {
              item.style.display = 'none';
              const parentListItem = item.closest('li, div.citation, div.reference'); 
              if (parentListItem && parentListItem !== item && item.matches(referenceListSelectors)) {
                // parentListItem.style.display = 'none'; // This might be too aggressive
              }
            }
          } else {
            // Fingerprint already seen. This reference content is already counted.
            // Still style/hide this specific occurrence.
            if (mode === 'highlight') {
              styleRef(item, refData.id); 
            } else if (mode === 'hide') {
              item.style.display = 'none';
            }
          }
        } else {
          // Element matches selector but is not an MDPI item by content.
          // Ensure it's visible if mode is 'highlight' and it was previously hidden.
          // This handles cases where an item was MDPI, then content changed and it's no longer MDPI.
          if (item.style.display === 'none' && item.dataset.mdpiFilterRefId) {
             // item.style.display = ''; 
          }
          delete item.dataset.mdpiFingerprint; // Clean up fingerprint if not MDPI
        }
      });
      updateBadgeAndReferences();
    }

    function processDirectMdpiLinks() {
      const mdpiArticleRegex = /^https?:\/\/www\.mdpi\.com\/\d{4}-\d{4}\/\d+\/\d+\/\d+(\/.*)?$/;
      document.querySelectorAll(`a[href^="https://www.mdpi.com/"]`).forEach(a => {
        const href = a.getAttribute('href');
        if (href && mdpiArticleRegex.test(href) && !a.closest(referenceListSelectors.split(',').map(s => s.trim() + '[style*="border"]').join(','))) {
          styleDirectLink(a);
        }
      });
    }

    const highlightElementTemporarily = (element) => {
      if (!element) return;
      element.style.outline = '3px solid #FFD700';
      element.style.transition = 'outline 0.1s ease-in-out';

      const refId = element.dataset.mdpiFilterRefId;
      if (refId) {
        document.querySelectorAll(`[data-mdpi-filter-ref-id="${refId}"]`).forEach(el => {
          el.style.outline = '3px solid #FFD700';
          el.style.transition = 'outline 0.1s ease-in-out';
        });
      }

      setTimeout(() => {
        element.style.outline = '';
        if (refId) {
          document.querySelectorAll(`[data-mdpi-filter-ref-id="${refId}"]`).forEach(el => {
            el.style.outline = '';
          });
        }
      }, 2000);
    };

    function runAll(source = "initial") {
      // console.log(`[MDPI Filter] runAll triggered by: ${source}`);
      refIdCounter = 0; // Reset ID counter for this run

      // Clear dataset attributes and styles from previous runs or other elements
      document.querySelectorAll('[data-mdpi-processed-in-this-run], [data-mdpi-result], [data-mdpi-filter-ref-id], [data-mdpi-fingerprint], [data-mdpi-checked], [data-mdpi-cited-by-processed]').forEach(el => {
        el.style.color = '';
        el.style.fontWeight = '';
        el.style.border = '';
        el.style.padding = '';
        el.style.display = ''; 
        el.style.outline = ''; 

        delete el.dataset.mdpiProcessedInThisRun;
        delete el.dataset.mdpiResult;
        delete el.dataset.mdpiFilterRefId;
        delete el.dataset.mdpiFingerprint; // Added to clear fingerprint
        delete el.dataset.mdpiChecked;
        delete el.dataset.mdpiCitedByProcessed;
      });
      document.querySelectorAll('[style*="color: rgb(226, 33, 28)"]').forEach(el => {
        el.style.color = '';
        el.style.fontWeight = '';
        el.style.borderBottom = '';
        el.style.textDecoration = '';
        // el.style.display = ''; // Be cautious with resetting display broadly
      });

      uniqueMdpiReferences.clear();
      collectedMdpiReferences = []; // Clear references for the new run

      try {
        if (!window.MDPIFilterDomains || !window.sanitize) {
          console.error("[MDPI Filter] runAll aborted: Dependencies (domains/sanitizer) not loaded.");
          return;
        }
        processSearchSites();
        processCitedByEntries();
        processAllReferences();     // Populates collectedMdpiReferences
        styleInlineFootnotes();     // Uses data-mdpi-result set by processAllReferences
        processDirectMdpiLinks();
        updateBadgeAndReferences(); // Sends collectedMdpiReferences (now sorted)
      } catch (error) {
        console.error(`[MDPI Filter] Error during runAll (source: ${source}):`, error);
      } finally {
        // console.log(`[MDPI Filter] runAll finished (source: ${source}). Unique MDPI refs (for badge): ${uniqueMdpiReferences.size}, Collected for popup: ${collectedMdpiReferences.length}`);
      }
    }

    const debouncedRunAll = window.debounce(runAll, 500);

    function setupMainObserver() {
      const targetNode = document.body;
      if (!targetNode) {
        console.error("[MDPI Filter] Cannot find document.body to observe.");
        return;
      }

      // console.log("[MDPI Filter] Setting up Main observer for document.body");

      const observerConfig = {
        childList: true,
        subtree: true
      };

      const observer = new MutationObserver((mutationsList, observer) => {
        let nodesAdded = false;
        for (const mutation of mutationsList) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            nodesAdded = true;
            break;
          }
        }

        if (nodesAdded) {
          // console.log("[MDPI Filter] Main observer detected added nodes. Triggering debounced runAll.");
          debouncedRunAll("main observer");
        }
      });

      observer.observe(targetNode, observerConfig);
      // console.log("[MDPI Filter] Main observer started.");
    }

    function setupCitedByObserver() {
      const targetNode = document.getElementById('cited-by__content');
      if (!targetNode) {
        // console.log("[MDPI Filter] Cited By observer target '#cited-by__content' not found.");
        return;
      }

      // console.log("[MDPI Filter] Setting up Cited By observer for:", targetNode);

      const observerConfig = {
        childList: true,
        subtree: true
      };

      const observer = new MutationObserver((mutationsList, observer) => {
        // console.log("[MDPI Filter] Cited By observer detected mutations.");
        debouncedProcessCitedByEntries();
      });

      observer.observe(targetNode, observerConfig);
      // console.log("[MDPI Filter] Cited By observer started.");
    }

    if (window.MDPIFilterDomains && window.sanitize) {
      // console.log("[MDPI Filter] Dependencies loaded. Requesting initial runAll and setting up observers.");
      requestAnimationFrame(() => {
        // console.log("[MDPI Filter] Running initial runAll via requestAnimationFrame.");
        runAll("initial load");
        setupCitedByObserver();
        setupMainObserver();
      });
    } else {
      console.error("[MDPI Filter] Initial run/observer setup skipped: Dependencies not loaded.");
    }

    window.addEventListener('hashchange', () => {
      // console.log("[MDPI Filter] hashchange detected. Requesting runAll.");
      requestAnimationFrame(() => {
        // console.log("[MDPI Filter] Running runAll via requestAnimationFrame after hashchange.");
        runAll("hashchange");
      });
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === 'scrollToRef' && msg.refId) {
        // console.log(`[MDPI Filter] Received scrollToRef request for ID: ${msg.refId}`);
        const targetElement = document.querySelector(`[data-mdpi-filter-ref-id="${msg.refId}"]`);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlightElementTemporarily(targetElement);
          sendResponse({ status: "scrolled" });
        } else {
          // console.warn(`[MDPI Filter] Element with ID ${msg.refId} not found.`);
          sendResponse({ status: "not_found" });
        }
        return true;
      }
      return false;
    });

    // console.log("[MDPI Filter] Initial setup complete, listeners/observers added.");

  });

} else {
  // console.log("[MDPI Filter] Injection prevented, mdpiFilterInjected was already true.");
}
