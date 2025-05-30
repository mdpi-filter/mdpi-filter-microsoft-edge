# Privacy Policy for MDPI Filter Chrome Extension

**Last Updated:** May 30, 2025 <!-- Replace with the actual date -->

Thank you for using MDPI Filter (the "Extension"). This Privacy Policy explains how the Extension handles information. The MDPI Filter extension is designed to operate primarily locally within your browser.

Our single purpose is to help users instantly identify and manage publications from the publisher MDPI. It allows users to either highlight or hide MDPI content during literature searches (e.g., on Google, Google Scholar, PubMed) and visually distinguishes MDPI citations (footnotes, reference list entries) on various web pages.

## 1. Information We Handle and How We Use It

The Extension handles the following types of information solely to provide its features:

*   **User Preferences:**
    *   **Data Handled:** Your chosen mode for handling MDPI content (e.g., "highlight" or "hide"), preferences for highlighting potential MDPI sites (Google Search only), custom highlight colors, and whether debug logging is enabled.
    *   **How Handled:** These settings are stored locally in your browser using `chrome.storage.sync`. If you have Chrome Sync enabled, these settings may be synced across your devices by Google. The Extension uses these preferences to customize its behavior according to your choices.
    *   **Purpose:** To remember your settings across browsing sessions and provide a consistent user experience.

*   **Website Content:**
    *   **Data Handled:** The text, HTML structure, and links (URLs) of the web pages you visit.
    *   **How Handled:** This information is processed locally and in-memory by the Extension's content scripts running within your browser on the active web page. This data is analyzed to identify MDPI-related publications, citations, Digital Object Identifiers (DOIs), PubMed IDs (PMIDs), and other relevant identifiers.
    *   **Purpose:** To find MDPI-related content so the Extension can apply your chosen visual styles (highlighting or hiding) or extract identifiers for further checks. This data is not stored by the Extension after the page analysis is complete for the current view.

*   **Web Browsing Activity (URLs of Visited Pages):**
    *   **Data Handled:** The URLs of the web pages you navigate to.
    *   **How Handled:** The Extension uses web navigation events to determine when a page has loaded and to understand the context of the page (e.g., if it's a supported search engine like Google, Google Scholar, PubMed, or a general article page). This processing occurs locally.
    *   **Purpose:** To reliably trigger the Extension's content analysis and styling logic at the appropriate moment on relevant pages. URLs are not stored by the Extension.

*   **Publication Identifiers (DOIs, PMIDs, PMCIDs):**
    *   **Data Handled:** Digital Object Identifiers (DOIs), PubMed IDs (PMIDs), and PubMed Central IDs (PMCIDs) extracted from the website content you are viewing.
    *   **How Handled:** These identifiers are processed in-memory. Some of these identifiers are sent to the NCBI API (see Section 2). For performance, the MDPI status of these identifiers (obtained from NCBI or direct checks) is cached in-memory (`window.MDPIFilterCaches.ncbiApiCache`) during your browsing session. This cache is cleared when your browser session ends or the tab is closed and is not persistently stored by the Extension.
    *   **Purpose:** To check if these publications are affiliated with MDPI.

## 2. Information Sharing with Third Parties

We are committed to user privacy and limit data sharing to what is essential for the Extension's functionality.

*   **NCBI (National Center for Biotechnology Information) E-utilities API:**
    *   **Data Shared:** To determine if a publication is MDPI-affiliated, the Extension sends extracted publication identifiers (such as DOIs, PMIDs, or PMCIDs) to NCBI's E-utilities API services (specifically `efetch.fcgi` and `esummary.fcgi` hosted on `eutils.ncbi.nlm.nih.gov`). These requests include `tool` (application name) and `email` (developer contact) parameters as recommended by NCBI's usage guidelines.
    *   **Purpose of Sharing:** This is a core function of the Extension to retrieve publication metadata (such as DOIs) which is then used to accurately identify MDPI content, especially on search result pages or when direct MDPI indicators are not present.
    *   **NCBI's Privacy Practices:** NCBI is a public service. According to their policies, they do not collect Personally Identifiable Information (PII) from API users and use access data to understand public use and improve their services. You can review NCBI's policies here:
        *   NCBI Specific Policy: [https://www.ncbi.nlm.nih.gov/home/about/policies/](https://www.ncbi.nlm.nih.gov/home/about/policies/)
        *   NLM Privacy Policy (NCBI is part of NLM): [https://www.nlm.nih.gov/privacy.html](https://www.nlm.nih.gov/privacy.html)
        *   E-utilities Usage Guidelines: [https://www.ncbi.nlm.nih.gov/books/NBK25497/](https://www.ncbi.nlm.nih.gov/books/NBK25497/)
    *   **IP Addresses:** When the Extension communicates with the NCBI API, your IP address will be visible to NCBI as part of standard internet communication protocols. This is handled by NCBI according to their privacy policies. The MDPI Filter Extension itself does not log, store, or use your IP address.

*   **No Other Sharing for Commercial Purposes:**
    We do **not** sell, rent, or share any user data (including website content, web history, or user preferences) with any other third parties for commercial purposes, advertising, tracking, or any purpose unrelated to the Extension's single described purpose.
    We will not transfer user data to third parties except as necessary to provide or improve the Extension's single purpose (as described with NCBI), to comply with applicable laws, or as part of a merger, acquisition, or sale of assets after obtaining explicit prior consent from the user.

## 3. Data Security

*   The Extension processes data locally within your browser.
*   Communication with the NCBI API is conducted over HTTPS, which encrypts the data in transit.
*   The Extension utilizes DOMPurify for HTML sanitization where appropriate as a security measure against cross-site scripting (XSS) when interacting with web page content.

## 4. Data Retention

*   **User Preferences:** Stored via `chrome.storage.sync` and retained as long as the Extension is installed, or until you clear them or reset your Chrome sync data.
*   **In-Memory Caches:** Data cached in memory (e.g., NCBI API responses, processed citation status) is temporary and is cleared when the browser tab is closed or the browser session ends.
*   **Other Processed Data:** Information like website content or URLs processed for a page view is not retained by the Extension after its immediate use.

## 5. User Choices and Control

*   You can manage your preferences for the Extension (mode, highlight colors, logging) through the Extension's popup interface.
*   You can disable or uninstall the MDPI Filter Extension at any time through your browser's extension management page.

## 6. Compliance with Chrome Web Store Policies

The MDPI Filter Extension adheres to the Chrome Web Store User Data Policy, including its Limited Use requirements. We are committed to:
*   Only using user data to provide or improve the Extension's single, user-facing purpose described above.
*   Not transferring user data for purposes like personalized advertising, credit-worthiness, or to data brokers.
*   Not allowing humans to read user data, except with explicit user consent for specific data, for security purposes (e.g., investigating abuse), to comply with applicable laws, or if the data is aggregated and anonymized for internal operations.

## 7. Changes to This Privacy Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy here and updating the "Last Updated" date. We encourage you to review this Privacy Policy periodically for any changes.

## 8. Contact Us

If you have any questions or concerns about this Privacy Policy or our data handling practices, please contact us through the support contact information provided on the MDPI Filter Chrome Web Store listing page.

Alternatively, you can raise an issue on our GitHub repository: [https://github.com/mdpi-filter/mdpi-filter-chrome/issues](https://github.com/mdpi-filter/mdpi-filter-chrome/issues)