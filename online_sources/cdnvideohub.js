    // --- CDNVIDEOHUB SOURCE ------------------------------------------------------

    registerSource('cdnvideohub', 'CDNvideohub', {
        load: function(card, callback, opts) {
            opts = opts || {};
            var title = card.title || card.name || '';
            var isMovie = !card.number_of_seasons && card.media_type !== 'tv' && !card.first_air_date;
            var cardImgPath = isMovie ? (card.backdrop_path || card.poster_path) : (card.poster_path || card.backdrop_path);
            var poster = cardImgPath ? Lampa.TMDB.image('t/p/w300' + cardImgPath) : './img/img_broken.svg';
            var year = (card.release_date || card.first_air_date || '').slice(0, 4);
            var genres = card.genres ? card.genres.slice(0, 2).map(function(g) { return g.name; }).join(', ') : '';
            var info = [year, genres].filter(Boolean).join(' \u00b7 ');

            var parseMasterQualities = function(hlsUrl, cb) {
                var proxyUrl = cdnUrl('/proxy?url=') + encodeURIComponent(hlsUrl);
                var xhr = new XMLHttpRequest();
                xhr.open('GET', proxyUrl, true);
                xhr.timeout = 10000;
                xhr.onload = function() {
                    var text = xhr.responseText;
                    if (!text || text.trim().indexOf('#EXTM3U') !== 0) {
                        cb({ 'auto': proxyUrl }); return;
                    }

                    var qualityMap = {
                        'ultra': '2160p', '4k': '2160p', 'quad': '1440p', '2k': '1440p',
                        'full': '1080p', 'hd': '720p', 'sd': '480p', 'low': '360p',
                        'lowest': '240p', 'mobile': '144p'
                    };
                    var qualityOrder = ['2160p','1440p','1080p','720p','480p','360p','240p','144p'];
                    var qualities = {};
                    var subtitles = [];
                    var lines = text.split('\n');

                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();

                        // Парсимо субтитри: #EXT-X-MEDIA:TYPE=SUBTITLES
                        if (line.indexOf('#EXT-X-MEDIA:TYPE=SUBTITLES') === 0 || line.indexOf('#EXT-X-MEDIA:TYPE="SUBTITLES"') === 0) {
                            var nameM = line.match(/NAME="([^"]+)"/i);
                            var uriM  = line.match(/URI="([^"]+)"/i);
                            if (nameM && uriM) {
                                var subUri = uriM[1];
                                if (subUri.indexOf('http') !== 0) subUri = hlsUrl.substring(0, hlsUrl.lastIndexOf('/') + 1) + subUri;
                                subtitles.push({ label: nameM[1], url: cdnUrl('/proxy?url=') + encodeURIComponent(subUri) });
                            }
                            continue;
                        }

                        if (line.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
                        var nextLine = (lines[i + 1] || '').trim();
                        if (!nextLine || nextLine.indexOf('#') === 0) continue;

                        var label;
                        var qMatch = line.match(/QUALITY=([^,\s]+)/i);
                        var rMatch = line.match(/RESOLUTION=(\d+x\d+)/i);

                        if (qMatch) {
                            label = qualityMap[qMatch[1].toLowerCase()];
                            if (!label) { var num = parseInt(qMatch[1]); label = num ? num + 'p' : qMatch[1]; }
                        } else if (rMatch) {
                            label = window.resolveQualityLabel(parseInt(rMatch[1].split('x')[0]));
                        }

                        if (label && !qualities[label]) {
                            var subUrl = nextLine.indexOf('http') === 0 ? nextLine : (hlsUrl.substring(0, hlsUrl.lastIndexOf('/') + 1) + nextLine);
                            var PROXY_BASE = cdnUrl('');
                            qualities[label] = subUrl.indexOf(PROXY_BASE) === 0 ? subUrl : cdnUrl('/proxy?url=') + encodeURIComponent(subUrl);
                        }
                    }

                    if (Object.keys(qualities).length === 0) { cb({ 'auto': proxyUrl }, subtitles); return; }
                    var sorted = {};
                    qualityOrder.forEach(function(q) { if (qualities[q]) sorted[q] = qualities[q]; });
                    Object.keys(qualities).forEach(function(q) { if (!sorted[q]) sorted[q] = qualities[q]; });
                    cb(sorted, subtitles);
                };
                xhr.onerror = xhr.ontimeout = function() { cb({ 'auto': cdnUrl('/proxy?url=') + encodeURIComponent(hlsUrl) }, []); };
                xhr.send();
            };

            var playVkId = function(vkId, voiceName, cb) {
                notify('CDNvideohub: загрузка...');
                var xhr = new XMLHttpRequest();
                xhr.open('GET', cdnUrl('/cdnvideohub/video?vkId=') + vkId, true);
                xhr.timeout = 15000;
                xhr.onload = function() {
                    var data;
                    try { data = JSON.parse(xhr.responseText); } catch(e) { notify('CDNvideohub: ошибка'); return; }
                    var sources = data.sources || {};
                    var hlsUrl = sources.hlsUrl;
                    if (!hlsUrl) {
                        var mp4Url = sources.mpegFullHdUrl || sources.mpegHighUrl || sources.mpegMediumUrl || sources.mpegLowUrl;
                        if (!mp4Url) { notify('CDNvideohub: нет стрима'); return; }
                        var proxiedMp4 = cdnUrl('/proxy?url=') + encodeURIComponent(mp4Url);
                        cdnStartKeepAlive();
                        Lampa.Player.play({ title: title + (voiceName ? ' \u2014 ' + voiceName : ''), url: proxiedMp4 });
                        Lampa.Player.playlist([{ url: proxiedMp4 }]);
                        return;
                    }
                    var proxiedHls = cdnUrl('/proxy?url=') + encodeURIComponent(hlsUrl);
                    parseMasterQualities(hlsUrl, function(quals, subs) {
                        var isWebOS = Lampa.Platform && Lampa.Platform.is('webos');
                        if (sources.mpegFullHdUrl) quals['1080p MP4'] = CDNVIDEOHUB_PROXY + '/proxy_mp4?url=' + encodeURIComponent(sources.mpegFullHdUrl);
                        if (sources.mpegHighUrl)   quals['720p MP4']  = CDNVIDEOHUB_PROXY + '/proxy_mp4?url=' + encodeURIComponent(sources.mpegHighUrl);
                        if (sources.mpegMediumUrl) quals['480p MP4']  = CDNVIDEOHUB_PROXY + '/proxy_mp4?url=' + encodeURIComponent(sources.mpegMediumUrl);
                        if (sources.mpegLowUrl)    quals['360p MP4']  = CDNVIDEOHUB_PROXY + '/proxy_mp4?url=' + encodeURIComponent(sources.mpegLowUrl);
                        var playerItem = { title: title + (voiceName ? ' \u2014 ' + voiceName : ''), url: proxiedHls };
                        if (!isWebOS && Object.keys(quals).length > 0) playerItem.quality = quals;
                        if (subs && subs.length) playerItem.subtitles = subs;
                        cdnStartKeepAlive();
                        if (cb) cb(playerItem);
                        else {
                            Lampa.Player.play(playerItem);
                            Lampa.Player.playlist([playerItem]);
                        }
                    });
                };
                xhr.onerror = xhr.ontimeout = function() { notify('CDNvideohub: ошибка сети'); };
                xhr.send();
            };

            var buildMovieItems = function(items) {
                var movieItems = items.map(function(item) {
                    var label = (item.voiceStudio || item.voiceType || item.voice || item.translation || item.title || item.name || item.label || 'Оригинал').trim() || 'Оригинал';
                    return {
                        title:   label,
                        quality: '',
                        info:    info,
                        poster:  poster,
                        _vkId:   item.vkId,
                        onPlay: (function(vkId, voiceName) {
                            return function() { playVkId(vkId, voiceName, null); };
                        })(item.vkId, label)
                    };
                });
                return movieItems;
            };

            var buildMovieItemsWithQuality = function(rawItems, cb) {
                var movieItems = buildMovieItems(rawItems);
                if (!movieItems.length) { cb(movieItems); return; }

                // Запрашиваем качество для каждого item параллельно
                var pending = movieItems.length;
                var done = function() {
                    if (--pending === 0) cb(window.sortItemsByQuality(movieItems));
                };

                movieItems.forEach(function(it) {
                    var vkId = it._vkId;
                    if (!vkId) { done(); return; }
                    var xhrQ = new XMLHttpRequest();
                    xhrQ.open('GET', cdnUrl('/cdnvideohub/video?vkId=') + vkId, true);
                    xhrQ.timeout = 8000;
                    xhrQ.onload = function() {
                        try {
                            var vd = JSON.parse(xhrQ.responseText);
                            var hlsUrl = (vd.sources || {}).hlsUrl;
                            if (hlsUrl) {
                                parseMasterQualities(hlsUrl, function(quals) {
                                    it.quality = window.resolveMaxQualityFromList(Object.keys(quals));
                                    done();
                                });
                                return;
                            }
                            // Нет HLS — определяем по mp4
                            var src = vd.sources || {};
                            if (src.mpegFullHdUrl) it.quality = '1080p';
                            else if (src.mpegHighUrl) it.quality = '720p';
                            else if (src.mpegMediumUrl) it.quality = '480p';
                            else if (src.mpegLowUrl) it.quality = '360p';
                        } catch(e) {}
                        done();
                    };
                    xhrQ.onerror = xhrQ.ontimeout = function() { done(); };
                    xhrQ.send();
                });
            };

            var buildSerialItems = function(items) {
                // Normalize season/episode to numbers to avoid string vs number comparison issues
                items.forEach(function(item) {
                    item.season  = parseInt(item.season,  10) || 0;
                    item.episode = parseInt(item.episode, 10) || 0;
                });

                var seasons = {};
                items.forEach(function(item) { if (!seasons[item.season]) seasons[item.season] = true; });
                var seasonNums = Object.keys(seasons).map(Number).sort(function(a, b) { return a - b; });
                var firstSeason = opts.season ? parseInt(opts.season) : seasonNums[0];
                if (seasonNums.indexOf(firstSeason) < 0) firstSeason = seasonNums[0];

                var voices = {};
                items.filter(function(i) { return i.season === firstSeason; }).forEach(function(i) {
                    var v = (i.voiceStudio || i.voiceType || i.voice || i.translation || '').trim() || 'Оригинал';
                    if (!voices[v]) voices[v] = true;
                });
                var voiceList = Object.keys(voices);
                // If opts.voice not available for this season — use first available
                var curVoice = (opts.voice && voiceList.indexOf(opts.voice) !== -1) ? opts.voice : voiceList[0] || '';

                var eps = items.filter(function(i) {
                    var v = (i.voiceStudio || i.voiceType || i.voice || i.translation || '').trim() || 'Оригинал';
                    return i.season === firstSeason && v === curVoice;
                }).sort(function(a, b) { return a.episode - b.episode; });

                if (!eps.length) {
                    eps = items.filter(function(i) { return i.season === firstSeason; })
                               .sort(function(a, b) { return a.episode - b.episode; });
                }

                // Сохраняем все эпизоды для плейлиста
                var allEpisodes = eps.map(function(item) {
                    return {
                        episode: item.episode,
                        season: firstSeason,
                        vkId: item.vkId,
                        voice: (item.voiceStudio || item.voiceType || item.voice || item.translation || '').trim() || 'Оригинал'
                    };
                });

                var result = eps.map(function(item) {
                    var epNum = item.episode;
                    var voice = (item.voiceStudio || item.voiceType || item.voice || item.translation || '').trim() || 'Оригинал';
                    return {
                        title:   'Серия ' + epNum,
                        episode: epNum,
                        season:  firstSeason,
                        quality: '',
                        info:    info,
                        poster:  poster,
                        onPlay: (function(vkId, ep, voiceName, season, allEps) {
                            return function() {
                                var t = title + ' S' + season + 'E' + ep + (voiceName ? ' — ' + voiceName : '');
                                
                                // URL resolver для плейлиста
                                var urlResolver = function(epItem, callback) {
                                    var xhr = new XMLHttpRequest();
                                    xhr.open('GET', cdnUrl('/cdnvideohub/video?vkId=') + epItem.vkId, true);
                                    xhr.timeout = 15000;
                                    xhr.onload = function() {
                                        try {
                                            var data = JSON.parse(xhr.responseText);
                                            var hlsUrl = (data.sources || {}).hlsUrl;
                                            if (!hlsUrl) {
                                                var mp4Url = (data.sources||{}).mpegFullHdUrl || (data.sources||{}).mpegHighUrl || (data.sources||{}).mpegMediumUrl;
                                                if (mp4Url) {
                                                    var proxiedMp4 = cdnUrl('/proxy?url=') + encodeURIComponent(mp4Url);
                                                    cdnStartKeepAlive();
                                                    callback({ url: proxiedMp4 });
                                                } else {
                                                    callback({ url: '' });
                                                }
                                                return;
                                            }
                                            var proxiedHls = cdnUrl('/proxy?url=') + encodeURIComponent(hlsUrl);
                                            parseMasterQualities(hlsUrl, function(quals, subs) {
                                                var isWebOS = Lampa.Platform && Lampa.Platform.is('webos');
                                                var result = { url: proxiedHls };
                                                if (!isWebOS && Object.keys(quals).length > 0) result.quality = quals;
                                                if (subs && subs.length) result.subtitles = subs;
                                                cdnStartKeepAlive();
                                                callback(result);
                                            });
                                        } catch(e) {
                                            callback({ url: '' });
                                        }
                                    };
                                    xhr.onerror = xhr.ontimeout = function() {
                                        callback({ url: '' });
                                    };
                                    xhr.send();
                                };
                                
                                // Создаем items для плейлиста
                                var playlistItems = allEps.map(function(epItem) {
                                    return {
                                        title: title + ' S' + epItem.season + 'E' + epItem.episode + (epItem.voice ? ' — ' + epItem.voice : ''),
                                        episode: epItem.episode,
                                        season: epItem.season,
                                        vkId: epItem.vkId
                                    };
                                });
                                
                                // Создаем плейлист через универсальную функцию
                                var playlist = window.createOnlinePlaylist(
                                    { title: t },
                                    playlistItems,
                                    urlResolver
                                );
                                
                                // Загружаем текущую серию
                                notify('CDNvideohub: загрузка...');
                                var xhr = new XMLHttpRequest();
                                xhr.open('GET', cdnUrl('/cdnvideohub/video?vkId=') + vkId, true);
                                xhr.timeout = 15000;
                                xhr.onload = function() {
                                    var data;
                                    try { data = JSON.parse(xhr.responseText); } catch(e) { notify('CDNvideohub: ошибка'); return; }
                                    var hlsUrl = (data.sources || {}).hlsUrl;
                                    if (!hlsUrl) {
                                        var mp4Url = (data.sources||{}).mpegFullHdUrl || (data.sources||{}).mpegHighUrl || (data.sources||{}).mpegMediumUrl;
                                        if (!mp4Url) { notify('CDNvideohub: нет стрима'); return; }
                                        var proxiedMp4 = cdnUrl('/proxy?url=') + encodeURIComponent(mp4Url);
                                        cdnStartKeepAlive();
                                        Lampa.Player.play({ title: t, url: proxiedMp4 });
                                        Lampa.Player.playlist(playlist.length > 0 ? playlist : [{ url: proxiedMp4 }]);
                                        return;
                                    }
                                    var proxiedHls = cdnUrl('/proxy?url=') + encodeURIComponent(hlsUrl);
                                    parseMasterQualities(hlsUrl, function(quals, subs) {
                                        var isWebOS = Lampa.Platform && Lampa.Platform.is('webos');
                                        var playerItem = { title: t, url: proxiedHls };
                                        if (!isWebOS && Object.keys(quals).length > 0) playerItem.quality = quals;
                                        if (subs && subs.length) playerItem.subtitles = subs;
                                        cdnStartKeepAlive();
                                        Lampa.Player.play(playerItem);
                                        Lampa.Player.playlist(playlist.length > 0 ? playlist : [playerItem]);
                                    });
                                };
                                xhr.onerror = xhr.ontimeout = function() { notify('CDNvideohub: ошибка сети'); };
                                xhr.send();
                            };
                        })(item.vkId, epNum, voice, firstSeason, allEpisodes)
                    };
                });

                result._meta = {
                    seasons: seasonNums.map(function(s) { return { id: s, name: 'Сезон ' + s }; }),
                    curSeason: firstSeason,
                    curSeasonName: 'Сезон ' + firstSeason,
                    voices: voiceList.map(function(v) { return { id: v, name: v }; }),
                    curVoice: curVoice,
                    curVoiceName: curVoice
                };

                return result;
            };

            var doLoad = function(kpId) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', cdnUrl('/cdnvideohub/playlist?kp=') + kpId, true);
                xhr.timeout = 15000;
                xhr.onload = function() {
                    var data;
                    try { data = JSON.parse(xhr.responseText); } catch(e) { callback(new Error('CDNvideohub: ошибка парсинга')); return; }
                    if (!data || !data.items || !data.items.length) { callback(new Error('CDNvideohub: не найдено')); return; }

                    if (data.isSerial) {
                        var items = buildSerialItems(data.items);
                        if (!items || !items.length) { callback(new Error('CDNvideohub: нет данных')); return; }
                        callback(null, items);

                        // Async: определяем качество по первому vkId для сериала
                        var firstVkId = data.items[0] && data.items[0].vkId;
                        if (firstVkId) {
                            var xhrQ = new XMLHttpRequest();
                            xhrQ.open('GET', cdnUrl('/cdnvideohub/video?vkId=') + firstVkId, true);
                            xhrQ.timeout = 10000;
                            xhrQ.onload = function() {
                                try {
                                    var vd = JSON.parse(xhrQ.responseText);
                                    var hlsUrl = (vd.sources || {}).hlsUrl;
                                    if (!hlsUrl) return;
                                    parseMasterQualities(hlsUrl, function(quals) {
                                        var maxQ = window.resolveMaxQualityFromList(Object.keys(quals));
                                        if (maxQ) items.forEach(function(it) {
                                            it.quality = maxQ;
                                            if (it._setQuality) it._setQuality(maxQ);
                                        });
                                    });
                                } catch(e) {}
                            };
                            xhrQ.send();
                        }
                    } else {
                        // Фильм: определяем качество каждой озвучки параллельно, потом сортируем
                        buildMovieItemsWithQuality(data.items, function(items) {
                            if (!items || !items.length) { callback(new Error('CDNvideohub: нет данных')); return; }
                            callback(null, items);
                        });
                    }
                };
                xhr.onerror = xhr.ontimeout = function() { callback(new Error('CDNvideohub: ошибка сети')); };
                xhr.send();
            };

            var kpId = card.kinopoisk_id || (card.external_ids && card.external_ids.kinopoisk_id) || null;
            if (kpId) {
                doLoad(kpId);
            } else {
                resolveKpId(card, function(kp) {
                    if (!kp) { callback(new Error('CDNvideohub: нет Кинопоиск ID')); return; }
                    doLoad(kp);
                });
            }
        }
    });
