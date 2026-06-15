    // --- VEOVEO SOURCE -----------------------------------------------------------
    // Uses veoveo.ru → tv-1-kinoserial.net embed → PlayerJS base64 data
    // Each request returns a random slice of data - need multiple requests to get all episodes

    registerSource('veoveo', 'VeoVeo', {
        load: function(card, callback, opts) {
            opts = opts || {};
            var title = card.title || card.name || '';
            var isMovie = !card.number_of_seasons && card.media_type !== 'tv' && !card.first_air_date;
            var cardImgPath = isMovie ? (card.backdrop_path || card.poster_path) : (card.poster_path || card.backdrop_path);
            var poster = cardImgPath ? Lampa.TMDB.image('t/p/w300' + cardImgPath) : './img/img_broken.svg';
            var year = (card.release_date || card.first_air_date || '').slice(0, 4);
            var genres = card.genres ? card.genres.slice(0, 2).map(function(g) { return g.name; }).join(', ') : '';
            var info = [year, genres].filter(Boolean).join(' \u00b7 ');

            // ── Parse {Voice} url;{Voice2} url2 format ──────────────────────────
            function parseVoices(fileStr) {
                var voices = [];
                if (!fileStr) return voices;
                var parts = fileStr.split(/;(?=\{)/);
                for (var i = 0; i < parts.length; i++) {
                    var m = parts[i].trim().match(/^\{([^}]+)\}\s*(https?:\/\/.+)$/);
                    if (m) voices.push({ label: m[1].trim(), url: m[2].trim() });
                }
                return voices;
            }

            // ── Parse subtitles from subtitle field ─────────────────────────────
            function parseSubtitles(subtitleStr) {
                var subs = [];
                if (!subtitleStr) return subs;
                var parts = subtitleStr.split(',');
                for (var i = 0; i < parts.length; i++) {
                    var m = parts[i].trim().match(/^\[([^\]]+)\](https?:\/\/.+)$/);
                    if (m) subs.push({ label: m[1], url: m[2] });
                }
                return subs;
            }

            // ── Extract PlayerJS raw data from HTML ──────────────────────────────
            function extractPlayerjsRaw(html) {
                var pjsIdx = html.indexOf('Playerjs("');
                if (pjsIdx < 0) return null;
                var dataStart = pjsIdx + 10;
                var dataEnd = html.indexOf('")', dataStart);
                if (dataEnd < 0) return null;
                return html.substring(dataStart, dataEnd);
            }

            // ── Decode PlayerJS: take only the first real segment (before first |||) ──
            // The server injects garbage after the real data using ||| markers
            // Each request returns a different random slice of the full data
            function decodePlayerjsSegment(raw) {
                var b64full = raw.replace(/^#\d/, '');
                var firstInj = b64full.indexOf('|||');
                var realB64 = firstInj >= 0 ? b64full.substring(0, firstInj) : b64full;
                var padded = realB64 + '===='.substring(0, (4 - realB64.length % 4) % 4);
                try {
                    return atob(padded);
                } catch(e) {
                    return null;
                }
            }

            // ── Extract episodes from a decoded JSON fragment ────────────────────
            // Fragment may be incomplete - extract what we can
            function extractEpisodesFromFragment(decoded) {
                var episodes = {};
                if (!decoded) return episodes;
                // Match episode entries: {"title":"N серия","subtitle":"...","file":"..."}
                var epRe = /"title"\s*:\s*"([^"]+)"\s*,\s*"subtitle"\s*:\s*"([^"]*)"\s*,\s*"file"\s*:\s*"([^"]+)"/g;
                var m;
                while ((m = epRe.exec(decoded)) !== null) {
                    var epTitle = m[1];
                    var subtitle = m[2];
                    var file = m[3];
                    if (file.indexOf('https://') >= 0 || file.indexOf('{') >= 0) {
                        var key = epTitle;
                        if (!episodes[key] || episodes[key].file.length < file.length) {
                            episodes[key] = { title: epTitle, subtitle: subtitle, file: file };
                        }
                    }
                }
                return episodes;
            }

            // ── Extract season structure from a decoded JSON fragment ────────────
            function extractSeasonsFromFragment(decoded) {
                if (!decoded) return null;
                // Try to find season titles
                var seasons = {};
                var seasonRe = /"title"\s*:\s*"(\d+)\s*[сС]езон[^"]*"\s*,\s*"folder"\s*:\s*\[/g;
                var m;
                while ((m = seasonRe.exec(decoded)) !== null) {
                    var sNum = parseInt(m[1]);
                    if (!seasons[sNum]) seasons[sNum] = true;
                }
                return Object.keys(seasons).map(Number).sort(function(a,b){return a-b;});
            }

            // ── Fetch embed HTML ─────────────────────────────────────────────────
            // tv-1-kinoserial.net requires Referer header which browser blocks for XHR
            // Route through proxy (same as Alloha/Turbo)
            function fetchEmbed(embedUrl, cb) {
                var proxyUrl = getProxyUrl() + '/veoveo/embed?url=' + encodeURIComponent(embedUrl);
                var xhr = new XMLHttpRequest();
                xhr.open('GET', proxyUrl, true);
                xhr.timeout = 15000;
                xhr.onload = function() {
                    if (xhr.status === 200) cb(null, xhr.responseText);
                    else cb(new Error('HTTP ' + xhr.status));
                };
                xhr.onerror = xhr.ontimeout = function() { cb(new Error('network error')); };
                xhr.send();
            }

            // ── Fetch from Balancer API (Direct method, same as lampacNG) ────────
            function fetchFromBalancer(contentId, opts, cb) {
                var proxyUrl = getProxyUrl() + '/veoveo/balancer?id=' + contentId;
                var xhr = new XMLHttpRequest();
                xhr.open('GET', proxyUrl, true);
                xhr.timeout = 10000;
                xhr.onload = function() {
                    if (xhr.status !== 200) { cb(new Error('balancer failed')); return; }
                    try {
                        var data = JSON.parse(xhr.responseText);
                        if (!Array.isArray(data) || !data.length) { cb(new Error('no data')); return; }
                        
                        var seasonsMap = {};
                        data.forEach(function(item) {
                            var s = (item.season && item.season.order !== undefined) ? item.season.order : 0;
                            if (!seasonsMap[s]) seasonsMap[s] = [];
                            seasonsMap[s].push(item);
                        });

                        var seasonKeys = Object.keys(seasonsMap).map(Number).sort(function(a,b){return a-b;});
                        // Use TMDB/Card info to determine if it's a movie
                        var reallyMovie = !card.number_of_seasons && card.media_type !== 'tv' && !card.first_air_date;
                        
                        // Select season
                        var targetSeason = (opts.season !== undefined) ? opts.season : (reallyMovie ? (seasonsMap[0] ? 0 : seasonKeys[0]) : seasonKeys[0]);
                        if (!seasonsMap[targetSeason] && seasonKeys.length > 0) targetSeason = seasonKeys[0];

                        var episodes = (seasonsMap[targetSeason] || []).map(function(item, idx) {
                            if (!item.episodeVariants || !item.episodeVariants.length) return null;
                            var voices = item.episodeVariants.map(function(v) {
                                return { label: v.title || 'Озвучка', url: v.filepath };
                            }).filter(function(v) { return !!v.url; });
                            
                            if (!voices.length) return null;

                            return {
                                title: item.title || (reallyMovie ? title : 'Серия ' + (item.order || (idx + 1))),
                                episode: item.order || (idx + 1),
                                season: targetSeason,
                                quality: '',
                                info: info,
                                poster: poster,
                                voices: voices
                            };
                        }).filter(Boolean);

                        // Build _meta for Lampa
                        var meta = null;
                        if (!reallyMovie || seasonKeys.length > 1) {
                            meta = {
                                seasons: seasonKeys.map(function(s) {
                                    return { season_id: s, name: s === 0 ? 'Фильм' : 'Сезон ' + s };
                                }),
                                curSeason: targetSeason
                            };
                        }

                        if (episodes.length) {
                            if (meta) episodes._meta = meta;
                            cb(null, episodes);
                        } else {
                            cb(new Error('no episodes'));
                        }
                    } catch(e) { cb(new Error('parse error')); }
                };
                xhr.onerror = xhr.ontimeout = function() { cb(new Error('balancer network error')); };
                xhr.send();
            }

            // ── Fetch embed multiple times and merge episodes ────────────────────
            function fetchEmbedMulti(embedUrl, targetEps, cb) {
                var allEpisodes = {};
                var BATCH = 5;
                var MAX_BATCHES = 8;
                var batch = 0;

                function runBatch() {
                    if (batch >= MAX_BATCHES) {
                        cb(null, allEpisodes);
                        return;
                    }

                    var pending = BATCH;
                    var newEps = 0;

                    function onDone() {
                        pending--;
                        if (pending > 0) return;
                        batch++;
                        var total = Object.keys(allEpisodes).length;
                        // Stop if we have enough or no new episodes
                        if ((targetEps > 0 && total >= targetEps) || (newEps === 0 && batch >= 2)) {
                            cb(null, allEpisodes);
                        } else {
                            runBatch();
                        }
                    }

                    for (var i = 0; i < BATCH; i++) {
                        (function() {
                            fetchEmbed(embedUrl, function(err, html) {
                                if (!err && html) {
                                    var raw = extractPlayerjsRaw(html);
                                    if (raw) {
                                        var decoded = decodePlayerjsSegment(raw);
                                        if (decoded) {
                                            var eps = extractEpisodesFromFragment(decoded);
                                            var keys = Object.keys(eps);
                                            for (var k = 0; k < keys.length; k++) {
                                                var key = keys[k];
                                                if (!allEpisodes[key]) {
                                                    allEpisodes[key] = eps[key];
                                                    newEps++;
                                                }
                                            }
                                        }
                                    }
                                }
                                onDone();
                            });
                        })();
                    }
                }

                runBatch();
            }

            // ── Search veoveo.ru ─────────────────────────────────────────────────
            function searchVeoveo(query, year, cb) {
                console.log('VeoVeo: searching by title', query);
                var url = 'https://veoveo.ru/api/search.php?q=' + encodeURIComponent(query);
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.timeout = 10000;
                xhr.onload = function() {
                    if (xhr.status !== 200) { cb(new Error('search failed')); return; }
                    try {
                        var text = xhr.responseText.replace(/^\uFEFF/, '');
                        var data = JSON.parse(text);
                        if (Array.isArray(data) && data.length) {
                            cb(null, data.map(function(item) {
                                var type = item.type === 'movie' ? 'movie' : 'serial';
                                return { path: '/' + type + '/' + item.id, id: String(item.id) };
                            }));
                        } else {
                            cb(null, []);
                        }
                    } catch(e) { cb(new Error('search parse error')); }
                };
                xhr.onerror = xhr.ontimeout = function() { cb(new Error('search network error')); };
                xhr.send();
            }

            // ── Search by KP ID ──────────────────────────────────────────────────
            function searchByKpId(kpId, cb) {
                console.log('VeoVeo: searching by KP ID', kpId);
                var url = 'https://veoveo.ru/api/search.php?kp=' + kpId;
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.timeout = 8000;
                xhr.onload = function() {
                    if (xhr.status !== 200) { cb(null, null); return; }
                    try {
                        var data = JSON.parse(xhr.responseText.replace(/^\uFEFF/, ''));
                        if (Array.isArray(data) && data.length) {
                            var item = data[0];
                            var type = item.type === 'movie' ? 'movie' : 'serial';
                            cb(null, { path: '/' + type + '/' + item.id, id: String(item.id) });
                        } else {
                            console.log('VeoVeo: KP search no results');
                            cb(null, null);
                        }
                    } catch(e) {
                        console.log('VeoVeo: KP search parse error');
                        cb(null, null);
                    }
                };
                xhr.onerror = xhr.ontimeout = function() {
                    console.log('VeoVeo: KP search network error');
                    cb(null, null);
                };
                xhr.send();
            }

            // ── Get embed URL from veoveo.ru page ───────────────────────────────
            function getEmbedUrl(pagePath, cb) {
                var url = 'https://veoveo.ru' + pagePath;
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.timeout = 12000;
                xhr.onload = function() {
                    if (xhr.status !== 200) { cb(new Error('page failed')); return; }
                    var html = xhr.responseText;
                    var m = html.match(/src="(https?:\/\/[^"]*kinoserial\.net\/embed[^"]+)"/i);
                    if (m) { cb(null, m[1]); return; }
                    var tokenM = html.match(/token=([a-f0-9]{32})/i);
                    var idM = html.match(/embed(?:_(serial|movie)|\/(\d+))/i);
                    if (tokenM && idM) {
                        if (idM[2]) {
                            cb(null, 'https://tv-1-kinoserial.net/embed/' + idM[2] + '/?token=' + (tokenM ? tokenM[1] : ''));
                        } else {
                            cb(null, 'https://tv-1-kinoserial.net/embed_' + idM[1] + '/' + (html.match(/embed_movie\/(\d+)/) || html.match(/embed_serial\/(\d+)/) || [0,0])[1] + '/?token=' + tokenM[1]);
                        }
                        return;
                    }
                    cb(new Error('embed not found'));
                };
                xhr.onerror = xhr.ontimeout = function() { cb(new Error('page network error')); };
                xhr.send();
            }

            // ── Build items from collected episodes ──────────────────────────────
            function buildItems(allEpisodes, embedUrl) {
                // Object.values() не поддерживается в WebOS 3.9 - используем ручной цикл
                var epList = [];
                for (var key in allEpisodes) {
                    if (allEpisodes.hasOwnProperty(key)) {
                        epList.push(allEpisodes[key]);
                    }
                }
                epList.sort(function(a, b) {
                    var na = parseInt(a.title) || 0;
                    var nb = parseInt(b.title) || 0;
                    return na - nb;
                });

                if (!epList.length) return null;

                // Check if it's a movie (season 0) or serial
                // For now treat all as serial episodes
                var items = epList.map(function(ep, idx) {
                    var voices = parseVoices(ep.file);
                    var subs = parseSubtitles(ep.subtitle);
                    if (!voices.length) return null;

                    return {
                        title: ep.title,
                        episode: idx + 1,
                        season: 1,
                        quality: '',
                        info: info,
                        poster: poster,
                        subtitles: subs.length > 0,
                        onPlay: (function(epVoices, epSubs, epTitle, allEps) {
                            return function() {
                                var t = title + ' — ' + epTitle;

                                if (epVoices.length > 1) {
                                    var enabled = Lampa.Controller.enabled().name;
                                    Lampa.Select.show({
                                        title: 'Озвучка',
                                        items: epVoices.map(function(v) {
                                            return { title: v.label, url: v.url };
                                        }),
                                        onBack: function() { Lampa.Controller.toggle(enabled); },
                                        onSelect: function(item) {
                                            Lampa.Controller.toggle(enabled);
                                            var playerItem = { title: t + ' — ' + item.title, url: item.url };
                                            if (epSubs.length) playerItem.subtitles = epSubs;
                                            Lampa.Player.play(playerItem);
                                            Lampa.Player.playlist([playerItem]);
                                        }
                                    });
                                    return;
                                }

                                // Build playlist from all episodes
                                var playlistItems = allEps.map(function(e) {
                                    var v = parseVoices(e.file);
                                    return v.length ? { title: title + ' — ' + e.title, url: v[0].url, episode: 1, season: 1 } : null;
                                }).filter(Boolean);

                                var urlResolver = function(item, cb) { cb({ url: item.url }); };
                                var playlist = window.createOnlinePlaylist({ title: t }, playlistItems, urlResolver);

                                var playerItem = { title: t, url: epVoices[0].url };
                                if (epSubs.length) playerItem.subtitles = epSubs;
                                Lampa.Player.play(playerItem);
                                Lampa.Player.playlist(playlist.length ? playlist : [playerItem]);
                            };
                        })(voices, subs, ep.title, epList)
                    };
                }).filter(Boolean);

                return items;
            }

            // ── Main flow ────────────────────────────────────────────────────────
            var kpId = card.kinopoisk_id || (card.external_ids && card.external_ids.kinopoisk_id) || null;
            var searchQuery = card.original_title || card.title || card.name || '';

            function processResult(result) {
                getEmbedUrl(result.path, function(err, embedUrl) {
                    if (err || !embedUrl) {
                        callback(new Error('VeoVeo: embed не найден'));
                        return;
                    }

                    var idMatch = embedUrl.match(/embed(?:_movie|_serial)?\/(\d+)/);
                    var balancerId = idMatch ? idMatch[1] : null;

                    if (balancerId) {
                        fetchFromBalancer(balancerId, opts, function(err, items) {
                            if (!err && items && items.length) {
                                var formatted = items.map(function(it) {
                                    return {
                                        title: it.title,
                                        episode: it.episode,
                                        season: it.season,
                                        quality: '',
                                        info: info,
                                        poster: poster,
                                        onPlay: (function(voices, t) {
                                            return function() {
                                                function play(url, label) {
                                                    var streamUrl = url;
                                                    // Handle parsed.json format
                                                    if (streamUrl.indexOf('parsed.json') !== -1) {
                                                        var xhr = new XMLHttpRequest();
                                                        xhr.open('GET', getProxyUrl() + '/hls?url=' + encodeURIComponent(streamUrl), true);
                                                        xhr.onload = function() {
                                                            try {
                                                                var pdata = JSON.parse(xhr.responseText);
                                                                var link = pdata && pdata.sources && pdata.sources[0] ? pdata.sources[0].link : null;
                                                                if (!link) throw new Error('no link');
                                                                var finalUrl = getProxyUrl() + '/hls?url=' + encodeURIComponent(link);
                                                                Lampa.Player.play({ title: title + (label ? ' — ' + label : ''), url: finalUrl });
                                                                Lampa.Player.playlist([{ title: title + (label ? ' — ' + label : ''), url: finalUrl }]);
                                                            } catch(e) { Lampa.Noty.show('Ошибка загрузки потока'); }
                                                        };
                                                        xhr.send();
                                                        return;
                                                    }

                                                    if (streamUrl.indexOf('m3u8') !== -1 || streamUrl.indexOf('rstprgapipt.com') !== -1) {
                                                        streamUrl = getProxyUrl() + '/hls?url=' + encodeURIComponent(streamUrl);
                                                    }
                                                    Lampa.Player.play({ title: title + (label ? ' — ' + label : ''), url: streamUrl });
                                                    Lampa.Player.playlist([{ title: title + (label ? ' — ' + label : ''), url: streamUrl }]);
                                                }

                                                if (voices.length > 1) {
                                                    var enabled = Lampa.Controller.enabled().name;
                                                    Lampa.Select.show({                        title: 'Озвучка',
                                                        items: voices,
                                                        onBack: function() { Lampa.Controller.toggle(enabled); },
                                                        onSelect: function(item) {
                                                            Lampa.Controller.toggle(enabled);
                                                            play(item.url, item.label);
                                                        }
                                                    });
                                                } else {
                                                    play(voices[0].url);
                                                }
                                            };
                                        })(it.voices, title + (it.episode ? ' — ' + it.title : ''))
                                    };
                                });
                                if (items._meta) formatted._meta = items._meta;
                                callback(null, formatted);
                                return;
                            }
                            fallbackToScraping(embedUrl);
                        });
                    } else {
                        fallbackToScraping(embedUrl);
                    }
                });

                function fallbackToScraping(embedUrl) {
                    var targetEps = card.number_of_episodes || 0;
                    fetchEmbedMulti(embedUrl, targetEps, function(err, allEpisodes) {
                        if (err) { callback(new Error('VeoVeo: ошибка загрузки')); return; }
                        var total = Object.keys(allEpisodes).length;
                        if (!total) { callback(new Error('VeoVeo: нет эпизодов')); return; }
                        var items = buildItems(allEpisodes, embedUrl);
                        if (!items || !items.length) { callback(new Error('VeoVeo: нет озвучек')); return; }
                        callback(null, items);
                    });
                }
            }

            function doSearch() {
                searchVeoveo(searchQuery, year, function(err, results) {
                    if (err || !results || !results.length) {
                        var ruTitle = card.title || card.name || '';
                        if (ruTitle && ruTitle !== searchQuery) {
                            searchVeoveo(ruTitle, year, function(err2, results2) {
                                if (err2 || !results2 || !results2.length) {
                                    callback(new Error('VeoVeo: не найдено'));
                                    return;
                                }
                                processResult(results2[0]);
                            });
                        } else {
                            callback(new Error('VeoVeo: не найдено'));
                        }
                        return;
                    }
                    processResult(results[0]);
                });
            }

            if (kpId) {
                searchByKpId(kpId, function(err, result) {
                    if (result) processResult(result);
                    else doSearch();
                });
            } else {
                doSearch();
            }
        }
    });
