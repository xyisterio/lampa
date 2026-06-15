    // --- TURBO (obrut.show) SOURCE -----------------------------------------------

    registerSource('turbo', 'Turbo', {
        load: function(card, callback, opts) {
            opts = opts || {};
            var title = card.title || card.name || '';
            var isMovie = !card.number_of_seasons && card.media_type !== 'tv' && !card.first_air_date;
            var cardImgPath = isMovie ? (card.backdrop_path || card.poster_path) : (card.poster_path || card.backdrop_path);
            var poster = cardImgPath ? Lampa.TMDB.image('t/p/w300' + cardImgPath) : './img/img_broken.svg';
            var year = (card.release_date || card.first_air_date || '').slice(0, 4);
            var genres = card.genres ? card.genres.slice(0, 2).map(function(g) { return g.name; }).join(', ') : '';
            var info = [year, genres].filter(Boolean).join(' \u00b7 ');

            var WATCHED_KEY = 'turbo_watched_last';
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

            var turboProxyUrl = function(url) {
                if (!url) return url;
                return getProxyUrl() + '/hls?url=' + encodeURIComponent(url) + '&.m3u8';
            };

            var playVoice = function(voice, seasonId, episodeId) {
                if (!voice || !voice.url) { Lampa.Noty.show('Turbo: нет потока'); return; }
                var t = title;
                if (seasonId && episodeId) t += ' ' + episodeId.toUpperCase();
                watchedSet({ voice_name: voice.label, season: seasonId || null, episode: episodeId || null });
                var playerItem = { title: t, url: turboProxyUrl(voice.url) };
                if (voice.qualities && voice.qualities.length > 1) {
                    playerItem.quality = {};
                    voice.qualities.forEach(function(q) { playerItem.quality[q.quality] = turboProxyUrl(q.url); });
                }
                Lampa.Player.play(playerItem);
                Lampa.Player.playlist([playerItem]);
            };

            var turboGetCleanText = function(raw) {
                var eyJIdx = raw.indexOf('eyJ');
                var b64 = eyJIdx > 0 ? raw.substring(eyJIdx) : raw;
                var parts = b64.split('//');
                var cleanB64 = parts[0];
                for (var i = 1; i < parts.length; i++) {
                    var eqIdx = parts[i].indexOf('=');
                    if (eqIdx >= 0 && eqIdx <= 12) {
                        cleanB64 += parts[i].substring(eqIdx + 1);
                    } else {
                        cleanB64 += parts[i];
                    }
                }
                cleanB64 = cleanB64.replace(/[^A-Za-z0-9+\/=]/g, '');
                var bytes;
                try { bytes = atob(cleanB64); } catch(e) {
                    try { bytes = atob(b64.replace(/[^A-Za-z0-9+\/=]/g, '')); } catch(e2) { return ''; }
                }
                try {
                    return decodeURIComponent(escape(bytes));
                } catch(e) {
                    var result = '';
                    for (var i = 0; i < bytes.length; i++) {
                        var code = bytes.charCodeAt(i);
                        if (code < 128) result += bytes[i];
                    }
                    return result;
                }
            };

            var turboUnescapeUnicode = function(s) {
                return s.replace(/\\u([0-9a-fA-F]{4})/g, function(m, hex) {
                    return String.fromCharCode(parseInt(hex, 16));
                });
            };

            var turboParseFileStr = function(s) {
                var streams = [], re = /\[(\w+)\](https?:\/\/[^,\[]+)/g, m;
                while ((m = re.exec(s)) !== null) streams.push({ quality: m[1], url: m[2].trim() });
                return streams;
            };

            var turboExtractEntries = function(text) {
                var re = /"title":"([^"]+)","t1":"([^"]+)","poster":"[^"]*","file":"((?:\[\w+\]https?:\\\/\\\/[^"]+))"/g;
                var entries = [], m;
                while ((m = re.exec(text)) !== null) {
                    if (!m[2]) continue;
                    var streams = turboParseFileStr(m[3].replace(/\\\//g, '/'));
                    if (streams.length) entries.push({ voice: turboUnescapeUnicode(m[1]), episode: m[2], streams: streams, url: streams[0].url, label: turboUnescapeUnicode(m[1]) });
                }
                return entries;
            };

            var turboExtractMovieVoices = function(text) {
                var re = /"title":"([^"]+)","t1":"","poster":"[^"]*","file":"((?:\[\w+\]https?:\\\/\\\/[^"]+))"/g;
                var voices = [], m;
                while ((m = re.exec(text)) !== null) {
                    var streams = turboParseFileStr(m[2].replace(/\\\//g, '/'));
                    if (streams.length) voices.push({ label: turboUnescapeUnicode(m[1]), url: streams[0].url, qualities: streams, subtitles: [] });
                }
                return voices;
            };

            var turboBuildSerial = function(entries) {
                var byEp = {};
                entries.forEach(function(e) {
                    var sm = e.episode.match(/S(\d+)E(\d+)/i);
                    if (!sm) return;
                    var sKey = 's' + (sm[1].length < 2 ? '0' : '') + sm[1];
                    var eKey = 'e' + (sm[2].length < 2 ? '0' : '') + sm[2];
                    if (!byEp[sKey]) byEp[sKey] = {};
                    if (!byEp[sKey][eKey]) byEp[sKey][eKey] = [];
                    byEp[sKey][eKey].push({ label: e.voice, url: e.url, qualities: e.streams, subtitles: [] });
                });
                var seasonIds = Object.keys(byEp).sort();
                var seasons = seasonIds.map(function(s) { return { id: s, title: 'Season ' + parseInt(s.slice(1)) }; });
                var episodes = {}, voices = {};
                seasonIds.forEach(function(s) {
                    var epIds = Object.keys(byEp[s]).sort();
                    episodes[s] = epIds.map(function(e) { return { id: e, title: 'Episode ' + parseInt(e.slice(1)) }; });
                    voices[s] = {};
                    epIds.forEach(function(e) { voices[s][e] = byEp[s][e]; });
                });
                return { seasons: seasons, episodes: episodes, voices: voices };
            };

            var turboFetchEmbedDirect = function(embedUrl, cb) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', embedUrl, true); xhr.timeout = 15000;
                xhr.onload = function() { cb(xhr.responseText || ''); };
                xhr.onerror = xhr.ontimeout = function() { cb(''); };
                xhr.send();
            };

            var turboFetchEmbed = function(embedUrl, cb) {
                var proxyUrl = getProxyUrl() + '/turbo/proxy-embed?url=' + encodeURIComponent(embedUrl);
                var xhr = new XMLHttpRequest();
                xhr.open('GET', proxyUrl, true); xhr.timeout = 15000;
                xhr.onload = function() {
                    var html = xhr.responseText || '';
                    if (html.includes('new Player(') || html.length > 1000) { cb(html); return; }
                    turboFetchEmbedDirect(embedUrl, cb);
                };
                xhr.onerror = xhr.ontimeout = function() { turboFetchEmbedDirect(embedUrl, cb); };
                xhr.send();
            };

            var buildMovieItems = function(voiceList) {
                return voiceList.map(function(voice) {
                    return {
                        title:   voice.label,
                        quality: window.resolveMaxQualityFromList(voice.qualities || []),
                        info:    info,
                        poster:  poster,
                        onPlay: (function(v) {
                            return function() {
                                watchedSet({ voice_name: v.label });
                                playVoice(v, null, null);
                            };
                        })(voice)
                    };
                });
            };

            var buildSerialItems = function(serial) {
                var curSeasonId = opts.season || (serial.seasons[0] ? serial.seasons[0].id : null);
                var firstSeason = serial.seasons.filter(function(s) { return s.id === curSeasonId; })[0] || serial.seasons[0];
                if (!firstSeason) return [];
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
                var curVoice = opts.voice || ((w0 && w0.voice_name && voiceNames.indexOf(w0.voice_name) !== -1) ? w0.voice_name : (voiceNames[0] || ''));
                // If opts.voice not available for this season — use first available
                if (curVoice && voiceNames.indexOf(curVoice) === -1) curVoice = voiceNames[0] || '';

                // Сохраняем все эпизоды для плейлиста
                var allEpisodes = eps.map(function(ep) {
                    var epNumMatch = ep.id.match(/e(\d+)$/i);
                    var epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : 0;
                    var sNumMatch = seasonId.match(/s(\d+)$/i);
                    var sNum = sNumMatch ? parseInt(sNumMatch[1], 10) : 1;
                    return {
                        id: ep.id,
                        episode: epNum,
                        season: sNum,
                        title: ep.title || ('Серия ' + epNum),
                        voices: voicesMap[ep.id] || []
                    };
                });

                var items = [];
                eps.forEach(function(ep) {
                    var epVoices = voicesMap[ep.id] || [];
                    var epNumMatch = ep.id.match(/e(\d+)$/i);
                    var epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : 0;
                    var sNumMatch = seasonId.match(/s(\d+)$/i);
                    var sNum = sNumMatch ? parseInt(sNumMatch[1], 10) : 1;
                    var curVoiceData = (curVoice ? epVoices.filter(function(v) { return v.label === curVoice; })[0] : null) || epVoices[0];

                    items.push({
                        title:   ep.title || ('Серия ' + epNum),
                        episode: epNum,
                        season:  sNum,
                        quality: curVoiceData ? window.resolveMaxQualityFromList(curVoiceData.qualities || []) : '',
                        info:    info,
                        poster:  poster,
                        onPlay: (function(epId, epVoiceList, sId, epN, sN, allEps) {
                            return function() {
                                var voice = (curVoice ? epVoiceList.filter(function(v) { return v.label === curVoice; })[0] : null) || epVoiceList[0];
                                if (!voice) { Lampa.Noty.show('Turbo: нет голоса для серии'); return; }
                                watchedSet({ season: sId, episode: epId, voice_name: curVoice || '' });
                                
                                var t = title + ' ' + epId.toUpperCase();
                                
                                // URL resolver для плейлиста
                                var urlResolver = function(epItem, callback) {
                                    var epVoice = (curVoice
                                        ? epItem.voices.filter(function(v) { return v.label === curVoice; })[0]
                                        : null) || epItem.voices[0];
                                    
                                    if (!epVoice || !epVoice.url) {
                                        callback({ url: '' });
                                        return;
                                    }
                                    
                                    var result = { url: turboProxyUrl(epVoice.url) };
                                    if (epVoice.qualities && epVoice.qualities.length > 1) {
                                        result.quality = {};
                                        epVoice.qualities.forEach(function(q) { 
                                            result.quality[q.quality] = turboProxyUrl(q.url); 
                                        });
                                    }
                                    callback(result);
                                };
                                
                                // Создаем items для плейлиста
                                var playlistItems = allEps.map(function(epItem) {
                                    return {
                                        title: title + ' ' + epItem.id.toUpperCase(),
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
                                var playerItem = { title: t, url: turboProxyUrl(voice.url) };
                                if (voice.qualities && voice.qualities.length > 1) {
                                    playerItem.quality = {};
                                    voice.qualities.forEach(function(q) { playerItem.quality[q.quality] = turboProxyUrl(q.url); });
                                }
                                Lampa.Player.play(playerItem);
                                Lampa.Player.playlist(playlist.length > 0 ? playlist : [playerItem]);
                            };
                        })(ep.id, epVoices, seasonId, epNum, sNum, allEpisodes)
                    });
                });

                items._meta = {
                    seasons: serial.seasons.map(function(s) {
                        var n = s.id.match(/s(\d+)$/i);
                        return { id: s.id, name: s.title || ('Сезон ' + (n ? parseInt(n[1]) : s.id)) };
                    }),
                    curSeason: seasonId,
                    curSeasonName: firstSeason.title || ('Сезон ' + seasonId),
                    voices: voiceNames.map(function(v) { return { id: v, name: v }; }),
                    curVoice: curVoice,
                    curVoiceName: curVoice
                };

                return items;
            };

            var turboParseEmbed = function(embedUrl, attempt, merged, cb) {
                var MAX = 8;
                turboFetchEmbed(embedUrl, function(html) {
                    var pm = html.match(/new\s+Player\s*\(\s*"([A-Za-z0-9+\/=]{20,})"/);
                    if (pm) {
                        var text = turboGetCleanText(pm[1]);
                        turboExtractEntries(text).forEach(function(e) { if (!merged[e.voice+'|'+e.episode]) merged[e.voice+'|'+e.episode] = e; });
                        turboExtractMovieVoices(text).forEach(function(v) { if (!merged['m|'+v.label]) merged['m|'+v.label] = v; });
                    }
                    var ser = [], mov = [];
                    Object.keys(merged).forEach(function(k) { if (k.indexOf('m|') === 0) mov.push(merged[k]); else ser.push(merged[k]); });
                    if ((ser.length >= 80 || mov.length >= 3) || attempt >= MAX - 1) {
                        cb(ser, mov);
                    } else {
                        setTimeout(function() { turboParseEmbed(embedUrl, attempt + 1, merged, cb); }, 300);
                    }
                });
            };

            var queryRu = card.name || card.title || '';
            var queryOrig = card.original_title || card.original_name || '';
            var query = queryRu || queryOrig;
            if (year) query = query + ' ' + year;

            // Step 1: search kinojump
            var kjSearchUrl = 'https://web.kinojump.com/index.php?do=search&subaction=search&story=' + encodeURIComponent(query);
            var xhrSearch = new XMLHttpRequest();
            xhrSearch.open('GET', kjSearchUrl, true);
            xhrSearch.timeout = 15000;
            xhrSearch.onload = function() {
                var html = xhrSearch.responseText || '';
                var re = /href="(https?:\/\/(?:web\.)?kinojump\.com\/(\d+)-([^"]+)\.html)"/g;
                var results = [], m;
                while ((m = re.exec(html)) !== null) {
                    if (!results.filter(function(r) { return r.id === m[2]; }).length)
                        results.push({ url: m[1].replace('web.kinojump.com', 'kinojump.com'), id: m[2], slug: m[3] });
                }
                if (!results.length) { callback(new Error('Turbo: не найдено')); return; }

                // Step 2: get embed URL from page
                var xhr2 = new XMLHttpRequest();
                xhr2.open('GET', results[0].url, true); xhr2.timeout = 15000;
                xhr2.onload = function() {
                    var html2 = xhr2.responseText || '';
                    var em = html2.match(/(?:([a-z0-9]+)\.)?obrut\.show\/embed\/([A-Za-z0-9]+)\/content\/([A-Za-z0-9]+)/);
                    if (!em) { callback(new Error('Turbo: embed не найден')); return; }
                    var subdomain = em[1] ? em[1] + '.obrut.show' : '49372504.obrut.show';
                    var embedUrl = 'https://' + subdomain + '/embed/' + em[2] + '/content/' + em[3];

                    // Step 3: parse embed
                    turboParseEmbed(embedUrl, 0, {}, function(ser, mov) {
                        if (ser.length > 0) {
                            var serial = turboBuildSerial(ser);
                            var items = buildSerialItems(serial);
                            if (!items.length) { callback(new Error('Turbo: нет серий')); return; }
                            callback(null, items);
                        } else if (mov.length > 0) {
                            var items = buildMovieItems(mov);
                            if (!items.length) { callback(new Error('Turbo: нет озвучек')); return; }
                            callback(null, items);
                        } else {
                            callback(new Error('Turbo: нет данных'));
                        }
                    });
                };
                xhr2.onerror = xhr2.ontimeout = function() { callback(new Error('Turbo: ошибка сети')); };
                xhr2.send();
            };
            xhrSearch.onerror = xhrSearch.ontimeout = function() { callback(new Error('Turbo: ошибка сети')); };
            xhrSearch.send();
        }
    });
