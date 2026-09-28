/*

* ==========================================
* GitHub Dashboard
* ==========================================
*
* Hier deine GitHub-Daten eintragen:
  */

const GITHUB_USERNAME = "Cr0cke";
const GITHUB_REPOSITORY = "nanogames";

// Ordner mit den HTML-Dateien
const PAGES_FOLDER = "games";

// GitHub Branch
const GITHUB_BRANCH = "main";

// ==========================================
// Elemente
// ==========================================

const pageGrid = document.getElementById("pageGrid");
const loading = document.getElementById("loading");
const errorBox = document.getElementById("error");
const errorMessage = document.getElementById("errorMessage");
const empty = document.getElementById("empty");

const searchInput = document.getElementById("searchInput");
const pageCount = document.getElementById("pageCount");

const refreshButton = document.getElementById("refreshButton");
const retryButton = document.getElementById("retryButton");

const lastUpdated = document.getElementById("lastUpdated");

// Alle gefundenen Seiten
let pages = [];

// ==========================================
// GitHub API
// ==========================================

async function getPages() {

const apiURL =
    `https://api.github.com/repos/` +
    `${GITHUB_USERNAME}/` +
    `${GITHUB_REPOSITORY}/contents/` +
    `${PAGES_FOLDER}?ref=${GITHUB_BRANCH}`;


const response = await fetch(apiURL);


if (!response.ok) {

    if (response.status === 404) {
        throw new Error(
            `Der Ordner "${PAGES_FOLDER}" wurde nicht gefunden.`
        );
    }

    if (response.status === 403) {
        throw new Error(
            "GitHub API Rate Limit erreicht."
        );
    }

    throw new Error(
        `GitHub API Fehler: ${response.status}`
    );
}


const entries = await response.json();
const pages = [];


for (const entry of entries) {
    if (entry.type === "file" && entry.name.toLowerCase().endsWith(".html")) {
        pages.push({
            ...entry,
            folderName: null
        });
        continue;
    }

    if (entry.type !== "dir") {
        continue;
    }

    const folderURL =
        `https://api.github.com/repos/` +
        `${GITHUB_USERNAME}/` +
        `${GITHUB_REPOSITORY}/contents/` +
        `${entry.path}?ref=${GITHUB_BRANCH}`;


    const folderResponse =
        await fetch(folderURL);


    if (!folderResponse.ok) {
        continue;
    }


    const folderContents =
        await folderResponse.json();


    const indexFile =
        folderContents.find(file =>
            file.type === "file" &&
            file.name.toLowerCase() === "index.html"
        );


    if (indexFile) {
        pages.push({
            ...indexFile,
            folderName: entry.name
        });
    }
}


return pages;

}

// ==========================================
// Titel einer HTML-Seite auslesen
// ==========================================

async function getPageInformation(file) {
    try {
        const response = await fetch(file.download_url);

        if (!response.ok) {
            throw new Error("Datei konnte nicht geladen werden.");
        }

        const html = await response.text();
        const parser = new DOMParser();
        const document = parser.parseFromString(html, "text/html");

        const title =
            document.querySelector("title")?.textContent?.trim() ||
            cleanFileName(file.name);

        const description =
            document
                .querySelector('meta[name="description"]')
                ?.getAttribute("content")
                ?.trim() ||
            "Diese Webseite öffnen.";

        return {
            name: file.name,
            title: title,
            description: description,
            url: createPageURL(file.path)
        };
    } catch (error) {
        return {
            name: file.name,
            title: cleanFileName(file.name),
            description: "Diese Webseite öffnen.",
            url: createPageURL(file.path)
        };
    }
}

// ==========================================
// URL erstellen
// ==========================================

function createPageURL(filePath) {
    return filePath
        .split("/")
        .map(part => encodeURIComponent(part))
        .join("/");

}

// ==========================================
// Dateiname schöner machen
// ==========================================

function cleanFileName(fileName) {
    return fileName
        .replace(/\.html$/i, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, char => char.toUpperCase());
}

// ==========================================
// Seiten laden
// ==========================================

async function loadPages() {
    showLoading();

    try {
        const files = await getPages();

        if (files.length === 0) {
            showEmpty();
            pages = [];
            updatePageCount();
            return;
        }

        pages = await Promise.all(
            files.map(file => getPageInformation(file))
        );

        pages.sort((a, b) =>
            a.title.localeCompare(
                b.title,
                "de",
                {
                    sensitivity: "base"
                }
            )
        );

        renderPages(pages);
        updatePageCount();

        lastUpdated.textContent =
            "Zuletzt aktualisiert: " +
            new Date().toLocaleTimeString(
                "de-DE",
                {
                    hour: "2-digit",
                    minute: "2-digit"
                }
            );
    } catch (error) {
        console.error(error);
        showError(error.message);
    }
}

// ==========================================
// Kacheln erstellen
// ==========================================

function renderPages(pageList) {
    pageGrid.innerHTML = "";

    if (pageList.length === 0) {
        pageGrid.innerHTML = `
            <div class="status">
                <div class="status-icon">⌕</div>
                <h2>Keine Ergebnisse</h2>
                <p>
                    Keine Seite passt zu deiner Suche.
                </p>
            </div>
        `;

        hideLoading();
        return;
    }

    pageList.forEach(page => {
        const card = document.createElement("a");
        card.className = "page-card";
        card.href = page.url;

        card.innerHTML = `
            <div>
                <div class="card-top">
                    <div class="card-icon">
                        &lt;/&gt;
                    </div>

                    <div class="card-arrow">
                        →
                    </div>
                </div>

                <h2 class="card-title">
                    ${escapeHTML(page.title)}
                </h2>

                <p class="card-description">
                    ${escapeHTML(page.description)}
                </p>
            </div>

            <div class="card-path">
                ${escapeHTML(page.name)}
            </div>
        `;

        pageGrid.appendChild(card);
    });

    hideLoading();
}

// ==========================================
// Suche
// ==========================================

searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
        renderPages(pages);
        updatePageCount();
        return;
    }

    const filtered = pages.filter(page => {
        return (
            page.title.toLowerCase().includes(query) ||
            page.description.toLowerCase().includes(query) ||
            page.name.toLowerCase().includes(query)
        );
    });

    renderPages(filtered);
    updatePageCount(filtered.length);
});

// ==========================================
// Anzahl anzeigen
// ==========================================

function updatePageCount(count = pages.length) {
    if (count === 1) {
        pageCount.textContent = "1 Seite";
    } else {
        pageCount.textContent = `${count} Seiten`;
    }
}

// ==========================================
// HTML Escaping
// ==========================================

function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// ==========================================
// Status
// ==========================================

function showLoading() {
    loading.classList.remove("hidden");
    errorBox.classList.add("hidden");
    empty.classList.add("hidden");
    pageGrid.classList.add("hidden");
}

function hideLoading() {
    loading.classList.add("hidden");
    pageGrid.classList.remove("hidden");
}

function showEmpty() {
    loading.classList.add("hidden");
    errorBox.classList.add("hidden");
    empty.classList.remove("hidden");
    pageGrid.classList.add("hidden");
}

function showError(message) {
    loading.classList.add("hidden");
    empty.classList.add("hidden");
    pageGrid.classList.add("hidden");
    errorBox.classList.remove("hidden");
    errorMessage.textContent = message;
}

// ==========================================
// Buttons
// ==========================================

refreshButton.addEventListener("click", loadPages);
retryButton.addEventListener("click", loadPages);

// ==========================================
// Start
// ==========================================

loadPages();
