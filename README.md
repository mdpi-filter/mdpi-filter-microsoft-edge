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
- **EuropePMC Full-Text Citations**: Inline numerical citations (e.g., "[1]") in the full-text view of some EuropePMC articles are not highlighted for MDPI references. Examples:
    - [https://europepmc.org/article/med/36838493#free-full-text](https://europepmc.org/article/med/36838493#free-full-text)
    - [https://europepmc.org/article/pmc/pmc9146485#free-full-text](https://europepmc.org/article/pmc/pmc9146485#free-full-text)
- **Nature.com Sidebar References**: On Nature.com articles (e.g., [https://www.nature.com/articles/s44264-024-00042-0](https://www.nature.com/articles/s44264-024-00042-0)), references in the "reading companion" sidebar may occasionally be incorrectly counted and listed in the extension's popup, particularly if an inline footnote is clicked while the page and extension are still loading. While these sidebar references are correctly styled if they are MDPI, they are not intended to be part of the main count.
