/**
 * HDRezka + Multi-source Plugin for Lampa TV
 * v1.2 — one button, multiple sources (HDRezka, Kodik, HDVB, Alloha)
 */

// Promise polyfill for Chromium 38 / WebOS 3.x
if (typeof Promise === 'undefined') {
    window.Promise = (function() {
        var Promise = function(fn) {
            var state = 'pending', value, callbacks = [];
            var resolve = function(val) {
                if (state !== 'pending') return;
                if (val && typeof val.then === 'function') { val.then(resolve, reject); return; }
                state = 'fulfilled'; value = val;
                callbacks.forEach(function(cb) { cb.onFulfilled && cb.onFulfilled(value); });
            }
            var reject = function(val) {
                if (state !== 'pending') return;
                state = 'rejected'; value = val;
                callbacks.forEach(function(cb) { cb.onRejected && cb.onRejected(value); });
            }
            this.then = function(onFulfilled, onRejected) {
                return new Promise(function(res, rej) {
                    var handle = function() {
                        try {
                            if (state === 'fulfilled') {
                                res(typeof onFulfilled === 'function' ? onFulfilled(value) : value);
                            } else if (state === 'rejected') {
                                if (typeof onRejected === 'function') res(onRejected(value));
                                else rej(value);
                          } else {
                                callbacks.push({
                                    onFulfilled: function(v) { try { res(typeof onFulfilled === 'function' ? onFulfilled(v) : v); } catch(e) { rej(e); } },
                                    onRejected:  function(v) { try { if (typeof onRejected === 'function') res(onRejected(v)); else rej(v); } catch(e) { rej(e); } }
                                });
                            }
                        } catch(e) { rej(e); }
                    };
                    handle();
                });
            };
            this['catch'] = function(onRejected) { return this.then(null, onRejected); };
            try { fn(resolve, reject); } catch(e) { reject(e); }
        }
        Promise.resolve = function(v) { return new Promise(function(r) { r(v); }); };
        Promise.reject  = function(v) { return new Promise(function(_, r) { r(v); }); };
        Promise.all = function(arr) {
            return new Promise(function(resolve, reject) {
                var results = [], count = arr.length;
                if (!count) { resolve(results); return; }
                arr.forEach(function(p, i) {
                    Promise.resolve(p).then(function(v) { results[i] = v; if (!--count) resolve(results); }, reject);
                });
            });
        };
        return Promise;
    })();
}

