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

---

## 🧪 Test Pages & Queries

### Test Articles

**Cell**
- https://www.cell.com/trends/plant-science/abstract/S1360-1385(24)00048-7

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

**The Lancet**
- https://www.thelancet.com/journals/lanmic/article/PIIS2666-5247(24)00200-3/fulltext

**Oxford Academic**
- https://academic.oup.com/af/article/13/4/112/7242422

**Wiley Online Library**
- https://onlinelibrary.wiley.com/doi/full/10.1002/vms3.798

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
