# mdpi-filter-chrome

**MDPI Filter** is a Chrome extension that helps you declutter your literature searches by hiding or highlighting MDPI publications on major search engines, and styles MDPI citations in any scholarly article you read.

---

## 🔹 Features

- **Search-site filtering**  
  - **Hide** or **Highlight** MDPI links on:
    - Google Web Search
    - Google Scholar
    - PubMed
    - Europe PMC
- **Universal in-page citation styling**  
  - **Inline footnotes**: turns MDPI reference numbers red wherever they appear  
  - **Reference lists**: outlines and bold-reds MDPI entries in bibliographies across *any* journal site

---

## 📥 Installation

1. Clone or download this repository.  
2. In Chrome, go to **chrome://extensions**.  
3. Enable **Developer mode** (top right).  
4. Click **Load unpacked**, and select the `mdpi-filter-chrome/` folder.  
5. Look for the MDPI Filter icon in your toolbar.

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
- **EuropePMC Full-Text Citations**: Inline numerical citations (e.g., "[1]") in the full-text view of some EuropePMC articles are not highlighted for MDPI references. Examples:
    - [https://europepmc.org/article/med/36838493#free-full-text](https://europepmc.org/article/med/36838493#free-full-text)
    - [https://europepmc.org/article/pmc/pmc9146485#free-full-text](https://europepmc.org/article/pmc/pmc9146485#free-full-text)
- **Nature.com Sidebar References**: On Nature.com articles (e.g., [https://www.nature.com/articles/s44264-024-00042-0](https://www.nature.com/articles/s44264-024-00042-0)), references in the "reading companion" sidebar may occasionally be incorrectly counted and listed in the extension's popup, particularly if an inline footnote is clicked while the page and extension are still loading. While these sidebar references are correctly styled if they are MDPI, they are not intended to be part of the main count.
- **The Lancet Inline Citations**: On The Lancet articles (e.g., [https://www.thelancet.com/journals/lanmic/article/PIIS2666-5247(24)00200-3/fulltext](https://www.thelancet.com/journals/lanmic/article/PIIS2666-5247(24)00200-3/fulltext)), inline numerical citations (e.g., "<sup>74</sup>") are not highlighted for MDPI references. Reference list highlighting and other functionalities work correctly.
- **Cambridge University Press Inline Citations**: On Cambridge University Press articles (e.g., [https://www.cambridge.org/core/journals/psychological-medicine/article/comparative-efficacy-and-tolerability-of-nutraceuticals-for-depressive-disorder-a-systematic-review-and-network-metaanalysis/5799A126D0B5677764562824C452D545](https://www.cambridge.org/core/journals/psychological-medicine/article/comparative-efficacy-and-tolerability-of-nutraceuticals-for-depressive-disorder-a-systematic-review-and-network-metaanalysis/5799A126D0B5677764562824C452D545)), inline numerical citations (e.g., "Suneson et al.2021") are not highlighted for MDPI references. Reference list highlighting and other functionalities work correctly.
- **TheClinics.com Inline Citations**: On TheClinics.com articles (e.g., [https://www.id.theclinics.com/article/S0891-5520(21)00048-9/fulltext](https://www.id.theclinics.com/article/S0891-5520(21)00048-9/fulltext)), inline numerical citations (e.g., "<sup>50</sup>") are not highlighted for MDPI references. Reference list highlighting and other functionalities work correctly.
- **LWW Journals (Medicine) Issues**:
    - **Scroll-to-Reference**: On LWW journal pages (e.g., [https://journals.lww.com/md-journal/fulltext/2019/09130/an_investigation_into_the_stress_relieving_and.67.aspx](https://journals.lww.com/md-journal/fulltext/2019/09130/an_investigation_into_the_stress_relieving_and.67.aspx)), scrolling to a reference from the popup may not work correctly if the reference list is initially collapsed. The "View full references list" button needs to be manually clicked first.
    - **Inline Citation Styling**: Inline numerical citations (e.g., "<sup>[4]</sup>") are not highlighted for MDPI references on LWW journal pages (e.g., [https://journals.lww.com/md-journal/fulltext/2019/09130/an_investigation_into_the_stress_relieving_and.67.aspx](https://journals.lww.com/md-journal/fulltext/2019/09130/an_investigation_into_the_stress_relieving_and.67.aspx)). Reference list highlighting works correctly.
- **Wiley Online Library Scroll-to-Reference**: On some Wiley Online Library articles (e.g., [https://onlinelibrary.wiley.com/doi/full/10.1002/vms3.798](https://onlinelibrary.wiley.com/doi/full/10.1002/vms3.798)), scrolling to a reference from the popup may not work if the "REFERENCES" accordion is not manually expanded first. The extension attempts to expand this accordion, but it may not always succeed before the scroll action is triggered.
- **Limited Citation Data**: On some websites (e.g., LWW journals like [https://journals.lww.com/md-journal/fulltext/2019/09130/an_investigation_into_the_stress_relieving_and.67.aspx](https://journals.lww.com/md-journal/fulltext/2019/09130/an_investigation_into_the_stress_relieving_and.67.aspx)), reference items may only provide a Google Scholar link and basic citation text (e.g., authors, title, year, and a journal name like "Aging Clin Exp Res"). Without a DOI or a more specific, unique journal identifier, accurately identifying these as MDPI (or non-MDPI) is challenging. Relying solely on journal names can lead to false positives (if the name is too generic) or false negatives (if the journal name isn't in the extension's known lists or has variations). The extension currently prioritizes DOI, PMCID/PMID (which are converted to DOI where possible), direct link to MDPI domain and strong journal name matches to maintain accuracy. For articles where this is an issue, checking for the full text on PubMed Central (PMC) can be a more reliable alternative for MDPI identification if the article is available there. For example, the LWW article mentioned above can be found on PMC ([https://pmc.ncbi.nlm.nih.gov/articles/PMC6750292/](https://pmc.ncbi.nlm.nih.gov/articles/PMC6750292/)), where PMC often provides more precise metadata, including DOI, PMID, and PMCID, which greatly aids in accurate identification.

---

## 🧪 Test Pages & Queries

### Test Articles

**Cell**
- https://www.cell.com/trends/plant-science/abstract/S1360-1385(24)00048-7

**BMJ**
- https://bjsm.bmj.com/content/52/6/376.long

**MDPI**
- https://www.mdpi.com/1660-4601/20/3/1681

**Frontiers**
- https://www.frontiersin.org/journals/drug-discovery/articles/10.3389/fddsv.2024.1385460/full#B40
- https://www.frontiersin.org/journals/nutrition/articles/10.3389/fnut.2024.1439294/full

**Nature**
- https://www.nature.com/articles/s43016-021-00402-w
- https://www.nature.com/articles/s41579-023-00993-0

**ScienceDirect**
- https://www.sciencedirect.com/science/article/pii/S1360138520301941

**PMC (PubMed Central)**
- https://pmc.ncbi.nlm.nih.gov/articles/PMC8810379/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC9415189/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC6750292/

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
```

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
