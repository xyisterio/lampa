    // --- CINEMAR SOURCE ----------------------------------------------------------

    // CINEMAR_RAILWAY and TURBO_RAILWAY are functions — always return current proxy
    var CINEMAR_RAILWAY = function() { return getCinemarProxyUrl(); };
    var TURBO_RAILWAY   = function() { return getProxyUrl(); };

    registerSource('cinemar', 'Cinemar', {
        load: function(card, callback, opts) {
            opts = opts || {};
            var title = card.title || card.name || '';
            var isMovie = !card.number_of_seasons && card.media_type !== 'tv' && !card.first_air_date;
            var cardImgPath = isMovie ? (card.backdrop_path || card.poster_path) : (card.poster_path || card.backdrop_path);
            var poster = cardImgPath ? Lampa.TMDB.image('t/p/w300' + cardImgPath) : './img/img_broken.svg';
            var year = (card.release_date || card.first_air_date || '').slice(0, 4);
            var genres = card.genres ? card.genres.slice(0, 2).map(function(g) { return g.name; }).join(', ') : '';
            var info = [year, genres].filter(Boolean).join(' \u00b7 ');

            var WATCHED_KEY = 'cinemar_watched_last';
            var watchedGet = function() {
                var fid = Lampa.Utils.hash(card.original_title || card.original_name || card.title || card.name || '');
                var all = Lampa.Storage.cache(WATCHED_KEY, 5000, {});
                return all[fid] || null;
            };
            var watchedSet = function(data) {
                var fid = Lampa.Utils.hash(card.original_title || card.original_name || card.title || card.name || '');
                var all = Lampa.Storage.cache(WATCHED_KEY, 5000, {});
                if (!all[fid]) all[fid] = {};
                Lampa.Arrays.extend(all[fid], data, true);
                Lampa.Storage.set(WATCHED_KEY, all);
            };

            var playVoice = function(voice, seasonNum, episodeNum) {
                if (!voice || !voice.url) { Lampa.Noty.show('Cinemar: нет потока'); return; }
                var t = title;
                if (seasonNum && episodeNum) t += ' S' + seasonNum + 'E' + episodeNum;
                watchedSet({ source: 'cinemar', voice_name: voice.label, season: seasonNum || null, episode: episodeNum || null });
                var playerItem = { title: t, url: voice.url };
                if (voice.subtitles && voice.subtitles.length) playerItem.subtitles = voice.subtitles;
                Lampa.Player.play(playerItem);
                Lampa.Player.playlist([playerItem]);
            };

            var buildMovieItems = function(data) {
                var voiceList = data.voices || [];
                if (!voiceList.length && data.stream) {
                    voiceList = [{ label: 'Оригинал', url: data.stream, subtitles: [] }];
                }
                if (!voiceList.length) return null;

                var items = voiceList.map(function(voice) {
                    var hasSub = !!(voice.subtitles && voice.subtitles.length);
                    return {
                        title:     voice.label,
                        quality:   '',
                        subtitles: hasSub,
                        info:      info,
                        poster:    poster,
                        onPlay: (function(v) {
                            return function() {
                                watchedSet({ source: 'cinemar', voice_name: v.label });
                                playVoice(v, null, null);
                            };
                        })(voice)
                    };
                });

                // Async: определяем качество по первому голосу
                var firstUrl = voiceList[0] && voiceList[0].url;
                if (firstUrl) {
                    var xhrQ = new XMLHttpRequest();
                    xhrQ.open('GET', firstUrl, true);
                    xhrQ.timeout = 8000;
                    xhrQ.onload = function() {
                        var maxQ = window.resolveQualityFromM3U8(xhrQ.responseText || '');
                        if (maxQ) items.forEach(function(it) {
                            it.quality = maxQ;
                            if (it._setQuality) it._setQuality(maxQ);
                        });
                    };
                    xhrQ.onerror = xhrQ.ontimeout = function() {};
                    xhrQ.send();
                }

                return items;
            };

            var buildSerialItems = function(data) {
                var serial = data.serial;
                var seasons = serial.seasons || [];
                if (!seasons.length) return null;

                var curSeasonId = opts.season || seasons[0].id;
                var firstSeason = seasons.filter(function(s) { return s.id === curSeasonId; })[0] || seasons[0];
                var seasonId = firstSeason.id;
                var eps = serial.episodes[seasonId] || [];
                var voicesMap = serial.voices[seasonId] || {};

                var allVoices = {};
                eps.forEach(function(ep) {
                    var epVoices = voicesMap[ep.id] || [];
                    epVoices.forEach(function(v) { allVoices[v.label] = true; });
                });
                var voiceNames = Object.keys(allVoices);
                var w0 = watchedGet();
                var curVoice = opts.voice || ((w0 && w0.voice_name && voiceNames.indexOf(w0.voice_name) !== -1)
                    ? w0.voice_name : (voiceNames[0] || ''));
                // If opts.voice not available for this season — use first available
                if (curVoice && voiceNames.indexOf(curVoice) === -1) curVoice = voiceNames[0] || '';

                // Сохраняем все эпизоды для плейлиста
                var allEpisodes = eps.map(function(ep) {
                    var epNumMatch = ep.id.match(/e(\d+)$/i);
                    var epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : 0;
                    return {
                        id: ep.id,
                        episode: epNum,
                        season: parseInt(seasonId.replace(/[^0-9]/g, '')) || 1,
                        title: ep.title || ('Серия ' + epNum),
                        voices: voicesMap[ep.id] || []
                    };
                });

                var items = [];
                eps.forEach(function(ep) {
                    var epVoices = voicesMap[ep.id] || [];
                    var epNumMatch = ep.id.match(/e(\d+)$/i);
                    var epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : 0;
                    var hasSub = epVoices.some(function(v) { return v.subtitles && v.subtitles.length; });

                    items.push({
                        title:     ep.title || ('Серия ' + epNum),
                        episode:   epNum,
                        season:    parseInt(seasonId.replace(/[^0-9]/g, '')) || 1,
                        quality:   '',
                        subtitles: hasSub,
                        info:      info,
                        poster:    poster,
                        onPlay: (function(epId, epVoiceList, sId, epN, allEps) {
                            return function() {
                                var voice = (curVoice
                                    ? epVoiceList.filter(function(v) { return v.label === curVoice; })[0]
                                    : null) || epVoiceList[0];
                                if (!voice) { Lampa.Noty.show('Cinemar: нет голоса для серии'); return; }
                                watchedSet({ source: 'cinemar', season: sId, episode: epId, voice_name: curVoice || '' });
                                
                                var t = title + ' S' + sId + 'E' + epN;
                                
                                // URL resolver для плейлиста
                                var urlResolver = function(epItem, callback) {
                                    var epVoice = (curVoice
                                        ? epItem.voices.filter(function(v) { return v.label === curVoice; })[0]
                                        : null) || epItem.voices[0];
                                    
                                    if (!epVoice || !epVoice.url) {
                                        callback({ url: '' });
                                        return;
                                    }
                                    
                                    var result = { url: epVoice.url };
                                    if (epVoice.subtitles && epVoice.subtitles.length) {
                                        result.subtitles = epVoice.subtitles;
                                    }
                                    callback(result);
                                };
                                
                                // Создаем items для плейлиста
                                var playlistItems = allEps.map(function(epItem) {
                                    return {
                                        title: title + ' S' + epItem.season + 'E' + epItem.episode,
                                        episode: epItem.episode,
                                        season: epItem.season,
                                        voices: epItem.voices
                                    };
                                });
                                
                                // Создаем плейлист через универсальную функцию
                                var playlist = window.createOnlinePlaylist(
                                    { title: t },
                                    playlistItems,
                                    urlResolver
                                );
                                
                                // Загружаем текущую серию
                                var playerItem = { title: t, url: voice.url };
                                if (voice.subtitles && voice.subtitles.length) playerItem.subtitles = voice.subtitles;
                                Lampa.Player.play(playerItem);
                                Lampa.Player.playlist(playlist.length > 0 ? playlist : [playerItem]);
                            };
                        })(ep.id, epVoices, seasonId, epNum, allEpisodes)
                    });
                });

                // Async: определяем качество по первому эпизоду первого голоса
                var firstEpVoices = eps[0] ? (voicesMap[eps[0].id] || []) : [];
                var firstVoice = (curVoice ? firstEpVoices.filter(function(v) { return v.label === curVoice; })[0] : null) || firstEpVoices[0];
                if (firstVoice && firstVoice.url) {
                    var xhrQ = new XMLHttpRequest();
                    xhrQ.open('GET', firstVoice.url, true);
                    xhrQ.timeout = 8000;
                    xhrQ.onload = function() {
                        var maxQ = window.resolveQualityFromM3U8(xhrQ.responseText || '');
                        if (maxQ) items.forEach(function(it) {
                            it.quality = maxQ;
                            if (it._setQuality) it._setQuality(maxQ);
                        });
                    };
                    xhrQ.onerror = xhrQ.ontimeout = function() {};
                    xhrQ.send();
                }

                items._meta = {
                    seasons: seasons.map(function(s) { return { id: s.id, name: s.title || ('Сезон ' + s.id) }; }),
                    curSeason: seasonId,
                    curSeasonName: firstSeason.title || ('Сезон ' + seasonId),
                    voices: voiceNames.map(function(v) { return { id: v, name: v }; }),
                    curVoice: curVoice,
                    curVoiceName: curVoice
                };

                return items;
            };

            var isSerial = !!(card.number_of_seasons || card.media_type === 'tv' || card.first_air_date);
            var queryRu = card.name || card.title || '';
            var queryOrig = card.original_title || card.original_name || '';
            var query = queryRu || queryOrig;
            if (year) query = query + ' ' + year;

            var doStream = function(best) {
                var streamUrl = getCinemarProxyUrl() + '/uakinogo/stream?url=' + encodeURIComponent(best.url);
                var xhr2 = new XMLHttpRequest();
                xhr2.open('GET', streamUrl, true);
                xhr2.timeout = 60000;
                xhr2.onload = function() {
                    var data;
                    try { data = JSON.parse(xhr2.responseText); } catch(e) { data = null; }
                    if (!data || !data.ok) { callback(new Error('Cinemar: ошибка сети')); return; }

                    var items;
                    if (data.content_type === 'serial' && data.serial) {
                        items = buildSerialItems(data);
                    } else {
                        items = buildMovieItems(data);
                    }
                    if (!items || !items.length) { callback(new Error('Cinemar: нет результатов')); return; }
                    callback(null, items);
                };
                xhr2.onerror = xhr2.ontimeout = function() { callback(new Error('Cinemar: ошибка сети')); };
                xhr2.send();
            };

            var doCinemarSearch = function(searchQuery) {
                var searchUrl = getCinemarProxyUrl() + '/uakinogo/search?q=' + encodeURIComponent(searchQuery);
                var xhr = new XMLHttpRequest();
                xhr.open('GET', searchUrl, true);
                xhr.timeout = 15000;
                xhr.onload = function() {
                    var resp;
                    try { resp = JSON.parse(xhr.responseText); } catch(e) { resp = null; }
                    if (!resp || !resp.ok || !resp.results || !resp.results.length) {
                        callback(new Error('Cinemar: не найдено "' + searchQuery + '"'));
                        return;
                    }

                    var results = resp.results;
                    var score = function(r) {
                        var s = 0;
                        var url = r.url || '';
                        var slug = r.slug || '';
                        if (isSerial && url.indexOf('serial') !== -1) s += 20;
                        if (!isSerial && url.indexOf('serial') === -1) s += 20;
                        if (year && slug.indexOf(year) !== -1) s += 15;
                        return s;
                    };

                    var best = results.slice().sort(function(a, b) { return score(b) - score(a); })[0];

                    if (year && score(best) <= 20) {
                        var queryNoYear = searchQuery.replace(/\s+\d{4}\s*$/, '').trim();
                        if (queryNoYear === searchQuery) { doStream(best); return; }
                        var searchUrl2 = getCinemarProxyUrl() + '/uakinogo/search?q=' + encodeURIComponent(queryNoYear);
                        var xhr1b = new XMLHttpRequest();
                        xhr1b.open('GET', searchUrl2, true);
                        xhr1b.timeout = 10000;
                        xhr1b.onload = function() {
                            var resp2;
                            try { resp2 = JSON.parse(xhr1b.responseText); } catch(e) { resp2 = null; }
                            if (resp2 && resp2.ok && resp2.results && resp2.results.length) {
                                var best2 = resp2.results.slice().sort(function(a, b) { return score(b) - score(a); })[0];
                                if (score(best2) >= score(best)) best = best2;
                            }
                            doStream(best);
                        };
                        xhr1b.onerror = xhr1b.ontimeout = function() { doStream(best); };
                        xhr1b.send();
                        return;
                    }

                    doStream(best);
                };
                xhr.onerror = xhr.ontimeout = function() { callback(new Error('Cinemar: ошибка сети')); };
                xhr.send();
            };

            doCinemarSearch(query);
        }
    });
