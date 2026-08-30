(function () {
  "use strict";

  var STORAGE_KEY = "song.favorites.v1";
  var MOODS = ["Romantic", "Chill", "Sad", "Happy", "Party", "Rainy"];
  var pendingSong = null;
  var pendingFavoriteId = null;

  function el(id) {
    return document.getElementById(id);
  }

  function todaySong() {
    var node = el("song-today-data");
    if (!node) {
      return null;
    }
    try {
      var data = JSON.parse(node.textContent || "null");
      if (!data || typeof data !== "object") {
        return null;
      }
      var title = String(data.title || "").trim();
      var artist = String(data.artist || "").trim();
      var spotifyId = String(data.spotify_id || "").trim();
      if (!title || !spotifyId) {
        return null;
      }
      return {
        title: title,
        artist: artist,
        spotify_id: spotifyId,
        spotify_url: String(data.spotify_url || "").trim(),
        date: String(data.date || "").trim()
      };
    } catch (err) {
      return null;
    }
  }

  function newId() {
    if (globalThis.crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
  }

  function normalizeFavorite(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    var title = String(raw.title || "").trim();
    var spotifyId = String(raw.spotify_id || "").trim();
    var mood = String(raw.mood || "").trim();
    if (!title || !spotifyId || MOODS.indexOf(mood) === -1) {
      return null;
    }
    return {
      id: raw.id ? String(raw.id) : newId(),
      title: title,
      artist: String(raw.artist || "").trim(),
      spotify_id: spotifyId,
      spotify_url: String(raw.spotify_url || "").trim(),
      date: String(raw.date || "").trim(),
      mood: mood
    };
  }

  function readFavorites() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      var data = JSON.parse(raw);
      var rows = Array.isArray(data)
        ? data
        : data && Array.isArray(data.favorites)
          ? data.favorites
          : [];
      return rows.map(normalizeFavorite).filter(Boolean);
    } catch (err) {
      return [];
    }
  }

  function writeFavorites(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ favorites: list }));
  }

  function findFavorite(list, song) {
    if (!song) {
      return null;
    }
    return list.filter(function (item) {
      return item.spotify_id === song.spotify_id;
    })[0] || null;
  }

  function embedUrl(id) {
    return "https://open.spotify.com/embed/track/" + encodeURIComponent(id);
  }

  function trackUrl(song) {
    if (song.spotify_url) {
      return song.spotify_url;
    }
    return "https://open.spotify.com/track/" + encodeURIComponent(song.spotify_id);
  }

  function embed(song) {
    var frame = document.createElement("iframe");
    frame.className = "song-embed";
    frame.src = embedUrl(song.spotify_id);
    frame.title = song.title;
    frame.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    frame.loading = "lazy";
    return frame;
  }

  function openMoodDialog(song, favoriteId) {
    pendingSong = song;
    pendingFavoriteId = favoriteId || null;
    var dialog = el("song-mood-dialog");
    var title = el("song-mood-title");
    if (title) {
      title.textContent = favoriteId ? "Move to a mood" : "Choose a mood";
    }
    if (dialog && typeof dialog.showModal === "function") {
      dialog.showModal();
    } else if (dialog) {
      dialog.setAttribute("open", "open");
    }
  }

  function closeMoodDialog() {
    pendingSong = null;
    pendingFavoriteId = null;
    var dialog = el("song-mood-dialog");
    if (!dialog) {
      return;
    }
    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function saveWithMood(mood) {
    if (MOODS.indexOf(mood) === -1) {
      return;
    }
    var list = readFavorites();
    if (pendingFavoriteId) {
      list = list.map(function (item) {
        if (item.id !== pendingFavoriteId) {
          return item;
        }
        return Object.assign({}, item, { mood: mood });
      });
    } else if (pendingSong) {
      var existing = findFavorite(list, pendingSong);
      if (existing) {
        existing.mood = mood;
      } else {
        list.push(normalizeFavorite(Object.assign({}, pendingSong, { mood: mood, id: newId() })));
      }
    }
    writeFavorites(list.filter(Boolean));
    closeMoodDialog();
    render();
  }

  function removeFavorite(id) {
    writeFavorites(readFavorites().filter(function (item) {
      return item.id !== id;
    }));
    render();
  }

  function toggleTodayFavorite() {
    var song = todaySong();
    if (!song) {
      return;
    }
    var list = readFavorites();
    var existing = findFavorite(list, song);
    if (existing) {
      removeFavorite(existing.id);
      return;
    }
    openMoodDialog(song, null);
  }

  function renderToday() {
    var root = el("song-today");
    if (!root) {
      return;
    }
    root.replaceChildren();
    var song = todaySong();
    if (!song) {
      var empty = document.createElement("p");
      empty.className = "lede";
      empty.textContent = "Today’s song isn’t in yet.";
      root.appendChild(empty);
      return;
    }
    var saved = findFavorite(readFavorites(), song);
    var title = document.createElement("h2");
    title.className = "song-title";
    title.textContent = song.title;
    var artist = document.createElement("p");
    artist.className = "song-artist";
    artist.textContent = song.artist || "";
    if (song.date) {
      var when = document.createElement("p");
      when.className = "song-date";
      when.textContent = song.date;
      root.appendChild(title);
      root.appendChild(artist);
      root.appendChild(when);
    } else {
      root.appendChild(title);
      root.appendChild(artist);
    }
    root.appendChild(embed(song));
    var actions = document.createElement("div");
    actions.className = "song-actions";
    var fav = document.createElement("button");
    fav.type = "button";
    fav.className = "song-btn" + (saved ? " is-saved" : "");
    fav.textContent = saved ? "Favorited · " + saved.mood : "Favorite";
    fav.addEventListener("click", toggleTodayFavorite);
    var open = document.createElement("a");
    open.className = "song-link";
    open.href = trackUrl(song);
    open.target = "_blank";
    open.rel = "noreferrer";
    open.textContent = "Open in Spotify";
    actions.appendChild(fav);
    actions.appendChild(open);
    root.appendChild(actions);
  }

  function favoriteRow(item) {
    var row = document.createElement("article");
    row.className = "song-fav";
    var copy = document.createElement("div");
    var title = document.createElement("h3");
    title.textContent = item.title;
    var meta = document.createElement("p");
    meta.textContent = [item.artist, item.date].filter(Boolean).join(" · ");
    copy.appendChild(title);
    if (meta.textContent) {
      copy.appendChild(meta);
    }
    var mood = document.createElement("label");
    mood.className = "song-mood-label";
    mood.textContent = "Mood";
    var select = document.createElement("select");
    select.setAttribute("aria-label", "Mood for " + item.title);
    MOODS.forEach(function (name) {
      var option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      if (name === item.mood) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    select.addEventListener("change", function () {
      saveWithMoodFor(item.id, select.value);
    });
    mood.appendChild(select);
    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "song-btn song-btn-quiet";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove " + item.title + " from favorites");
    remove.addEventListener("click", function () {
      removeFavorite(item.id);
    });
    row.appendChild(copy);
    row.appendChild(embed(item));
    var tools = document.createElement("div");
    tools.className = "song-fav-tools";
    tools.appendChild(mood);
    tools.appendChild(remove);
    row.appendChild(tools);
    return row;
  }

  function saveWithMoodFor(id, mood) {
    if (MOODS.indexOf(mood) === -1) {
      return;
    }
    writeFavorites(readFavorites().map(function (item) {
      return item.id === id ? Object.assign({}, item, { mood: mood }) : item;
    }));
    render();
  }

  function renderFavorites() {
    var root = el("song-favorites");
    if (!root) {
      return;
    }
    root.replaceChildren();
    var list = readFavorites();
    if (!list.length) {
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No favorites in this browser.";
      root.appendChild(empty);
      return;
    }
    MOODS.forEach(function (mood) {
      var group = list.filter(function (item) {
        return item.mood === mood;
      });
      if (!group.length) {
        return;
      }
      var section = document.createElement("section");
      section.className = "song-mood-group";
      var heading = document.createElement("h3");
      heading.textContent = mood;
      section.appendChild(heading);
      group.forEach(function (item) {
        section.appendChild(favoriteRow(item));
      });
      root.appendChild(section);
    });
  }

  function render() {
    renderToday();
    renderFavorites();
  }

  function initMoods() {
    var root = el("song-mood-options");
    if (!root) {
      return;
    }
    root.replaceChildren();
    MOODS.forEach(function (mood) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "song-mood";
      button.textContent = mood;
      button.addEventListener("click", function () {
        saveWithMood(mood);
      });
      root.appendChild(button);
    });
  }

  function init() {
    initMoods();
    render();
    var cancel = el("song-mood-cancel");
    if (cancel) {
      cancel.addEventListener("click", closeMoodDialog);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