(function () {
    'use strict';

    // Unique ID for this plugin instance to avoid component/manifest conflicts
    var PLUGIN_UID = 'online_' + Math.random().toString(36).substring(2, 10);
    console.log('[Online] plugin script executing with UID:', PLUGIN_UID);

    var ONLINE_PLUGIN_BASE_URL = (function() {
        try {
            var src = (document.currentScript && document.currentScript.src) || '';
            if (!src) return '';
            return src.substring(0, src.lastIndexOf('/') + 1);
        } catch (e) {
            return '';
        }
    })();
    window.ONLINE_PLUGIN_BASE_URL = ONLINE_PLUGIN_BASE_URL;
    
    // Debug: confirm plugin is executing
    try { document.title = 'HDRezka OK'; } catch(e) {}

    // Global error handler for debugging on TV
    window.onerror = function(msg, src, line) {
        try {
            if (window.Lampa && Lampa.Noty) {
                Lampa.Noty.show('Plugin error: ' + msg + ' L' + line);
            }
        } catch(e) {}
        return false;
    };

    // --- CONFIG ------------------------------------------------------------------

    var STORAGE_KEY    = 'hdrezka_mirror';
    var DEFAULT_MIRROR = 'https://rezka.ag';
    var MIRRORS = [
        'https://rezka.ag',
        'https://hdrezka.ag',
        'https://rezka-ua.pub'
    ];
    var TRASH_MARKERS = ['//_//', '!!_!!', '@@_@@', '--_--', '$$__$$', '%%_%%'];

    // Token storage keys for paid CDN sources
    var TOKEN_KEYS = {
        kodik:        'hdrezka_plugin_kodik_token',
        hdvb:         'hdrezka_plugin_hdvb_token',
        alloha:       'hdrezka_plugin_alloha_token',
        alloha_domain:'hdrezka_plugin_alloha_domain',
        fancdn:       'hdrezka_plugin_fancdn_token',
        fancdn_cookie:'hdrezka_plugin_fancdn_cookie'
    };

    // FanCDN defaults
    var FANCDN_DEFAULT_HOST = 'https://fanserial.me';

    var CDNVIDEOHUB_PROXY_KEY = 'online_cdnvideohub_proxy';
    var CDNVIDEOHUB_PROXY_DEFAULT = 'https://recycleactor-1.hf.space';
    var CDNVIDEOHUB_PROXY = CDNVIDEOHUB_PROXY_DEFAULT;

    // VeoVeo — использует тот же прокси что Alloha/Turbo (Railway)
    // Нужен для embed запросов к tv-1-kinoserial.net (требует Referer)
    var VEOVEO_PROXY = CDNVIDEOHUB_PROXY; // будет переопределён через getProxyUrl() при использовании

    function cdnUrl(path) {
        return CDNVIDEOHUB_PROXY + path;
    }

    function setCdnvideohubProxy(url) {
        url = String(url || '').trim().replace(/\/$/, '');
        if (url && url.indexOf('http') === 0) {
            CDNVIDEOHUB_PROXY = url;
        } else {
            CDNVIDEOHUB_PROXY = CDNVIDEOHUB_PROXY_DEFAULT;
        }
        window.CDNVIDEOHUB_PROXY = CDNVIDEOHUB_PROXY;
    }

    function refreshCdnvideohubProxyFromStorage() {
        try {
            if (window.Lampa && Lampa.Storage) {
                var v = Lampa.Storage.get(CDNVIDEOHUB_PROXY_KEY, '');
                if (v) setCdnvideohubProxy(v);
                else setCdnvideohubProxy(CDNVIDEOHUB_PROXY_DEFAULT);
            }
        } catch (e) {
            setCdnvideohubProxy(CDNVIDEOHUB_PROXY_DEFAULT);
        }
    }

    // Универсальная функция получения Кинопоиск ID для карточки
    // Сначала проверяет card.kinopoisk_id и external_ids
    // Потом запрашивает TMDB external_ids
    // Потом через наш HF прокси по imdb_id или названию
    function resolveKpId(card, callback) {
        // 1. Уже есть
        var kp = card.kinopoisk_id || (card.external_ids && card.external_ids.kinopoisk_id) || null;
        if (kp) { callback(kp); return; }

        var isSerial = !!(card.number_of_seasons || card.media_type === 'tv' || card.first_air_date);
        var tmdbType = isSerial ? 'tv' : 'movie';
        var tmdbId = card.id;

        // 2. Запрашиваем TMDB external_ids
        var extUrl = Lampa.TMDB.api(tmdbType + '/' + tmdbId + '/external_ids?api_key=' + Lampa.TMDB.key());
        var xhr = new XMLHttpRequest();
        xhr.open('GET', extUrl, true);
        xhr.timeout = 10000;
        xhr.onload = function() {
            var ext; try { ext = JSON.parse(xhr.responseText); } catch(e) { ext = {}; }
            var kp2 = ext.kinopoisk_id || null;
            if (kp2) { card.kinopoisk_id = kp2; callback(kp2); return; }

            // 3. Через HF прокси по imdb_id или названию
            var imdbId = ext.imdb_id || card.imdb_id || (card.external_ids && card.external_ids.imdb_id) || null;
            var title = card.original_title || card.original_name || card.title || card.name || '';
            var year = (card.release_date || card.first_air_date || '').slice(0, 4);
            var params = [];
            if (imdbId) params.push('imdb=' + encodeURIComponent(imdbId));
            if (title)  params.push('title=' + encodeURIComponent(title));
            if (year)   params.push('year=' + encodeURIComponent(year));
            if (!params.length) { callback(null); return; }

            var xhrKp = new XMLHttpRequest();
            xhrKp.open('GET', CDNVIDEOHUB_PROXY + '/kp_by_imdb?' + params.join('&'), true);
            xhrKp.timeout = 12000;
            xhrKp.onload = function() {
                try {
                    var d = JSON.parse(xhrKp.responseText);
                    if (d.kp_id) { card.kinopoisk_id = d.kp_id; callback(d.kp_id); }
                    else callback(null);
                } catch(e) { callback(null); }
            };
            xhrKp.onerror = xhrKp.ontimeout = function() { callback(null); };
            xhrKp.send();
        };
        xhr.onerror = xhr.ontimeout = function() { callback(null); };
        xhr.send();
    }

    // Keepalive для HF Space — пингуем каждые 10 сек чтобы не засыпал
    var _cdnKeepAliveTimer = null;
    function cdnStartKeepAlive() {
        cdnStopKeepAlive();
        _cdnKeepAliveTimer = setInterval(function() {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', CDNVIDEOHUB_PROXY + '/', true);
            xhr.timeout = 5000;
            xhr.send();
        }, 10000);
    }
    function cdnStopKeepAlive() {
        if (_cdnKeepAliveTimer) { clearInterval(_cdnKeepAliveTimer); _cdnKeepAliveTimer = null; }
    }

    // Default Alloha config (from videozal.club — static partner token)
    var ALLOHA_DEFAULT_TOKEN  = '7245bc6ce2604536b78f128f818b06';
    var ALLOHA_DEFAULT_DOMAIN = 'https://alloha.videozal.club';

    // --- UTILS -------------------------------------------------------------------

    // Автопереход на следующую серию
    (function setupAutoNextEpisode() {
        if (window._autoNextEpisodeInitialized) return;
        window._autoNextEpisodeInitialized = true;

        // Слушаем события плеера
        if (Lampa.Player) {
            var checkAndShowNextPrompt = function() {
                var player = Lampa.Player.player;
                if (!player || !window._online_season_playlist || window._online_current_episode_index === undefined) return;

                var playlist = window._online_season_playlist;
                var currentIndex = window._online_current_episode_index;
                var nextEpisode = playlist[currentIndex + 1];

                if (!nextEpisode) return; // Нет следующей серии

                var duration = player.duration || 0;
                var currentTime = player.currentTime || 0;
                var remaining = duration - currentTime;

                // За 30 секунд до конца показываем промпт
                if (remaining > 25 && remaining < 30 && !window._nextEpisodePromptShown) {
                    window._nextEpisodePromptShown = true;

                    var notification = Lampa.Template.get('notice', {
                        title: 'Следующая серия',
                        text: nextEpisode.title
                    });

                    notification.css({
                        position: 'fixed',
                        bottom: '100px',
                        right: '30px',
                        'z-index': '10000',
                        'max-width': '400px'
                    });

                    $('body').append(notification);

                    setTimeout(function() {
                        notification.remove();
                    }, 8000);
                }

                // Автоматически переключаем когда серия заканчивается
                if (remaining < 2 && !window._autoNextTriggered) {
                    window._autoNextTriggered = true;
                    window._nextEpisodePromptShown = false;
                    window._online_current_episode_index = currentIndex + 1;

                    setTimeout(function() {
                        if (nextEpisode.onPlay) {
                            nextEpisode.onPlay();
                        }
                        window._autoNextTriggered = false;
                    }, 1000);
                }
            };

            // Проверяем каждую секунду
            setInterval(checkAndShowNextPrompt, 1000);

            // Сбрасываем флаги при старте нового видео
            Lampa.Player.listener.follow('start', function() {
                window._nextEpisodePromptShown = false;
                window._autoNextTriggered = false;
            });
        }
    })();

    // ═══════════════════════════════════════════════════════════════════════════
    // УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ДЛЯ СОЗДАНИЯ ПЛЕЙЛИСТА СЕЗОНА
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Создает плейлист для всего сезона с поддержкой lazy-loading URL
     * @param {Object} currentItem - текущий item для воспроизведения
     * @param {Array} allSeasonItems - все items сезона (опционально, для создания плейлиста)
     * @param {Function} urlResolver - функция для получения URL: function(item, callback)
     *                                 callback должен вызываться с объектом {url, quality?, subtitles?}
     */
    window.createOnlinePlaylist = function(currentItem, allSeasonItems, urlResolver) {
        var playlist = [];
        
        if (allSeasonItems && allSeasonItems.length > 1 && urlResolver) {
            allSeasonItems.forEach(function(item) {
                var playlistItem = {
                    title: item.title || 'Серия ' + (item.episode || ''),
                    url: function(call) {
                        var self = this;
                        urlResolver(item, function(result) {
                            // result должен быть объектом: {url, quality?, subtitles?}
                            self.url = result.url;
                            if (result.quality) self.quality = result.quality;
                            if (result.subtitles) self.subtitles = result.subtitles;
                            call();
                        });
                    }
                };
                
                // Копируем дополнительные свойства
                if (item.timeline) playlistItem.timeline = item.timeline;
                if (item.episode) playlistItem.episode = item.episode;
                if (item.season) playlistItem.season = item.season;
                
                playlist.push(playlistItem);
            });
        }
        
        return playlist;
    };

    var getBaseUrl = function() {
            var saved = Lampa.Storage.get(STORAGE_KEY, '');
        return (saved && saved.length > 5) ? saved : DEFAULT_MIRROR;
    }

    var normalizeUrl = function(url) {
        if (!url) return '';
        if (url.indexOf('http') === 0) return url;
        if (url.indexOf('//') === 0) return 'https:' + url;
        return getBaseUrl() + (url.charAt(0) === '/' ? '' : '/') + url;
    }

    var request = function(url, options) {
        options = options || {};
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            var method = options.method || 'GET';
            xhr.open(method, url, true);
            xhr.timeout = options.timeout || 20000;
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            if (method === 'POST') {
                xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
            }
            // Custom headers
            if (options.headers) {
                for (var h in options.headers) {
                    if (options.headers.hasOwnProperty(h)) {
                        try { xhr.setRequestHeader(h, options.headers[h]); } catch (e) {}
                    }
                }
            }
            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 400) {
                    resolve({ text: xhr.responseText, status: xhr.status });
                } else {
                    reject(new Error('HTTP ' + xhr.status));
                }
            };
            xhr.onerror   = function () { reject(new Error('Network error')); };
            xhr.ontimeout = function () { reject(new Error('Timeout')); };
            xhr.send(options.body || null);
        });
    }

    var get = function(url) { return request(url); }

    var post = function(url, params) {
            var body = Object.keys(params).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }).join('&');
        return request(url, { method: 'POST', body: body });
    }

    var parseHtml = function(text) {
        return (new DOMParser()).parseFromString(text, 'text/html');
    }

    // --- DECODER -----------------------------------------------------------------

    var safeAtob = function(str) {
        try {
            var c = str.replace(/[^A-Za-z0-9+/=\-_]/g, '').replace(/-/g, '+').replace(/_/g, '/');
            var mod = c.length % 4;
            if (mod === 1) c = c.slice(0, -1);
            else if (mod > 0) c += '===='.slice(0, 4 - mod);
            return atob(c);
        } catch (e) { return str; }
    }

    var clearTrash = function(data) {
        if (!data) return '';
        var s = data.replace(/\\\//g, '/');

        // Format #2/#3
        if (s.indexOf('#2') === 0 || s.indexOf('#3') === 0) {
            try {
                var wp = s.substring(2);
                var dm = wp.substring(0, 2);
                var payload = wp.substring(2);
                var sep = String.fromCharCode(parseInt(dm, 10));
                var parts = payload.split(sep);
                var ml = 32;
                var out = [];
                for (var i = 0; i < parts.length; i++) {
                    var p = parts[i];
                    if (!p) { out.push(''); continue; }
                    var t = parseInt(p.slice(-1), 10);
                    if (isNaN(t)) { out.push(p); continue; }
                    var dec = safeAtob(p.slice(0, -1));
                    var res = '';
                    for (var j = 0; j < dec.length; j++) res += String.fromCharCode(dec.charCodeAt(j) ^ (ml + t));
                    out.push(res);
                }
                return out.join('');
            } catch (e) { /* fall through */ }
        }

        // Format #h
        if (s.indexOf('#h') === 0) {
            s = s.substring(2);
            var hasMarker = false;
            for (var k = 0; k < TRASH_MARKERS.length; k++) {
                if (s.indexOf(TRASH_MARKERS[k]) === 0) { hasMarker = true; break; }
            }
            if (!hasMarker) s = s.substring(16);
        } else if (s.indexOf('#') === 0) {
            s = s.substring(2);
        }

        // Remove trash markers (marker 5 chars + 16 junk = 21)
        s = s.replace(/(?:\/\/_\/\/|!!_!!|@@_@@|--_--|\\$\\$__\\$\\$|%%_%%)[\s\S]{1,16}/g, '');

        if (s.trim().match(/^\[[^\]]+\]/) || s.trim().indexOf('http') === 0) return s;

        try { return safeAtob(s); } catch (e) { return s; }
    }

    var parseStreams = function(decoded) {
            var streams = [];
        if (!decoded) return streams;
        var parts = decoded.split(/,(?=\[)/);
        for (var i = 0; i < parts.length; i++) {
            var m = parts[i].trim().match(/^\[([^\]]+)\](.*)/);
            if (!m) continue;
            var quality = m[1].trim();
            var urlList = m[2].trim().split(' or ');
            var bestUrl = '';
            for (var j = 0; j < urlList.length; j++) {
                var u = urlList[j].trim();
                if (u.indexOf('http') === 0 || u.indexOf('//') === 0) { bestUrl = u; break; }
            }
            if (!bestUrl) bestUrl = urlList[0].trim();
            if (bestUrl.indexOf('//') === 0) bestUrl = 'https:' + bestUrl;
            if (bestUrl) streams.push({ quality: quality, url: bestUrl });
        }
        var order = ['2160p', '1080p ultra', '1080p', '720p', '480p', '360p'];
        streams.sort(function (a, b) {
            var ai = order.indexOf(a.quality.toLowerCase()); if (ai < 0) ai = 99;
            var bi = order.indexOf(b.quality.toLowerCase()); if (bi < 0) bi = 99;
            return ai - bi;
        });
        return streams;
    }

    // --- SEARCH ------------------------------------------------------------------

    /**
     * Detect content type from HDRezka search result item
     * Returns: 'movie' | 'series' | 'cartoon' | 'anime'
     */
    var detectType = function(item) {
            var catEl = item.querySelector('.cat');
        if (catEl) {
            var cls = catEl.className || '';
            if (cls.indexOf('serial') !== -1 || cls.indexOf('series') !== -1) return 'series';
            if (cls.indexOf('animation') !== -1 || cls.indexOf('anime') !== -1) return 'anime';
            if (cls.indexOf('cartoon') !== -1) return 'cartoon';
            if (cls.indexOf('film') !== -1 || cls.indexOf('movie') !== -1) return 'movie';
            // Try text inside
            var entityEl = catEl.querySelector('.entity');
            if (entityEl) {
                var t = entityEl.textContent.toLowerCase();
                if (t.indexOf('сериал') !== -1) return 'series';
                if (t.indexOf('аниме') !== -1) return 'anime';
                if (t.indexOf('мультфильм') !== -1) return 'cartoon';
            }
        }
        return 'movie';
    }

    var typeLabel = function(type) {
            var labels = { series: 'сериал', anime: 'аниме', cartoon: 'мультфильм', movie: 'фильм' };
        return labels[type] || 'фильм';
    }

    var isSeries = function(type) {
        return type === 'series' || type === 'anime';
    }

    /**
     * Search HDRezka, returns [{title, url, year, poster, type}]
     */
    var searchByTitle = function(query, callback) {
            var base = getBaseUrl();
        var url = base + '/search/?do=search&subaction=search&q=' + encodeURIComponent(query);
        get(url).then(function (resp) {
            var doc = parseHtml(resp.text);
            var items = doc.querySelectorAll('.b-content__inline_item');
            var results = [];
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var linkEl = item.querySelector('.b-content__inline_item-link a');
                if (!linkEl) continue;
                var href  = linkEl.getAttribute('href') || '';
                var title = linkEl.textContent.trim();
                var yearEl = item.querySelector('.b-content__inline_item-link div');
                var year   = yearEl ? (yearEl.textContent.match(/\d{4}/) || [''])[0] : '';
                var imgEl  = item.querySelector('.b-content__inline_item-cover img');
                var poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '') : '';
                var type   = detectType(item);
                if (href && title) {
                    results.push({ title: title, url: normalizeUrl(href), year: year, poster: poster, type: type });
                }
            }
            callback(null, results);
        }).catch(function (err) { callback(err, []); });
    }

    // --- FILM PAGE PARSING -------------------------------------------------------

    var parseFilmPage = function(html) {
            var doc = parseHtml(html);
        var result = { id: 0, translators: [], isSeries: false, favs: '0', seasons: [] };

        var idMatch = html.match(/initCDN(?:Series|Movies)Events\s*\(\s*(\d+)/);
        if (idMatch) result.id = parseInt(idMatch[1], 10);

        if (!result.id) {
            var canonical = doc.querySelector('link[rel="canonical"]');
            if (canonical) {
                var m = (canonical.getAttribute('href') || '').match(/\/(\d+)-/);
                if (m) result.id = parseInt(m[1], 10);
            }
        }

        result.isSeries = html.indexOf('initCDNSeriesEvents') !== -1;

        // Translators — include language flags from data attributes
        var transEls = doc.querySelectorAll('.b-translator__item, #translators-list li');
        for (var i = 0; i < transEls.length; i++) {
            var el = transEls[i];
            var tid = el.getAttribute('data-translator_id') || el.getAttribute('data-id') || '';
            var tname = el.textContent.trim();
            // Append language tag if present (e.g. "(укр)" from title attribute or data-title)
            var titleAttr = el.getAttribute('title') || el.getAttribute('data-title') || '';
            if (titleAttr && titleAttr !== tname) {
                // Extract language hint from title if it differs
                var langMatch = titleAttr.match(/\(([^)]{2,10})\)/);
                if (langMatch && tname.indexOf(langMatch[0]) === -1) tname += ' ' + langMatch[0];
            }
            // Check for Ukrainian/English flags via img inside
            var flagImg = el.querySelector('img');
            if (flagImg) {
                var flagSrc = flagImg.getAttribute('src') || '';
                if (flagSrc.indexOf('ua') !== -1 || flagSrc.indexOf('ukr') !== -1) {
                    if (tname.indexOf('укр') === -1 && tname.indexOf('(укр)') === -1) tname += ' (укр)';
                } else if (flagSrc.indexOf('en') !== -1 || flagSrc.indexOf('eng') !== -1) {
                    if (tname.indexOf('укр') === -1 && tname.indexOf('(укр)') === -1) tname += ' (укр)';
                }
            }
            if (tid) result.translators.push({ id: tid, name: tname });
        }

        // Favs hash
        var favsMatch = html.match(/initCDN(?:Series|Movies)Events\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*["']([^"']{4,})["']/);
        result.favs = favsMatch ? favsMatch[1] : '0';

        // Default translator fallback
        if (result.translators.length === 0) {
            var defMatch = html.match(/initCDN(?:Series|Movies)Events\s*\(\s*\d+\s*,\s*(\d+)/);
            if (defMatch) result.translators.push({ id: defMatch[1], name: 'Без перевода' });
        }

        // Parse seasons list (for series)
        if (result.isSeries) {
            var seasonEls = doc.querySelectorAll('.b-simple_season__item, #simple-seasons-list li');
            for (var s = 0; s < seasonEls.length; s++) {
                var sel = seasonEls[s];
                var snum = sel.getAttribute('data-tab_id') || sel.getAttribute('data-id') || '';
                var sname = sel.textContent.trim();
                if (snum) result.seasons.push({ id: snum, name: sname || ('Сезон ' + snum) });
            }
            // Fallback: extract seasons from initCDNSeriesEvents JS call
            if (result.seasons.length === 0) {
                var seasonsMatch = html.match(/seasons\s*:\s*\{([^}]+)\}/);
                if (seasonsMatch) {
                    var sKeys = seasonsMatch[1].match(/"(\d+)"/g);
                    if (sKeys) sKeys.forEach(function(k) {
                        var sn = k.replace(/"/g, '');
                        result.seasons.push({ id: sn, name: 'Сезон ' + sn });
                    });
                }
            }
        }

        console.log('[HDRezka] parseFilmPage: id=' + result.id + ' isSeries=' + result.isSeries + ' seasons=' + result.seasons.length + ' translators=' + result.translators.length + ' seasons_ids=' + result.seasons.map(function(s){return s.id;}).join(','));
        return result;
    }

    // --- STREAM FETCHING ---------------------------------------------------------

    /**
     * Fetch episodes list for a season via AJAX
     * Returns [{id, name}]
     */
    var getEpisodes = function(filmId, translatorId, seasonId, favs, callback) {
            var base = getBaseUrl();
        var params = {
            id: filmId,
            translator_id: translatorId,
            season: seasonId,
            action: 'get_episodes',
            favs: favs || '0'
        };
        var endpoints = [
            base + '/ajax/get_cdn_series/',
            base + '/engine/ajax/get_cdn_series/'
        ];

        var tryNext = function(idx) {
            if (idx >= endpoints.length) { callback(new Error('Failed'), []); return; }
            post(endpoints[idx], params).then(function (resp) {
                var text = resp.text || '';
                var json;
                try { json = JSON.parse(text); } catch (e) { tryNext(idx + 1); return; }
                if (!json || json.success === false) { tryNext(idx + 1); return; }

                var episodes = [];

                // Parse episodes from json.episodes HTML
                // HDRezka: <li class="b-simple_episode__item" data-season_id="1" data-episode_id="1">
                if (json.episodes) {
                    console.log('[HDRezka] json.episodes raw (first 300):', String(json.episodes).substring(0, 300));
                    var doc = parseHtml('<div>' + json.episodes + '</div>');
                    var epEls = doc.querySelectorAll('li');
                    // Log first element to see real attribute names
                    if (epEls.length > 0) {
                        console.log('[HDRezka] episode li[0]:', epEls[0].outerHTML.substring(0, 200));
                    }
                    for (var i = 0; i < epEls.length; i++) {
                        var el = epEls[i];
                        var epId = el.getAttribute('data-episode_id') || el.getAttribute('data-id') || '';
                        var epSeason = el.getAttribute('data-season_id') || el.getAttribute('data-season') || '';
                        var epName = el.textContent.trim();
                        // Only include episodes for the requested season
                        if (epSeason && String(epSeason) !== String(seasonId)) continue;
                        if (epId) episodes.push({ id: epId, name: epName || ('Серия ' + epId) });
                    }
                    console.log('[HDRezka] after season filter: season=' + seasonId + ' total_li=' + epEls.length + ' filtered=' + episodes.length);
                }

                // Fallback: generate episode list from json.episodes_count
                if (!episodes.length && json.episodes_count) {
                    for (var k = 1; k <= parseInt(json.episodes_count); k++) {
                        episodes.push({ id: String(k), name: 'Серия ' + k });
                    }
                }

                console.log('[HDRezka] getEpisodes season=' + seasonId + ' trans=' + translatorId + ' count=' + episodes.length + ' ids=' + episodes.slice(0,5).map(function(e){return e.id;}).join(','));
                callback(null, episodes);
            }).catch(function () { tryNext(idx + 1); });
        };
        tryNext(0);
    }

    // Fetch all seasons list for a series via API
    var getSeasons = function(filmId, translatorId, favs, callback) {
            var base = getBaseUrl();
        var params = { id: filmId, translator_id: translatorId, season: 1, action: 'get_episodes', favs: favs || '0' };
        post(base + '/ajax/get_cdn_series/', params).then(function(resp) {
            var json; try { json = JSON.parse(resp.text); } catch(e) { json = null; }
            var seasons = [];
            if (json && json.seasons) {
                console.log('[HDRezka] json.seasons raw (first 300):', String(json.seasons).substring(0, 300));
                var sdoc = parseHtml('<div>' + json.seasons + '</div>');
                var sEls = sdoc.querySelectorAll('li');
                sEls.forEach(function(el) {
                    var sid = el.getAttribute('data-tab_id') || el.getAttribute('data-id') || '';
                    var sname = el.textContent.trim();
                    if (sid) seasons.push({ id: sid, name: sname || 'Сезон ' + sid });
                });
            }
            console.log('[HDRezka] getSeasons: ' + seasons.map(function(s){return s.id;}).join(','));
            callback(null, seasons);
        }).catch(function() { callback(new Error('seasons_failed'), []); });
    }

    var getStreamAjax = function(filmId, translatorId, season, episode, favs, callback) {
            var base = getBaseUrl();
        var params = {
            id: filmId,
            translator_id: translatorId || 0,
            action: season ? 'get_stream' : 'get_movie',
            favs: favs || '0',
            is_watched: '0'
        };
        if (season) { params.season = season; params.episode = episode; }

        var endpoints = [
            base + '/ajax/get_cdn_series/',
            base + '/engine/ajax/get_cdn_series/'
        ];

        var tryNext = function(idx) {
            if (idx >= endpoints.length) { callback(new Error('All endpoints failed')); return; }
            post(endpoints[idx], params).then(function (resp) {
                var text = resp.text || '';
                if (!text || text.length < 5) { tryNext(idx + 1); return; }
                var json;
                try { json = JSON.parse(text); } catch (e) { tryNext(idx + 1); return; }
                if (!json || json.success === false) { tryNext(idx + 1); return; }

                var rawStream = json.url || json.streams || '';
                if (!rawStream) { tryNext(idx + 1); return; }

                var decoded = clearTrash(rawStream);

                // Parse subtitles from json.subtitle / json.subtitle_lns
                console.log('[HDRezka] subtitle raw:', JSON.stringify(json.subtitle), '| lns:', JSON.stringify(json.subtitle_lns));
                console.log('[HDRezka] json keys:', Object.keys(json).join(','));
                var subtitles = parseSubtitles(json.subtitle, json.subtitle_lns);

                // Series playlist ? extract specific episode
                if (season && episode && decoded.trim().indexOf('[') === 0 && !decoded.match(/^\[[^\]]+\]\s*https?:/)) {
                    var epData = extractEpisodeFromPlaylist(decoded, season, episode);
                    if (epData) {
                        // Episode may have its own subtitles
                        var epSubs = parseSubtitles(epData.subtitle || json.subtitle, epData.subtitle_lns || json.subtitle_lns);
                        callback(null, parseStreams(epData.file), epSubs.length ? epSubs : subtitles);
                        return;
                    }
                }

                callback(null, parseStreams(decoded), subtitles);
            }).catch(function () { tryNext(idx + 1); });
        };
        tryNext(0);
    }

    var _pad2 = function(n) { return n < 10 ? '0' + n : '' + n; }

    // Parse HDRezka subtitle JSON into Lampa subtitle format
    // subtitle: "{\"???????\":\"url\",\"??????????\":\"url\"}"
    // subtitle_lns: "{\"???????\":\"forced_url\"}"
    var parseSubtitles = function(subtitle, subtitle_lns) {
            var result = [];

        // HDRezka format: "[???????]https://...vtt,[English]https://...vtt"
        if (subtitle && typeof subtitle === 'string' && subtitle.indexOf('[') !== -1) {
            var parts = subtitle.split(',');
            parts.forEach(function(part) {
                part = part.trim();
                var m = part.match(/^\[([^\]]+)\](https?:\/\/.+|\/\/.+)/);
                if (!m) return;
                var label = m[1];
                var url = m[2];
                if (url.indexOf('//') === 0) url = 'https:' + url;
                result.push({ label: label, url: url });
            });
        }

        // subtitle_lns: forced subtitles, same format or {"lang": "url"}
        if (subtitle_lns && typeof subtitle_lns === 'string' && subtitle_lns.indexOf('[') !== -1) {
            var parts2 = subtitle_lns.split(',');
            parts2.forEach(function(part) {
                part = part.trim();
                var m = part.match(/^\[([^\]]+)\](https?:\/\/.+|\/\/.+)/);
                if (!m) return;
                var url = m[2];
                if (url.indexOf('//') === 0) url = 'https:' + url;
                result.push({ label: m[1] + ' [forced]', url: url });
            });
        }

        console.log('[HDRezka] subs:', result.map(function(s){ return s.label; }).join(', '));
        return result;
    }

    var extractEpisodeFromPlaylist = function(decoded, seasonNum, episodeNum) {
        if (!decoded || decoded.trim().indexOf('[') !== 0) return null;
        try {
            var data = JSON.parse(decoded.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''));
            var sn = parseInt(seasonNum, 10);
            var en = parseInt(episodeNum, 10);
            var sid1 = 's' + _pad2(sn);
            var eid1 = 's' + _pad2(sn) + 'e' + _pad2(en);
            // Also try without leading zero
            var sid2 = 's' + sn;
            var eid2 = 's' + sn + 'e' + en;

            for (var i = 0; i < data.length; i++) {
                var season = data[i];
                if (season.id === sid1 || season.id === sid2 || String(season.id) === String(sn)) {
                    var folder = season.folder || [];
                    for (var j = 0; j < folder.length; j++) {
                        var ep = folder[j];
                        if (ep.id === eid1 || ep.id === eid2 || String(ep.episode) === String(en)) {
                            if (ep.file) return { file: ep.file, subtitle: ep.subtitle, subtitle_lns: ep.subtitle_lns };
                        }
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    // --- UI HELPERS --------------------------------------------------------------

    var showSelect = function(title, items, onSelect, onBack) {
        Lampa.Select.show({
            title: title,
            items: items,
            onSelect: function (item) {
                Lampa.Controller.toggle('content');
                onSelect(item);
            },
            onBack: function () {
                Lampa.Controller.toggle('content');
                if (onBack) onBack();
            }
        });
    }

    // Show search refinement dialog with alternative title variants
    var showSearchRefine = function(card, onSearch) {
            var variants = [];
        var seen = {};
        var addVariant = function(title) {
            if (title && !seen[title.toLowerCase()]) {
                seen[title.toLowerCase()] = true;
                variants.push({ title: title, value: title });
            }
        }
        addVariant(card.title || card.name);
        addVariant(card.original_title || card.original_name);
        // Add title without year
        var mainTitle = card.title || card.name || '';
        var noYear = mainTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim();
        addVariant(noYear);
        // Add title + year
        var year = (card.release_date || card.first_air_date || '').slice(0, 4);
        if (year) addVariant(mainTitle + ' ' + year);
        // Add "????не задан??" option
        variants.push({ title: 'Ввести вручную...', value: '__manual__' });

        showSelect('точнить поиск', variants, function(item) {
            if (item.value === '__manual__') {
                // Use Lampa keyboard if available
                if (Lampa.Keypad) {
                    Lampa.Keypad.show({
                        title: 'Сезон',
                        value: mainTitle,
                        onEnter: function(val) { if (val) onSearch(val); }
                    });
                } else {
                    // Fallback ? show select with current value
                    onSearch(mainTitle);
                }
            } else {
                onSearch(item.value);
            }
        });
    }

    var notify = function(msg) {
        console.log('[Online]', msg);
    }

    // ============================================================
    // WebOS Native Player — x-media-option для апаратного декодування
    // Підтримує HEVC, DASH, HLS без обмежень браузера
    // ============================================================
    var WebOSPlayer = (function() {
        var _overlay  = null;
        var _video    = null;
        var _active   = false;
        var _timer    = null;
        var _hideTimer = null;
        var _paused   = false;
        var _keyHandler = null; // нативный обработчик клавиш
        var _menuOpen = false;  // флаг — открыто ли меню качества (пауза перехвата)

        var fmt = function(s) {
            s = Math.floor(s || 0);
            var h = Math.floor(s / 3600);
            var m = Math.floor((s % 3600) / 60);
            var sec = s % 60;
            var r = (h > 0 ? h + ':' : '') + (h > 0 && m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
            return r;
        }

        var showUI = function() {
            if (!_overlay) return;
            _overlay.find('.wos-ui').css('opacity', '1');
            clearTimeout(_hideTimer);
            _hideTimer = setTimeout(function() {
                if (_active && !_paused) _overlay.find('.wos-ui').css('opacity', '0');
            }, 4000);
        }

        var updateProgress = function() {
            if (!_video || !_overlay) return;
            var cur = _video.currentTime || 0;
            var dur = _video.duration || 0;
            _overlay.find('.wos-time').text(fmt(cur));
            _overlay.find('.wos-dur').text(dur > 0 ? fmt(dur) : '--:--');
            if (dur > 0) _overlay.find('.wos-bar-fill').css('width', (cur / dur * 100) + '%');
            // Показываем реальное разрешение декодируемого потока
            var w = _video.videoWidth, h = _video.videoHeight;
            if (w && h) {
                var label = w + 'x' + h;
                // Определяем качество по высоте
                var q = h >= 2160 ? '4K' : h >= 1440 ? '1440p' : h >= 1080 ? '1080p' : h >= 720 ? '720p' : h >= 480 ? '480p' : h + 'p';
                _overlay.find('.wos-resolution').text(q + ' (' + label + ')');
                _overlay.find('.wos-btn-quality').text(q);
            }
        }

        var close = function() {
            if (!_active) return;
            _active = false;
            _paused = false;
            _menuOpen = false;
            clearInterval(_timer);
            clearTimeout(_hideTimer);
            $(document).off('keydown.wosplayer');
            if (_keyHandler) {
                document.removeEventListener('keydown', _keyHandler, true);
                document.removeEventListener('keydown', _keyHandler, false);
                _keyHandler = null;
            }
            if (_video) { try { _video.pause(); _video.src = ''; _video.load(); } catch(e) {} }
            if (_overlay) { _overlay.remove(); _overlay = null; }
            _video = null;
            // Возвращаем контроллер Lampa
            try { Lampa.Controller.remove('wos_player'); } catch(e) {}
            try { Lampa.Controller.toggle('content'); } catch(e) {}
        }

        var play = function(url, title, onClose, qualityMap) {
            if (_active) close();
            _active = true;
            _paused = false;

            // Стиль кнопки
            var btnStyle = 'display:inline-flex;align-items:center;justify-content:center;' +
                'padding:0.5em 1.4em;background:rgba(255,255,255,0.12);border:2px solid transparent;' +
                'color:#fff;font-size:1.1em;border-radius:0.4em;cursor:pointer;min-width:7em;';
            var btnFocusStyle = 'border-color:#fff;background:rgba(255,255,255,0.25);';

            var html = '<div class="wos-player" style="position:fixed;top:0;left:0;width:100%;height:100%;' +
                'background:#000;z-index:99999;">' +
                '<video class="wos-video" style="width:100%;height:100%;display:block;" autoplay playsinline></video>' +
                // Верхний ряд — название + разрешение
                '<div class="wos-ui" style="position:absolute;top:0;left:0;right:0;bottom:0;' +
                'background:transparent;transition:opacity 0.3s;opacity:1;">' +
                '<div style="position:absolute;top:0;left:0;right:0;padding:1.5em 2em;' +
                'background:linear-gradient(rgba(0,0,0,0.7),transparent);">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div class="wos-title" style="font-size:1.3em;font-weight:bold;' +
                'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">' + (title || '') + '</div>' +
                '<div class="wos-resolution" style="font-size:1em;opacity:0.8;margin-left:1em;white-space:nowrap;"></div>' +
                '</div>' +
                '</div>' +
                // Нижняя панель
                '<div style="position:absolute;bottom:0;left:0;right:0;padding:1em 2em 1.5em;' +
                'background:linear-gradient(transparent,rgba(0,0,0,0.85));">' +
                // Прогресс-бар
                '<div style="display:flex;align-items:center;gap:1em;margin-bottom:1em;">' +
                '<span class="wos-time" style="font-size:1em;min-width:4.5em;">0:00</span>' +
                '<div style="flex:1;height:5px;background:rgba(255,255,255,0.25);border-radius:3px;">' +
                '<div class="wos-bar-fill" style="height:100%;background:#fff;border-radius:3px;width:0%;transition:width 0.5s linear;"></div>' +
                '</div>' +
                '<span class="wos-dur" style="font-size:1em;min-width:4.5em;text-align:right;">--:--</span>' +
                '</div>' +
                // Кнопки
                '<div style="display:flex;gap:0.8em;justify-content:center;">' +
                '<button class="wos-btn selector" data-action="back" style="' + btnStyle + '">\u2715 Закрыть</button>' +
                '<button class="wos-btn selector" data-action="rw" style="' + btnStyle + '">\u23EA \u221230с</button>' +
                '<button class="wos-btn wos-btn-play selector" data-action="play" style="' + btnStyle + '">\u23F8 Пауза</button>' +
                '<button class="wos-btn selector" data-action="ff" style="' + btnStyle + '">\u23E9 +30с</button>' +
                '<button class="wos-btn wos-btn-quality selector" data-action="quality" style="' + btnStyle + '">Качество</button>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>';

            _overlay = $(html);
            $('body').append(_overlay);
            _video = _overlay.find('.wos-video')[0];

            // Фокус стиль
            _overlay.on('hover:focus', '.wos-btn', function() {
                _overlay.find('.wos-btn').css('border-color', 'transparent').css('background', 'rgba(255,255,255,0.12)');
                $(this).css('border-color', '#fff').css('background', 'rgba(255,255,255,0.28)');
            });

            // x-media-option для WebOS аппаратного декодирования
            var _currentType = url.indexOf('.mpd') !== -1 ? 'DASH' : 'HLS';
            // Стартуем с master URL — WebOS сам выберет качество через adaptiveStreaming
            var startUrl = url;
            var startKey = null;
            if (qualityMap) {
                // Показываем лучшее доступное качество на кнопке
                var qks = Object.keys(qualityMap);
                var preferOrder = ['DASH (1080p+)', '1080p', '720p', '480p', '360p'];
                for (var pi = 0; pi < preferOrder.length; pi++) {
                    if (qualityMap[preferOrder[pi]]) { startKey = preferOrder[pi]; break; }
                }
                if (!startKey && qks.length) startKey = qks[0];
                if (startKey) setTimeout(function() { _overlay.find('.wos-btn-quality').text(startKey); }, 100);
            }
            if (Lampa.Platform && Lampa.Platform.is('webos')) {
                var mediaOption = {
                    mediaTransportType: startUrl.indexOf('.mpd') !== -1 ? 'DASH' : 'HLS',
                    adaptiveStreaming: {
                        maxWidth: 1920,
                        maxHeight: 1080,
                        maxBandwidth: 8000000
                    }
                };
                _video.setAttribute('x-media-option', JSON.stringify(mediaOption));
            }
            _video.src = startUrl;
            _video.load();
            try { _video.play(); } catch(e) {}
            // Показываем тип потока на кнопке качества
            _overlay.find('.wos-btn-quality').text(_currentType);

            // Обновление прогресса
            _timer = setInterval(updateProgress, 500);

            // Индекс сфокусированной кнопки (0=Закрыть, 1=RW, 2=Play, 3=FF, 4=Качество)
            var _focusIdx = 2;
            var _btns = ['back', 'rw', 'play', 'ff', 'quality'];

            var focusBtn = function(idx) {
                _focusIdx = Math.max(0, Math.min(_btns.length - 1, idx));
                _overlay.find('.wos-btn').css({ 'border-color': 'transparent', 'background': 'rgba(255,255,255,0.12)' });
                _overlay.find('[data-action="' + _btns[_focusIdx] + '"]').css({ 'border-color': '#fff', 'background': 'rgba(255,255,255,0.28)' });
            };

            var pressBtn = function(action) {
                if (action === 'back') {
                    close();
                    if (onClose) onClose();
                } else if (action === 'play') {
                    if (_video.paused) {
                        try { _video.play(); } catch(e) {}
                        _paused = false;
                        _overlay.find('[data-action="play"]').text('\u23F8 Пауза');
                    } else {
                        _video.pause();
                        _paused = true;
                        _overlay.find('[data-action="play"]').text('\u25B6 Играть');
                    }
                    showUI();
                } else if (action === 'rw') {
                    _video.currentTime = Math.max(0, (_video.currentTime || 0) - 30);
                    showUI();
                } else if (action === 'ff') {
                    _video.currentTime = (_video.currentTime || 0) + 30;
                    showUI();
                } else if (action === 'quality') {
                    if (qualityMap && Object.keys(qualityMap).length > 0) {
                        // Показываем своё меню качества прямо внутри плеера
                        var qKeys = Object.keys(qualityMap);
                        var menuHtml = '<div class="wos-qmenu" style="position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:10;display:flex;align-items:center;justify-content:center;">' +
                            '<div style="background:rgba(255,255,255,0.08);border-radius:0.5em;padding:1em 0;min-width:20em;">' +
                            '<div style="font-size:1.3em;font-weight:bold;padding:0.5em 1.5em 1em;border-bottom:1px solid rgba(255,255,255,0.15);">Качество</div>' +
                            qKeys.map(function(q, i) {
                                return '<div class="wos-qitem selector" data-quality="' + q + '" data-idx="' + i + '" style="padding:0.7em 1.5em;font-size:1.1em;cursor:pointer;">' + q + '</div>';
                            }).join('') +
                            '</div></div>';
                        var $qmenu = $(menuHtml);
                        _overlay.append($qmenu);

                        var qFocusIdx = 0;
                        var qFocusItem = function(idx) {
                            qFocusIdx = Math.max(0, Math.min(qKeys.length - 1, idx));
                            $qmenu.find('.wos-qitem').css({ 'background': 'transparent', 'color': '#fff' });
                            $qmenu.find('[data-idx="' + qFocusIdx + '"]').css({ 'background': 'rgba(255,255,255,0.2)', 'color': '#fff' });
                        };
                        var qSelect = function() {
                            var q = qKeys[qFocusIdx];
                            var qUrl = qualityMap[q];
                            $qmenu.remove();
                            _menuOpen = false;
                            if (qUrl && _video) {
                                var curTime = _video.currentTime || 0;
                                if (Lampa.Platform && Lampa.Platform.is('webos')) {
                                    var mo = {
                                        mediaTransportType: qUrl.indexOf('.mpd') !== -1 ? 'DASH' : 'HLS',
                                        adaptiveStreaming: { maxWidth: 1920, maxHeight: 1080, maxBandwidth: 8000000 }
                                    };
                                    _video.setAttribute('x-media-option', JSON.stringify(mo));
                                }
                                _video.src = qUrl;
                                _video.load();
                                var onCanPlay = function() {
                                    _video.removeEventListener('canplay', onCanPlay);
                                    _video.removeEventListener('loadedmetadata', onCanPlay);
                                    _video.currentTime = curTime;
                                    try { _video.play(); } catch(e) {}
                                };
                                _video.addEventListener('canplay', onCanPlay);
                                _video.addEventListener('loadedmetadata', onCanPlay);
                                _overlay.find('.wos-btn-quality').text(q);
                            }
                        };
                        var qClose = function() {
                            $qmenu.remove();
                            _menuOpen = false;
                        };

                        qFocusItem(0);
                        _menuOpen = true;

                        // Клик по пунктам
                        $qmenu.on('click', '.wos-qitem', function() {
                            qFocusIdx = parseInt($(this).data('idx'));
                            qSelect();
                        });

                        // Временно меняем keyHandler для навигации по меню
                        var _savedKeyHandler = _keyHandler;
                        document.removeEventListener('keydown', _keyHandler, true);
                        document.removeEventListener('keydown', _keyHandler, false);
                        var _qKeyHandler = function(e) {
                            var code = e.keyCode || e.which;
                            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                            if (code === 461 || code === 27 || code === 8) {
                                document.removeEventListener('keydown', _qKeyHandler, true);
                                document.removeEventListener('keydown', _qKeyHandler, false);
                                _keyHandler = _savedKeyHandler;
                                document.addEventListener('keydown', _keyHandler, true);
                                document.addEventListener('keydown', _keyHandler, false);
                                qClose();
                            } else if (code === 38) { // вверх
                                qFocusItem(qFocusIdx - 1);
                            } else if (code === 40) { // вниз
                                qFocusItem(qFocusIdx + 1);
                            } else if (code === 13) { // OK
                                document.removeEventListener('keydown', _qKeyHandler, true);
                                document.removeEventListener('keydown', _qKeyHandler, false);
                                _keyHandler = _savedKeyHandler;
                                document.addEventListener('keydown', _keyHandler, true);
                                document.addEventListener('keydown', _keyHandler, false);
                                qSelect();
                            }
                        };
                        document.addEventListener('keydown', _qKeyHandler, true);
                        document.addEventListener('keydown', _qKeyHandler, false);
                    } else {
                        Lampa.Noty.show('qualityMap пустой');
                    }
                    showUI();
                }
            };

            // Клик мышью по кнопкам
            _overlay.on('click', '.wos-btn', function() {
                pressBtn($(this).data('action'));
            });

            // Начальный фокус
            focusBtn(2);

            // Пульт
            _keyHandler = function(e) {
                if (!_active) {
                    document.removeEventListener('keydown', _keyHandler, true);
                    document.removeEventListener('keydown', _keyHandler, false);
                    return;
                }
                // Если открыто меню — не перехватываем, пусть Lampa обрабатывает
                if (_menuOpen) return;

                var code = e.keyCode || e.which;

                // Back
                if (code === 461 || code === 27) {
                    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                    pressBtn('back');
                    return;
                }

                showUI();
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

                if (code === 13) {
                    pressBtn(_btns[_focusIdx]);
                } else if (code === 37) {
                    focusBtn(_focusIdx - 1);
                } else if (code === 39) {
                    focusBtn(_focusIdx + 1);
                } else if (code === 415 || code === 179) {
                    pressBtn('play');
                } else if (code === 412) {
                    pressBtn('rw');
                } else if (code === 417) {
                    pressBtn('ff');
                }
            };
            // Используем оба способа — capture и bubble
            document.addEventListener('keydown', _keyHandler, true);
            document.addEventListener('keydown', _keyHandler, false);

            // Lampa Controller
            Lampa.Controller.add('wos_player', {
                toggle: function() {
                    Lampa.Controller.collectionSet(_overlay.find('.wos-ui'));
                    focusBtn(2);
                },
                up:    function() { showUI(); },
                down:  function() { showUI(); },
                left:  function() { focusBtn(_focusIdx - 1); },
                right: function() { focusBtn(_focusIdx + 1); },
                enter: function() { pressBtn(_btns[_focusIdx]); },
                back:  function() { pressBtn('back'); }
            });
            Lampa.Controller.toggle('wos_player');
            showUI();
        }

        return { play: play, close: close };
    })();

    // Показывает меню выбора плеера при долгом нажатии
    // onPlay() — callback для запуска через встроенный плеер Lampa
    var showPlayerMenu = function(url, title, onPlay) {
        var enabled = Lampa.Controller.enabled().name;
        var menu = [];
        if (Lampa.Platform && Lampa.Platform.is('webos')) {
            menu.push({ title: Lampa.Lang.translate('player_lauch') + ' - WebOS', player: 'webos' });
        }
        if (Lampa.Platform && Lampa.Platform.is('android')) {
            menu.push({ title: Lampa.Lang.translate('player_lauch') + ' - Android', player: 'android' });
        }
        menu.push({ title: Lampa.Lang.translate('player_lauch') + ' - Lampa', player: 'lampa' });
        menu.push({ title: Lampa.Lang.translate('copy_link') || 'Скопировать ссылку', link: true });

        Lampa.Select.show({
            title: Lampa.Lang.translate('title_action') || 'Действие',
            items: menu,
            onBack: function() { Lampa.Controller.toggle(enabled); },
            onSelect: function(a) {
                Lampa.Controller.toggle(enabled);
                if (a.link) {
                    Lampa.Utils.copyTextToClipboard(url,
                        function() { Lampa.Noty.show(Lampa.Lang.translate('copy_secuses') || 'Скопировано'); },
                        function() { Lampa.Noty.show(Lampa.Lang.translate('copy_error') || 'Ошибка'); }
                    );
                    return;
                }
                if (a.player === 'webos' || a.player === 'android') {
                    Lampa.Player.runas(a.player);
                }
                if (onPlay) onPlay();
            }
        });
    }

    // Добавляет hover:long на элемент с меню выбора плеера
    // getUrl() — функция возвращающая URL (может быть null если URL ещё не известен)
    // onPlay() — callback запуска воспроизведения
    var addPlayerLongPress = function(item, getUrl, onPlay) {
        item.on('hover:long', function() {
            var url = getUrl ? getUrl() : '';
            var enabled = Lampa.Controller.enabled().name;
            var menu = [];
            if (Lampa.Platform && Lampa.Platform.is('webos')) {
                menu.push({ title: 'WebOS Player (нативный)', player: 'webos_native' });
                menu.push({ title: Lampa.Lang.translate('player_lauch') + ' - WebOS (системный)', player: 'webos' });
            }
            if (Lampa.Platform && Lampa.Platform.is('android')) menu.push({ title: Lampa.Lang.translate('player_lauch') + ' - Android', player: 'android' });
            menu.push({ title: Lampa.Lang.translate('player_lauch') + ' - Lampa', player: 'lampa' });
            if (url) menu.push({ title: Lampa.Lang.translate('copy_link') || 'Скопировать ссылку', link: true });
            Lampa.Select.show({
                title: Lampa.Lang.translate('title_action') || 'Действие',
                items: menu,
                onBack: function() { Lampa.Controller.toggle(enabled); },
                onSelect: function(a) {
                    Lampa.Controller.toggle(enabled);
                    if (a.link) {
                        Lampa.Utils.copyTextToClipboard(url,
                            function() { Lampa.Noty.show(Lampa.Lang.translate('copy_secuses') || 'Скопировано'); },
                            function() { Lampa.Noty.show(Lampa.Lang.translate('copy_error') || 'Ошибка'); }
                        );
                        return;
                    }
                    if (a.player === 'webos_native') {
                        // Парсим master.m3u8 чтобы получить качества
                        notify('Загрузка качеств...');
                        var xhrCin = new XMLHttpRequest();
                        xhrCin.open('GET', url, true);
                        xhrCin.timeout = 8000;
                        xhrCin.onload = function() {
                            var text = xhrCin.responseText || '';
                            var qMap = {};
                            if (text.indexOf('#EXTM3U') !== -1) {
                                var qVals = { 'mobile':144,'lowest':240,'low':360,'sd':480,'hd':720,'full':1080,'quad':1440,'ultra':2160,'4k':2160 };
                                var baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
                                var lines = text.split('\n');
                                for (var qi = 0; qi < lines.length; qi++) {
                                    var ln = lines[qi].trim();
                                    if (ln.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
                                    var nl = (lines[qi+1] || '').trim();
                                    if (!nl || nl.indexOf('#') === 0) continue;
                                    var rm = ln.match(/RESOLUTION=(\d+)x(\d+)/i);
                                    var qm = ln.match(/QUALITY=([^,\s]+)/i);
                                    var lbl;
                                    if (rm) { var w = parseInt(rm[1]); lbl = w >= 3840 ? '2160p' : w >= 2560 ? '1440p' : w >= 1920 ? '1080p' : w >= 1280 ? '720p' : w >= 854 ? '480p' : '360p'; }
                                    else if (qm) { var qv = qVals[qm[1].toLowerCase()]; lbl = qv ? qv + 'p' : qm[1]; }
                                    if (lbl && !qMap[lbl]) qMap[lbl] = nl.indexOf('http') === 0 ? nl : baseUrl + nl;
                                }
                            }
                            if (Object.keys(qMap).length === 0) qMap['HLS'] = url;
                            WebOSPlayer.play(url, item.find('.online-prestige__title').text() || 'Видео', function() {
                                Lampa.Controller.toggle(enabled);
                            }, qMap);
                        };
                        xhrCin.onerror = xhrCin.ontimeout = function() {
                            WebOSPlayer.play(url, item.find('.online-prestige__title').text() || 'Видео', function() {
                                Lampa.Controller.toggle(enabled);
                            }, null);
                        };
                        xhrCin.send();
                    } else {
                        if (a.player !== 'lampa') Lampa.Player.runas(a.player);
                        if (onPlay) onPlay();
                    }
                }
            });
        });
    }

    // Fetch subtitles from HDRezka for a given card (used by Alloha to get subs)
    // Searches HDRezka silently, takes first translator, returns subtitle array
    var fetchHDRezkaSubtitles = function(card, seasonNum, episodeNum, callback) {
            var query = card.title || card.name || '';
        if (!query) { callback([]); return; }
        searchByTitle(query, function(err, results) {
            if (err || !results.length) { callback([]); return; }
            var year = (card.release_date || card.first_air_date || '').slice(0, 4);
            var best = null;
            for (var i = 0; i < results.length; i++) {
                var r = results[i];
                if (r.title.toLowerCase().indexOf(query.toLowerCase()) !== -1 && (!year || r.year === year)) { best = r; break; }
            }
            if (!best) best = results[0];
            get(best.url).then(function(resp) {
                var pi = parseFilmPage(resp.text || '');
                if (!pi.id || !pi.translators.length) { callback([]); return; }
                var transId = pi.translators[0].id;
                var s = seasonNum || null, e = episodeNum || null;
                getStreamAjax(pi.id, transId, s, e, pi.favs, function(err2, streams, subtitles) {
                    callback(subtitles && subtitles.length ? subtitles : []);
                });
            }).catch(function() { callback([]); });
        });
    }

    // --- PLAYBACK FLOW -----------------------------------------------------------

    var playStream = function(streams, card, season, episode, subtitles) {
        if (!streams || streams.length === 0) {
            notify('HDRezka: поиск не дал результатов');
            return;
        }

        var title = card.title || card.name || '';
        if (season && episode) title += ' ? S' + season + 'E' + episode;

        // Build quality object for in-player switching: {"1080p": "url", "720p": "url"}
        var qualityObj = {};
        streams.forEach(function(s) { qualityObj[s.quality] = s.url; });

        // Default URL: prefer 720p for TV compatibility (most TVs can't play HEVC/4K)
        // Fall back to 1080p, then 480p, then first available
        var defaultUrl = qualityObj['720p'] || qualityObj['1080p'] || qualityObj['480p'] || streams[0].url;

        var playerItem = {
            title: title,
            url: defaultUrl,
            quality: Object.keys(qualityObj).length > 1 ? qualityObj : undefined
        };
        if (subtitles && subtitles.length) playerItem.subtitles = subtitles;

        console.log('[HDRezka] playStream: quality keys=' + Object.keys(qualityObj).join(',') + ' default=' + defaultUrl.substring(0,60) + ' subs=' + (subtitles ? subtitles.length : 0));
        Lampa.Player.play(playerItem);
        Lampa.Player.playlist([playerItem]);
    }

    /**
     * For series: show season > episode > translator > quality > play
     */
    var proceedSeries = function(filmUrl, pageInfo, card) {
        // Step 1: choose translator
        var doSelectTranslator = function (onDone) {
            if (pageInfo.translators.length <= 1) {
                onDone(pageInfo.translators[0] ? pageInfo.translators[0].id : 0);
                return;
            }
            showSelect('Перевод', pageInfo.translators.map(function (t) {
                return { title: t.name, id: t.id };
            }), function (item) { onDone(item.id); });
        };

        // Step 2: choose season
        var doSelectSeason = function (translatorId, onDone) {
            if (pageInfo.seasons.length === 0) {
                // No seasons parsed from page ? try season 1 directly
                onDone(translatorId, 1);
                return;
            }
            if (pageInfo.seasons.length === 1) {
                onDone(translatorId, pageInfo.seasons[0].id);
                return;
            }
            showSelect('Сезон', pageInfo.seasons.map(function (s) {
                return { title: s.name, id: s.id };
            }), function (item) { onDone(translatorId, item.id); });
        };

        // Step 3: choose episode
        var doSelectEpisode = function (translatorId, seasonId, onDone) {
            notify('HDRezka: загрузка серий...');
            getEpisodes(pageInfo.id, translatorId, seasonId, pageInfo.favs, function (err, episodes) {
                if (err || episodes.length === 0) {
                    // Fallback: just try episode 1
                    onDone(translatorId, seasonId, 1);
                    return;
                }
                if (episodes.length === 1) {
                    onDone(translatorId, seasonId, episodes[0].id);
                    return;
                }
                showSelect('Сезон', episodes.map(function (e) {
                    return { title: e.name, id: e.id };
                }), function (item) { onDone(translatorId, seasonId, item.id); });
            });
        };

        // Run the chain
        doSelectTranslator(function (translatorId) {
            doSelectSeason(translatorId, function (tid, seasonId) {
                doSelectEpisode(tid, seasonId, function (tid2, sid, episodeId) {
                    notify('HDRezka: загрузка потока...');
                    getStreamAjax(pageInfo.id, tid2, sid, episodeId, pageInfo.favs, function (err, streams, subtitles) {
                        if (err || !streams || streams.length === 0) {
                            notify('HDRezka: не удалось получить поток');
                            return;
                        }
                        playStream(streams, card, sid, episodeId, subtitles);
                    });
                });
            });
        });
    }

    /**
     * For movies: translator > quality > play
     */
    var proceedMovie = function(filmUrl, pageInfo, card) {
            var doPlay = function (translatorId) {
            notify('HDRezka: загрузка потока...');
            getStreamAjax(pageInfo.id, translatorId, null, null, pageInfo.favs, function (err, streams, subtitles) {
                if (err || !streams || streams.length === 0) {
                    notify('HDRezka: не удалось получить поток');
                    return;
                }
                playStream(streams, card, null, null, subtitles);
            });
        };

        if (pageInfo.translators.length <= 1) {
            doPlay(pageInfo.translators[0] ? pageInfo.translators[0].id : 0);
            return;
        }

        showSelect('Перевод', pageInfo.translators.map(function (t) {
            return { title: t.name, id: t.id };
        }), function (item) { doPlay(item.id); });
    }

    /**
     * Load film page and branch to movie or series flow
     */
    var proceedWithFilm = function(filmUrl, card) {
        notify('HDRezka: загрузка...');
        get(filmUrl).then(function (resp) {
            var pageInfo = parseFilmPage(resp.text || '');
            if (pageInfo.isSeries) {
                proceedSeries(filmUrl, pageInfo, card);
            } else {
                proceedMovie(filmUrl, pageInfo, card);
            }
        }).catch(function () {
            notify('HDRezka: ошибка загрузки страницы');
        });
    }

    /**
     * Main entry: search > pick result > proceed
     */
    var openHDRezka = function(card) {
            var query = card.title || card.name || '';
        var year  = (card.release_date || card.first_air_date || '').slice(0, 4);

        notify('HDRezka: поиск «' + query + '»...');

        searchByTitle(query, function (err, results) {
            if (err || results.length === 0) {
                notify('HDRezka: поиск не дал результатов');
                return;
            }

            // Try to auto-match by title + year
            var best = null;
            for (var i = 0; i < results.length; i++) {
                var r = results[i];
                var titleOk = r.title.toLowerCase().indexOf(query.toLowerCase()) !== -1;
                var yearOk  = year ? r.year === year : true;
                if (titleOk && yearOk) { best = r; break; }
            }
            if (!best) best = results[0];

            // If only one result ? go directly
            if (results.length === 1) {
                proceedWithFilm(best.url, card);
                return;
            }

            // Show list with type labels so user knows what's what
            var items = results.slice(0, 15).map(function (r) {
                var label = r.title;
                if (r.year) label += ' (' + r.year + ')';
                label += '  [' + typeLabel(r.type) + ']';
                return { title: label, result: r };
            });

            showSelect('HDRezka — результаты', items, function (item) {
                proceedWithFilm(item.result.url, card);
            });
        });
    }

    // --- KODIK SOURCE ------------------------------------------------------------

    /**
     * Kodik: search by kp_id or imdb_id, returns iframe URL
     * API: https://kodikapi.com/search?token=TOKEN&kinopoisk_id=ID&with_episodes=true
     */
    var kodikGetStream = function(card, callback) {
            var token = Lampa.Storage.get(TOKEN_KEYS.kodik, '');
        if (!token) { callback(new Error('no_token')); return; }

        var kpId   = card.external_ids && card.external_ids.kinopoisk_id;
        var imdbId = card.imdb_id || (card.external_ids && card.external_ids.imdb_id);

        var params = 'token=' + encodeURIComponent(token) + '&with_episodes=true&with_material_data=false';
        if (kpId)   params += '&kinopoisk_id=' + kpId;
        else if (imdbId) params += '&imdb_id=' + encodeURIComponent(imdbId);
        else { callback(new Error('no_id')); return; }

        var url = 'https://kodikapi.com/search?' + params;
        get(url).then(function (resp) {
            var json;
            try { json = JSON.parse(resp.text); } catch (e) { callback(new Error('parse')); return; }
            if (!json || !json.results || !json.results.length) { callback(new Error('not_found')); return; }

            // Group by translation
            var results = json.results;
            var isSeries = results[0].type && results[0].type.indexOf('serial') !== -1;

            if (!isSeries) {
                // Movie ? pick best quality result
                var best = results[0];
                callback(null, { type: 'kodik', isSeries: false, results: results, best: best });
            } else {
                callback(null, { type: 'kodik', isSeries: true, results: results });
            }
        }).catch(function (e) { callback(e); });
    }

    /**
     * Kodik: get direct stream URL from iframe link
     * Kodik iframes contain a JS call to get the actual m3u8
     */
    var kodikExtractStream = function(iframeLink, callback) {
        // iframeLink looks like: //kodik.info/serial/12345/abc123/720p
        var url = (iframeLink.indexOf('//') === 0 ? 'https:' : '') + iframeLink;
        get(url).then(function (resp) {
            var html = resp.text || '';
            // Extract the urlParams from the page
            var urlParamsMatch = html.match(/var\s+urlParams\s*=\s*'([^']+)'/);
            var videoTypeMatch = html.match(/var\s+videoType\s*=\s*'([^']+)'/);
            var videoIdMatch   = html.match(/var\s+videoId\s*=\s*'([^']+)'/);
            var videoHashMatch = html.match(/var\s+videoHash\s*=\s*'([^']+)'/);

            if (!videoIdMatch || !videoHashMatch) {
                callback(new Error('kodik: no video params'));
                return;
            }

            var apiUrl = 'https://kodik.info/ftor';
            var body = 'type=' + encodeURIComponent(videoTypeMatch ? videoTypeMatch[1] : 'seria') +
                       '&id=' + encodeURIComponent(videoIdMatch[1]) +
                       '&hash=' + encodeURIComponent(videoHashMatch[1]) +
                       '&quality=720p' +
                       (urlParamsMatch ? '&' + urlParamsMatch[1] : '');

            post(apiUrl, {
                type: videoTypeMatch ? videoTypeMatch[1] : 'seria',
                id: videoIdMatch[1],
                hash: videoHashMatch[1],
                quality: '720p'
            }).then(function (r) {
                var j;
                try { j = JSON.parse(r.text); } catch (e) { callback(new Error('kodik ftor parse')); return; }
                if (!j || !j.links) { callback(new Error('kodik: no links')); return; }
                // links: {"720": [{"src": "//...m3u8", "type": "application/x-mpegURL"}]}
                var streams = [];
                var qualityOrder = ['1080', '720', '480', '360'];
                for (var qi = 0; qi < qualityOrder.length; qi++) {
                    var q = qualityOrder[qi];
                    if (j.links[q] && j.links[q][0]) {
                        var src = j.links[q][0].src;
                        if (src.indexOf('//') === 0) src = 'https:' + src;
                        streams.push({ quality: q + 'p', url: src });
                    }
                }
                callback(null, streams);
            }).catch(function (e) { callback(e); });
        }).catch(function (e) { callback(e); });
    }

    // --- HDVB SOURCE -------------------------------------------------------------

    /**
     * HDVB: search by kp_id
     * API: https://apivb.info/api/videos.json?token=TOKEN&id_kp=ID
     */
    var hdvbGetStream = function(card, callback) {
            var token = Lampa.Storage.get(TOKEN_KEYS.hdvb, '');
        if (!token) { callback(new Error('no_token')); return; }

        var kpId = card.external_ids && card.external_ids.kinopoisk_id;
        if (!kpId) { callback(new Error('no_kp_id')); return; }

        var url = 'https://apivb.info/api/videos.json?token=' + encodeURIComponent(token) + '&id_kp=' + kpId;
        get(url).then(function (resp) {
            var json;
            try { json = JSON.parse(resp.text); } catch (e) { callback(new Error('parse')); return; }
            if (!json || !json.length) { callback(new Error('not_found')); return; }

            var isSeries = json[0].type === 'serial';
            callback(null, { type: 'hdvb', isSeries: isSeries, results: json });
        }).catch(function (e) { callback(e); });
    }


    // --- ALLOHA SOURCE -----------------------------------------------------------
    // Flow: search kinokrad.my by title -> get token_movie -> BNSI -> m3u8

    var ALLOHA_BNSI_HOST = 'https://streamalloha.live';
    var ALLOHA_BNSI_API  = 'https://assortedia-as.stloadi.live';
    var ALLOHA_PARTNER_TOKEN = '7fda2b04f6ae5e0e228bda812b0dee';

    var getAllohaToken = function() { return Lampa.Storage.get(TOKEN_KEYS.alloha, ALLOHA_PARTNER_TOKEN); }
    var getAllohaDomain = function() { return Lampa.Storage.get(TOKEN_KEYS.alloha_domain, ALLOHA_DEFAULT_DOMAIN) || ALLOHA_DEFAULT_DOMAIN; }

    var kinokradSearch = function(title, year, callback, originalTitle) {
        // ?не задан????? ? ???? не задан??????не задан??? (??????)
        var searchTitle = (originalTitle && originalTitle !== title) ? originalTitle : title;
        var cleanTitle = searchTitle.replace(/[:\-\u2013\u2014]/g, ' ').replace(/\s+/g, ' ').trim();
        var cleanOrig = title.replace(/[:\-\u2013\u2014]/g, ' ').replace(/\s+/g, ' ').trim();
        var firstWord = cleanTitle.split(' ')[0].toLowerCase();
        var searchUrl = 'https://kinokrad.my/search/' + encodeURIComponent(firstWord) + '/';
        console.log('[Alloha] search:', searchUrl, 'year:', year, 'orig:', originalTitle);

        get(searchUrl).then(function(resp) {
            var html = resp.text || '';
            var linkRe = /href="(https?:\/\/kinokrad\.my\/\d[^"]+\.html)"/g;
            var links = [];
            var m;
            while ((m = linkRe.exec(html)) !== null) {
                var u = m[1];
                var dup = false;
                for (var i = 0; i < links.length; i++) { if (links[i] === u) { dup = true; break; } }
                if (!dup) links.push(u);
            }
            console.log('[Alloha] links found:', links.length);
            if (!links.length) { callback(new Error('no_results')); return; }

            var bestResult = null;
            var total = Math.min(links.length, 20);

            var tryLink = function(idx) {
                if (idx >= total) {
                    if (bestResult) { callback(null, bestResult); }
                    else { callback(new Error('film_not_found')); }
                    return;
                }
                var filmUrl = links[idx];
                var yearInUrl = year && filmUrl.indexOf(year) !== -1;
                console.log('[Alloha] checking:', filmUrl);

                get(filmUrl).then(function(resp2) {
                    var html2 = resp2.text || '';
                    var tmMatch = html2.match(/token_movie[=\s"']+([a-f0-9]{20,40})/);
                    if (!tmMatch) { tryLink(idx + 1); return; }

                    var tokenMovie = tmMatch[1];
                    if (!bestResult) { bestResult = { url: filmUrl, tokenMovie: tokenMovie }; }

                    // ???????не задан?????не задан??? ? HTML ????????
                    var origTitleMatch = html2.match(/class="[^"]*original[^"]*"[^>]*>([^<]+)</i) ||
                                        html2.match(/itemprop="alternativeHeadline"[^>]*>([^<]+)</i);
                    var origTitleOnPage = origTitleMatch ? origTitleMatch[1].trim().toLowerCase() : '';
                    var searchTitleLower = cleanTitle.toLowerCase();
                    var origTitleLower = cleanOrig.toLowerCase();

                    // ????не задан???не задан??????не задан??? ? ????не задан????
                    if (origTitleOnPage && (origTitleOnPage.indexOf(searchTitleLower) >= 0 || origTitleOnPage.indexOf(origTitleLower) >= 0)) {
                        console.log('[Alloha] orig title match:', filmUrl);
                        callback(null, { url: filmUrl, tokenMovie: tokenMovie });
                        return;
                    }

                    if (yearInUrl) {
                        console.log('[Alloha] year in URL match:', filmUrl);
                        callback(null, { url: filmUrl, tokenMovie: tokenMovie });
                        return;
                    }
                    if (year && html2.indexOf(year) !== -1) {
                        bestResult = { url: filmUrl, tokenMovie: tokenMovie };
                        console.log('[Alloha] year in page match:', filmUrl);
                        callback(null, bestResult);
                        return;
                    }
                    tryLink(idx + 1);
                }).catch(function() { tryLink(idx + 1); });
            };
            tryLink(0);
        }).catch(function(e) { callback(new Error('search_failed: ' + e.message)); });
    }

    // --- ALLOHA FLOW -------------------------------------------------------------
    // Computes Borth suffix using real player JS
    // Automatically detects bundle URLs from player HTML

    // --- PROXY SERVERS -----------------------------------------------------------

    var PROXY_SERVERS = [
        { id: 'railway', name: 'Railway',      url: 'https://prox-production-889a.up.railway.app' },
        { id: 'render',  name: 'Render',       url: 'https://prox-kk62.onrender.com' },
        { id: 'hf',      name: 'HuggingFace',  url: 'https://recycleactor-prox.hf.space' },
        { id: 'local',   name: 'Local (WebOS)', url: 'http://localhost:3002' },
        { id: 'custom',  name: 'Свой',  url: '' }
    ];
    var PROXY_STORAGE_KEY = 'hdrezka_proxy_server';
    var PROXY_CUSTOM_URL_KEY = 'hdrezka_proxy_custom_url';

    // Railway IP is blocked by cinemar.cc/uakinogo.io Cloudflare
    // Use Render or HF for Cinemar, Railway for Turbo/Alloha
    var CINEMAR_PROXY_SERVERS = [
        { id: 'render',  url: 'https://prox-kk62.onrender.com' },
        { id: 'hf',      url: 'https://recycleactor-prox.hf.space' },
        { id: 'local',   url: 'http://localhost:3001' }
    ];

    var getProxyUrl = function() {
            var saved = Lampa.Storage.get(PROXY_STORAGE_KEY, '');
        if (saved === 'custom') {
            var customUrl = Lampa.Storage.get(PROXY_CUSTOM_URL_KEY, '').trim().replace(/\/$/, '');
            return customUrl || PROXY_SERVERS[0].url;
        }
        if (saved) {
            for (var i = 0; i < PROXY_SERVERS.length; i++) {
                if (PROXY_SERVERS[i].id === saved) return PROXY_SERVERS[i].url;
            }
        }
        return PROXY_SERVERS[0].url;
    }

    // For Cinemar: prefer non-Railway proxy (Railway IP blocked by cinemar.cc)
    var getCinemarProxyUrl = function() {
            var saved = Lampa.Storage.get(PROXY_STORAGE_KEY, '');
        if (saved === 'custom') {
            var customUrl = Lampa.Storage.get(PROXY_CUSTOM_URL_KEY, '').trim().replace(/\/$/, '');
            return customUrl || 'https://prox-kk62.onrender.com';
        }
        if (saved === 'render') return 'https://prox-kk62.onrender.com';
        if (saved === 'hf') return 'https://recycleactor-prox.hf.space';
        return 'https://prox-kk62.onrender.com';
    }
    // Ping a proxy and return ms, or -1 on failure
    var pingProxy = function(url, callback) {
            var start = Date.now();
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url + '/health', true);
        xhr.timeout = 8000;
        xhr.onload = function() {
            callback(xhr.status === 200 ? (Date.now() - start) : -1);
        };
        xhr.onerror = xhr.ontimeout = function() { callback(-1); };
        xhr.send();
    }

    // Wake up all proxies on plugin start (fire and forget)
    var wakeUpProxies = function() {
        PROXY_SERVERS.forEach(function(p) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', p.url + '/health', true);
            xhr.timeout = 30000;
            xhr.send();
        });
    }

    var ALLOHA_WORKER = 'https://prox-production-889a.up.railway.app';
    var RAILWAY_PROXY = 'https://prox-production-889a.up.railway.app';    // Bundle URLs ? ?????????не задан?????? ?? HTML ??????
    var ALLOHA_APP_JS_URL = '';
    var ALLOHA_RUNTIME_JS_URL = '';
    var ALLOHA_539_JS_URL = '';
    var _allohaBundleUrlsDetected = false;

    // Cache for downloaded bundles and computed suffix
    var _allohaAppJs = null;
    var _allohaRuntimeJs = null;
    var _alloha539Js = null;
    var _allohaComputeSuffix = null; // cached function

    // ?????????не задан???? URL bundle'?? ?? HTML ??????
    var allohaDetectBundleUrls = function(playerHtml) {
            var appMatch = playerHtml.match(/src="(\/build\/app\.[a-f0-9]+\.js)"/);
        var runtimeMatch = playerHtml.match(/src="(\/build\/runtime\.[a-f0-9]+\.js)"/);
        var js539Match = playerHtml.match(/src="(\/build\/539\.[a-f0-9]+\.js)"/);
        var base = 'https://streamalloha.live';
        var changed = false;
        if (appMatch && base + appMatch[1] !== ALLOHA_APP_JS_URL) {
            ALLOHA_APP_JS_URL = base + appMatch[1];
            _allohaAppJs = null; _allohaComputeSuffix = null; // ?????????? ???
            changed = true;
        }
        if (runtimeMatch && base + runtimeMatch[1] !== ALLOHA_RUNTIME_JS_URL) {
            ALLOHA_RUNTIME_JS_URL = base + runtimeMatch[1];
            _allohaRuntimeJs = null; _allohaComputeSuffix = null;
            changed = true;
        }
        if (js539Match && base + js539Match[1] !== ALLOHA_539_JS_URL) {
            ALLOHA_539_JS_URL = base + js539Match[1];
            _alloha539Js = null; _allohaComputeSuffix = null;
            changed = true;
        }
        if (changed) console.log('[Alloha] bundle URLs updated:', ALLOHA_APP_JS_URL.split('/').pop());
        _allohaBundleUrlsDetected = true;
    }

    var allohaDownloadJs = function(url, callback) {
            var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.timeout = 30000;
        xhr.onload = function() {
            if (xhr.status === 200) callback(null, xhr.responseText);
            else callback(new Error('HTTP ' + xhr.status));
        };
        xhr.onerror = function() { callback(new Error('network')); };
        xhr.ontimeout = function() { callback(new Error('timeout')); };
        xhr.send();
    }

    var allohaGetComputeSuffix = function(callback) {
        if (_allohaComputeSuffix) { callback(null, _allohaComputeSuffix); return; }

        // Check if Proxy is supported (WebOS 4+ / Chromium 49+)
        if (typeof Proxy === 'undefined') {
            callback(new Error('no_proxy_support'));
            return;
        }

        // If bundle URL not yet detected from player HTML ? go straight to worker fallback
        if (!ALLOHA_APP_JS_URL) {
            callback(new Error('bundle URL not yet detected from player HTML'));
            return;
        }

        // Download app bundle
        allohaDownloadJs(ALLOHA_APP_JS_URL, function(err, appJs) {
            if (err) { callback(err); return; }

            // -- ???????????не задан ???не задан ------------------------------
            // ??не задан ??? jQuery ?????? viewporti meta ???
            // ???????: XX=JQ()(SELECTOR)[METHOD]('content'); JQ()(SELECTOR2)[METHOD2]();
            // ??? JQ ? jQuery, SELECTOR ???????? viewporti
            // ????????? 1: ???????? borth ? ????не задан?
            // ????????? 2: ???????? nk ? ??????????не задан ?????не задан???

            var insertAfterNk = -1;
            var nkVarName = 'nk';
            var ndVarName = 'nd';
            var suffixExpr = 'null';
            var patchMode = 'nk';
            var borthVar = null, suffixVar = null;

            // -- ????????? A: ???????? borth ???????? -------------------------
            // ??????? ?? bundle b207bf6a at 407471:
            // return kT&&(kR=kR+'|'+kT),kR
            // ?не заданне заданне задан????? borth = nc+'|'+suffix
            // ?????????????: ????????? postMessage ????? return
            var pipeIdx = 0;
            var borthFound = false;
            // ??не задан? ???????: return VAR&&(VAR2=VAR2+'|'+VAR),VAR2
            var borthReturnRe = /return\s+([a-zA-Z_$][a-zA-Z0-9_$]{0,4})\s*&&\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]{0,4})\s*=\s*\2\s*\+\s*'[|]'\s*\+\s*\1\s*\)\s*,\s*\2/;
            var borthReturnMatch = appJs.match(borthReturnRe);
            if (!borthReturnMatch) {
                // Try with double quotes
                borthReturnRe = /return\s+([a-zA-Z_$][a-zA-Z0-9_$]{0,4})\s*&&\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]{0,4})\s*=\s*\2\s*\+\s*"[|]"\s*\+\s*\1\s*\)\s*,\s*\2/;
                borthReturnMatch = appJs.match(borthReturnRe);
            }
            if (borthReturnMatch) {
                var brIdx = appJs.indexOf(borthReturnMatch[0]);
                // Find end of this return statement
                var brEnd = appJs.indexOf(';', brIdx + borthReturnMatch[0].length);
                if (brEnd > brIdx && brEnd - brIdx < 100) {
                    insertAfterNk = brEnd + 1;
                    patchMode = 'borth';
                    suffixVar = borthReturnMatch[1]; // kT = suffix
                    borthVar = borthReturnMatch[2];  // kR = borth (nc+'|'+suffix)
                    borthFound = true;
                    console.log('[Alloha] borth return intercept: borthVar=' + borthVar + ' suffixVar=' + suffixVar + ' at ' + brIdx);
                }
            }
            // Fallback: search for VAR=VAR+'|'+VAR pattern near 'Borth' string
            if (!borthFound) {
                var borthStrIdx = appJs.indexOf("'Borth'");
                if (borthStrIdx < 0) borthStrIdx = appJs.indexOf('"Borth"');
                if (borthStrIdx >= 0) {
                    // Search for '|' within 5000 chars of 'Borth'
                    var searchArea = appJs.substring(borthStrIdx, borthStrIdx + 5000);
                    var pipeM = searchArea.match(/([a-zA-Z_$][a-zA-Z0-9_$]{0,4})\s*\+\s*['"][|]['"]\s*\+\s*([a-zA-Z_$][a-zA-Z0-9_$]{0,4})/);
                    if (pipeM) {
                        var pipeAbsIdx = borthStrIdx + searchArea.indexOf(pipeM[0]);
                        var pipeStmtEnd = appJs.indexOf(';', pipeAbsIdx + pipeM[0].length);
                        if (pipeStmtEnd > pipeAbsIdx && pipeStmtEnd - pipeAbsIdx < 200) {
                            insertAfterNk = pipeStmtEnd + 1;
                            patchMode = 'borth';
                            borthVar = pipeM[1]; suffixVar = pipeM[2];
                            borthFound = true;
                            console.log('[Alloha] borth fallback: borthVar=' + borthVar + ' suffixVar=' + suffixVar);
                            console.log('[Alloha] borth ctx:', appJs.substring(Math.max(0, pipeAbsIdx - 100), pipeAbsIdx + 200));
                        }
                    }
                }
            }

            // -- ????????? B: ???????? nk --------------------------------------
            // ??????? 1: ?????? bundle
            if (insertAfterNk < 0) {
                var oldPattern = "nk=T6()(Ah(0x2c1,0x4ef))['attr']('content');T6()(Ah(0x2c1,0x51b))[Ah(0x502,0x2fd)]();";
                var oldIdx = appJs.indexOf(oldPattern);
                if (oldIdx >= 0) {
                    insertAfterNk = oldIdx + oldPattern.length;
                    nkVarName = 'nk'; ndVarName = 'nd';
                    suffixExpr = 'ny(nD(nY(nk,nd),nd),nd)';
                }
            }

            // ??????? 2: bundle app.7c861a4f
            if (insertAfterNk < 0) {
                var newPattern = "yF=C6()(cv(-0x21e,0xda))[cv(0x5bd,0x2bd)](cv(0x3ad,0x514));C6()(cv(0x24,0xda))[cv(0x6f8,0x4eb)]();";
                var newIdx = appJs.indexOf(newPattern);
                if (newIdx >= 0) {
                    insertAfterNk = newIdx + newPattern.length;
                    nkVarName = 'yF'; ndVarName = 'yh';
                    suffixExpr = 'yG(yP(yO(yF,yh),yh),yh)';
                }
            }

            // ??????? 2b: bundle app.b207bf6a ? regex match for VAR=JQ()('meta[name=viewporti]')
            if (insertAfterNk < 0) {
                var b207Pattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]{0,4})\s*=\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(\s*\)\s*\(\s*['"]meta\[name=viewporti\]['"]\s*\)/;
                var b207Match = appJs.match(b207Pattern);
                if (b207Match) {
                    var b207Idx = appJs.indexOf(b207Match[0]);
                    var b207End1 = appJs.indexOf(';', b207Idx + b207Match[0].length);
                    var b207End2 = b207End1 >= 0 ? appJs.indexOf(';', b207End1 + 1) : -1;
                    if (b207End2 > b207End1) {
                        insertAfterNk = b207End2 + 1;
                        nkVarName = b207Match[1];
                        var b207Before = appJs.substring(Math.max(0, b207Idx - 200), b207Idx);
                        var b207nd = b207Before.match(/\b([a-zA-Z_$][a-zA-Z0-9_$]{0,4})\s*=\s*!\s*\(/);
                        if (b207nd) ndVarName = b207nd[1];
                        console.log('[Alloha] pattern2b found: nkVar=' + nkVarName + ' ndVar=' + ndVarName);
                    }
                }
            }

            // ??????? 4: ???????????не задан ?? viewporti
            if (insertAfterNk < 0) {
                var vpIdx = appJs.indexOf('viewporti');
                while (vpIdx >= 0 && insertAfterNk < 0) {
                    var stmtE = appJs.indexOf(';', vpIdx);
                    if (stmtE > vpIdx && stmtE - vpIdx < 400) {
                        var stmtE2 = appJs.indexOf(';', stmtE + 1);
                        if (stmtE2 > stmtE && stmtE2 - stmtE < 300) {
                            insertAfterNk = stmtE2 + 1;
                            var beforeVp = appJs.substring(Math.max(0, vpIdx - 300), vpIdx);
                            var nkM = beforeVp.match(/\b([a-zA-Z_$][a-zA-Z0-9_$]{0,4})\s*=\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(\s*\)\s*\(\s*['"][^'"]*$/);
                            if (nkM) nkVarName = nkM[1];
                            var ndM = beforeVp.match(/\b([a-zA-Z_$][a-zA-Z0-9_$]{0,4})\s*=\s*!\s*\(/);
                            if (ndM) ndVarName = ndM[1];
                        }
                    }
                    vpIdx = appJs.indexOf('viewporti', vpIdx + 1);
                }
            }

            // Log if still not found ? show snippet for debugging
            if (insertAfterNk < 0) {
                var vpDebug = appJs.indexOf('viewporti');
                if (vpDebug >= 0) {
                    console.log('[Alloha] nk_assign_not_found. viewporti snippet:', appJs.substring(Math.max(0, vpDebug - 150), vpDebug + 300));
                } else {
                    console.log('[Alloha] nk_assign_not_found. viewporti NOT in bundle! bundle length:', appJs.length);
                }
            }
            
            if (insertAfterNk < 0) {
                callback(new Error('nk_assign_not_found'));
                return;
            }
            
            // ???? suffixExpr не задан??? ? ????????не задан?????не задан
            if (!suffixExpr) {
                suffixExpr = 'null'; // ???не задан?не задан?????? ? iframe
            }

            // Patch: insert suffix computation right after nk= assignment
            var nkRef = nkVarName;
            var patchedApp;
            if (patchMode === 'borth' && borthVar) {
                console.log('[Alloha] using borth intercept mode, borthVar=' + borthVar);
                var ypIdx = appJs.indexOf("'segmentId':function(");
                if (ypIdx < 0) ypIdx = appJs.indexOf('"segmentId":function(');
                var ypObjStart = ypIdx >= 0 ? appJs.lastIndexOf('var YP=', ypIdx) : -1;
                // Find end of YP object
                var ypObjEnd = -1;
                if (ypObjStart >= 0) {
                    var depth = 0, si = ypObjStart;
                    while (si < appJs.length) {
                        if (appJs[si] === '{') depth++;
                        else if (appJs[si] === '}') { depth--; if (depth === 0) { ypObjEnd = si + 1; break; } }
                        si++;
                    }
                }
                console.log('[Alloha] YP at:', ypObjStart, 'end:', ypObjEnd, 'borth insert:', insertAfterNk);

                // Strategy: wrap segmentId AFTER YP is defined to capture suffix (kT = 4th arg)
                // Also capture nk right after viewporti assignment
                var nkPos = appJs.indexOf("meta[name=viewporti]");
                var nkStmt1 = nkPos >= 0 ? appJs.indexOf(';', nkPos) : -1;
                var nkStmt2 = nkStmt1 >= 0 ? appJs.indexOf(';', nkStmt1 + 1) : -1;
                var nkInsertPos = nkStmt2 >= 0 ? nkStmt2 + 1 : -1;

                var nkCapture = '\nwindow.__alloha_nk_saved=rg;window.__alloha_nk_len=rg?rg.length:0;\n';
                var ypWrap = '\nif(typeof YP!=="undefined"&&YP.segmentId){' +
                    'var __origSegId=YP.segmentId;' +
                    'YP.segmentId=function(kP,kX,kl,kT){' +
                    'if(kT&&String(kT).length>10)window.__alloha_suffix_captured=String(kT);' +
                    'return __origSegId.apply(this,arguments);' +
                    '};' +
                    '}\n' +
                    'setTimeout(function(){' +
                    'var __nk=window.__alloha_nk_saved;' +
                    'if(!__nk)return;' +
                    'var __results=[];' +
                    // We now have 4 perm functions: rj, rU, rI, rf
                    // Try all combinations: btoa(perm(nk)), btoa(perm2(perm1(nk))), etc
                    'var __perms=[];' +
                    '["rj","rU","rI","rf"].forEach(function(n){try{var f=eval(n);if(typeof f==="function")__perms.push({n:n,f:f});}catch(e){}});' +
                    // Single perm + btoa
                    '__perms.forEach(function(p){' +
                    '  try{var r=btoa(p.f(__nk,false));__results.push("S_"+p.n+":"+r.substring(0,20));}catch(e){}' +
                    '  try{var r=btoa(p.f(__nk));__results.push("S0_"+p.n+":"+r.substring(0,20));}catch(e){}' +
                    '});' +
                    // Double perm + btoa
                    'for(var i=0;i<__perms.length;i++){' +
                    '  for(var j=0;j<__perms.length;j++){' +
                    '    if(i===j)continue;' +
                    '    try{var r=btoa(__perms[j].f(__perms[i].f(__nk,false),false));__results.push("D_"+__perms[i].n+__perms[j].n+":"+r.substring(0,20));}catch(e){}' +
                    '  }' +
                    '}' +
                    'if(window.parent)window.parent.postMessage({__alloha_perm:true,perm:__results.join("|"),nk:__nk.substring(0,15)},"*");' +
                    '},300);\n';
                    'window.__alloha_perm_results=__results.join("|");' +
                    // Send early postMessage with perm results
                    'if(window.parent)window.parent.postMessage({__alloha_perm:true,perm:__results.join("|"),nk:__nk.substring(0,15)},"*");' +
                    '},200);\n';

                // Build patchedApp: insert nkCapture at nk position, ypWrap after YP, nothing at borth position
                // (borth capture not needed ? we get suffix from segmentId)
                var base = appJs;
                var offset = 0;

                // Insert nkCapture first (smallest position)
                if (nkInsertPos > 0) {
                    base = base.substring(0, nkInsertPos + offset) + nkCapture + base.substring(nkInsertPos + offset);
                    if (ypObjEnd > nkInsertPos) offset += nkCapture.length;
                }

                // Insert ypWrap after YP object
                if (ypObjEnd > 0) {
                    var ypInsert = ypObjEnd + offset;
                    base = base.substring(0, ypInsert) + ypWrap + base.substring(ypInsert);
                }

                patchedApp = 'window.__alloha_mod_loaded=true;window.__alloha_patch_reached=true;\n' + base;
            } else {
                patchedApp = appJs.substring(0, insertAfterNk) +
                '\nwindow.__alloha_mod_loaded=true;window.__alloha_patch_reached=true;' +
                'try{var __mod_nk=' + nkRef + ';' +
                'window.__alloha_nk_len=__mod_nk?__mod_nk.length:0;' +
                'window.__alloha_mod_nk_first15=__mod_nk?__mod_nk.substring(0,15):"";' +
                'window.__alloha_nk_saved=__mod_nk;' +
                'window.__alloha_suffix=(' + suffixExpr + ');' +
                '}catch(__pe0){window.__alloha_suffix_err=String(__pe0);}' +
                'setTimeout(function(){' +
                  'var __nk=window.__alloha_nk_saved;' +
                  'var __suf=window.__alloha_suffix;' +
                  'var __fnLog=[];' +
                  'if(!__suf&&__nk&&__nk.length>10){' +
                    'var __names=' + JSON.stringify((function(){
                        var s=appJs.substring(Math.max(0,insertAfterNk-200),Math.min(appJs.length,insertAfterNk+3000));
                        var o={},m,r=/\b([a-zA-Z_$][a-zA-Z0-9_$]{1,3})\b/g;
                        while((m=r.exec(s))!==null)o[m[1]]=1;
                        return Object.keys(o);
                    })()) + ';' +
                    'var __pf=[],__bf=null;' +
                    '__names.forEach(function(n){' +
                      'try{' +
                        'var f=eval(n);' +
                        'if(typeof f!=="function")return;' +
                        'var r0,r1,r2;' +
                        'try{r0=f(__nk,false);}catch(e){}' +
                        'try{r1=f(__nk);}catch(e){}' +
                        'try{r2=f(__nk,true);}catch(e){}' +
                        'var r=r0||r1||r2;' +
                        'if(typeof r!=="string"||r.length<10)return;' +
                        'var ss=__nk.split("").sort().join("");' +
                        'var rs=r.split("").sort().join("");' +
                        'if(r.length===__nk.length&&ss===rs){__pf.push(f);return;}' +
                        'if(r.length>__nk.length*1.2&&/^[A-Za-z0-9+\\/=]+$/.test(r)){__bf=f;return;}' +
                        'if(r.length>20&&r.length<400)__fnLog.push(n+":"+r.substring(0,25));' +
                      '}catch(e){}' +
                    '});' +
                    'var __bfn=__bf||function(s){return btoa(s);};' +
                    'if(__pf.length>=2){' +
                      'var __t1,__t2;' +
                      'try{__t1=__bfn(__pf[1](__nk,false),false);}catch(e){}' +
                      'try{__t2=__bfn(__pf[0](__nk,false),false);}catch(e){}' +
                      'var __pick=__t1||__t2;' +
                      'try{if(atob(__t1||"").indexOf("|")>0)__pick=__t1;else if(atob(__t2||"").indexOf("|")>0)__pick=__t2;}catch(e){}' +
                      '__suf=__pick;' +
                    '}else if(__pf.length===1){' +
                      'try{__suf=__bfn(__pf[0](__nk,false),false);}catch(e){}' +
                    '}else if(__bf){' +
                      'try{__suf=__bf(__nk,false);}catch(e){}' +
                    '}' +
                  '}' +
                  'window.parent&&window.parent.postMessage({__alloha:true,borth:null,nc:null,' +
                    'nh_called:false,nh_done:false,nh_err:null,' +
                    'suffix:__suf||null,ls:null,' +
                    'nk_len:window.__alloha_nk_len||0,' +
                    'mod_nk:window.__alloha_mod_nk_first15||null,' +
                    'mod_nk_full:window.__alloha_nk_saved||null,' +
                    'fn_results:__fnLog.slice(0,20).join("|"),' +
                    'error:__suf?null:("perm="+(__pf?__pf.length:0)),' +
                    'mod:true,patch:true},"*");' +
                '},50);\n' +
                appJs.substring(insertAfterNk);
            } // end else (nk mode)

            // Deep proxy helper
            var deepProxy = function(target) {
                return new Proxy(target, {
                    get: function(t, p) {
                        if (p in t) return t[p];
                        return deepProxy({});
                    }
                });
            }

            // jQuery mock ? attr('content') ?????????? nkVal ??? ????-???? viewporti
            var jqMock = function(sel) {
            var o = { on:function(){return o;}, off:function(){return o;}, attr:function(n){return n==='content'?nkVal:'';}, find:function(){return o;}, length:1, addClass:function(){return o;}, removeClass:function(){return o;}, text:function(){return o;}, html:function(){return o;}, val:function(){return '';}, trigger:function(){return o;}, css:function(){return o;}, show:function(){return o;}, hide:function(){return o;}, each:function(){return o;}, append:function(){return o;}, prepend:function(){return o;}, remove:function(){return o;}, empty:function(){return o;}, parent:function(){return o;}, children:function(){return o;}, closest:function(){return o;}, data:function(){return o;}, prop:function(){return false;}, is:function(){return false;}, hasClass:function(){return false;}, eq:function(){return o;}, first:function(){return o;}, last:function(){return o;}, get:function(){return null;}, 0:null, ready:function(fn){try{fn();}catch(e){}return o;} };
                return o;
            };
            jqMock.fn={extend:function(){},jquery:'3.0.0'}; jqMock.extend=function(a,b){return Object.assign(a||{},b||{});}; jqMock.ajax=function(){return{done:function(){return this;},fail:function(){return this;}};}; jqMock.noop=function(){}; jqMock.isFunction=function(f){return typeof f==='function';}; jqMock.isArray=Array.isArray; jqMock.each=function(obj,fn){if(Array.isArray(obj))obj.forEach(fn);return obj;}; jqMock.map=function(obj,fn){return Array.isArray(obj)?obj.map(fn):[];}; jqMock.grep=function(arr,fn){return arr.filter(fn);}; jqMock.inArray=function(val,arr){return arr.indexOf(val);}; jqMock.type=function(obj){return typeof obj;}; jqMock.trim=function(s){return s.trim();}; jqMock.parseJSON=JSON.parse;

            // Build mock element
            var makeEl = function(tag) {
            var el = { style:{}, tagName:(tag||'').toUpperCase(), nodeType:1, childNodes:[], children:[], innerHTML:'', textContent:'', type:'', id:'', className:'', classList:{add:function(){},remove:function(){},contains:function(){return false;}}, addEventListener:function(){}, removeEventListener:function(){}, dispatchEvent:function(){return true;}, play:function(){return Promise.resolve();}, pause:function(){}, load:function(){}, canPlayType:function(){return '';}, removeChild:function(){}, insertBefore:function(){return null;}, appendChild:function(){return null;}, setAttribute:function(){}, getAttribute:function(){return '';}, getBoundingClientRect:function(){return{top:0,left:0,width:0,height:0};}, offsetWidth:0, offsetHeight:0, dataset:{} };
                if ((tag||'').toLowerCase() === 'script') {
                    Object.defineProperty(el, 'src', { get:function(){return el._src||'';}, set:function(v){el._src=v;setTimeout(function(){if(el.onload)el.onload();},5);}, configurable:true });
                }
                return deepProxy(el);
            }

            // Build globals for new Function - called fresh each time to avoid webpack cache
            var buildAllohaGlobals = function(nkVal) {
            var g = {
                document: deepProxy({ referrer:'', querySelector:function(sel){if(sel&&sel.indexOf('viewporti')>=0)return{getAttribute:function(){return nkVal||'';}}; return makeEl('div');}, querySelectorAll:function(){return[];}, getElementById:function(){return null;}, getElementsByTagName:function(){return{length:0,item:function(){return null;}};}, getElementsByClassName:function(){return{length:0};}, createElement:function(t){return makeEl(t);}, createElementNS:function(ns,t){return makeEl(t);}, createTextNode:function(t){return{textContent:t,nodeType:3};}, createDocumentFragment:function(){return{appendChild:function(el){return el;},childNodes:[]};}, body:deepProxy({appendChild:function(){},removeChild:function(){},insertBefore:function(){return null;},style:{},innerHTML:'',classList:{add:function(){},remove:function(){},contains:function(){return false;}}}), head:{appendChild:function(){}}, addEventListener:function(){}, removeEventListener:function(){}, dispatchEvent:function(){return true;}, title:'', readyState:'complete', hidden:false, visibilityState:'visible', fullscreenElement:null, cookie:'' }),
                location:{href:'https://streamalloha.live/',origin:'https://streamalloha.live',hostname:'streamalloha.live',pathname:'/',search:'',hash:'',protocol:'https:'},
                navigator:{userAgent:navigator.userAgent,language:'ru',platform:'Win32',cookieEnabled:true,onLine:true},
                history:{pushState:function(){},replaceState:function(){}},
                screen:{width:1920,height:1080},
                fetch:function(){return Promise.resolve({ok:false,status:404,json:function(){return Promise.resolve({});},text:function(){return Promise.resolve('');},headers:{get:function(){return null;}}});},
                Promise:Promise,
                console:{log:function(){},error:function(){},warn:function(){},info:function(){},debug:function(){},group:function(){},groupEnd:function(){}},
                setTimeout:setTimeout,clearTimeout:clearTimeout,setInterval:setInterval,clearInterval:clearInterval,
                requestAnimationFrame:function(fn){return setTimeout(fn,16);},cancelAnimationFrame:clearTimeout,
                JSON:JSON,Math:Math,Object:Object,Array:Array,String:String,Number:Number,Boolean:Boolean,Error:Error,Symbol:Symbol,
                Map:Map,Set:Set,WeakMap:WeakMap,WeakSet:WeakSet,Proxy:Proxy,Reflect:Reflect,RegExp:RegExp,Date:Date,
                parseInt:parseInt,parseFloat:parseFloat,isNaN:isNaN,isFinite:isFinite,
                encodeURIComponent:encodeURIComponent,decodeURIComponent:decodeURIComponent,encodeURI:encodeURI,decodeURI:decodeURI,
                XMLHttpRequest:function(){this.open=function(){};this.send=function(){};this.setRequestHeader=function(){};this.timeout=0;},
                WebSocket:function(){this.close=function(){};this.send=function(){};this.readyState=3;},
                Hls:{isSupported:function(){return false;}},
                crypto:window.crypto||{subtle:{digest:function(){return Promise.resolve(new ArrayBuffer(32));}},getRandomValues:function(arr){return arr;}},
                performance:{now:function(){return Date.now();}},
                userParam:{token:'',domain:'',device:0,selector:1,autoPlayChange:1,saveTime:1,hidden:[],fullscreen:0,autoplay:0,start:'0',audio:'',subtitle:''},
                movie:{id:'',type:'movie'},
                fileList:{type:'movie',active:{id:0},all:{theatrical:{},directors:[]}},
                config:{av1Support:true,debug:false,mediaMetadata:{title:''},poster:'',ads:{enabled:false},controls:[],settings:[]},
                player:deepProxy({currentTime:0,pause:function(){},play:function(){return Promise.resolve();},src:'',volume:1,muted:false,paused:true,ended:false,duration:0,buffered:{length:0},textTracks:{length:0},audioTracks:{length:0},videoTracks:{length:0},addEventListener:function(){},removeEventListener:function(){},load:function(){},setAttribute:function(){},getAttribute:function(){return'';},style:{},classList:{add:function(){},remove:function(){},contains:function(){return false;}}}),
                showLoading:function(){},hideLoading:function(){},autoplayNext:null,
                MutationObserver:function(){this.observe=function(){};this.disconnect=function(){};},
                IntersectionObserver:function(){this.observe=function(){};this.disconnect=function(){};},
                ResizeObserver:function(){this.observe=function(){};this.disconnect=function(){};},
                CustomEvent:function(type,opts){this.type=type;this.detail=opts&&opts.detail;},
                Event:function(type){this.type=type;},
                URL:function(url){var u=(url||'').replace('https://','').split('/');this.hostname=u[0];this.pathname='/'+u.slice(1).join('/');this.href=url;this.origin='https://'+u[0];this.search='';this.hash='';},
                URLSearchParams:function(str){this.get=function(){return null;};this.set=function(){};this.toString=function(){return str||'';};},
                atob:window.atob?window.atob.bind(window):function(s){return s;},
                btoa:window.btoa?window.btoa.bind(window):function(s){return s;},
                TextEncoder:window.TextEncoder||function(){this.encode=function(s){return [];};},
                TextDecoder:window.TextDecoder||function(){this.decode=function(){return '';};},
                Uint8Array:Uint8Array,Int8Array:Int8Array,Uint16Array:Uint16Array,Int16Array:Int16Array,
                Uint32Array:Uint32Array,Int32Array:Int32Array,Float32Array:Float32Array,Float64Array:Float64Array,
                ArrayBuffer:ArrayBuffer,DataView:DataView,
                undefined:undefined,NaN:NaN,Infinity:Infinity,
                localStorage:{getItem:function(){return null;},setItem:function(){},removeItem:function(){}},
                sessionStorage:{getItem:function(){return null;},setItem:function(){},removeItem:function(){}},
                google:{ima:{AdDisplayContainer:function(){this.initialize=function(){};this.destroy=function(){};},AdsLoader:function(){this.addEventListener=function(){};this.requestAds=function(){};this.destroy=function(){};this.contentComplete=function(){};},AdsRequest:function(){},AdEvent:{Type:{}},AdErrorEvent:{Type:{AD_ERROR:'adError'}},ViewMode:{NORMAL:'normal'}}},
                jQuery:jqMock,$:jqMock,
                __alloha_nk:nkVal,__alloha_suffix:null,__alloha_suffix_err:null,__alloha_mod_loaded:false,
                __alloha_patch_reached:false,__alloha_cp1:false,__alloha_cp2:false,__alloha_cp3:false,
                webpackChunk:[],
                addEventListener:function(){},removeEventListener:function(){},dispatchEvent:function(){return true;},postMessage:function(){}
                };
                g.window=g;g.self=g;g.global=g;g.top=g;g.parent=g;
                g.document.defaultView=g;
                // Pre-intercept webpackChunk.push
                var _wc = g.webpackChunk;
                _wc.push = function(chunk) {
                    if (chunk && chunk[2]) {
                        var _or = chunk[2];
                        chunk[2] = function(wpReq) {
                            if (wpReq && wpReq.m) {
                                Object.keys(wpReq.m).forEach(function(id) {
                                    var _orig = wpReq.m[id];
                                    var _mid = parseInt(id);
                                    wpReq.m[id] = (function(origFn, modId) {
                                        return function(module, exports, require) {
                                            try { origFn(module, exports, require); } catch(e) {
                                                if (modId === 74692 || modId === 64468) {
                                                    module.exports = jqMock;
                                                    module.exports.default = jqMock;
                                                }
                                            }
                                        };
                                    })(_orig, _mid);
                                });
                            }
                            return _or.call(this, wpReq);
                        };
                    }
                    Array.prototype.push.call(_wc, chunk);
                    return _wc.length;
                };
                return g;
            }

            // Download runtime
            allohaDownloadJs(ALLOHA_RUNTIME_JS_URL, function(err2, runtimeJs) {
                if (err2) { callback(err2); return; }

                // Download 539
                allohaDownloadJs(ALLOHA_539_JS_URL, function(err3, js539) {
                    if (err3) { callback(err3); return; }

                    // Run bundles safely with explicit parameter isolation
                    var runBundleWith = function(code, g) {
            var paramNames = Object.keys(g);
                        var paramValues = paramNames.map(function(k) { return g[k]; });
                        try {
                            var fn = new Function(paramNames, code);
                            fn.apply(null, paramValues);
                        } catch(e) {}
                    }

                    // Create the compute function using sandboxed iframe
                    _allohaComputeSuffix = function(nk, fileId, partnerToken, playerUrl, cb) {
                        var iframe = document.createElement('iframe');
                        iframe.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;top:-9999px;';
                        iframe.setAttribute('sandbox', 'allow-scripts');
                        document.body.appendChild(iframe);

                        var done = false;
                        var timeout = setTimeout(function() {
                            if (done) return;
                            done = true;
                            try { document.body.removeChild(iframe); } catch(e) {}
                            cb(new Error('iframe_timeout'));
                        }, 30000);

                        var msgHandler = function(event) {
                            if (!event.data || (event.data.__alloha !== true && event.data.__alloha_perm !== true)) return;
                            // Handle perm results message (early, before main result)
                            if (event.data.__alloha_perm) {
                                console.log('[Alloha] perm results from iframe:', event.data.perm);
                                // Extract COMBO suffixes and try them via worker
                                var permStr = event.data.perm || '';
                                var combos = [];
                                permStr.split('|').forEach(function(p) {
                                    // Accept S_ (single perm), D_ (double perm), S0_ variants
                                    var colonIdx = p.indexOf(':');
                                    if (colonIdx > 0) {
                                        var name = p.substring(0, colonIdx);
                                        var val = p.substring(colonIdx + 1);
                                        if (val && val.length > 10) combos.push(name + ':' + val);
                                    }
                                });
                                if (combos.length > 0 && !done) {
                                    console.log('[Alloha] trying', combos.length, 'suffix combos...');
                                    // Try each combo as suffix
                                    (function tryCombo(idx) {
                                        if (idx >= combos.length || done) return;
                                        var comboStr = combos[idx];
                                        var colonIdx = comboStr.indexOf(':');
                                        var comboName = colonIdx > 0 ? comboStr.substring(0, colonIdx) : 'C' + idx;
                                        var suffix = colonIdx > 0 ? comboStr.substring(colonIdx + 1) : comboStr;
                                        if (!suffix || suffix.length < 10) { tryCombo(idx + 1); return; }
                                        console.log('[Alloha] trying ' + comboName + ':', suffix.substring(0, 15));
                                        var xhr = new XMLHttpRequest();
                                        xhr.open('POST', workerUrl + '/alloha/streams', true);
                                        xhr.timeout = 15000;
                                        xhr.setRequestHeader('Content-Type', 'application/json');
                                        var comboPayload = { file_id: fileId, partner_token: partnerToken, suffix: suffix, player_url: playerUrl };
                                        console.log('[Alloha] ' + comboName + ' payload: file_id=' + fileId + ' suffix=' + suffix.substring(0,15));
                                        xhr.onload = function() {
                                            if (done) return;
                                            var json;
                                            try { json = JSON.parse(xhr.responseText); } catch(e) {}
                                            if (xhr.status === 200 && json && json.ok && json.hlsSource && json.hlsSource.length) {
                                                console.log('[Alloha] ' + comboName + ' SUCCESS!');
                                                done = true;
                                                clearTimeout(timeout);
                                                window.removeEventListener('message', msgHandler);
                                                try { document.body.removeChild(iframe); } catch(e) {}
                                                cb(null, suffix, null);
                                            } else {
                                                console.log('[Alloha] ' + comboName + ' failed:', xhr.status, json && json.error ? json.error.substring(0, 50) : '');
                                                tryCombo(idx + 1);
                                            }
                                        };
                                        xhr.onerror = xhr.ontimeout = function() { tryCombo(idx + 1); };
                                        xhr.send(JSON.stringify(comboPayload));
                                    })(0);
                                }
                                return; // don't set done=true
                            }
                            if (done) return;
                            done = true;
                            clearTimeout(timeout);
                            window.removeEventListener('message', msgHandler);
                            try { document.body.removeChild(iframe); } catch(e) {}
                            console.log('[Alloha] iframe nk_full=' + (event.data.mod_nk_full||'?'));
                            console.log('[Alloha] iframe suffix_full=' + (event.data.suffix||'?'));
                            console.log('[Alloha] iframe result: mod_loaded=' + event.data.mod + ' patch=' + event.data.patch + ' nk_len=' + event.data.nk_len + ' mod_nk=' + (event.data.mod_nk||'?') + ' nh_called=' + event.data.nh_called + ' borth=' + (event.data.borth ? event.data.borth.substring(0,20) : 'null') + ' suffix=' + (event.data.suffix ? event.data.suffix.substring(0,10) : 'null') + ' err=' + event.data.error + ' vp_mod=' + (event.data.vp_mod||'none') + ' bnsi=' + event.data.bnsi_called + ' suffix_cap=' + (event.data.suffix_cap ? event.data.suffix_cap.substring(0,15) : 'null') + ' nk_saved=' + (event.data.nk_saved||'null'));
                            if (event.data.perm_results) console.log('[Alloha] perm results:', event.data.perm_results);
                            if (event.data.fn_results) console.log('[Alloha] iframe fn_results:', event.data.fn_results);
                            if (event.data.borth) {
                                // Full borth captured from iframe (nH completed via /bnsi intercept)
                                cb(null, null, event.data.borth);
                            } else if (event.data.suffix) {
                                // Have suffix ? always fetch a fresh nc via sarnvorf right before BNSI
                                // (nc from iframe may be stale by the time we call BNSI)
                                cb(null, event.data.suffix, null);
                            } else {
                                cb(new Error(event.data.error || 'no_suffix'));
                            }
                        };
                        window.addEventListener('message', msgHandler);

                        // Minimal jQuery mock as a safe string (no single quotes inside)
                        var jqMockCode = [
                            'var __jq=function(sel){',
                            '  var __isVP=(typeof sel==="string"&&(sel.indexOf("viewporti")>=0||sel.indexOf("meta")>=0));',
                            '  var o={on:function(){return o;},off:function(){return o;},',
                            '  attr:function(n){return(n==="content")?__nk:"";},find:function(){return o;},length:1,',
                            '  addClass:function(){return o;},removeClass:function(){return o;},',
                            '  text:function(){return o;},html:function(){return o;},',
                            '  val:function(){return "";},trigger:function(){return o;},',
                            '  css:function(){return o;},show:function(){return o;},',
                            '  hide:function(){return o;},each:function(){return o;},',
                            '  append:function(){return o;},prepend:function(){return o;},',
                            '  remove:function(){return o;},empty:function(){return o;},',
                            '  parent:function(){return o;},children:function(){return o;},',
                            '  closest:function(){return o;},data:function(){return o;},',
                            '  prop:function(){return false;},is:function(){return false;},',
                            '  hasClass:function(){return false;},eq:function(){return o;},',
                            '  first:function(){return o;},last:function(){return o;},',
                            '  get:function(){return null;},0:null,',
                            '  ready:function(fn){try{fn();}catch(e){}return o;}};',
                            '  return o;',
                            '};',
                            '__jq.fn={extend:function(){},jquery:"3.0.0"};',
                            '__jq.extend=function(a,b){return Object.assign(a||{},b||{});};',
                            '__jq.ajax=function(){return{done:function(){return this;},fail:function(){return this;}};};',
                            '__jq.noop=function(){};',
                            '__jq.isFunction=function(f){return typeof f==="function";};',
                            '__jq.isArray=Array.isArray;',
                            '__jq.each=function(obj,fn){if(Array.isArray(obj))obj.forEach(fn);return obj;};',
                            '__jq.map=function(obj,fn){return Array.isArray(obj)?obj.map(fn):[];};',
                            '__jq.grep=function(arr,fn){return arr.filter(fn);};',
                            '__jq.inArray=function(val,arr){return arr.indexOf(val);};',
                            '__jq.type=function(obj){return typeof obj;};',
                            '__jq.trim=function(s){return s.trim();};',
                            '__jq.parseJSON=JSON.parse;'
                        ].join('\n');

                        var workerUrl = ALLOHA_WORKER;

                        // Build iframe HTML
                        var parts = [
                            '<!DOCTYPE html><html><head>',
                            '<meta name="viewporti" content="' + nk + '">',
                            '</head><body><script>',
                            '(function(){',
                            'var __nk=' + JSON.stringify(nk) + ';',
                            // Suppress unhandled promise rejections ? they crash the iframe
                            'window.addEventListener("unhandledrejection",function(e){e.preventDefault();});',
                            // Set nk and file_id on window so patch can access them
                            'window.__alloha_nk=' + JSON.stringify(nk) + ';',
                            'window.__alloha_file_id=' + JSON.stringify(fileId) + ';',
                            'var __worker=' + JSON.stringify(workerUrl) + ';',
                            'var __playerUrl=' + JSON.stringify(playerUrl) + ';',
                            // Intercept XHR: use worker sarnvorf for auth, capture Borth from bnsi
                            'var __origXHR=XMLHttpRequest;',
                            'var __nc_val=null;',
                            'var __sarnvorf_pending=[];',
                            'var __sarnvorf_done=false;',
                            'function __doSarnVorf(cb){',
                            '  if(__nc_val){cb(__nc_val);return;}',
                            '  __sarnvorf_pending.push(cb);',
                            '  if(__sarnvorf_pending.length>1)return;',
                            '  var _x=new __origXHR();',
                            '  _x.open("POST",__worker+"/alloha/sarnvorf",true);',
                            '  _x.setRequestHeader("Content-Type","application/json");',
                            '  _x.onload=function(){',
                            '    try{var j=JSON.parse(_x.responseText);__nc_val=j.nc||null;}catch(e){}',
                            '    var cbs=__sarnvorf_pending.splice(0);',
                            '    cbs.forEach(function(f){f(__nc_val);});',
                            '  };',
                            '  _x.onerror=function(){var cbs=__sarnvorf_pending.splice(0);cbs.forEach(function(f){f(null);});};',
                            '  _x.send(JSON.stringify({partner_token:userParam.token,player_url:__playerUrl}));',
                            '}',
                            'XMLHttpRequest=function(){',
                            '  var self=this;var _url="";var _method="GET";var _headers={};',
                            '  this.open=function(m,u){_method=m;_url=u;};',
                            '  this.setRequestHeader=function(n,v){_headers[n]=v;};',
                            '  this.send=function(body){',
                            '    if(_url&&(_url.indexOf("/sarn")>=0)){',
                            '      // Intercept /sarn ? trigger sarnvorf, return fake sarn response',
                            '      __doSarnVorf(function(nc){',
                            '        self.status=200;',
                            '        self.responseText=JSON.stringify({challenge:"x",nonce:"x",uap:"x"});',
                            '        setTimeout(function(){if(self.onload)self.onload();},10);',
                            '      });',
                            '    } else if(_url&&(_url.indexOf("/vorf")>=0)){',
                            '      // Intercept /vorf ? return fake nc from our sarnvorf call',
                            '      __doSarnVorf(function(nc){',
                            '        self.status=200;',
                            '        self.responseText=JSON.stringify({token:nc||""});',
                            '        setTimeout(function(){if(self.onload)self.onload();},10);',
                            '      });',
                            '    } else if(_url&&_url.indexOf("/bnsi")>=0){',
                            '      // Capture Borth header',
                            '      var _borth=_headers["Borth"]||_headers["borth"]||"";',
                            '      window.__alloha_borth=_borth;',
                            '      window.__alloha_bnsi_called=true;',
                            '      window.__alloha_bnsi_url=_url;',
                            '      self.status=200;self.responseText="{}";',
                            '      setTimeout(function(){if(self.onload)self.onload();},10);',
                            '    } else {',
                            '      self.status=404;self.responseText="";',
                            '      setTimeout(function(){if(self.onload)self.onload();},10);',
                            '    }',
                            '  };',
                            '  this.timeout=0;',
                            '};',
                            // Also intercept fetch API
                            'var __origFetch=window.fetch;',
                            'window.fetch=function(url,opts){',
                            '  var urlStr=String(url||"");',
                            '  var headers=(opts&&opts.headers)||{};',
                            '  if(urlStr.indexOf("/sarn")>=0){',
                            '    return new Promise(function(resolve){',
                            '      __doSarnVorf(function(nc){',
                            '        resolve({ok:true,status:200,json:function(){return Promise.resolve({challenge:"x",nonce:"x",uap:"x"});},headers:{get:function(){return null;}}});',
                            '      });',
                            '    });',
                            '  }',
                            '  if(urlStr.indexOf("/vorf")>=0){',
                            '    return new Promise(function(resolve){',
                            '      __doSarnVorf(function(nc){',
                            '        resolve({ok:true,status:200,json:function(){return Promise.resolve({token:nc||""});},headers:{get:function(){return null;}}});',
                            '      });',
                            '    });',
                            '  }',
                            '  if(urlStr.indexOf("/bnsi")>=0){',
                            '    var _borth=(headers["Borth"]||headers["borth"]||"");',
                            '    if(!_borth&&opts&&opts.headers){',
                            '      var _hkeys=Object.keys(opts.headers);',
                            '      for(var _hi=0;_hi<_hkeys.length;_hi++){if(_hkeys[_hi].toLowerCase()==="borth"){_borth=opts.headers[_hkeys[_hi]];break;}}',
                            '    }',
                            '    window.__alloha_borth=_borth;',
                            '    window.__alloha_bnsi_called=true;',
                            '    window.__alloha_bnsi_url=urlStr;',
                            '    return Promise.resolve({ok:true,status:200,json:function(){return Promise.resolve({});},headers:{get:function(){return null;}}});',
                            '  }',
                            '  // Block ads and other external requests',
                            '  return Promise.resolve({ok:false,status:404,json:function(){return Promise.resolve({});},text:function(){return Promise.resolve("");},headers:{get:function(){return null;}}});',
                            '};',
                            // Player globals needed by module 28364
                            'var fileList={type:"movie",active:{id:' + JSON.stringify(fileId) + ',id_file:null,id_translation:66,quality:"WEB-DL",uhd:1,typeList:"theatrical"},all:{theatrical:{t66:{"WEB-DL":{id:' + JSON.stringify(fileId) + '}}},directors:[]}};',
                            'var userParam={token:' + JSON.stringify(partnerToken) + ',domain:"",device:0,selector:1,autoPlayChange:1,saveTime:1,hidden:[],fullscreen:0,autoplay:1,start:"0",audio:"",subtitle:""};',
                            'var config={av1Support:true,debug:false,mediaMetadata:{title:""},poster:"",ads:{enabled:false,ima:{enabled:false},vast:{enabled:false},preroll:{enabled:false},midroll:{enabled:false},postroll:{enabled:false}},controls:[],settings:[],subtitles:{enabled:false},quality:{default:"auto"},autoplay:false,loop:false,muted:false,volume:1,startTime:0,endTime:0,live:false,dvr:false,cast:{enabled:false},pip:{enabled:false},keyboard:{enabled:false},contextMenu:{enabled:false},logo:{enabled:false},share:{enabled:false},download:{enabled:false},speed:{enabled:false},related:{enabled:false},playlist:{enabled:false}};',
                            'var movie={id:' + JSON.stringify((playerUrl.match(/token_movie=([^&]+)/) || ['',''])[1]) + ',type:"movie"};',
                            'var showLoading=function(){};var hideLoading=function(){};var autoplayNext=null;',
                            'var player={currentTime:0,pause:function(){},play:function(){return Promise.resolve();},src:"",volume:1,muted:false,paused:true,ended:false,duration:0,buffered:{length:0},textTracks:{length:0},audioTracks:{length:0},videoTracks:{length:0},addEventListener:function(){},removeEventListener:function(){},load:function(){},setAttribute:function(){},getAttribute:function(){return"";},style:{},classList:{add:function(){},remove:function(){},contains:function(){return false;}}};',
                            jqMockCode,
                            // Intercept webpackChunk before runtime
                            'var __wc=[];',
                            '__wc.push=function(chunk){',
                            '  if(chunk&&chunk[2]){',
                            '    var _or=chunk[2];',
                            '    chunk[2]=function(wpReq){',
                            '      if(wpReq)__wpReq=wpReq;',
                            '      if(wpReq&&wpReq.m){',
                            '        Object.keys(wpReq.m).forEach(function(id){',
                            '          var _orig=wpReq.m[id];var _mid=parseInt(id);',
                            '          wpReq.m[id]=function(module,exports,require){',
                            '            var _configMock={av1Support:true,debug:false,mediaMetadata:{title:""},poster:"",ads:{enabled:false,ima:{enabled:false},vast:{enabled:false},preroll:{enabled:false},midroll:{enabled:false},postroll:{enabled:false}},controls:[],settings:[],subtitles:{enabled:false},quality:{default:"auto"},autoplay:false,loop:false,muted:false,volume:1,startTime:0,endTime:0,live:false,dvr:false,cast:{enabled:false},pip:{enabled:false},keyboard:{enabled:false},contextMenu:{enabled:false},logo:{enabled:false},share:{enabled:false},download:{enabled:false},speed:{enabled:false},related:{enabled:false},playlist:{enabled:false}};',
                            '            if(_mid===0x6ecc){',
                            '              var _origRequire=require;',
                            '              var _wrappedRequire=function(id){',
                            '                try{var r=_origRequire(id);',
                            '                  if(r&&typeof r==="object"&&r.ads===undefined&&typeof r.enabled==="undefined"){',
                            '                    if(Object.keys(r).length===0)return _configMock;',
                            '                  }',
                            '                  if(r===undefined||r===null)return _configMock;',
                            '                  return r;',
                            '                }catch(e){return _configMock;}',
                            '              };',
                            '              Object.keys(_origRequire).forEach(function(k){try{_wrappedRequire[k]=_origRequire[k];}catch(e){}});',
                            '              try{_orig(module,exports,_wrappedRequire);}catch(e){}',
                            '            }',
                            '            else{try{_orig(module,exports,require);}catch(e){',
                            '              if(_mid===74692||_mid===64468){',
                            '                module.exports=__jq;',
                            '                module.exports.default=__jq;',
                            '              }',
                            '            }}',
                            '          };',
                            '        });',
                            '      }',
                            '      try{return _or.call(this,wpReq);}catch(e){}',
                            '    };',
                            '  }',
                            '  Array.prototype.push.call(__wc,chunk);',
                            '  return __wc.length;',
                            '};',
                            'self["webpackChunk"]=__wc;',
                            'var __wpReq=null;', // ???????? webpack require
                            // Eagerly fetch nc so it's ready when needed
                            '__doSarnVorf(function(){});',
                            runtimeJs,
                            js539,
                            patchedApp,
                            // ??????не задан? 28364 ??????? ??не задан?? ??? не задан??
                            'if(!window.__alloha_suffix&&__wpReq&&__wpReq.m&&__wpReq.m[0x6ecc]){',
                            '  window.__alloha_wpReq_mCount=Object.keys(__wpReq.m).length;',
                            '  try{__wpReq.m[0x6ecc]({exports:{}},{},__wpReq);}catch(e){}',
                            '}',
                            // Also try to find and run the module containing viewporti in new bundle
                            'if(!window.__alloha_borth&&__wpReq&&__wpReq.m){',
                            '  var __mids=Object.keys(__wpReq.m);',
                            '  for(var __mi=0;__mi<__mids.length;__mi++){',
                            '    var __mfn=__wpReq.m[__mids[__mi]];',
                            '    if(__mfn&&typeof __mfn==="function"&&__mfn.toString().indexOf("viewporti")>=0){',
                            '      window.__alloha_vp_module_id=__mids[__mi];',
                            '      try{__mfn({exports:{}},{},__wpReq);}catch(e){}',
                            '      break;',
                            '    }',
                            '  }',
                            '}',
                            'setTimeout(function(){',
                            '  window.parent.postMessage({',
                            '    __alloha:true,',
                            '    borth:window.__alloha_borth||null,',
                            '    nc:__nc_val||null,',
                            '    nh_called:window.__alloha_nh_called||false,',
                            '    nh_done:window.__alloha_nh_done||false,',
                            '    nh_err:window.__alloha_nh_err||null,',
                            '    suffix:window.__alloha_suffix||null,',
                            '    ls:window.__alloha_ls||null,',
                            '    nk_len:window.__alloha_nk_len||0,',
                            '    mod_nk:window.__alloha_mod_nk_first15||null,',
                            '    nc_val:window.__alloha_nc_val||null,',
                            '    error:window.__alloha_suffix_err||null,',
                            '    mod:window.__alloha_mod_loaded,',
                            '    patch:window.__alloha_patch_reached,',
                            '    vp_mod:window.__alloha_vp_module_id||null,',
                            '    bnsi_called:window.__alloha_bnsi_called||false,',
                            '    bnsi_url:window.__alloha_bnsi_url||null,',
                            '    suffix_cap:window.__alloha_suffix_captured||null,',
                            '    nk_saved:window.__alloha_nk_saved?window.__alloha_nk_saved.substring(0,15):null,',
                            '    perm_results:window.__alloha_perm_results||null',
                            '  },"*");',
                            '},8000);',
                            '})();',
                            '<\/script></body></html>'
                        ];

                        iframe.srcdoc = parts.join('\n');
                    };

                    callback(null, _allohaComputeSuffix);
                });
            });
        });
    }

    var allohaGetBnsiStreams = function(fileId, partnerToken, nk, playerUrl, callback, tokenMovie) {
        console.log('[Alloha] computing Borth suffix...');

        allohaGetComputeSuffix(function(err, computeSuffix) {
            if (err) {
                // Fallback to worker if browser doesn't support Proxy
                console.log('[Alloha] browser compute failed:', err.message, '? trying worker');
                allohaGetBnsiStreamsViaWorker(fileId, partnerToken, nk, playerUrl, callback, tokenMovie);
                return;
            }

            var suffix;
            // computeSuffix is now async (uses iframe), takes callback(err, suffix, borth)
            computeSuffix(nk, fileId, partnerToken, playerUrl, function(suffixErr, suffix, borth) {
                if (suffixErr) {
                    console.log('[Alloha] suffix compute error:', suffixErr.message, '? trying worker');
                    allohaGetBnsiStreamsViaWorker(fileId, partnerToken, nk, playerUrl, callback, tokenMovie);
                    return;
                }

                if (borth) {
                    // Got full Borth from iframe ? use it directly via worker
                    console.log('[Alloha] got full Borth from iframe, sending to worker...');
                    var bnsiXhr2 = new XMLHttpRequest();
                    bnsiXhr2.open('POST', getProxyUrl() + '/alloha/bnsi', true);
                    bnsiXhr2.timeout = 15000;
                    bnsiXhr2.setRequestHeader('Content-Type', 'application/json');
                    bnsiXhr2.onload = function() {
                        if (bnsiXhr2.status !== 200) {
                            console.log('[Alloha] bnsi worker response:', bnsiXhr2.responseText.substring(0,200));
                            // Worker failed with assembled borth ? retry via /alloha/streams (fresh nc, same IP)
                            console.log('[Alloha] bnsi failed, retrying via /alloha/streams...');
                            var pipeIdx = borth.indexOf('|');
                            var oldSuffix = pipeIdx >= 0 ? borth.substring(pipeIdx + 1) : borth;
                            var retryXhr = new XMLHttpRequest();
                            retryXhr.open('POST', getProxyUrl() + '/alloha/streams', true);
                            retryXhr.timeout = 30000;
                            retryXhr.setRequestHeader('Content-Type', 'application/json');
                            retryXhr.onload = function() {
                                if (retryXhr.status !== 200) { callback(new Error('streams_' + retryXhr.status)); return; }
                                var jsonR;
                                try { jsonR = JSON.parse(retryXhr.responseText); } catch(e) { callback(new Error('streams_parse')); return; }
                                if (!jsonR || !jsonR.ok) { callback(new Error('streams_err: ' + (jsonR && jsonR.error || ''))); return; }
                                parseBnsiResponse(jsonR, callback);
                            };
                            retryXhr.onerror = function() { callback(new Error('streams_network')); };
                            retryXhr.ontimeout = function() { callback(new Error('streams_timeout')); };
                            retryXhr.send(JSON.stringify({ file_id: fileId, partner_token: partnerToken, suffix: oldSuffix, player_url: playerUrl }));
                            return;
                        }
                        var json2;
                        try { json2 = JSON.parse(bnsiXhr2.responseText); } catch(e) { callback(new Error('bnsi_parse')); return; }
                        if (!json2 || !json2.ok) { callback(new Error('bnsi_err: ' + (json2 && json2.error || ''))); return; }
                        parseBnsiResponse(json2, callback);
                    };
                    bnsiXhr2.onerror = function() { callback(new Error('bnsi_network')); };
                    bnsiXhr2.ontimeout = function() { callback(new Error('bnsi_timeout')); };
                    bnsiXhr2.send(JSON.stringify({ file_id: fileId, partner_token: partnerToken, borth: borth, player_url: playerUrl }));
                    return;
                }

                console.log('[Alloha] suffix computed:', suffix ? suffix.substring(0,15) : 'null');

                // Got suffix ? send to worker /alloha/streams (rewrites HLS URLs through proxy)
                console.log('[Alloha] sending to /alloha/streams...');
                var streamsXhr = new XMLHttpRequest();
                streamsXhr.open('POST', getProxyUrl() + '/alloha/streams', true);
                streamsXhr.timeout = 60000;
                streamsXhr.setRequestHeader('Content-Type', 'application/json');
                streamsXhr.onload = function() {
                    if (streamsXhr.status !== 200) {
                        console.log('[Alloha] streams response:', streamsXhr.responseText.substring(0,200));
                        callback(new Error('streams_' + streamsXhr.status));
                        return;
                    }
                    var json;
                    try { json = JSON.parse(streamsXhr.responseText); } catch(e) { callback(new Error('streams_parse')); return; }
                    if (!json || !json.ok) { callback(new Error('streams_err: ' + (json && json.error || ''))); return; }
                    parseBnsiResponse(json, callback);
                };
                streamsXhr.onerror = function() { callback(new Error('streams_network')); };
                streamsXhr.ontimeout = function() { callback(new Error('streams_timeout')); };
                streamsXhr.send(JSON.stringify({ file_id: fileId, partner_token: partnerToken, suffix: suffix, player_url: playerUrl }));
            }); // end computeSuffix callback
        });
    }

    var allohaComputeProof = function(lk, callback) {
        if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
            var encoder = new TextEncoder();
            var data = encoder.encode(lk);
            window.crypto.subtle.digest('SHA-256', data).then(function(hashBuffer) {
                var hashArray = Array.prototype.slice.call(new Uint8Array(hashBuffer));
                var hex = hashArray.map(function(b) { return ('00' + b.toString(16)).slice(-2); }).join('');
                callback(hex);
            }).catch(function() { callback(allohaSimpleHash(lk)); });
        } else {
            callback(allohaSimpleHash(lk));
        }
    }

    var allohaSimpleHash = function(str) {
            var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(16);
    }

    var allohaGetBnsiStreamsViaWorker = function(fileId, partnerToken, nk, playerUrl, callback, tokenMovie) {
        // Fallback for browsers without Proxy support (can't run iframe compute)
        // If tokenMovie is available ? let Railway compute nk+suffix server-side (same IP, reliable)
        // Otherwise compute a best-effort suffix locally

        var payload;
        if (tokenMovie) {
            // Railway will fetch nk and compute suffix itself ? most reliable path
            console.log('[Alloha] worker fallback: using token_movie for server-side suffix');
            payload = { file_id: fileId, partner_token: partnerToken, token_movie: tokenMovie, player_url: playerUrl };
        } else {
            // No token_movie ? generate suffix in correct format: btoa(sid|timestamp|key)
            var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
            var sid = ''; for (var i = 0; i < 11; i++) sid += chars[Math.floor(Math.random() * chars.length)];
            var ts = Math.floor(Date.now() / 1000).toString();
            var rkey = ''; for (var j = 0; j < 44; j++) rkey += chars[Math.floor(Math.random() * chars.length)];
            var ls = sid + '|' + ts + '|' + rkey;
            var suffix = window.btoa ? window.btoa(ls) : ls;
            payload = { file_id: fileId, partner_token: partnerToken, suffix: suffix, player_url: playerUrl };
        }

        var xhr = new XMLHttpRequest();
        xhr.open('POST', getProxyUrl() + '/alloha/streams', true);
        xhr.timeout = 30000;
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function() {
            if (xhr.status !== 200) {
                console.log('[Alloha] worker streams error:', xhr.status, xhr.responseText.substring(0, 200));
                callback(new Error('streams_' + xhr.status));
                return;
            }
            var json;
            try { json = JSON.parse(xhr.responseText); } catch(e) { callback(new Error('streams_parse')); return; }
            if (!json || !json.ok) { callback(new Error('streams_failed: ' + (json && json.error || ''))); return; }
            parseBnsiResponse(json, callback);
        };
        xhr.onerror = function() { callback(new Error('streams_network')); };
        xhr.ontimeout = function() { callback(new Error('streams_timeout')); };
        xhr.send(JSON.stringify(payload));
    }

    var parseBnsiResponse = function(json, callback) {
        if (!json || !json.hlsSource || !json.hlsSource.length) {
            callback(new Error('no_hls'));
            return;
        }
        // Log full structure to understand what Alloha returns
        console.log('[Alloha] hlsSource[0] keys:', Object.keys(json.hlsSource[0]).join(','));
        console.log('[Alloha] hlsSource[0] subtitles:', JSON.stringify(json.hlsSource[0].subtitles || json.hlsSource[0].subtitle || null));
        if (json.subtitles || json.subtitle) console.log('[Alloha] global subtitles:', JSON.stringify(json.subtitles || json.subtitle));
        var qualOrder = ['2160','1440','1080','720','480','360'];
        var track = null;
        for (var i = 0; i < json.hlsSource.length; i++) {
            if (json.hlsSource[i].default) { track = json.hlsSource[i]; break; }
        }
        if (!track) track = json.hlsSource[0];

        var streams = [];
        var qualMap = track.quality || {};
        for (var qi = 0; qi < qualOrder.length; qi++) {
            var q = qualOrder[qi];
            if (qualMap[q]) {
                var u = qualMap[q].split(' or ')[0].trim();
                if (u.indexOf('//') === 0) u = 'https:' + u;
                streams.push({ quality: q + 'p', url: u });
            }
        }

        var translations = [];
        for (var ti = 0; ti < json.hlsSource.length; ti++) {
            var src = json.hlsSource[ti];
            var qm = src.quality || {};
            var bestUrl = '';
            for (var qi2 = 0; qi2 < qualOrder.length; qi2++) {
                if (qm[qualOrder[qi2]]) {
                    bestUrl = qm[qualOrder[qi2]].split(' or ')[0].trim();
                    if (bestUrl.indexOf('//') === 0) bestUrl = 'https:' + bestUrl;
                    break;
                }
            }
            // Parse subtitles per track
            var trackSubs = [];
            var subSrc = src.subtitles || src.subtitle || null;
            if (subSrc) {
                if (typeof subSrc === 'string') {
                    try { subSrc = JSON.parse(subSrc); } catch(e) { subSrc = null; }
                }
                if (subSrc && typeof subSrc === 'object') {
                    for (var lang in subSrc) {
                        if (!subSrc.hasOwnProperty(lang)) continue;
                        var su = subSrc[lang];
                        if (!su) continue;
                        if (su.indexOf('//') === 0) su = 'https:' + su;
                        trackSubs.push({ label: lang, url: su });
                    }
                }
            }
            if (bestUrl) translations.push({ title: src.label || ('Перевод ' + (ti+1)), url: bestUrl, quality: qm, subtitles: trackSubs });
        }

        // Global subtitles (fallback)
        var globalSubs = [];
        var gSubSrc = json.subtitles || json.subtitle || null;
        if (gSubSrc) {
            if (typeof gSubSrc === 'string') { try { gSubSrc = JSON.parse(gSubSrc); } catch(e) { gSubSrc = null; } }
            if (gSubSrc && typeof gSubSrc === 'object') {
                for (var gl in gSubSrc) {
                    if (!gSubSrc.hasOwnProperty(gl)) continue;
                    var gu = gSubSrc[gl];
                    if (!gu) continue;
                    if (gu.indexOf('//') === 0) gu = 'https:' + gu;
                    globalSubs.push({ label: gl, url: gu });
                }
            }
        }

        callback(null, streams, translations, globalSubs);
    }

    // --- ALLOHA SERIES FLOW ------------------------------------------------------

    var allohaPlayEpisode = function(fileId, partnerToken, nk, playerUrl, card, seasonNum, episodeNum, voiceKey, tokenMovie) {
        notify('Alloha: загрузка S' + seasonNum + 'E' + episodeNum + '...');
        allohaGetBnsiStreams(fileId, partnerToken, nk, playerUrl, function(err, streams, translations, globalSubs) {
            if (err || !streams || !streams.length) {
                notify('Alloha: ошибка (' + (err ? err.message : 'нет данных') + ')');
                return;
            }
            var title = (card.title || card.name || '') + ' S' + seasonNum + 'E' + episodeNum;
            var playCard = {
                id: card.id,
                title: title,
                name: title,
                original_name: card.original_name || card.original_title || '',
                poster_path: card.poster_path || '',
                source: card.source || 'tmdb',
                season: parseInt(seasonNum),
                episode: parseInt(episodeNum),
                balanser_name: 'Alloha'
            };

            var doPlay = function(streamList, subtitles) {
                if (card.id) {
                    Lampa.Favorite.add('history', playCard, 100);
                    window._online_current_timeline = Lampa.Timeline.view('alloha_' + card.id + '_s' + seasonNum + '_e' + episodeNum);
                    window._online_current_timeline.card = playCard;
                }
                // If no subtitles from Alloha ? try to get them from HDRezka
                if (subtitles && subtitles.length) {
                    playStream(streamList, playCard, null, null, subtitles);
                } else {
                    fetchHDRezkaSubtitles(card, seasonNum, episodeNum, function(hdSubs) {
                        playStream(streamList, playCard, null, null, hdSubs);
                    });
                }
            };

            // ???? ??не задан?? ? ??????не задан? ????????????? ?? voiceKey
            if (translations && translations.length > 0) {
                var chosen = null;
                // ???? ?? voiceKey (translation key)
                if (voiceKey) {
                    for (var i = 0; i < translations.length; i++) {
                        if (String(translations[i].id) === String(voiceKey) ||
                            (translations[i].translation && translations[i].translation === voiceKey)) {
                            chosen = translations[i];
                            break;
                        }
                    }
                }
                // ???? не задан ? ??не задан?
                if (!chosen) chosen = translations[0];

                // ???????? ?не задан?не задан??не задан?? ??? playlist
                var qualOrder = ['2160','1440','1080','720','480','360'];
                var tStreams = [];
                for (var qi = 0; qi < qualOrder.length; qi++) {
                    var q = qualOrder[qi];
                    if (chosen.quality && chosen.quality[q]) {
                        var u = chosen.quality[q].split(' or ')[0].trim();
                        if (u.indexOf('//') === 0) u = 'https:' + u;
                        tStreams.push({ quality: q + 'p', url: u });
                    }
                }
                doPlay(tStreams.length ? tStreams : streams, chosen.subtitles && chosen.subtitles.length ? chosen.subtitles : globalSubs);
            } else {
                doPlay(streams, globalSubs);
            }
        }, tokenMovie);
    }

    var allohaOpenSeries = function(pi, card) {
            var fl = pi.file_list;
        var partnerToken = getAllohaToken();
        var nk = pi.nk;
        var playerUrl = pi.player_url;

        // Build translation list from all seasons/episodes
        var translations = {};
        var seasons = Object.keys(fl.all).sort(function(a,b){ return parseInt(a)-parseInt(b); });
        seasons.forEach(function(s) {
            var eps = fl.all[s];
            Object.keys(eps).forEach(function(e) {
                var epData = eps[e];
                Object.keys(epData).forEach(function(tKey) {
                    var t = epData[tKey];
                    if (!translations[tKey]) translations[tKey] = t.translation;
                });
            });
        });

        var translationItems = Object.keys(translations).map(function(k) {
            return { title: translations[k], key: k };
        });

        // Pick translation
        var doPickTranslation = function(onDone) {
            if (translationItems.length <= 1) { onDone(translationItems[0] ? translationItems[0].key : null); return; }
            showSelect('Перевод (Alloha)', translationItems, function(item) { onDone(item.key); });
        };

        // Pick season
        var doPickSeason = function(tKey, onDone) {
            // Filter seasons that have this translation
            var availSeasons = seasons.filter(function(s) {
                return Object.keys(fl.all[s]).some(function(e) { return fl.all[s][e][tKey]; });
            });
            if (availSeasons.length === 1) { onDone(tKey, availSeasons[0]); return; }
            showSelect('Сезон', availSeasons.map(function(s) { return { title: 'Сезон ' + s, season: s }; }), function(item) { onDone(tKey, item.season); });
        };

        // Pick episode
        var doPickEpisode = function(tKey, season, onDone) {
            var eps = fl.all[season];
            var availEps = Object.keys(eps).filter(function(e) { return eps[e][tKey]; }).sort(function(a,b){ return parseInt(a)-parseInt(b); });
            if (availEps.length === 1) { onDone(tKey, season, availEps[0]); return; }
            showSelect('Сезон', availEps.map(function(e) { return { title: 'Серия ' + e, episode: e }; }), function(item) { onDone(tKey, season, item.episode); });
        };

        doPickTranslation(function(tKey) {
            doPickSeason(tKey, function(tKey2, season) {
                doPickEpisode(tKey2, season, function(tKey3, season2, episode) {
                    var epEntry = fl.all[season2][episode][tKey3];
                    if (!epEntry) { notify('Alloha: поиск не дал результатов'); return; }
                    var fileId = String(epEntry.id);
                    allohaPlayEpisode(fileId, partnerToken, nk, playerUrl, card, season2, episode);
                });
            });
        });
    }




    // ============================================================
    // SOURCE REGISTRY
    // ============================================================
    var GLOBAL_SOURCE_KEY = 'online_last_source';

    // Registry: { id: { name, component, open } }
    var _sourceRegistry = {};
    var _sourceOrder    = [];   // insertion order

    /**
     * Register a source.
     * @param {string} id         - unique key, e.g. 'hdrezka'
     * @param {string} name       - display name, e.g. 'HDRezka'
     * @param {Function} component - Lampa component constructor
     * @param {Function} open      - function(card) that opens the source
     */
    /**
     * Register a source.
     * New API: registerSource(id, name, { load: function(card, callback) })
     * Legacy API: registerSource(id, name, ComponentClass, openFn) — still supported
     * 
     * load(card, callback) — callback(error, items)
     * items = [{ title, quality, info, poster, onPlay, onLongPress }]
     */
    function registerSource(id, name, componentOrObj, open) {
        var entry = { id: id, name: name };
        if (componentOrObj && typeof componentOrObj.load === 'function') {
            // New API: source object with load()
            entry.load = componentOrObj.load;
        } else {
            // Legacy API: Lampa component + open function
            entry.component = componentOrObj;
            entry.open = open;
            if (componentOrObj) Lampa.Component.add(id + '_online', componentOrObj);
        }
        _sourceRegistry[id] = entry;
        if (_sourceOrder.indexOf(id) === -1) _sourceOrder.push(id);
    }

    /** Returns [{id, name}] in registration order */
    function getSourceList() {
        return _sourceOrder.map(function(id) { return { id: id, name: _sourceRegistry[id].name }; });
    }

    /** Open the currently selected source for a card */
    function openSource(card) {
        var src = Lampa.Storage.get(GLOBAL_SOURCE_KEY, _sourceOrder[0] || 'cdnvideohub');
        var entry = _sourceRegistry[src] || _sourceRegistry[_sourceOrder[0]];
        console.log('[Online] openSource src=' + src + ' registry_size=' + _sourceOrder.length + ' entry=' + (entry ? (entry.load ? 'new-api' : 'legacy') : 'null'));
        if (!entry) return;

        var doOpen = function() {
            if (entry.load) {
                Lampa.Activity.push({
                    url: '', title: card.title || card.name || 'Онлайн',
                    component: 'online_unified', card: card, movie: card
                });
            } else if (entry.open) {
                entry.open(card);
            }
        };

        // Check if we have a last watched episode to continue
        var isSerial = !!(card.number_of_seasons || card.media_type === 'tv' || card.first_air_date);
        var watchKey = 'online_last_watch_' + card.id;
        var saved = Lampa.Storage.get(watchKey, '');
        var lastData = null;
        try {
            if (saved && typeof saved === 'string') lastData = JSON.parse(saved);
            else if (saved && typeof saved === 'object') lastData = saved;
        } catch(e) {}

        if (lastData && lastData.source && _sourceRegistry[lastData.source]) {
            // Есть история — показываем попап
            checkContinueWatching(card, function(data) {
                // Продолжить: открываем источник с сохранённым сезоном/голосом + автоплей
                Lampa.Storage.set(GLOBAL_SOURCE_KEY, data.source || src);
                data._autoPlay = true; // флаг для автозапуска плеера
                // Устанавливаем resume позицию — патч Lampa.Player.play подхватит её
                var resumeTl = data.tlKey ? Lampa.Timeline.view(data.tlKey) : null;
                if (resumeTl && resumeTl.time > 30 && resumeTl.percent < 95) {
                    window._online_resume_time = resumeTl.time;
                    console.log('[Resume] set _online_resume_time=' + resumeTl.time + ' tlKey=' + data.tlKey);
                } else {
                    console.log('[Resume] no resume: resumeTl=' + JSON.stringify(resumeTl ? {time: resumeTl.time, percent: resumeTl.percent} : null) + ' tlKey=' + data.tlKey);
                }
                Lampa.Activity.push({
                    url: '', title: card.title || card.name || 'Онлайн',
                    component: 'online_unified', card: card, movie: card,
                    continueData: data
                });
            }, function() {
                // Выбрать серию/озвучку — открываем на последнем источнике и сезоне без автоплея
                if (lastData && lastData.source && _sourceRegistry[lastData.source] && _sourceRegistry[lastData.source].load) {
                    Lampa.Storage.set(GLOBAL_SOURCE_KEY, lastData.source);
                    Lampa.Activity.push({
                        url: '', title: card.title || card.name || 'Онлайн',
                        component: 'online_unified', card: card, movie: card,
                        continueData: {
                            source:  lastData.source,
                            season:  lastData.season,
                            voice:   lastData.voice,
                            episode: null
                        }
                    });
                } else {
                    doOpen();
                }
            });
        } else {
            doOpen();
        }
    }

    /** Build _sources array for filter UI — used by each component */
    function buildSourcesArray() {
        return getSourceList();
    }

    /** Switch source — uses Activity.replace() to reload content without page change */
    function switchSource(id, card) {
        Lampa.Storage.set(GLOBAL_SOURCE_KEY, id);
        var entry = _sourceRegistry[id];
        if (!entry) return;
        if (entry.load) {
            // Replace current activity — UI stays, only content reloads
            if (window._onlineUnifiedComponent) {
                window._onlineUnifiedComponent.loadSource(id);
            } else {
                Lampa.Activity.replace({ source: id });
            }
        } else if (entry.open) {
            Lampa.Activity.backward();
            setTimeout(function() { entry.open(card); }, 100);
        }
    }


    // --- SHARED UI UTILITIES (used by all sources) ---

    var initOnlineTemplates = function() {
        if (window._online_templates_added) return;
        window._online_templates_added = true;

        Lampa.Template.add('online_prestige_full', "<div class=\"online-prestige online-prestige--full selector\">\n            <div class=\"online-prestige__img\">\n                <img alt=\"\">\n                <div class=\"online-prestige__loader\"></div>\n            </div>\n            <div class=\"online-prestige__body\">\n                <div class=\"online-prestige__head\">\n                    <div class=\"online-prestige__title\">{title}</div>\n                    <div class=\"online-prestige__time\">{time}</div>\n                </div>\n                <div class=\"online-prestige__timeline\"></div>\n                <div class=\"online-prestige__footer\">\n                    <div class=\"online-prestige__info\">{info}</div>\n                    <div class=\"online-prestige__badges\"><div class=\"online-prestige__quality\">{quality}</div></div>\n                </div>\n            </div>\n        </div>");

        if (!$('#online-prestige-css').length) {
            $('body').append('<style id="online-prestige-css">.online-prestige{position:relative;border-radius:.3em;background-color:rgba(0,0,0,0.3);display:flex;margin:.8em 1em}.online-prestige__body{padding:1.2em;line-height:1.3;flex-grow:1;position:relative;min-width:0}.online-prestige__img{position:relative;width:13em;flex-shrink:0;min-height:8.2em}.online-prestige__img>img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:.3em;opacity:0;transition:opacity .3s}.online-prestige__img--loaded>img{opacity:1}.online-prestige__episode-number{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:2em}.online-prestige__loader{position:absolute;top:50%;left:50%;width:2em;height:2em;margin-left:-1em;margin-top:-1em;background:url(./img/loader.svg) no-repeat center center;background-size:contain}.online-prestige__head,.online-prestige__footer{display:flex;justify-content:space-between;align-items:center}.online-prestige__timeline{margin:.8em 0}.online-prestige__timeline>.time-line{display:block!important}.online-prestige__title{font-size:1.7em;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical}.online-prestige__time{padding-left:2em;flex-shrink:0}.online-prestige__info{display:flex;align-items:center;min-width:0;overflow:hidden}.online-prestige__badges{display:flex;align-items:center;gap:.5em;padding-left:1em;flex-shrink:0;white-space:nowrap}.online-prestige__quality{margin-left:.5em}.online-prestige__badge{font-size:.75em;padding:.15em .45em;border-radius:.25em;font-weight:600;letter-spacing:.03em;margin-left:.5em}.online-prestige__badge--sub{background:rgba(255,200,0,0.18);color:#ffc800;border:1px solid rgba(255,200,0,0.35)}.online-prestige__badge--audio{background:rgba(100,180,255,0.15);color:#64b4ff;border:1px solid rgba(100,180,255,0.3)}.online-prestige.focus::after{content:"";position:absolute;top:-.4em;left:-.4em;right:-.4em;bottom:-.4em;border-radius:.6em;border:solid .3em #fff;z-index:1;pointer-events:none}.online-prestige+.online-prestige{margin-top:0}.scroll__body{overflow:visible!important}.scroll__content{overflow:visible!important}.explorer__files-head .selector{pointer-events:auto!important}.torrent-filter .selector{pointer-events:auto!important}</style>');
        }
    }

    var applyExpandCSS = function(enabled) {
        // Normalize: accept boolean true, string 'true', or truthy
        enabled = (enabled === true || enabled === 'true');
        // Ensure style tag exists
        if (!$('#hdrezka-expand-btns').length) {
            $('body').append('<style id="hdrezka-expand-btns"></style>');
        }
        var style = document.getElementById('hdrezka-expand-btns');
        if (enabled) {
            style.textContent =
                '.full-start-new__buttons .full-start__button:not(.focus) span { display: inline !important; }';
        } else {
            style.textContent =
                '.full-start-new__buttons .full-start__button:not(.focus) span { display: none !important; }';
        }
    };

    var applyPlayerBlurCSS = function(enabled) {
        enabled = !(enabled === false || enabled === 'false');
        if (!$('#hdrezka-player-blur').length) {
            $('body').append('<style id="hdrezka-player-blur"></style>');
        }
        var style = document.getElementById('hdrezka-player-blur');
        if (!enabled) {
            // Повністю прибираємо підложку під панелями плеєра
            style.textContent = [
                '.player-panel,',
                '.player-info,',
                '.player-footer {',
                '  -webkit-backdrop-filter: none !important;',
                '  backdrop-filter: none !important;',
                '  background: transparent !important;',
                '  background-color: transparent !important;',
                '  box-shadow: none !important;',
                '  border-radius: 0 !important;',
                '}'
            ].join('\n');
        } else {
            style.textContent = '';
        }
    };

    // Export registry API to global scope so source files can call registerSource()
    window.OnlinePlugin = {
        register: registerSource,
        getSources: getSourceList,
        buildSourcesArray: buildSourcesArray,
        switchSource: switchSource,
        openSource: function(card) { openSource(card); }
    };
    // Shortcuts used directly in source files
    window.registerSource    = registerSource;
    window.buildSourcesArray = buildSourcesArray;
    window.switchSource      = switchSource;
    window.GLOBAL_SOURCE_KEY = GLOBAL_SOURCE_KEY;

    // Core utilities needed by source files
    window.initOnlineTemplates  = initOnlineTemplates;
    window.applyExpandCSS       = applyExpandCSS;
    window.notify               = notify;

    // ========== ПАТЧ ДЛЯ СТАТУСОВ СЕРИАЛОВ ==========
    setTimeout(function() {
    (function() {
        if (window._serial_status_patch_applied) return;
        window._serial_status_patch_applied = true;
        
        console.log('[Serial Status] Инициализация патча статусов');
        
        // Кэш для статусов сериалов
        var _serialStatusCache = {};
        var _serialStatusPending = {};
        
        // Функция для запроса статуса сериала из TMDB
        function fetchSerialStatus(tvId, callback) {
            // Проверяем кэш
            if (_serialStatusCache[tvId]) {
                callback(_serialStatusCache[tvId]);
                return;
            }
            
            // Если запрос уже в процессе - добавляем callback в очередь
            if (_serialStatusPending[tvId]) {
                _serialStatusPending[tvId].push(callback);
                return;
            }
            
            // Создаем очередь для этого ID
            _serialStatusPending[tvId] = [callback];
            
            var apiUrl = 'tv/' + tvId + '?api_key=' + Lampa.TMDB.key() + '&language=' + Lampa.Storage.get('language', 'ru');
            var rq = new Lampa.Reguest();
            rq.timeout(10000);
            rq.silent(Lampa.TMDB.api(apiUrl), function(resp) {
                var result = null;
                if (resp && resp.status) {
                    result = {
                        status: resp.status,
                        last_episode_to_air: resp.last_episode_to_air || null,
                        next_episode_to_air: resp.next_episode_to_air || null,
                        seasons: resp.seasons || []
                    };
                    // Сохраняем в кэш
                    _serialStatusCache[tvId] = result;
                }
                
                // Вызываем все ожидающие callbacks
                var callbacks = _serialStatusPending[tvId] || [];
                delete _serialStatusPending[tvId];
                callbacks.forEach(function(cb) {
                    try { cb(result); } catch(e) {}
                });
            }, function() {
                // При ошибке тоже вызываем callbacks
                var callbacks = _serialStatusPending[tvId] || [];
                delete _serialStatusPending[tvId];
                callbacks.forEach(function(cb) {
                    try { cb(null); } catch(e) {}
                });
            });
        }
        
        // Функция для добавления плашки статуса
        function addSerialStatusBadge(viewElement, data) {
            var $view = $(viewElement);
            if ($view.find('.online-serial-status').length) return; // Уже есть
            
            var statusText = '';
            var statusClass = '';
            
            if (!data.status) return;
            
            var status = data.status.toLowerCase();
            
            // Завершенные/отмененные сериалы
            if (status === 'ended' || status === 'canceled') {
                statusText = 'Завершён';
                statusClass = 'status-ended';
            }
            // Продолжающиеся сериалы
            else if (status === 'returning series' || status === 'on_the_air') {
                if (data.last_episode_to_air && data.last_episode_to_air.season_number && data.last_episode_to_air.episode_number) {
                    var s = data.last_episode_to_air.season_number;
                    var e = data.last_episode_to_air.episode_number;
                    
                    // Проверяем вышел ли уже следующий эпизод
                    if (data.next_episode_to_air && data.next_episode_to_air.air_date && data.next_episode_to_air.episode_number) {
                        var nextAirDate = new Date(data.next_episode_to_air.air_date);
                        if (nextAirDate <= new Date()) {
                            e = data.next_episode_to_air.episode_number;
                        }
                    }
                    
                    statusText = 'S' + s + '/E' + e;
                    statusClass = 'status-ongoing';
                }
            }
            
            // Создаем плашку если есть текст
            if (statusText) {
                var badge = document.createElement('div');
                badge.className = 'online-serial-status ' + statusClass;
                badge.innerText = statusText;
                viewElement.appendChild(badge);
            }
        }

        // Принудительно включаем отметки качества и эпизодов
        setTimeout(function() {
            var settings = Lampa.Storage.get('settings', {});
            var needSave = false;
            
            if (settings.card_quality === undefined) {
                settings.card_quality = true;
                needSave = true;
            }
            if (settings.card_episodes === undefined) {
                settings.card_episodes = true;
                needSave = true;
            }
            
            if (needSave) {
                Lampa.Storage.set('settings', settings);
            }
        }, 1000);

        // Функция обработки статуса для одной карточки
        function processCardForStatus(cardElement) {
            try {
                var $card = $(cardElement);
                var $view = $card.find('.card__view');
                if (!$view.length) return;
                
                // Проверяем что еще не обработали статус
                if ($view.attr('data-status-processed')) return;
                
                // Проверяем что статус еще не добавлен (может быть добавлен синхронно в app.js)
                if ($view.find('.online-serial-status').length) {
                    $view.attr('data-status-processed', '1');
                    return;
                }
                
                $view.attr('data-status-processed', '1');
                
                // Получаем данные карточки
                var data = cardElement.card_data;
                if (!data) return;
                
                // Только для сериалов
                var isSerial = !!(data.number_of_seasons || data.first_air_date || data.original_name);
                if (!isSerial) return;
                
                // Если данные УЖЕ ЕСТЬ - они были добавлены синхронно в app.js, пропускаем
                if (data.last_episode_to_air && data.last_episode_to_air.season_number) return;
                
                // Добавляем плашку статуса (асинхронно, только если данных нет)
                if (Lampa.Storage.field('online_serial_status_badge')) {
                    scheduleStatusLoad(cardElement, data, $view[0]);
                }
                
            } catch(e) {
                // Тихо игнорируем ошибки
            }
        }
        
        // Функция для обработки всех карточек
        function processAllCardsForStatus() {
            var cards = document.querySelectorAll('.card');
            for (var i = 0; i < cards.length; i++) {
                var $view = $(cards[i]).find('.card__view');
                if (!$view.attr('data-status-processed')) {
                    processCardForStatus(cards[i]);
                }
            }
        }
        
        // Запускаем обработку статусов при загрузке
        setTimeout(function() {
            processAllCardsForStatus();
        }, 3000);
        
        // Обрабатываем статусы при смене активности
        if (Lampa.Listener) {
            Lampa.Listener.follow('activity', function(e) {
                if (e.type === 'start') {
                    setTimeout(function() {
                        processAllCardsForStatus();
                    }, 1000);
                }
            });
        }
        
        // Периодическая проверка новых карточек (только для статусов)
        setInterval(function() {
            processAllCardsForStatus();
        }, 5000); // Проверяем каждые 5 секунд
        
        // Очередь для загрузки статусов сериалов (только для них нужна оптимизация)
        var _statusQueue = [];
        var _statusTimer = null;
        
        function scheduleStatusLoad(cardElement, data, viewElement) {
            _statusQueue.push({ card: cardElement, data: data, view: viewElement });
            
            // Обрабатываем статусы пачками с задержкой
            if (_statusTimer) clearTimeout(_statusTimer);
            _statusTimer = setTimeout(function() {
                var queue = _statusQueue.slice();
                _statusQueue = [];
                
                // Обрабатываем по 3 запроса одновременно
                var batchSize = 3;
                var delay = 0;
                for (var i = 0; i < queue.length; i += batchSize) {
                    (function(batch) {
                        setTimeout(function() {
                            batch.forEach(function(item) {
                                try { loadSerialStatus(item.card, item.data, item.view); } catch(e) {}
                            });
                        }, delay);
                    })(queue.slice(i, i + batchSize));
                    delay += 200; // 200мс между пачками
                }
            }, 150);
        }
        
        function loadSerialStatus(cardElement, data, viewElement) {
            var $view = $(viewElement);
            if ($view.find('.online-serial-status').length) return;
            
            // Если есть полные данные - показываем сразу
            if (data.last_episode_to_air && data.last_episode_to_air.season_number) {
                addSerialStatusBadge(viewElement, data);
            } else if (data.id) {
                // Запрашиваем данные из TMDB с кэшированием
                fetchSerialStatus(data.id, function(statusData) {
                    if (statusData) {
                        data.status = statusData.status;
                        data.last_episode_to_air = statusData.last_episode_to_air;
                        data.next_episode_to_air = statusData.next_episode_to_air;
                        data.seasons = statusData.seasons;
                        addSerialStatusBadge(viewElement, data);
                    }
                });
            }
        }
        
        // CSS для цветов плашек (используем стандартные стили Lampa для .card__type)
        if (!$('#online-card-type-css').length) {
            $('head').append(
                '<style id="online-card-type-css">' +
                '.card__type.badge-movie { background: rgba(33, 150, 243, 0.9) !important; color: #fff !important; }' +
                '.card__type.badge-serial { background: rgba(227, 30, 36, 0.9) !important; color: #fff !important; }' +
                '.card__type.badge-cartoon { background: rgba(255, 152, 0, 0.9) !important; color: #fff !important; }' +
                '.card__type.badge-anime { background: rgba(156, 39, 176, 0.9) !important; color: #fff !important; }' +
                // Плашки статуса сериалов
                '.online-serial-status { position: absolute; top: 3.5em; left: -0.8em; padding: 0.4em 0.6em; font-size: 0.8em; font-weight: bold; border-radius: 0.3em; z-index: 3; pointer-events: none; color: #000; }' +
                '.online-serial-status.status-ongoing { background: rgba(87, 245, 255, 0.95); }' + // Голубой для продолжающихся
                '.online-serial-status.status-ended { background: rgba(255, 152, 0, 0.95); }' + // Оранжевый для завершенных
                '</style>'
            );
        }
    })();
    }, 3000); // конец setTimeout для card patches

    /**
     * resolveQualityLabel(width) — определяет метку качества по ширине кадра.
     * Используется всеми источниками для единообразного отображения качества.
     * @param {number} width — ширина кадра в пикселях
     * @returns {string} — например '4K', '1080p', '720p' и т.д.
     */
    window.resolveQualityLabel = function(width) {
        width = parseInt(width, 10) || 0;
        if (width >= 3840) return '4K';
        if (width >= 2560) return '1440p';
        if (width >= 1920) return '1080p';
        if (width >= 1280) return '720p';
        if (width >= 854)  return '480p';
        if (width >= 640)  return '360p';
        if (width >= 426)  return '240p';
        if (width > 0)     return width + 'p';
        return '';
    };

    /**
     * resolveQualityFromM3U8(m3u8Text) — парсит master.m3u8 и возвращает
     * метку максимального качества по ширине кадра.
     * @param {string} m3u8Text — текст master playlist
     * @returns {string} — метка качества или ''
     */
    window.resolveQualityFromM3U8 = function(m3u8Text) {
        if (!m3u8Text) return '';
        var maxWidth = 0;
        var lines = m3u8Text.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
            var rMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
            if (rMatch) {
                var w = parseInt(rMatch[1], 10);
                if (w > maxWidth) maxWidth = w;
            }
        }
        return window.resolveQualityLabel(maxWidth);
    };

    /**
     * resolveMaxQualityFromList(list) — определяет максимальное качество
     * из массива строк или объектов с полем quality/label.
     * Поддерживает форматы: '1080p', '1080', '4K', '2160p', '2160'.
     * @param {Array} list — массив строк или {quality: string}
     * @returns {string} — метка максимального качества или ''
     */
    window.resolveMaxQualityFromList = function(list) {
        if (!list || !list.length) return '';
        var order = ['4K', '2160p', '1440p', '1080p', '720p', '480p', '360p', '240p'];
        var normalize = function(q) {
            q = String(q || '').trim();
            if (/^4k$/i.test(q) || q === '2160' || q === '2160p') return '4K';
            if (q === '1440' || q === '1440p') return '1440p';
            if (q === '1080' || q === '1080p') return '1080p';
            if (q === '720'  || q === '720p')  return '720p';
            if (q === '480'  || q === '480p')  return '480p';
            if (q === '360'  || q === '360p')  return '360p';
            if (q === '240'  || q === '240p')  return '240p';
            var n = parseInt(q, 10);
            if (n >= 2160) return '4K';
            if (n >= 1440) return '1440p';
            if (n >= 1080) return '1080p';
            if (n >= 720)  return '720p';
            if (n >= 480)  return '480p';
            if (n >= 360)  return '360p';
            if (n >= 240)  return '240p';
            return q;
        };
        var best = '';
        list.forEach(function(item) {
            var q = normalize(typeof item === 'string' ? item : (item.quality || item.label || ''));
            if (!best) { best = q; return; }
            var bi = order.indexOf(best), qi = order.indexOf(q);
            if (qi >= 0 && (bi < 0 || qi < bi)) best = q;
        });
        return best;
    };

    /**
     * sortItemsByQuality(items) — сортирует массив items по полю quality
     * от максимального к минимальному. Items без quality идут в конец.
     * @param {Array} items
     * @returns {Array} — новый отсортированный массив
     */
    window.sortItemsByQuality = function(items) {
        var order = ['4K', '2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p'];
        var rank = function(q) {
            q = String(q || '').replace(/\s.*$/, ''); // берём только первое слово ("1080p SUB" → "1080p")
            var i = order.indexOf(q);
            return i >= 0 ? i : order.length;
        };
        return items.slice().sort(function(a, b) { return rank(a.quality) - rank(b.quality); });
    };

    /**
     * buildMovieTlKey(card, voiceId) — строит ключ timeline для фильма с учётом озвучки.
     * Используется ядром и источниками для единообразного хранения прогресса.
     * @param {object} card — карточка фильма
     * @param {string} voiceId — идентификатор озвучки (название или id)
     * @returns {string} — хэш-ключ
     */
    window.buildMovieTlKey = function(card, voiceId) {
        var origTitle = card.original_title || card.original_name || card.title || card.name || '';
        var parts = [origTitle];
        if (voiceId) parts.push(String(voiceId));
        return Lampa.Utils.hash(parts.join('|'));
    };
    window.showSelect           = showSelect;
    window.playStream           = playStream;
    window.resolveKpId          = resolveKpId;
    window.CDNVIDEOHUB_PROXY    = CDNVIDEOHUB_PROXY;
    window.VEOVEO_PROXY         = VEOVEO_PROXY;
    window.getProxyUrl          = getProxyUrl;
    window.getCinemarProxyUrl   = getCinemarProxyUrl;
    window.notify               = notify;
    window.showSelect           = showSelect;
    window.playStream           = playStream;
    window.parseSubtitles       = parseSubtitles;
    window.getBaseUrl           = getBaseUrl;
    window.normalizeUrl         = normalizeUrl;
    window.request              = request;
    window.get                  = get;
    window.post                 = post;
    window.parseHtml            = parseHtml;
    window.clearTrash           = clearTrash;
    window.parseStreams          = parseStreams;
    window.cdnStartKeepAlive    = cdnStartKeepAlive;
    window.cdnStopKeepAlive     = cdnStopKeepAlive;
    window.cdnUrl               = cdnUrl;
    window.applyExpandCSS       = applyExpandCSS;
    window.TOKEN_KEYS           = TOKEN_KEYS;
    window.ALLOHA_DEFAULT_TOKEN = ALLOHA_DEFAULT_TOKEN;
    window.ALLOHA_DEFAULT_DOMAIN = ALLOHA_DEFAULT_DOMAIN;
    window.FANCDN_DEFAULT_HOST  = FANCDN_DEFAULT_HOST;
    // Alloha-specific functions needed by alloha.js
    window.getAllohaToken        = getAllohaToken;
    window.getAllohaDomain       = getAllohaDomain;
    window.allohaPlayEpisode     = allohaPlayEpisode;
    window.allohaGetBnsiStreams  = allohaGetBnsiStreams;
    window.allohaDetectBundleUrls = allohaDetectBundleUrls;
    window.kinokradSearch        = kinokradSearch;
    window.fetchHDRezkaSubtitles = fetchHDRezkaSubtitles;
    window.allohaOpenSeries      = allohaOpenSeries;
    window.STORAGE_KEY          = STORAGE_KEY;
    window.MIRRORS              = MIRRORS;
    window.PROXY_SERVERS        = PROXY_SERVERS;
    window.PROXY_STORAGE_KEY    = PROXY_STORAGE_KEY;
    window.PROXY_CUSTOM_URL_KEY = PROXY_CUSTOM_URL_KEY;
    window.wakeUpProxies        = wakeUpProxies;
    window.pingProxy            = pingProxy;
    window.addPlayerLongPress   = addPlayerLongPress;
    window.searchByTitle        = searchByTitle;
    window.parseFilmPage        = parseFilmPage;
    window.getEpisodes          = getEpisodes;
    window.getStreamAjax        = getStreamAjax;
    window.getSeasons           = getSeasons;
    window.isSeries             = isSeries;
    window.typeLabel            = typeLabel;
    // ============================================================




    // === SOURCES loaded via <script> tags in index.html ===
    // Sources register themselves via registerSource() when loaded.
    // Lampa.Component.add() is called inside each registerSource() call.

    // --- TIMELINE HELPER ---------------------------------------------------------
    // Call this before Lampa.Player.play() to enable progress tracking
    var playWithTimeline = function(playerItem, card, season, episode, voiceName) {
        var origTitle = card.original_title || card.original_name || card.title || card.name || '';
        var tlKey = season && episode
            ? Lampa.Utils.hash([season, episode, origTitle].join(''))
            : Lampa.Utils.hash(origTitle);

        var tl = Lampa.Timeline.view(tlKey);
        tl.card = { id: card.id, title: card.title || card.name, poster_path: card.poster_path };
        window._online_current_timeline = tl;

        // Save last watched info
        var watchKey = 'online_last_watch_' + card.id;
        Lampa.Storage.set(watchKey, JSON.stringify({
            source: Lampa.Storage.get(GLOBAL_SOURCE_KEY, _sourceOrder[0] || 'cdnvideohub'),
            season: season || null,
            episode: episode || null,
            voice: voiceName || '',
            tlKey: tlKey,
            time: tl.time || 0
        }));

        // Restore position if available
        if (tl.time && tl.time > 10 && tl.percent < 95) {
            playerItem.time = tl.time;
        }

        Lampa.Player.play(playerItem);
        Lampa.Player.playlist([playerItem]);
    };
    window.playWithTimeline = playWithTimeline;

    // --- CONTINUE WATCHING -------------------------------------------------------
    // Called from openSource — shows "Continue?" dialog if last watch exists
    var checkContinueWatching = function(card, onContinue, onChoose) {
        var watchKey = 'online_last_watch_' + card.id;
        var saved = Lampa.Storage.get(watchKey, '');
        if (!saved) { onChoose(); return; }

        var data;
        try {
            if (typeof saved === 'string') data = JSON.parse(saved);
            else if (typeof saved === 'object') data = saved;
        } catch(e) { onChoose(); return; }
        if (!data || !data.source) { onChoose(); return; }

        var sourceName = (_sourceRegistry[data.source] || {}).name || data.source;
        // Читаем актуальное время из Timeline (обновляется в реальном времени во время просмотра)
        var tl = data.tlKey ? Lampa.Timeline.view(data.tlKey) : null;
        // Синхронизируем time из tl если он актуальнее сохранённого
        if (tl && tl.time > 0) data.time = tl.time;
        console.log('[ContinueWatch] tlKey=' + data.tlKey + ' tl.time=' + (tl ? tl.time : 'null') + ' data.time=' + data.time);
        var isSerial = !!(card.number_of_seasons || card.media_type === 'tv' || card.first_air_date);

        // Строим постер: для сериала пробуем still_path эпизода, иначе backdrop/poster
        var posterUrl = '';
        var episodeTitle = '';

        var showPopup = function() {
            // Убираем старый попап если есть
            $('#online-continue-popup').remove();

            var timeStr = (tl && tl.time > 0) ? Lampa.Utils.secondsToTime(tl.time) : '';
            var parts = [sourceName];
            if (data.voice) parts.push(data.voice);
            if (data.season) parts.push('Сезон ' + data.season);
            if (data.episode) parts.push('Серия ' + data.episode);
            var subTitle = parts.join(' \u2022 ');

            var tlHtml = '';
            if (tl) {
                var tlEl = Lampa.Timeline.render(tl);
                var tmp = $('<div>').append(tlEl);
                tlHtml = tmp.html();
            }

            // Добавляем CSS для кнопок попапа (один раз)
            if (!$('#online-continue-css').length) {
                $('body').append('<style id="online-continue-css">' +
                    '.online-continue__btn{' +
                        'position:relative;padding:.8em 1em;border-radius:.5em;' +
                        'cursor:pointer;font-size:1.1em;background:rgba(255,255,255,0.08);' +
                        'color:#fff;transition:background .15s,color .15s;text-align:center;' +
                    '}' +
                    '.online-continue__btn.focus{' +
                        'background:#fff;color:#000;' +
                    '}' +
                '</style>');
            }

            var popup = $([
                '<div id="online-continue-popup" style="',
                    'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;',
                    'display:flex;align-items:center;justify-content:center;',
                    'background:rgba(0,0,0,0.6);box-sizing:border-box',
                '">',
                    '<div class="online-continue__card" style="',
                        'background:rgba(18,18,18,0.98);border-radius:.7em;',
                        'width:44em;max-width:94vw;overflow:hidden;',
                        'box-shadow:0 .8em 4em rgba(0,0,0,0.8)',
                    '">',
                        '<div class="online-continue__img" style="',
                            'position:relative;width:100%;padding-top:56.25%;',
                            'background:#0d0d0d;overflow:hidden',
                        '">',
                            posterUrl
                                ? '<img src="' + posterUrl + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s" onload="this.style.opacity=1" onerror="this.style.display=\'none\'">'
                                : '',
                            '<div style="position:absolute;bottom:0;left:0;right:0;padding:.9em 1.2em;background:linear-gradient(transparent,rgba(0,0,0,0.92))">',
                                '<div style="font-size:1.5em;font-weight:700;margin-bottom:.3em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (episodeTitle || (card.title || card.name || '')) + '</div>',
                                '<div style="font-size:1em;opacity:.7">' + subTitle + (timeStr ? ' \u2022 ' + timeStr : '') + '</div>',
                            '</div>',
                        '</div>',
                        tl ? '<div style="padding:.55em 1.2em 0">' + tlHtml + '</div>' : '',
                        '<div style="display:flex;flex-direction:row;gap:.6em;padding:1em 1.2em 1.2em">',
                            '<div class="online-continue__btn online-continue__btn--play selector focus" style="flex:1">\u25ba\u00a0 Продолжить' + (timeStr ? ' \u0441 ' + timeStr : '') + '</div>',
                            '<div class="online-continue__btn online-continue__btn--choose selector" style="flex:1">\u2630\u00a0 Сменить источник</div>',
                        '</div>',
                    '</div>',
                '</div>'
            ].join(''));

            $('body').append(popup);

            var btns = popup.find('.online-continue__btn');
            var focusIdx = 0;

            var setFocus = function(i) {
                focusIdx = i;
                btns.removeClass('focus');
                btns.eq(i).addClass('focus');
            };
            setFocus(0);

            var prevController = Lampa.Controller.enabled().name;

            var close = function() {
                popup.remove();
                try { Lampa.Controller.toggle(prevController); } catch(e) {}
            };

            Lampa.Controller.add('online_continue', {
                toggle: function() {},
                up:    function() {},
                down:  function() {},
                left:  function() { setFocus(Math.max(0, focusIdx - 1)); },
                right: function() { setFocus(Math.min(btns.length - 1, focusIdx + 1)); },
                enter: function() {
                    if (focusIdx === 0) { close(); onContinue(data); }
                    else               { close(); onChoose(); }
                },
                back:  function() { close(); }
            });
            Lampa.Controller.toggle('online_continue');

            // Keyboard Escape
            var onKeyDown = function(e) {
                if (e.keyCode === 27) { // Escape
                    $(document).off('keydown', onKeyDown);
                    close();
                }
            };
            $(document).on('keydown', onKeyDown);

            // Клик мышью
            btns.eq(0).on('click', function() { close(); onContinue(data); });
            btns.eq(1).on('click', function() { close(); onChoose(); });
            popup.on('click', function(e) {
                if ($(e.target).is(popup)) {
                    $(document).off('keydown', onKeyDown);
                    close();
                }
            });

            // hover:focus / hover:enter для пульта
            btns.each(function(i) {
                $(this).on('hover:focus', function() { setFocus(i); });
                $(this).on('mouseover',   function() { setFocus(i); });
                $(this).on('hover:enter', function() {
                    $(document).off('keydown', onKeyDown);
                    if (i === 0) { close(); onContinue(data); }
                    else         { close(); onChoose(); }
                });
            });
        };

        // Для сериала — пробуем получить still_path эпизода из TMDB
        if (isSerial && data.season && data.episode && card.id) {
            var lang = Lampa.Storage.field('tmdb_lang') || 'ru';
            var epUrl = Lampa.TMDB.api('tv/' + card.id + '/season/' + data.season + '/episode/' + data.episode + '?api_key=' + Lampa.TMDB.key() + '&language=' + lang);
            $.ajax({ url: epUrl, timeout: 5000 })
                .done(function(epData) {
                    if (epData && epData.still_path) {
                        posterUrl = Lampa.TMDB.image('t/p/w500' + epData.still_path);
                    } else {
                        posterUrl = card.backdrop_path ? Lampa.TMDB.image('t/p/w500' + card.backdrop_path) : '';
                    }
                    episodeTitle = (epData && epData.name) ? epData.name : ('Серия ' + data.episode);
                    showPopup();
                })
                .fail(function() {
                    posterUrl = card.backdrop_path ? Lampa.TMDB.image('t/p/w500' + card.backdrop_path) : '';
                    episodeTitle = 'Серия ' + (data.episode || '');
                    showPopup();
                });
        } else {
            // Фильм — backdrop
            posterUrl = card.backdrop_path
                ? Lampa.TMDB.image('t/p/w500' + card.backdrop_path)
                : (card.poster_path ? Lampa.TMDB.image('t/p/w500' + card.poster_path) : '');
            episodeTitle = card.title || card.name || '';
            showPopup();
        }
    };
    window.checkContinueWatching = checkContinueWatching;

    // --- UNIFIED ONLINE COMPONENT ------------------------------------------------
    // Single component for all sources that use the new load() API.
    // Sources with legacy component/open API still open their own Activity pages.

    function OnlineUnifiedComponent(object) {
        var _this = this;
        var card  = object.card || object.movie || {};
        object.movie = card;
        // Встановлюємо search для кнопки "Уточнити" в Filter
        if (!object.search) object.search = card.title || card.name || '';

        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files  = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);

        initOnlineTemplates();

        var _curSource = Lampa.Storage.get(GLOBAL_SOURCE_KEY, _sourceOrder[0] || 'cdnvideohub');
        var _loading   = false;

        // Register self globally so switchSource() can call loadSource()
        window._onlineUnifiedComponent = _this;

        // ── Source / Season / Voice filter buttons ─────────────────────────────
        var _meta = null; // current season/voice state from source
        var _seasonBtn = null;
        var _voiceBtn  = null;

        var updateSourceFilter = function() {
            var sources = buildSourcesArray().filter(function(s) {
                return _sourceRegistry[s.id] && _sourceRegistry[s.id].load;
            });
            filter.set('sort', sources.map(function(s) {
                return { title: s.name, source: s.id, selected: s.id === _curSource };
            }));
            var curName = (sources.filter(function(s){ return s.id === _curSource; })[0] || {}).name || '';
            filter.chosen('sort', [curName]);
            filter.render().find('.filter--sort span').first().text('Источник');

            // Remove old custom buttons
            if (_seasonBtn) { _seasonBtn.remove(); _seasonBtn = null; }
            if (_voiceBtn)  { _voiceBtn.remove();  _voiceBtn  = null; }

            // Add Season button
            if (_meta && _meta.seasons && _meta.seasons.length > 1) {
                _seasonBtn = $('<div class="simple-button simple-button--filter selector filter--season"><span>Сезон</span><div>' + (_meta.curSeasonName || ('Сезон ' + _meta.curSeason)) + '</div></div>');
                _seasonBtn.on('hover:enter', function() {
                    var enabled = Lampa.Controller.enabled().name;
                    Lampa.Select.show({
                        title: 'Сезон',
                        items: _meta.seasons.map(function(s) {
                            return { title: s.name, season_id: s.id, selected: s.id == _meta.curSeason };
                        }),
                        onBack: function() { Lampa.Controller.toggle(enabled); },
                        onSelect: function(item) {
                            Lampa.Controller.toggle(enabled);
                            _this.loadSource(null, { season: item.season_id });
                        }
                    });
                });
                filter.render().find('.filter--sort').after(_seasonBtn);
            }

            // Add Voice button
            if (_meta && _meta.voices && _meta.voices.length > 1) {
                _voiceBtn = $('<div class="simple-button simple-button--filter selector filter--voice"><span>Озвучка</span><div>' + (_meta.curVoiceName || '') + '</div></div>');
                _voiceBtn.on('hover:enter', function() {
                    var enabled = Lampa.Controller.enabled().name;
                    Lampa.Select.show({
                        title: 'Озвучка',
                        items: _meta.voices.map(function(v) {
                            return { title: v.name, voice_id: v.id, selected: v.id == _meta.curVoice };
                        }),
                        onBack: function() { Lampa.Controller.toggle(enabled); },
                        onSelect: function(item) {
                            Lampa.Controller.toggle(enabled);
                            _this.loadSource(null, { voice: item.voice_id, season: _meta && _meta.curSeason });
                        }
                    });
                });
                var afterEl = _seasonBtn || filter.render().find('.filter--sort');
                afterEl.after(_voiceBtn);
            }

            // Переміщуємо лупу в крайнє праве положення
            var searchBtn = filter.render().find('.filter--search');
            if (searchBtn.length) {
                searchBtn.parent().append(searchBtn);
            }
        };

        // ── Lampa component interface ──────────────────────────────────────────
        this.render  = function(js) { return js ? files.render(true) : files.render(); };
        this.start   = function() {
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(false, scroll.render());
                },
                up:    function() { if (window.Navigator && window.Navigator.canmove('up')) window.Navigator.move('up'); else Lampa.Controller.toggle('head'); },
                down:  function() { if (window.Navigator) window.Navigator.move('down'); },
                left:  function() { if (window.Navigator && window.Navigator.canmove('left')) window.Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
                right: function() { if (window.Navigator && window.Navigator.canmove('right')) window.Navigator.move('right'); },
                back:  function() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };
        this.pause   = function() {};
        this.stop    = function() {};
        this.destroy = function() {
            window._onlineUnifiedComponent = null;
            filter.destroy(); scroll.destroy(); files.destroy();
        };
        this.onSearch = function(val) { if (filter.onSearch) filter.onSearch(val); };

        // ── Load source content ────────────────────────────────────────────────
        var _curOpts = {}; // current season/voice opts

        this.loadSource = function(sourceId, opts) {
            if (sourceId) _curSource = sourceId;
            _meta = null;
            _curOpts = opts || {};
            var entry = _sourceRegistry[_curSource];
            if (!entry || !entry.load) {
                showError('Источник не найден');
                return;
            }

            _loading = true;
            // Skeleton loader — призрачный список карточек с shimmer эффектом
            scroll.clear();
            if (!$('#online-skeleton-css').length) {
                $('body').append('<style id="online-skeleton-css">' +
                    '@keyframes online-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}' +
                    '.online-skeleton__item{display:flex;align-items:center;gap:0;border-radius:.3em;background:rgba(0,0,0,0.3);margin:.8em 1em}' +
                    '.online-skeleton__img{width:13em;min-height:8.2em;border-radius:.3em;flex-shrink:0;background:linear-gradient(90deg,rgba(255,255,255,0.05) 25%,rgba(255,255,255,0.1) 50%,rgba(255,255,255,0.05) 75%);background-size:200% 100%;animation:online-shimmer 1.6s infinite}' +
                    '.online-skeleton__body{flex:1;padding:1.2em;display:flex;flex-direction:column;gap:.5em;min-width:0}' +
                    '.online-skeleton__line{border-radius:.3em;background:linear-gradient(90deg,rgba(255,255,255,0.05) 25%,rgba(255,255,255,0.1) 50%,rgba(255,255,255,0.05) 75%);background-size:200% 100%;animation:online-shimmer 1.6s infinite}' +
                    '.online-skeleton__line--title{height:1.4em;width:55%}' +
                    '.online-skeleton__line--bar{height:.2em;width:100%;margin:.3em 0}' +
                    '.online-skeleton__line--sub{height:.85em;width:38%;opacity:.6}' +
                    '.online-skeleton__line--qual{height:.85em;width:3em;opacity:.5;margin-left:auto}' +
                    '.online-skeleton__footer{display:flex;align-items:center;gap:.5em}' +
                '</style>');
            }
            var skeletonHtml = '';
            for (var si = 0; si < 4; si++) {
                var delay = si * 0.12;
                skeletonHtml += '<div class="online-skeleton__item">' +
                    '<div class="online-skeleton__img" style="animation-delay:' + delay + 's"></div>' +
                    '<div class="online-skeleton__body">' +
                        '<div class="online-skeleton__line online-skeleton__line--title" style="animation-delay:' + delay + 's"></div>' +
                        '<div class="online-skeleton__line online-skeleton__line--bar" style="animation-delay:' + (delay + 0.08) + 's"></div>' +
                        '<div class="online-skeleton__footer">' +
                            '<div class="online-skeleton__line online-skeleton__line--sub" style="animation-delay:' + (delay + 0.16) + 's"></div>' +
                            '<div class="online-skeleton__line online-skeleton__line--qual" style="animation-delay:' + (delay + 0.16) + 's"></div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            }
            scroll.append($('<div>' + skeletonHtml + '</div>'));
            updateSourceFilter();

            // Якщо є уточнений запит — підміняємо назву в карточці
            var cardForLoad = card;
            if (_curOpts.clarify) {
                cardForLoad = Object.assign({}, card, {
                    title: _curOpts.clarify,
                    name:  _curOpts.clarify,
                    original_title: _curOpts.clarify,
                    original_name:  _curOpts.clarify
                });
                // Оновлюємо search в object щоб Filter показував поточний запит
                object.search = _curOpts.clarify;
            } else {
                object.search = card.title || card.name || '';
            }

            entry.load(cardForLoad, function(err, items) {
                _loading = false;
                if (err) {
                    showError(entry.name + ': ' + (err.message || err));
                    _this.activity.toggle();
                    _this.start();
                    return;
                }
                if (!items || !items.length) {
                    showError(entry.name + ': не найдено');
                    _this.activity.toggle();
                    _this.start();
                    return;
                }

                // Build season/voice filter from _meta
                if (items._meta) {
                    _meta = items._meta;
                    updateSourceFilter(); // rebuild filter buttons with season/voice
                }

                // Check if items have episode numbers — load TMDB episode data
                var hasEpisodes = items.some(function(it) {
                    if (it.episode) return true;
                    if (it.title && /(?:Серия|Episode|Ep\.?)\s*\d+/i.test(it.title)) return true;
                    return false;
                });
                var isSerial = !!(card.number_of_seasons || card.media_type === 'tv' || card.first_air_date);

                if (hasEpisodes && isSerial && card.id) {
                    // Find season number from first item
                    var seasonNum = items[0].season || 1;
                    // Try to detect from items if not set
                    for (var si = 0; si < items.length; si++) {
                        if (items[si].season) { seasonNum = items[si].season; break; }
                    }
                    var lang = Lampa.Storage.field('tmdb_lang') || 'ru';
                    var tmdbUrl = Lampa.TMDB.api('tv/' + card.id + '/season/' + seasonNum + '?api_key=' + Lampa.TMDB.key() + '&language=' + lang);
                    $.ajax({ url: tmdbUrl, timeout: 8000 })
                        .done(function(data) {
                            var tmdbEps = {};
                            (data.episodes || []).forEach(function(e) { tmdbEps[e.episode_number] = e; });
                            
                            // Дополняем items сериями из TMDB которых нет в источнике (будущие серии)
                            var maxEpInSource = 0;
                            items.forEach(function(it) {
                                var epNum = it.episode || 0;
                                if (epNum > maxEpInSource) maxEpInSource = epNum;
                            });
                            
                            // Добавляем недостающие серии из TMDB
                            var allEpisodes = Object.keys(tmdbEps).map(Number).sort(function(a,b){return a-b;});
                            allEpisodes.forEach(function(epNum) {
                                var tmdbEp = tmdbEps[epNum];
                                // Проверяем есть ли эта серия в источнике
                                var existsInSource = items.some(function(it) { return (it.episode || 0) === epNum; });
                                if (!existsInSource && tmdbEp.air_date) {
                                    // Проверяем дату выхода
                                    var airDate = new Date(tmdbEp.air_date);
                                    var today = new Date();
                                    airDate.setHours(0, 0, 0, 0);
                                    today.setHours(0, 0, 0, 0);
                                    var daysLeft = Math.ceil((airDate.getTime() - today.getTime()) / 86400000);
                                    
                                    if (daysLeft > 0) {
                                        // Будущая серия — добавляем с расписанием
                                        items.push({
                                            title: tmdbEp.name || ('Серия ' + epNum),
                                            episode: epNum,
                                            season: seasonNum,
                                            quality: '',
                                            info: '',
                                            _isFuture: true,
                                            _daysLeft: daysLeft,
                                            onPlay: null
                                        });
                                    } else if (daysLeft <= 0 && daysLeft > -365) {
                                        // Серия уже вышла (в течение последнего года), но её нет в источнике
                                        // Добавляем как неактивную
                                        items.push({
                                            title: tmdbEp.name || ('Серия ' + epNum),
                                            episode: epNum,
                                            season: seasonNum,
                                            quality: '',
                                            info: '',
                                            _isUnavailable: true,
                                            onPlay: null
                                        });
                                    }
                                }
                            });
                            
                            // Сортируем по номеру серии
                            items.sort(function(a, b) {
                                return (a.episode || 0) - (b.episode || 0);
                            });
                            
                            renderItems(items, tmdbEps);
                        })
                        .fail(function() { renderItems(items, {}); });
                } else {
                    renderItems(items, {});
                }

                if (items._filterItems) {
                    filter.set('filter', items._filterItems);
                    filter.chosen('filter', items._filterItems.map(function(f) { return f.subtitle || ''; }));
                }
            }, _curOpts);
        };

        var renderItems = function(items, tmdbEps) {
            // Создаем плейлист для всего сезона (для автоперехода на следующую серию)
            var createSeasonPlaylist = function(currentItem, allItems) {
                if (!currentItem.season || !currentItem.episode) return [];
                
                var playlist = [];
                var seasonItems = allItems.filter(function(it) {
                    return it.season === currentItem.season && 
                           it.episode && 
                           !it._isFuture && 
                           !it._isUnavailable &&
                           it.onPlay;
                }).sort(function(a, b) {
                    return a.episode - b.episode;
                });

                seasonItems.forEach(function(it) {
                    var tmdbEp = tmdbEps[it.episode] || {};
                    var epTitle = (tmdbEp.name || it.title || ('Серия ' + it.episode));
                    var origTitle = card.original_title || card.original_name || card.title || card.name || '';
                    var tlKey = Lampa.Utils.hash([it.season, it.episode, origTitle].join(''));
                    
                    playlist.push({
                        title: (card.title || card.name) + ' / ' + epTitle,
                        episode: it.episode,
                        season: it.season,
                        timeline: Lampa.Timeline.view(tlKey),
                        onPlay: it.onPlay
                    });
                });

                return playlist;
            };

            scroll.clear();
            items.forEach(function(item) {
                // Auto-detect episode number if not explicitly set
                var epNum = item.episode || 0;
                if (!epNum && item.title) {
                    var m = item.title.match(/(?:Серия|Episode|Ep\.?)\s*(\d+)/i);
                    if (m) epNum = parseInt(m[1]);
                }
                var seasonNum = item.season || 1;
                var tmdbEp   = tmdbEps[epNum] || {};

                // Use TMDB data if available
                var title    = (epNum && tmdbEp.name) ? tmdbEp.name : (item.title || 'Смотреть');
                var time     = item.time || (tmdbEp.runtime ? Lampa.Utils.secondsToTime(tmdbEp.runtime * 60, true) : '');
                var quality  = item.quality || '';

                // Build info line
                var infoArr = [];
                var daysLeft = 0;
                var notYetAired = false;
                if (tmdbEp.vote_average) infoArr.push('\u2605 ' + parseFloat(tmdbEp.vote_average).toFixed(1));
                if (tmdbEp.air_date) {
                    var airDateStr = Lampa.Utils.parseTime(tmdbEp.air_date).full;
                    // Вычисляем сколько дней до выхода (сравниваем только даты, без времени)
                    var airDate = new Date(tmdbEp.air_date);
                    var today = new Date();
                    // Обнуляем время для корректного сравнения дат
                    airDate.setHours(0, 0, 0, 0);
                    today.setHours(0, 0, 0, 0);
                    daysLeft = Math.ceil((airDate.getTime() - today.getTime()) / 86400000);
                    notYetAired = daysLeft > 0;
                    
                    if (notYetAired) {
                        infoArr.push(airDateStr + ' \u2022 \u041e\u0441\u0442\u0430\u043b\u043e\u0441\u044c \u0434\u043d\u0435\u0439: ' + daysLeft);
                    } else {
                        infoArr.push(airDateStr);
                    }
                }
                if (!infoArr.length && item.info) infoArr.push(item.info);
                var info = infoArr.join(' \u2022 ');

                // Poster: episode still > item poster > backdrop (для фильмов) > poster > broken
                // Для будущих серий — без постера, для недоступных вышедших — постер из TMDB
                var isMovie = !card.number_of_seasons && card.media_type !== 'tv' && !card.first_air_date;
                var cardImgPath = (isMovie && !epNum)
                    ? (card.backdrop_path || card.poster_path)
                    : (card.poster_path || card.backdrop_path);
                var poster;
                if (item._isFuture || notYetAired) {
                    // Для будущих серий — пустой постер (будет только номер серии)
                    poster = '';
                } else if (item._isUnavailable) {
                    // Для недоступных вышедших — постер из TMDB (still или основной)
                    poster = (tmdbEp.still_path ? Lampa.TMDB.image('t/p/w300' + tmdbEp.still_path) : null)
                          || (cardImgPath ? Lampa.TMDB.image('t/p/w300' + cardImgPath) : './img/img_broken.svg');
                } else {
                    poster = (tmdbEp.still_path ? Lampa.TMDB.image('t/p/w300' + tmdbEp.still_path) : null)
                          || item.poster
                          || (cardImgPath ? Lampa.TMDB.image('t/p/w300' + cardImgPath) : './img/img_broken.svg');
                }

                var el = Lampa.Template.get('online_prestige_full', {
                    title:   title,
                    time:    time,
                    info:    info,
                    quality: quality
                });
                el.find('.online-prestige__loader').remove();

                // Затемняем ещё не вышедшие эпизоды и недоступные в озвучке
                if (notYetAired || item._isFuture || item._isUnavailable) {
                    el.css('opacity', '0.5');
                    if (item._isFuture || notYetAired) {
                        var daysText = item._daysLeft || daysLeft;
                        el.find('.online-prestige__time').text('\u041e\u0441\u0442\u0430\u043b\u043e\u0441\u044c: ' + daysText + ' \u0434.');
                    }
                    // Для недоступных серий оставляем время как есть (из TMDB runtime)
                    el.addClass('online-prestige--future');
                    // Убираем возможность воспроизведения
                    el.removeClass('selector');
                    el.css('cursor', 'default');
                }

                // Даём источнику возможность обновить quality после async запроса
                var qualityEl = el.find('.online-prestige__quality');
                item._setQuality = function(q) {
                    if (q) qualityEl.text(q);
                };

                // Badges: субтитры и количество аудиодорожек
                var badgesEl = el.find('.online-prestige__badges');
                if (item.subtitles) {
                    badgesEl.prepend('<span class="online-prestige__badge online-prestige__badge--sub">SUB</span>');
                }
                if (item.audioCount && item.audioCount > 1) {
                    badgesEl.prepend('<span class="online-prestige__badge online-prestige__badge--audio">' + item.audioCount + '\u00a0\u266a</span>');
                }
                // Метод для async обновления badges
                item._setBadges = function(audioCount, hasSub) {
                    badgesEl.find('.online-prestige__badge--audio').remove();
                    badgesEl.find('.online-prestige__badge--sub').remove();
                    if (hasSub) badgesEl.prepend('<span class="online-prestige__badge online-prestige__badge--sub">SUB</span>');
                    if (audioCount && audioCount > 1) badgesEl.prepend('<span class="online-prestige__badge online-prestige__badge--audio">' + audioCount + '\u00a0\u266a</span>');
                };

                var imgEl = el.find('img')[0];
                imgEl.onload  = function() { el.find('.online-prestige__img').addClass('online-prestige__img--loaded'); };
                imgEl.onerror = function() { imgEl.src = './img/img_broken.svg'; };
                if (poster) {
                    imgEl.src = poster;
                } else {
                    // Для будущих серий без постера — скрываем img и показываем только номер
                    $(imgEl).hide();
                    el.find('.online-prestige__img').addClass('online-prestige__img--loaded');
                }

                // Episode number badge
                if (epNum) {
                    el.find('.online-prestige__img').append(
                        '<div class="online-prestige__episode-number">' + ('0' + epNum).slice(-2) + '</div>'
                    );
                }

                // Timeline
                var tlKey = item.timeline;
                if (!tlKey && epNum) {
                    // Сериал: season + episode + original_title
                    var origTitle = card.original_title || card.original_name || card.title || card.name || '';
                    tlKey = Lampa.Utils.hash([seasonNum, epNum, origTitle].join(''));
                } else if (!tlKey && !epNum) {
                    // Фильм/озвучка: original_title + voice (item.title — это название озвучки)
                    tlKey = window.buildMovieTlKey(card, item.title || '');
                }
                if (tlKey) {
                    var tl = Lampa.Timeline.view(tlKey);
                    el.find('.online-prestige__timeline').append(Lampa.Timeline.render(tl));
                }

                el.on('hover:focus', function(e) { scroll.update($(e.target)); });
                if (item.onPlay) {
                    (function(it, ep, sn, itemTitle) {
                        el.on('hover:enter', function() {
                            var origTitle = card.original_title || card.original_name || card.title || card.name || '';
                            var tlKey, tl;

                            if (ep) {
                                // Сериал — ключ по сезону/серии
                                tlKey = Lampa.Utils.hash([sn, ep, origTitle].join(''));
                                tl = Lampa.Timeline.view(tlKey);
                                tl.card = { id: card.id, title: card.title || card.name, poster_path: card.poster_path };
                                window._online_current_timeline = tl;
                                // Добавляем в историю Lampa (используем оригинальную карточку без озвучки в названии)
                                if (card.id) Lampa.Favorite.add('history', card, 100);
                                var watchKey = 'online_last_watch_' + card.id;
                                Lampa.Storage.set(watchKey, JSON.stringify({
                                    source: _curSource,
                                    season: sn || null,
                                    episode: ep || null,
                                    voice: (_meta && _meta.curVoice !== undefined) ? _meta.curVoice : ((_meta && _meta.curVoiceName) || ''),
                                    tlKey: tlKey,
                                    time: tl.time || 0
                                }));
                            } else {
                                // Фильм — ключ по названию + озвучка
                                tlKey = window.buildMovieTlKey(card, itemTitle || '');
                                tl = Lampa.Timeline.view(tlKey);
                                tl.card = { id: card.id, title: card.title || card.name, poster_path: card.poster_path };
                                window._online_current_timeline = tl;
                                // Добавляем в историю Lampa
                                if (card.id) Lampa.Favorite.add('history', card, 100);
                                var watchKeyM = 'online_last_watch_' + card.id;
                                Lampa.Storage.set(watchKeyM, JSON.stringify({
                                    source: _curSource,
                                    season: null,
                                    episode: null,
                                    voice: itemTitle || '',
                                    tlKey: tlKey,
                                    time: tl.time || 0
                                }));
                            }

                            // Если есть сохранённая позиция — предложить продолжить
                            if (tl && tl.time && tl.time > 30 && tl.percent < 95) {
                                var enabled = Lampa.Controller.enabled().name;
                                Lampa.Select.show({
                                    title: 'Продолжить с ' + Lampa.Utils.secondsToTime(tl.time) + '?',
                                    items: [
                                        { title: '\u25ba Продолжить с ' + Lampa.Utils.secondsToTime(tl.time), action: 'continue' },
                                        { title: 'Смотреть сначала', action: 'start' }
                                    ],
                                    onBack: function() { Lampa.Controller.toggle(enabled); },
                                    onSelect: function(sel) {
                                        Lampa.Controller.toggle(enabled);
                                        window._online_resume_time = (sel.action === 'continue') ? tl.time : 0;
                                        
                                        // Создаем плейлист для автоперехода
                                        if (ep) {
                                            var playlist = createSeasonPlaylist(it, items);
                                            window._online_season_playlist = playlist;
                                            window._online_current_episode_index = -1;
                                            for (var i = 0; i < playlist.length; i++) {
                                                if (playlist[i].episode === ep) {
                                                    window._online_current_episode_index = i;
                                                    break;
                                                }
                                            }
                                        }
                                        
                                        it.onPlay();
                                    }
                                });
                                return;
                            }
                            
                            // Создаем плейлист для автоперехода
                            if (ep) {
                                var playlist = createSeasonPlaylist(it, items);
                                window._online_season_playlist = playlist;
                                // findIndex не поддерживается на старых WebOS, используем цикл
                                window._online_current_episode_index = -1;
                                for (var i = 0; i < playlist.length; i++) {
                                    if (playlist[i].episode === ep) {
                                        window._online_current_episode_index = i;
                                        break;
                                    }
                                }
                            }
                            
                            it.onPlay();
                        });
                    })(item, epNum, seasonNum, item.title);
                }
                if (item.onLongPress) el.on('hover:long', function() { item.onLongPress(); });

                scroll.append(el);
            });

            _this.activity.toggle();
            _this.start();

            // Auto-play episode/movie if requested (from "Continue watching")
            if (_curOpts && _curOpts._autoPlay) {
                var epToPlay = _curOpts._autoPlayEpisode ? parseInt(_curOpts._autoPlayEpisode) : 0;
                var found = epToPlay
                    ? items.filter(function(it) { return it.episode === epToPlay; })[0]
                    : items[0]; // для фильма — первый item

                if (found && found.onPlay) {
                    setTimeout(function() { found.onPlay(); }, 300);
                }
            }
        };

        // ── Filter events ──────────────────────────────────────────────────────
        var showError = function(msg) {
            scroll.clear();
            var skeletonErr = '';
            for (var si = 0; si < 3; si++) {
                skeletonErr += '<div class="online-skeleton__item" style="opacity:' + (0.45 - si * 0.1) + '">' +
                    '<div class="online-skeleton__img" style="animation:none;background:rgba(255,255,255,0.04)"></div>' +
                    '<div class="online-skeleton__body">' +
                        '<div class="online-skeleton__line online-skeleton__line--title" style="animation:none;background:rgba(255,255,255,0.05)"></div>' +
                        '<div class="online-skeleton__line online-skeleton__line--bar" style="animation:none;background:rgba(255,255,255,0.03)"></div>' +
                        '<div class="online-skeleton__footer">' +
                            '<div class="online-skeleton__line online-skeleton__line--sub" style="animation:none;background:rgba(255,255,255,0.04)"></div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            }
            scroll.append($('<div>' +
                '<div style="padding:.8em 1em 1em;font-size:1.2em;font-weight:600;opacity:.9">' + msg + '</div>' +
                skeletonErr +
            '</div>'));
        };

        // ── Init ───────────────────────────────────────────────────────────────
        this.create = function() {
            files.appendHead(filter.render());
            files.appendFiles(scroll.render());
            filter.addButtonBack();
            filter.onBack = function() { _this.start(); };
            // Обробка "Уточнити" — перезавантажуємо джерело з новим пошуковим запитом
            filter.onSearch = function(query) {
                if (!query) return;
                // Зберігаємо уточнений запит і перезавантажуємо поточне джерело
                _this.loadSource(null, { clarify: query });
            };
            updateSourceFilter();

            filter.onSelect = function(type, a, b) {
                if (type === 'sort' && a && a.source) {
                    // Source switch
                    _curSource = a.source;
                    _meta = null;
                    Lampa.Storage.set(GLOBAL_SOURCE_KEY, _curSource);
                    _this.loadSource(_curSource);
                } else if (type === 'season' && a && a.season_id !== undefined) {
                    // Season switch — reload with new season, сохраняем текущий голос
                    _this.loadSource(null, { season: a.season_id, voice: _meta && _meta.curVoice });
                } else if (type === 'voice' && a && a.voice_id !== undefined) {
                    // Voice switch — reload with new voice
                    _this.loadSource(null, { voice: a.voice_id, season: _meta && _meta.curSeason });
                }
            };

            scroll.minus(files.render().find('.explorer__files-head'));
            // Не используем activity.loader — показываем inline лоадер в области списка
            // Сразу показываем страницу (постер слева виден сразу)
            _this.activity.toggle();
            _this.start();

            // If opened with continueData — load that source/season/voice
            var continueData = object.continueData;
            if (continueData && continueData.source) {
                _curSource = continueData.source;
                Lampa.Storage.set(GLOBAL_SOURCE_KEY, _curSource);
                _this.loadSource(_curSource, {
                    season:            continueData.season,
                    voice:             continueData.voice,
                    _autoPlay:         continueData._autoPlay || false,
                    _autoPlayEpisode:  continueData.episode,
                    _resumeTlKey:      continueData.tlKey
                });
            } else {
                _this.loadSource(_curSource);
            }
        };
    }



    // --- KODIK / HDVB FLOWS ------------------------------------------------------

    function openKodik(card) {
        notify('Kodik: загрузка...');
        kodikGetStream(card, function (err, data) {
            if (err) {
                if (err.message === 'no_token') notify('Kodik: укажите токен в настройках плагина');
                else notify('Kodik: не найдено');
                return;
            }
            if (!data.isSeries) {
                showSelect('Перевод (Kodik)', data.results.map(function (r) {
                    return { title: r.translation.title + ' [' + (r.quality || '') + ']', link: r.link };
                }), function (item) {
                    notify('Kodik: загрузка...');
                    kodikExtractStream(item.link, function (err2, streams) {
                        if (err2 || !streams || !streams.length) { notify('Kodik: ошибка потока'); return; }
                        playStream(streams, card, null, null);
                    });
                });
            } else {
                showSelect('Перевод (Kodik)', data.results.map(function (r) {
                    return { title: r.translation.title, result: r };
                }), function (item) {
                    var r = item.result;
                    var seasons = r.seasons ? Object.keys(r.seasons) : ['1'];
                    showSelect('Сезон', seasons.map(function (s) { return { title: 'Сезон ' + s, id: s }; }), function (sItem) {
                        var eps = r.seasons && r.seasons[sItem.id] && r.seasons[sItem.id].episodes ? Object.keys(r.seasons[sItem.id].episodes) : ['1'];
                        showSelect('Серия', eps.map(function (e) { return { title: 'Серия ' + e, id: e }; }), function (eItem) {
                            var epLink = r.seasons[sItem.id].episodes[eItem.id];
                            if (!epLink) { notify('Kodik: нет ссылки на серию'); return; }
                            notify('Kodik: загрузка...');
                            kodikExtractStream(epLink, function (err2, streams) {
                                if (err2 || !streams || !streams.length) { notify('Kodik: ошибка потока'); return; }
                                playStream(streams, card, sItem.id, eItem.id);
                            });
                        });
                    });
                });
            }
        });
    }

    function openHdvb(card) {
        notify('HDVB: загрузка...');
        hdvbGetStream(card, function (err, data) {
            if (err) {
                if (err.message === 'no_token') notify('HDVB: укажите токен в настройках плагина');
                else notify('HDVB: не найдено');
                return;
            }
            showSelect('Перевод (HDVB)', data.results.map(function (r) {
                return { title: r.translator + ' [' + (r.quality || '') + ']', result: r };
            }), function (item) {
                var r = item.result;
                if (!r.iframe_url) { notify('HDVB: нет ссылки'); return; }
                if (!data.isSeries) {
                    playStream([{ quality: r.quality || 'auto', url: r.iframe_url }], card, null, null);
                } else {
                    var seasons = r.seasons ? Object.keys(r.seasons) : ['1'];
                    showSelect('Сезон', seasons.map(function (s) { return { title: 'Сезон ' + s, id: s }; }), function (sItem) {
                        var eps = r.seasons && r.seasons[sItem.id] ? Object.keys(r.seasons[sItem.id]) : ['1'];
                        showSelect('Серия', eps.map(function (e) { return { title: 'Серия ' + e, id: e }; }), function (eItem) {
                            var epUrl = r.seasons[sItem.id][eItem.id];
                            if (!epUrl) { notify('HDVB: нет ссылки на серию'); return; }
                            playStream([{ quality: 'auto', url: epUrl }], card, sItem.id, eItem.id);
                        });
                    });
                }
            });
        });
    }

    // --- LAMPA BUTTON ------------------------------------------------------------

    function addWatchButton(e) {
        var card = (e.object && (e.object.card || e.object.movie)) || {};
        var render = e.body || (e.link && e.link.html ? $(e.link.html) : null);
        if (!render) return;
        var container = render.find('.buttons--container');
        if (!container.length) return;
        if (render.find('.hdrezka-btn').length) return;
        var btn = $([
            '<div class="full-start__button selector hdrezka-btn">',
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
            ' style="width:1.4em;height:1.4em;vertical-align:middle;margin-right:0.4em">',
            '<circle cx="12" cy="12" r="10"/>',
            '<polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>',
            '</svg>',
            '<span>Онлайн</span>',
            '</div>'
        ].join(''));
        btn.on('hover:enter', function () { openSource(card); });
        container.prepend(btn);
    }

    // --- SETTINGS ----------------------------------------------------------------

    function addSettings() {
        if (!Lampa.SettingsApi) return;

        Lampa.SettingsApi.addComponent({
            component: 'online_custom',
            name: 'Онлайн',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'online_custom',
            param: { type: 'title' },
            field: { name: 'Прокси' }
        });

        Lampa.SettingsApi.addParam({
            component: 'online_custom',
            param: {
                name: PROXY_STORAGE_KEY,
                type: 'select',
                values: (function() {
                    var v = {};
                    PROXY_SERVERS.forEach(function(p) { v[p.id] = p.name; });
                    return v;
                })(),
                default: 'hf'
            },
            field: { name: 'Активный прокси' }
        });

        Lampa.SettingsApi.addParam({
            component: 'online_custom',
            param: { name: PROXY_CUSTOM_URL_KEY, type: 'button', default: '' },
            field: { name: 'Свой прокси — URL' },
            onRender: function(item) {
                item.find('.settings-param__value').text(Lampa.Storage.get(PROXY_CUSTOM_URL_KEY, '') || 'не задан');
            },
            onChange: function() {
                var cur = Lampa.Storage.get(PROXY_CUSTOM_URL_KEY, '');
                var presets = [
                    { title: 'Указать адрес...', query: '' },
                    { title: 'Очистить', query: 'clear' }
                ];
                if (cur && !presets.find(function(p) { return p.query === cur; })) presets.splice(1, 0, { title: cur + ' (текущий)', query: cur });
                Lampa.Select.show({
                    title: 'Свой прокси — URL',
                    items: presets,
                    onBack: function() { Lampa.Controller.toggle('content'); },
                    onSelect: function(item) {
                        if (!item.query) {
                            var f = new Lampa.Filter({ movie: {} });
                            f.onSearch = function(val) {
                                Lampa.Storage.set(PROXY_CUSTOM_URL_KEY, val.trim().replace(/\/$/, ''));
                                try { Lampa.Settings.update(); } catch(e) {}
                            };
                            f.onBack = function() { Lampa.Controller.toggle('content'); };
                            f.render().find('.filter--search').trigger('hover:enter');
                        } else if (item.query === 'clear') {
                            Lampa.Storage.set(PROXY_CUSTOM_URL_KEY, '');
                            Lampa.Controller.toggle('content');
                            try { Lampa.Settings.update(); } catch(e) {}
                        } else {
                            Lampa.Storage.set(PROXY_CUSTOM_URL_KEY, item.query);
                            Lampa.Controller.toggle('content');
                            try { Lampa.Settings.update(); } catch(e) {}
                        }
                    }
                });
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'online_custom',
            param: { type: 'title' },
            field: { name: 'CDNvideohub / VK' }
        });

        Lampa.SettingsApi.addParam({
            component: 'online_custom',
            param: { name: CDNVIDEOHUB_PROXY_KEY, type: 'button', default: CDNVIDEOHUB_PROXY_DEFAULT },
            field: { name: 'Прокси URL', description: CDNVIDEOHUB_PROXY_DEFAULT },
            onRender: function(item) {
                item.find('.settings-param__value').text(Lampa.Storage.get(CDNVIDEOHUB_PROXY_KEY, CDNVIDEOHUB_PROXY_DEFAULT) || CDNVIDEOHUB_PROXY_DEFAULT);
            },
            onChange: function() {
                var cur = Lampa.Storage.get(CDNVIDEOHUB_PROXY_KEY, CDNVIDEOHUB_PROXY_DEFAULT) || CDNVIDEOHUB_PROXY_DEFAULT;
                var f = new Lampa.Filter({ movie: {} });
                f.onSearch = function(val) {
                    var next = val.trim().replace(/\/$/, '');
                    Lampa.Storage.set(CDNVIDEOHUB_PROXY_KEY, next || CDNVIDEOHUB_PROXY_DEFAULT);
                    setCdnvideohubProxy(next || CDNVIDEOHUB_PROXY_DEFAULT);
                    try { Lampa.Settings.update(); } catch(e) {}
                };
                f.onBack = function() { Lampa.Controller.toggle('content'); };
                f.render().find('.filter--search').val(cur).trigger('hover:enter');
            }
        });
    }

    var _online_sources_loading = false;
    var _online_sources_loaded = false;
    var _online_sources_queue = [];

    function _onlineDetectBaseUrl() {
        if (window.ONLINE_PLUGIN_BASE_URL) return window.ONLINE_PLUGIN_BASE_URL;
        var src = '';
        try {
            src = (document.currentScript && document.currentScript.src) || '';
        } catch (e) {}
        if (!src) {
            try {
                var scripts = document.getElementsByTagName('script');
                src = (scripts && scripts.length) ? (scripts[scripts.length - 1].src || '') : '';
            } catch (e2) {}
        }
        if (!src) return '';
        return src.substring(0, src.lastIndexOf('/') + 1);
    }

    function _onlineLoadScript(url, done) {
        var s = document.createElement('script');
        s.type = 'text/javascript';
        s.charset = 'utf-8';
        s.async = true;
        s.onload = function() { done(); };
        s.onerror = function() { done(new Error('load_failed')); };
        s.src = url;
        (document.head || document.documentElement).appendChild(s);
    }

    function _onlineLoadScriptsSequential(urls, done) {
        var i = 0;
        var next = function(err) {
            if (err) return done(err);
            if (i >= urls.length) return done();
            _onlineLoadScript(urls[i++], next);
        };
        next();
    }

    function ensureOnlineSourcesLoaded(done) {
        if (_online_sources_loaded) return done();
        _online_sources_queue.push(done);
        if (_online_sources_loading) return;
        _online_sources_loading = true;

        var base = _onlineDetectBaseUrl();
        var urls = [
            base + 'online_sources/cdnvideohub.js',
            base + 'online_sources/vkmovie.js',
            base + 'online_sources/cinemar.js'
        ];

        _onlineLoadScriptsSequential(urls, function(err) {
            _online_sources_loading = false;
            _online_sources_loaded = !err;
            var q = _online_sources_queue.slice();
            _online_sources_queue = [];
            q.forEach(function(fn) { try { fn(err); } catch (e) {} });
        });
    }

    // --- INIT --------------------------------------------------------------------

    function init() {
        refreshCdnvideohubProxyFromStorage();
        try {
            if (window.Lampa && Lampa.Storage) {
                var curProxy = Lampa.Storage.get(PROXY_STORAGE_KEY, '');
                if (!curProxy) Lampa.Storage.set(PROXY_STORAGE_KEY, 'hf');
            }
        } catch (e) {}

        ensureOnlineSourcesLoaded(function(err) {
            if (err) {
                try { notify('Онлайн: не удалось загрузить источники'); } catch (e) {}
                return;
            }

            if (Lampa.Manifest && Lampa.Manifest.plugins) {
                var manifest = {
                    type: 'video',
                    version: '1.0',
                    name: 'Онлайн',
                    description: 'CDNvideohub · VK Video · Cinemar',
                    component: 'online_custom',
                    onContextMenu: function(object) { return { name: 'Онлайн', description: 'Смотреть онлайн' }; },
                    onContextLauch: function(object) { openSource((object && (object.card || object.movie)) || object || {}); }
                };

                var exists = false;
                if (Array.isArray(Lampa.Manifest.plugins)) {
                    exists = Lampa.Manifest.plugins.some(function(p) { return p && p.component === manifest.component; });
                    if (!exists) Lampa.Manifest.plugins.push(manifest);
                } else {
                    exists = !!(Lampa.Manifest.plugins && Lampa.Manifest.plugins.component === manifest.component);
                    if (!exists) Lampa.Manifest.plugins = manifest;
                }
            }

            Lampa.Listener.follow('full', function(e) {
                if (e.type === 'complite') addWatchButton(e);
            });

            Lampa.PlayerVideo.listener.follow('destroy', function() { cdnStopKeepAlive(); });

            addSettings();
            wakeUpProxies();
            Lampa.Component.add('online_unified', OnlineUnifiedComponent);
        });
    }

    if (window.Lampa) {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    } else {
        var _t = setInterval(function () {
            if (window.Lampa && Lampa.Listener) {
                clearInterval(_t);
                Lampa.Listener.follow('app', function (e) {
                    if (e.type === 'ready') init();
                });
            }
        }, 200);
    }

})();
