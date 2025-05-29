# mdpi-filter-chrome

**MDPI Filter** is a Chrome extension that helps you identify and manage MDPI publications. It enhances your literature search by allowing you to hide or highlight MDPI results on major search engines (Google, Google Scholar, PubMed, Europe PMC), using direct checks and the NCBI API. Furthermore, it universally styles MDPI citations on any scholarly article you read: visually distinguishing MDPI entries in bibliographies, their inline footnotes, and also within "Cited By" and "Similar Articles" sections. The extension popup provides a quick overview of detected MDPI references, allowing you to see a count, a list, and click to scroll to them in the document.

---

## 🔹 Features

- **Search-site filtering**  
  - **Hide** or **Highlight** MDPI links on:
    - Google Web Search
    - Google Scholar
    - PubMed
    - Europe PMC
- **Universal in-page citation styling**  
  - **Inline footnotes**: turns MDPI reference numbers red wherever they appear.
  - **Reference lists**: outlines and bold-reds MDPI entries in bibliographies across *any* journal site.
- **Popup Interaction & Overview**
  - **Counts MDPI References**: Displays the total number of MDPI references found on the current page.
  - **Lists MDPI References**: Shows a clickable list of identified MDPI references.
  - **Scroll-to-Reference**: Allows you to click on a reference in the popup to scroll directly to its location in the document.
  - **"Cited By" sections**: styles MDPI entries within lists of citing articles.
  - **"Similar Articles" sections**: styles MDPI entries within lists of similar articles.
---

## 📥 Installation

