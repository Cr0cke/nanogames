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
const favoritesFilterButton = document.getElementById("favoritesFilterButton");
const favoritesCount = document.getElementById("favoritesCount");

const refreshButton = document.getElementById("refreshButton");
const retryButton = document.getElementById("retryButton");

const lastUpdated = document.getElementById("lastUpdated");

const STORAGE_KEY = "nanogames.cachedPages";
const FAVORITES_STORAGE_KEY = "nanogames.favoritePages";
const CACHE_TTL_MS = 10 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 2500;

// Alle gefundenen Seiten
let pages = [];
let favoritePages = readFavoritePages();
let favoritesOnly = false;
let lastRefreshRequest = 0;

function readFavoritePages() {
    try {
        const stored = JSON.parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
        return new Set(Array.isArray(stored) ? stored.filter(url => typeof url === "string") : []);
    } catch (error) {
        console.warn("Favoriten konnten nicht gelesen werden.", error);
        return new Set();
    }
}

function saveFavoritePages() {
    try {
        window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favoritePages]));
    } catch (error) {
        console.warn("Favoriten konnten nicht gespeichert werden.", error);
    }
}

function toggleFavorite(page) {
    if (favoritePages.has(page.url)) {
        favoritePages.delete(page.url);
    } else {
        favoritePages.add(page.url);
    }

    saveFavoritePages();
    renderVisiblePages();
}

function renderVisiblePages() {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = pages.filter(page => {
        const matchesQuery =
            page.title.toLowerCase().includes(query) ||
            page.description.toLowerCase().includes(query) ||
            page.name.toLowerCase().includes(query);

        return matchesQuery && (!favoritesOnly || favoritePages.has(page.url));
    });

    favoritesFilterButton.setAttribute("aria-pressed", String(favoritesOnly));
    favoritesCount.textContent = String(favoritePages.size);
    renderPages(filtered);
    updatePageCount(filtered.length);
}

function readCachedPages() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);

        if (!raw) {
            return null;
        }

        const cached = JSON.parse(raw);

        if (!cached || !Array.isArray(cached.pages) || typeof cached.timestamp !== "number") {
            return null;
        }

        const age = Date.now() - cached.timestamp;

        if (age > CACHE_TTL_MS) {
            window.localStorage.removeItem(STORAGE_KEY);
            return null;
        }

        return cached.pages;
    } catch (error) {
        console.warn("LocalStorage konnte nicht gelesen werden.", error);
        return null;
    }
}

function saveCachedPages(pageList) {
    try {
        window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                timestamp: Date.now(),
                pages: pageList
            })
        );
    } catch (error) {
        console.warn("LocalStorage konnte nicht gespeichert werden.", error);
    }
}

// ==========================================
// GitHub API
// ==========================================

async function getPages() {

async function fetchFolderContents(branchName) {
    const apiURL =
        `https://api.github.com/repos/` +
        `${GITHUB_USERNAME}/` +
        `${GITHUB_REPOSITORY}/contents/` +
        `${PAGES_FOLDER}?ref=${branchName}`;

    const response = await fetch(apiURL, { cache: "no-store" });

    if (!response.ok) {
        if (response.status === 404) {
            return null;
        }

        if (response.status === 403) {
            throw new Error("GitHub API Rate Limit erreicht.");
        }

        throw new Error(`GitHub API Fehler: ${response.status}`);
    }

    return await response.json();
}

let entries = await fetchFolderContents(GITHUB_BRANCH);

if (!entries && GITHUB_BRANCH === "main") {
    entries = await fetchFolderContents("master");
}

if (!entries) {
    throw new Error(`Der Ordner "${PAGES_FOLDER}" wurde nicht gefunden.`);
}

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
        await fetch(folderURL, { cache: "no-store" });


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

async function loadPages({ force = false } = {}) {
    showLoading();

    try {
        if (!force) {
            const cachedPages = readCachedPages();

            if (cachedPages && cachedPages.length > 0) {
                pages = cachedPages;
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
                return;
            }
        }

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

        saveCachedPages(pages);
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

        const cachedPages = readCachedPages();

        if (cachedPages && cachedPages.length > 0) {
            pages = cachedPages;
            renderPages(pages);
            updatePageCount();
            return;
        }

        showError(error.message);
    }
}

// ==========================================
// Kacheln erstellen
// ==========================================

function renderPages(pageList) {
    pageGrid.innerHTML = "";
    favoritesCount.textContent = String(favoritePages.size);
    favoritesFilterButton.setAttribute("aria-pressed", String(favoritesOnly));

    if (pageList.length === 0) {
        pageGrid.innerHTML = `
            <div class="status">
                <div class="status-icon">${favoritesOnly ? "☆" : "⌕"}</div>
                <h2>Keine Ergebnisse</h2>
                <p>
                    ${favoritesOnly ? "Du hast noch keine passenden Favoriten." : "Keine Seite passt zu deiner Suche."}
                </p>
            </div>
        `;

        hideLoading();
        return;
    }

    pageList.forEach(page => {
        const cardWrapper = document
            .getElementById("pageCardTemplate")
            .content.firstElementChild.cloneNode(true);
        const card = cardWrapper.querySelector(".page-card");
        card.href = page.url;
        card.querySelector(".card-title").textContent = page.title;
        card.querySelector(".card-description").textContent = page.description;
        card.querySelector(".card-path").textContent = page.name;

        const favoriteButton = cardWrapper.querySelector(".favorite-button");
        const isFavorite = favoritePages.has(page.url);
        favoriteButton.textContent = isFavorite ? "★" : "☆";
        favoriteButton.setAttribute("aria-label", `${isFavorite ? "Aus Favoriten entfernen:" : "Zu Favoriten hinzufügen:"} ${page.title}`);
        favoriteButton.setAttribute("aria-pressed", String(isFavorite));
        favoriteButton.title = isFavorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen";
        favoriteButton.addEventListener("click", () => toggleFavorite(page));

        pageGrid.appendChild(cardWrapper);
    });

    hideLoading();
}

// ==========================================
// Suche
// ==========================================

searchInput.addEventListener("input", () => {
    renderVisiblePages();
});

favoritesFilterButton.addEventListener("click", () => {
    favoritesOnly = !favoritesOnly;
    renderVisiblePages();
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

refreshButton.addEventListener("click", () => {
    const now = Date.now();

    if (now - lastRefreshRequest < REFRESH_COOLDOWN_MS) {
        return;
    }

    lastRefreshRequest = now;
    loadPages();
});

retryButton.addEventListener("click", () => {
    lastRefreshRequest = Date.now();
    loadPages({ force: true });
});

// ==========================================
// Start
// ==========================================

const cachedPages = readCachedPages();

if (cachedPages && cachedPages.length > 0) {
    pages = cachedPages;
    renderPages(pages);
    updatePageCount();
    lastUpdated.textContent =
        "Zuletzt lokal gespeichert: " +
        new Date().toLocaleTimeString(
            "de-DE",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );
} else {
    loadPages();
}
