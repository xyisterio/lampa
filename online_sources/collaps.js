    // --- COLLAPS (api.bhcesh.me) SOURCE ------------------------------------------

    registerSource('collaps', 'Collaps', {
        load: function(card, callback, opts) {
            opts = opts || {};
            var title = card.title || card.name || '';
            var originalTitle = card.original_title || card.original_name || '';
            var isMovie = !card.number_of_seasons && card.media_type !== 'tv' && !card.first_air_date;
            var cardImgPath = isMovie ? (card.backdrop_path || card.poster_path) : (card.poster_path || card.backdrop_path);
            var poster = cardImgPath ? Lampa.TMDB.image('t/p/w300' + cardImgPath) : './img/img_broken.svg';
            var year = (card.release_date || card.first_air_date || '').slice(0, 4);
            var genres = card.genres ? card.genres.slice(0, 2).map(function(g) { return g.name; }).join(', ') : '';
            var info = [year, genres].filter(Boolean).join(' \u00b7 ');

            var COLLAPS_API  = 'https://api.ortified.ws';  // Обновлен домен
            var COLLAPS_HOST = 'https://api.ortified.ws';
            var COLLAPS_TOKEN = 'eedefb541aeba871dcfc756e6b31c02e';
            var COLLAPS_ORIGIN = 'https://kinokrad.my';

            var defaultHeaders = {
                'Origin': COLLAPS_ORIGIN,
                'Referer': COLLAPS_ORIGIN + '/',
                'Accept': '*/*'
            };

            var apiGet = function(url, cb) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.timeout = 15000;
                for (var h in defaultHeaders) {
                    try { xhr.setRequestHeader(h, defaultHeaders[h]); } catch(e) {}
                }
                xhr.onload = function() {
                    if (xhr.status >= 400) { cb(new Error('Collaps: HTTP ' + xhr.status)); return; }
                    cb(null, xhr.responseText);
                };
                xhr.onerror = xhr.ontimeout = function() { cb(new Error('Collaps: ошибка сети')); };
                xhr.send();
            };

            // Парсим HLS master.m3u8 и возвращаем quality объект
            // Фильтруем только H.264 (avc) потоки — HEVC не работает на WebOS 3
            var parseHlsQualities = function(masterUrl, cb) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', masterUrl, true);
                xhr.timeout = 8000;
                xhr.onload = function() {
                    var text = xhr.responseText;
                    if (!text || text.indexOf('#EXTM3U') < 0) { cb(null); return; }

                    var qualityOrder = ['2160p','1440p','1080p','720p','480p','360p','240p'];
                    var qualities = {};
                    var lines = text.split('\n');
                    var baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);

                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();
                        if (line.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
                        var nextLine = (lines[i + 1] || '').trim();
                        if (!nextLine || nextLine.indexOf('#') === 0) continue;

                        var codecMatch = line.match(/CODECS="([^"]+)"/i);
                        if (codecMatch) {
                            var c = codecMatch[1].toLowerCase();
                            if (c.indexOf('hvc') !== -1 || c.indexOf('hev') !== -1 || c.indexOf('dvh') !== -1) continue;
                        }

                        var rMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
                        var label;
                        if (rMatch) {
                            var w = parseInt(rMatch[1]);
                            label = window.resolveQualityLabel(w);
                        } else {
                            var bwMatch = line.match(/BANDWIDTH=(\d+)/i);
                            if (bwMatch) {
                                var bw = parseInt(bwMatch[1]);
                                label = bw > 4000000 ? '1080p' : bw > 2000000 ? '720p' : bw > 800000 ? '480p' : '360p';
                            }
                        }

                        if (label) {
                            var streamUrl = nextLine.indexOf('http') === 0 ? nextLine : baseUrl + nextLine;
                            if (!qualities[label]) qualities[label] = streamUrl;
                        }
                    }

                    var keys = Object.keys(qualities);
                    if (!keys.length) { cb(null); return; }

                    var sorted = {};
                    qualityOrder.forEach(function(q) { if (qualities[q]) sorted[q] = qualities[q]; });
                    keys.forEach(function(q) { if (!sorted[q]) sorted[q] = qualities[q]; });
                    cb(sorted);
                };
                xhr.onerror = xhr.ontimeout = function() { cb(null); };
                xhr.send();
            };

            var doPlayStream = function(url, t, subs, allEpisodes, currentEpNum, seasonNum, voiceIdx, audioNames, isDash) {
                // Создаем URL resolver для плейлиста
                var urlResolver = function(ep, callback) {
                    // Приоритет: DASH (работает) > HLS (реклама)
                    var epUrl = (ep.dasha || ep.dash || ep.hls || '').replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
                    if (!epUrl) {
                        callback({ url: '' });
                        return;
                    }
                    
                    var epAudioNames = (ep.audio && ep.audio.names)
                        ? ep.audio.names.filter(function(n) { return n && n !== 'delete'; })
                        : audioNames;
                    var epSubs = ep.cc || [];
                    
                    // DASH не поддерживает parseHlsQualities, просто возвращаем URL
                    callback({ url: epUrl });
                };
                
                // Создаем items для плейлиста
                var playlistItems = [];
                if (allEpisodes && allEpisodes.length > 1) {
                    allEpisodes.forEach(function(ep) {
                        var epNum = parseInt(ep.episode, 10) || 0;
                        var epAudioNames = (ep.audio && ep.audio.names)
                            ? ep.audio.names.filter(function(n) { return n && n !== 'delete'; })
                            : audioNames;
                        var epVoiceName = epAudioNames && epAudioNames[voiceIdx] ? epAudioNames[voiceIdx] : '';
                        
                        playlistItems.push({
                            title: t.split(' S')[0] + ' S' + seasonNum + 'E' + epNum + (epVoiceName ? ' — ' + epVoiceName : ''),
                            episode: epNum,
                            season: seasonNum,
                            dasha: ep.dasha,
                            dash: ep.dash,
                            hls: ep.hls,
                            audio: ep.audio,
                            cc: ep.cc
                        });
                    });
                }
                
                // Создаем плейлист через универсальную функцию
                var playlist = window.createOnlinePlaylist(
                    { title: t },
                    playlistItems,
                    urlResolver
                );
                
                // Для WebOS и DASH - просто запускаем
                var playerItem = { title: t, url: url };
                if (subs && subs.length) {
                    playerItem.subtitles = subs.map(function(s) {
                        return { label: s.name.replace(/\s*-\s*\d+$/, ''), url: s.url };
                    });
                }
                Lampa.Player.play(playerItem);
                Lampa.Player.playlist(playlist.length > 0 ? playlist : [playerItem]);
            };

            // --- Парсинг фільму з makePlayer({...}) ---
            var buildMovieFromContent = function(content) {
                // Приоритет: DASH > HLS (т.к. HLS сейчас отдает рекламу)
                var dashMatch = content.match(/dasha?\s*:\s*"(https?:\/\/[^"]+\.mpd[^"]+)"/);
                var hlsMatch  = content.match(/hls\s*:\s*"(https?:\/\/[^"]+\.m3u[^"]+)"/);
                var url = (dashMatch && dashMatch[1]) || (hlsMatch && hlsMatch[1]) || '';
                if (!url) return null;

                url = url.replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
                var isDash = !!dashMatch;

                // Субтитри
                var subs = [];
                var subMatch = content.match(/cc\s*:\s*(\[[^\n\r]+\])/);
                if (subMatch) {
                    try { subs = JSON.parse(subMatch[1]) || []; } catch(e) {}
                }

                // Озвучки
                var audioMatch = content.match(/audio\s*:\s*\{"names":\[([^\]]+)\]/);
                var audioNames = [];
                if (audioMatch) {
                    try {
                        audioNames = JSON.parse('[' + audioMatch[1] + ']');
                    } catch(e) {
                        audioNames = audioMatch[1].replace(/"/g, '').split(',').map(function(s) { return s.trim(); });
                    }
                }
                audioNames = audioNames.filter(function(n) { return n && n !== 'delete'; });

                var makeItems = function(maxQLabel) {
                    var hasSub = subs.length > 0;
                    if (audioNames.length > 1) {
                        return audioNames.map(function(name) {
                            return {
                                title:     name,
                                quality:   isDash ? 'DASH' : maxQLabel,
                                subtitles: hasSub,
                                info:      info,
                                poster:    poster,
                                onPlay: (function(n) {
                                    return function() {
                                        var playerItem = { title: title + ' \u2014 ' + n, url: url };
                                        if (subs.length) {
                                            playerItem.subtitles = subs.map(function(s) {
                                                return { label: (s.name || '').replace(/\s*-\s*\d+$/, ''), url: s.url };
                                            });
                                        }
                                        Lampa.Player.play(playerItem);
                                        Lampa.Player.playlist([playerItem]);
                                    };
                                })(name)
                            };
                        });
                    } else {
                        return [{
                            title:     audioNames[0] || 'Смотреть',
                            quality:   isDash ? 'DASH' : maxQLabel,
                            subtitles: hasSub,
                            info:      info,
                            poster:    poster,
                            onPlay: function() {
                                var playerItem = { title: title, url: url };
                                if (subs.length) {
                                    playerItem.subtitles = subs.map(function(s) {
                                        return { label: (s.name || '').replace(/\s*-\s*\d+$/, ''), url: s.url };
                                    });
                                }
                                Lampa.Player.play(playerItem);
                                Lampa.Player.playlist([playerItem]);
                            }
                        }];
                    }
                };

                if (isDash) return makeItems('DASH');
            };

            // --- Парсинг серіалу з seasons:[...] ---
            var buildSerialFromSeasons = function(seasons) {
                if (!seasons || !seasons.length) return null;
                seasons.sort(function(a, b) { return a.season - b.season; });
                var curSeasonNum = opts.season ? parseInt(opts.season) : seasons[0].season;
                var seasonData = null;
                for (var si = 0; si < seasons.length; si++) {
                    if (seasons[si].season === curSeasonNum) { seasonData = seasons[si]; break; }
                }
                if (!seasonData) seasonData = seasons[0];

                var episodes = seasonData.episodes || [];
                var firstEp = episodes[0] || {};
                var audioNames = (firstEp.audio && firstEp.audio.names)
                    ? firstEp.audio.names.filter(function(n) { return n && n !== 'delete'; })
                    : [];
                var curVoice = opts.voice !== undefined ? parseInt(opts.voice) : 0;
                if (curVoice >= audioNames.length) curVoice = 0;

                var items = [];
                episodes.forEach(function(ep) {
                    var epNum = parseInt(ep.episode, 10) || 0;
                    // Приоритет: DASH > HLS
                    var epUrl = (ep.dasha || ep.dash || ep.hls || '').replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
                    if (!epUrl) return;

                    var epAudioNames = (ep.audio && ep.audio.names)
                        ? ep.audio.names.filter(function(n) { return n && n !== 'delete'; })
                        : audioNames;
                    var voiceName = epAudioNames[curVoice] || '';
                    var subs = ep.cc || [];
                    var isDash = !!(ep.dasha || ep.dash);

                    items.push({
                        title:     ep.title || ('Серия ' + epNum),
                        episode:   epNum,
                        season:    seasonData.season,
                        quality:   isDash ? 'DASH' : '',
                        subtitles: subs.length > 0,
                        info:      info,
                        poster:    poster,
                        onPlay: (function(eUrl, eNum, eAudio, eVoiceIdx, eSubs, allEps, sSeason, eIsDash) {
                            return function() {
                                var vName = eAudio[eVoiceIdx] || '';
                                var t = title + ' S' + sSeason + 'E' + eNum + (vName ? ' \u2014 ' + vName : '');
                                doPlayStream(eUrl, t, eSubs, allEps, eNum, sSeason, eVoiceIdx, eAudio, eIsDash);
                            };
                        })(epUrl, epNum, epAudioNames, curVoice, subs, episodes, seasonData.season, isDash)
                    });
                });

                // Качество уже установлено как DASH, не нужно async определение
                items._meta = {
                    seasons: seasons.map(function(s) { return { id: s.season, name: 'Сезон ' + s.season }; }),
                    curSeason: seasonData.season,
                    curSeasonName: 'Сезон ' + seasonData.season,
                    voices: audioNames.map(function(n, i) { return { id: i, name: n }; }),
                    curVoice: curVoice,
                    curVoiceName: audioNames[curVoice] || ''
                };

                return items;
            };

            // --- Парсинг HTML відповіді embed ---
            var parseEmbedHtml = function(html) {
                // Новий формат: сериал — seasons:[...] прямо в HTML
                var seasonsIdx = html.indexOf('seasons:');
                if (seasonsIdx !== -1) {
                    // Знаходимо JSON масив після "seasons:"
                    var arrStart = html.indexOf('[', seasonsIdx);
                    if (arrStart !== -1) {
                        // Знаходимо кінець масиву
                        var depth = 0, arrEnd = -1;
                        for (var i = arrStart; i < html.length; i++) {
                            if (html[i] === '[' || html[i] === '{') depth++;
                            else if (html[i] === ']' || html[i] === '}') {
                                depth--;
                                if (depth === 0) { arrEnd = i; break; }
                            }
                        }
                        if (arrEnd !== -1) {
                            try {
                                var seasons = JSON.parse(html.substring(arrStart, arrEnd + 1));
                                if (seasons && seasons.length) {
                                    var items = buildSerialFromSeasons(seasons);
                                    if (items && items.length) { callback(null, items); return; }
                                }
                            } catch(e) {}
                        }
                    }
                }

                // Старий формат: makePlayer({...})
                var idx = html.indexOf('makePlayer({');
                if (idx < 0) { callback(new Error('Collaps: не найдено')); return; }
                var start = html.indexOf('{', idx);
                if (start < 0) { callback(new Error('Collaps: не найдено')); return; }
                var depth2 = 0, end = -1;
                for (var j = start; j < html.length; j++) {
                    if (html[j] === '{') depth2++;
                    else if (html[j] === '}') { depth2--; if (depth2 === 0) { end = j; break; } }
                }
                if (end < 0) { callback(new Error('Collaps: ошибка парсинга')); return; }

                var data;
                try { data = (new Function('return ' + html.substring(start, end + 1)))(); }
                catch(e) { callback(new Error('Collaps: ошибка парсинга')); return; }

                var seasons = data.playlist && data.playlist.seasons;
                var items;
                if (seasons && seasons.length) {
                    items = buildSerialFromSeasons(seasons);
                } else if (data.source) {
                    items = buildMovieFromContent(html.substring(start, end + 1));
                }

                if (!items || !items.length) { callback(new Error('Collaps: нет данных')); return; }
                callback(null, items);
            };

            // --- Завантаження embed по kp/imdb/orid ---
            var loadEmbed = function(kpId, imdbId, orid) {
                var url;
                if (orid)        url = COLLAPS_API + '/embed/movie/' + orid;
                else if (kpId)   url = COLLAPS_API + '/embed/kp/' + kpId;
                else if (imdbId) url = COLLAPS_API + '/embed/imdb/' + imdbId;
                else { callback(new Error('Collaps: нет ID')); return; }

                apiGet(url, function(err, html) {
                    if (err) { callback(err); return; }
                    parseEmbedHtml(html || '');
                });
            };

            // --- Пошук по назві через API ---
            var searchByName = function(searchTitle, cb) {
                var url = COLLAPS_API + '/list?token=' + COLLAPS_TOKEN + '&name=' + encodeURIComponent(searchTitle);
                apiGet(url, function(err, text) {
                    if (err) { cb(err); return; }
                    try {
                        var data = JSON.parse(text);
                        var results = (data && data.results) || [];
                        if (!results.length) { cb(null, null); return; }

                        // Шукаємо найкращий збіг по назві і року
                        var yearInt = parseInt(year) || 0;
                        var titleLow = (searchTitle || '').toLowerCase();
                        var best = null, bestScore = -1;

                        results.forEach(function(r) {
                            var score = 0;
                            var rName = (r.name || r.origin_name || '').toLowerCase();
                            if (rName === titleLow) score += 50;
                            else if (rName.indexOf(titleLow) !== -1 || titleLow.indexOf(rName) !== -1) score += 20;
                            if (yearInt && r.year) {
                                var diff = Math.abs(r.year - yearInt);
                                if (diff === 0) score += 30;
                                else if (diff === 1) score += 10;
                                else score -= 10;
                            }
                            if (score > bestScore) { bestScore = score; best = r; }
                        });

                        cb(null, best && bestScore > 0 ? best.id : null);
                    } catch(e) { cb(null, null); }
                });
            };

            // --- Основний flow ---
            var kpId   = card.kinopoisk_id || (card.external_ids && card.external_ids.kinopoisk_id) || null;
            var imdbId = card.imdb_id || (card.external_ids && card.external_ids.imdb_id) || null;

            if (kpId) {
                // Если есть Kinopoisk ID - используем его
                loadEmbed(kpId, null, null);
            } else if (imdbId) {
                // Если есть только IMDB ID - пробуем его, но при 404 ищем по названию
                apiGet(COLLAPS_API + '/embed/imdb/' + imdbId, function(err, html) {
                    if (err || !html) {
                        // IMDB не сработал, пробуем поиск по названию
                        var searchQ = title || originalTitle;
                        searchByName(searchQ, function(err2, orid) {
                            if (err2 || !orid) {
                                if (originalTitle && originalTitle !== title) {
                                    searchByName(originalTitle, function(err3, orid2) {
                                        if (err3 || !orid2) { callback(new Error('Collaps: не найдено')); return; }
                                        loadEmbed(null, null, orid2);
                                    });
                                } else {
                                    callback(new Error('Collaps: не найдено'));
                                }
                            } else {
                                loadEmbed(null, null, orid);
                            }
                        });
                    } else {
                        parseEmbedHtml(html || '');
                    }
                });
            } else {
                // Немає ID — спробуємо через resolveKpId, потім через пошук по назві
                resolveKpId(card, function(kp) {
                    if (kp) { loadEmbed(kp, null, null); return; }

                    // Пошук по назві через Collaps API
                    var searchQ = title || originalTitle;
                    searchByName(searchQ, function(err, orid) {
                        if (err) { callback(err); return; }
                        if (!orid && originalTitle && originalTitle !== title) {
                            searchByName(originalTitle, function(err2, orid2) {
                                if (err2 || !orid2) { callback(new Error('Collaps: не найдено')); return; }
                                loadEmbed(null, null, orid2);
                            });
                        } else if (!orid) {
                            callback(new Error('Collaps: не найдено'));
                        } else {
                            loadEmbed(null, null, orid);
                        }
                    });
                });
            }
        }
    });