1.  **Download the Extension:**
    *   Go to the [**Releases**](https://github.com/mdpi-filter/mdpi-filter-chrome/releases) page of this repository.
    *   Download the `mdpi-filter-extension.zip` file from the latest release.
    *   Unzip the downloaded file. This will create a folder containing the extension files.

2.  **Install in Chrome:**
    *   Open Chrome and navigate to `chrome://extensions`.
    *   Enable **Developer mode** (usually a toggle in the top right corner).
    *   Click the **Load unpacked** button.
    *   Select the unzipped folder (e.g., `mdpi-filter-extension`) that you extracted.

3.  **Pin the Icon:**
    *   The MDPI Filter extension should now be installed. Pin its icon to your toolbar for easy access.

**For Developers:** If you've cloned the repository and want to load the source code directly for development, you can use the "Load unpacked" button to select the `mdpi-filter-chrome/` root folder. Note that for full NCBI API functionality, you would need to manually add your API credentials to `content/ncbi_api_handler.js` if you are not using a pre-built release version.

---

## 📦 Building and Releases

This extension is automatically built and packaged using GitHub Actions whenever a new tag (e.g., `vX.Y.Z` or `vX.Y.Z-prerelease`) is pushed to the repository.

The build process includes:
1.  Checking out the source code.
2.  Injecting necessary API credentials (NCBI API Email and Tool Name) from GitHub secrets into the `content/ncbi_api_handler.js` file. These secrets are `NCBI_API_EMAIL_SECRET` and `NCBI_TOOL_NAME_SECRET` respectively, and are configured in the repository's GitHub Actions secrets settings.
3.  Packaging the extension into a `mdpi-filter-extension.zip` file.
4.  Creating a new GitHub Release associated with the tag and attaching the `mdpi-filter-extension.zip` file as a downloadable asset.

---

## ⚙️ Usage

1. **Click** the toolbar icon.  
2. Choose **Highlight** or **Hide**.  
3. Perform a search on Google, Scholar, PubMed or Europe PMC—MDPI results will be styled accordingly.  
4. Open *any* academic article to see MDPI footnotes and bibliography entries styled in-page (no removal).

---

## 📄 License

- **Code**: [AGPL-3.0](LICENSE-CODE)  
- **Logo**: [CC-BY-SA-4.0](LICENSE-LOGO)

---

## ⚠️ Known Issues

- **ScienceDirect Author-Year Citations**: On some ScienceDirect articles (e.g., [https://www.sciencedirect.com/science/article/pii/S0924224424001535](https://www.sciencedirect.com/science/article/pii/S0924224424001535)), author-year style inline citations (e.g., "(Balasundram et al., 2023)") are not highlighted for MDPI references. Other functionalities like counting, listing, and highlighting in the reference list work correctly.
- **ScienceDirect Numerical Citations**: On some ScienceDirect articles (e.g., [https://www.sciencedirect.com/science/article/pii/S1360138520301941](https://www.sciencedirect.com/science/article/pii/S1360138520301941)), inline numerical citations (e.g., "[21]") are not highlighted for MDPI references. Reference list highlighting works correctly.
- **Nature.com Sidebar References**: On Nature.com articles (e.g., [https://www.nature.com/articles/s44264-024-00042-0](https://www.nature.com/articles/s44264-024-00042-0)), references in the "reading companion" sidebar may occasionally be incorrectly counted and listed in the extension's popup, particularly if an inline footnote is clicked while the page and extension are still loading. While these sidebar references are correctly styled if they are MDPI, they are not intended to be part of the main count.
- **TheClinics.com Inline Citations**: On TheClinics.com articles (e.g., [https://www.id.theclinics.com/article/S0891-5520(21)00048-9/fulltext](https://www.id.theclinics.com/article/S0891-5520(21)00048-9/fulltext)), inline numerical citations (e.g., "<sup>50</sup>") are not highlighted for MDPI references. Reference list highlighting and other functionalities work correctly.
- **LWW Journals (Medicine) Issues**:
    - **Scroll-to-Reference**: On LWW journal pages (e.g., [https://journals.lww.com/md-journal/fulltext/2019/09130/an_investigation_into_the_stress_relieving_and.67.aspx](https://journals.lww.com/md-journal/fulltext/2019/09130/an_investigation_into_the_stress_relieving_and.67.aspx)), scrolling to a reference from the popup may not work correctly if the reference list is initially collapsed. The "View full references list" button needs to be manually clicked first.
    - **Inline Citation Styling**: Inline numerical citations (e.g., "<sup>[4]</sup>") are not highlighted for MDPI references on LWW journal pages (e.g., [https://journals.lww.com/md-journal/fulltext/2019/09130/an_investigation_into_the_stress_relieving_and.67.aspx](https://journals.lww.com/md-journal/fulltext/2019/09130/an_investigation_into_the_stress_relieving_and.67.aspx)). Reference list highlighting works correctly.
- **Wiley Online Library Scroll-to-Reference**: On some Wiley Online Library articles (e.g., [https://onlinelibrary.wiley.com/doi/full/10.1002/vms3.798](https://onlinelibrary.wiley.com/doi/full/10.1002/vms3.798)), scrolling to a reference from the popup may not work if the "REFERENCES" accordion is not manually expanded first. The extension attempts to expand this accordion, but it may not always succeed before the scroll action is triggered.
- **Limited Citation Data**: On some websites (e.g., LWW journals like [https://journals.lww.com/md-journal/fulltext/2019/09130/an_investigation_into_the_stress_relieving_and.67.aspx](https://journals.lww.com/md-journal/fulltext/2019/09130/an_investigation_into_the_stress_relieving_and.67.aspx)), reference items may only provide a Google Scholar link and basic citation text (e.g., authors, title, year, and a journal name like "Aging Clin Exp Res"). Without a DOI or a more specific, unique journal identifier, accurately identifying these as MDPI (or non-MDPI) is challenging. Relying solely on journal names can lead to false positives (if the name is too generic) or false negatives (if the journal name isn't in the extension's known lists or has variations). The extension currently prioritizes DOI, PMCID/PMID (which are converted to DOI where possible), direct link to MDPI domain and strong journal name matches to maintain accuracy. For articles where this is an issue, checking for the full text on [PubMed Central (PMC)](https://pmc.ncbi.nlm.nih.gov/) or [Europe PMC](https://europepmc.org/search?query=SRC%3A%2a%20AND%20%28HAS_FT%3AY%29/) can be a more reliable alternative for MDPI identification if the article is available there. For example, the LWW article mentioned above can be found on PMC ([https://pmc.ncbi.nlm.nih.gov/articles/PMC6750292/](https://pmc.ncbi.nlm.nih.gov/articles/PMC6750292/)), where PMC often provides more precise metadata, including DOI, PMID, and PMCID, which greatly aids in accurate identification.

---

## 🧪 Test Pages & Queries

### Test Articles

**Cell**
- https://www.cell.com/trends/plant-science/abstract/S1360-1385(24)00048-7
- https://www.cell.com/heliyon/fulltext/S2405-8440(24)17287-8

**BMJ**
- https://bjsm.bmj.com/content/52/6/376.long

**MDPI**
- https://www.mdpi.com/1660-4601/20/3/1681

**Frontiers**
- https://www.frontiersin.org/journals/drug-discovery/articles/10.3389/fddsv.2024.1385460/full
- https://www.frontiersin.org/journals/nutrition/articles/10.3389/fnut.2024.1439294/full

**Nature**
- https://www.nature.com/articles/s43016-021-00402-w
- https://www.nature.com/articles/s41579-023-00993-0

**ScienceDirect**
- https://www.sciencedirect.com/science/article/pii/S1360138520301941

**NCBI**
  **PMC (PubMed Central)**
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC8810379/
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC9415189/
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC6750292/
  **PubMed**
  - https://pubmed.ncbi.nlm.nih.gov/22971582/
  - https://pubmed.ncbi.nlm.nih.gov/28805671/

**EuropePMC**
- https://europepmc.org/article/med/37110471
- https://europepmc.org/article/pmc/pmc9223600

**The Lancet**
- https://www.thelancet.com/journals/lanmic/article/PIIS2666-5247(24)00200-3/fulltext

**Oxford Academic**
- https://academic.oup.com/af/article/13/4/112/7242422

**Wiley Online Library**
- https://onlinelibrary.wiley.com/doi/full/10.1002/vms3.798
- https://bpspubs.onlinelibrary.wiley.com/doi/10.1111/bcp.13496

**Sage Journals**
- https://journals.sagepub.com/doi/abs/10.1177/02698811231200023

**Taylor & Francis Online**
- https://www.tandfonline.com/doi/full/10.1080/15502783.2024.2441775

**TheClinics.com**
- https://www.id.theclinics.com/article/S0891-5520(21)00048-9/fulltext

**LWW Journals (Medicine)**
- https://journals.lww.com/md-journal/fulltext/2019/09130/an_investigation_into_the_stress_relieving_and.67.aspx

### Search Queries

**Google**
```
mdpi
10.3390 europepmc "pmc"
10.3390 "pmc"
Poly Lactic-co-Glycolic Acid (PLGA) as Biodegradable Controlled Drug Delivery Carrier
```

**Google Scholar**
```
mdpi
10.3390
"Pattern recognition receptors and the innate immune response to viral infection"
```
> The query "Pattern recognition receptors and the innate immune response to viral infection" is included because the MDPI article does not have a direct MDPI link in Scholar results, but does have an NCBI PMC link ([https://pmc.ncbi.nlm.nih.gov/articles/PMC3186011/](https://pmc.ncbi.nlm.nih.gov/articles/PMC3186011/)).

**PubMed**
```
10.3390
```

**EuropePMC**
```
10.3390
```

### PubMed Articles
- https://pubmed.ncbi.nlm.nih.gov/22971582/
- https://pubmed.ncbi.nlm.nih.gov/28805671/

### Other Test Pages

**Wikipedia**
- https://en.wikipedia.org/wiki/Autism

**Healthline**
- https://www.healthline.com/health/nutrition/dietary-supplements

---
