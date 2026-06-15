    // --- FANCDN SOURCE -----------------------------------------------------------

    // Парсим HLS master.m3u8 и определяем максимальное качество
    var parseHlsQuality = function(hlsUrl, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', hlsUrl, true);
        xhr.timeout = 8000;
        xhr.onload = function() {
            var text = xhr.responseText;
            if (!text || text.indexOf('#EXTM3U') < 0) { callback(''); return; }
            
            var lines = text.split('\n');
            var maxRes = 0;
            
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (line.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
                
                var rMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
                if (rMatch) {
                    var w = parseInt(rMatch[1]);
                    if (w > maxRes) maxRes = w;
                }
            }
            
            if (maxRes > 0) {
                callback(window.resolveQualityLabel(maxRes));
            } else {
                callback('');
            }
        };
        xhr.onerror = xhr.ontimeout = function() { callback(''); };
        xhr.send();
    };

    registerSource('fancdn', 'FanCDN', {
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

            var searchTitle = title || originalTitle;
            if (!searchTitle) { callback(new Error('FanCDN: нет названия')); return; }

            notify('FanCDN: поиск...');

            var searchUrl = cdnUrl('/fancdn/search?title=') + encodeURIComponent(searchTitle) +
                            (year ? '&year=' + encodeURIComponent(year) : '');

            var xhr = new XMLHttpRequest();
            xhr.open('GET', searchUrl, true);
            xhr.timeout = 30000;
            xhr.onload = function() {
                var data;
                try { data = JSON.parse(xhr.responseText); } catch(e) {
                    callback(new Error('FanCDN: ошибка парсинга'));
                    return;
                }
                if (data.error) {
                    callback(new Error('FanCDN: ' + data.error));
                    return;
                }

                if (data.is_serial && data.voices && data.seasons) {
                    // Сериал
                    var items = buildSerialItems(data, card, title, info, poster, opts);
                    if (!items || !items.length) { callback(new Error('FanCDN: нет серий')); return; }
                    callback(null, items);
                } else if (data.voices) {
                    // Фильм с озвучками
                    var items = buildMovieItems(data.voices, title, info, poster);
                    if (!items || !items.length) { callback(new Error('FanCDN: нет озвучек')); return; }
                    callback(null, items);
                } else {
                    callback(new Error('FanCDN: неизвестный формат'));
                }
            };
            xhr.onerror = xhr.ontimeout = function() { callback(new Error('FanCDN: ошибка сети')); };
            xhr.send();

            // Строим items для фильма
            function buildMovieItems(voices, movieTitle, movieInfo, moviePoster) {
                var items = voices.map(function(voice) {
                    return {
                        title:   voice.title || 'Смотреть',
                        quality: '',
                        info:    movieInfo,
                        poster:  moviePoster,
                        onPlay: (function(hlsUrl, voiceName) {
                            return function() {
                                var t = movieTitle + (voiceName ? ' \u2014 ' + voiceName : '');
                                Lampa.Player.play({ title: t, url: hlsUrl });
                                Lampa.Player.playlist([{ title: t, url: hlsUrl }]);
                            };
                        })(voice.hls, voice.title)
                    };
                });
                
                // Async: определяем качество по первой озвучке
                if (voices.length > 0 && voices[0].hls) {
                    parseHlsQuality(voices[0].hls, function(maxQ) {
                        if (maxQ) items.forEach(function(it) {
                            it.quality = maxQ;
                            if (it._setQuality) it._setQuality(maxQ);
                        });
                    });
                }
                
                return items;
            }

            // Строим items для сериала
            function buildSerialItems(data, card, movieTitle, movieInfo, moviePoster, opts) {
                var voices = data.voices || [];
                var seasons = data.seasons || {};
                var epUrlTemplate = data.ep_url_template || '';

                var seasonNums = Object.keys(seasons).map(Number).sort(function(a, b) { return a - b; });
                var firstSeason = opts.season ? parseInt(opts.season) : seasonNums[0];
                if (seasonNums.indexOf(firstSeason) < 0) firstSeason = seasonNums[0];

                var curVoiceId = opts.voice !== undefined ? parseInt(opts.voice) : 0;
                if (curVoiceId >= voices.length) curVoiceId = 0;
                var curVoice = voices[curVoiceId] || voices[0];

                var epNums = (seasons[String(firstSeason)] || []).sort(function(a, b) { return a - b; });

                // Сохраняем все эпизоды для плейлиста
                var allEpisodes = epNums.map(function(epNum) {
                    return {
                        episode: epNum,
                        season: firstSeason,
                        epUrlTemplate: epUrlTemplate,
                        voiceIdx: curVoiceId
                    };
                });

                var items = epNums.map(function(epNum) {
                    return {
                        title:   'Серия ' + epNum,
                        episode: epNum,
                        season:  firstSeason,
                        quality: '',
                        info:    movieInfo,
                        poster:  moviePoster,
                        onPlay: (function(ep, sn, voiceIdx, voiceName, allEps) {
                            return function() {
                                var t = movieTitle + ' S' + sn + 'E' + ep + (voiceName ? ' — ' + voiceName : '');
                                
                                // URL resolver для плейлиста
                                var urlResolver = function(epItem, callback) {
                                    var epUrl = epItem.epUrlTemplate
                                        .replace('{season}', epItem.season)
                                        .replace('{episode}', epItem.episode);
                                    
                                    var epXhr = new XMLHttpRequest();
                                    epXhr.open('GET', cdnUrl('/fancdn/episode?url=') + encodeURIComponent(epUrl) + '&voice_idx=' + epItem.voiceIdx, true);
                                    epXhr.timeout = 15000;
                                    epXhr.onload = function() {
                                        try {
                                            var epData = JSON.parse(epXhr.responseText);
                                            if (epData.hls) {
                                                callback({ url: epData.hls });
                                            } else {
                                                callback({ url: '' });
                                            }
                                        } catch(e) {
                                            callback({ url: '' });
                                        }
                                    };
                                    epXhr.onerror = epXhr.ontimeout = function() {
                                        callback({ url: '' });
                                    };
                                    epXhr.send();
                                };
                                
                                // Создаем items для плейлиста
                                var playlistItems = allEps.map(function(epItem) {
                                    return {
                                        title: movieTitle + ' S' + epItem.season + 'E' + epItem.episode + (voiceName ? ' — ' + voiceName : ''),
                                        episode: epItem.episode,
                                        season: epItem.season,
                                        epUrlTemplate: epItem.epUrlTemplate,
                                        voiceIdx: epItem.voiceIdx
                                    };
                                });
                                
                                // Создаем плейлист через универсальную функцию
                                var playlist = window.createOnlinePlaylist(
                                    { title: t },
                                    playlistItems,
                                    urlResolver
                                );
                                
                                // Загружаем текущую серию
                                notify('FanCDN: загрузка...');
                                var epUrl = epUrlTemplate
                                    .replace('{season}', sn)
                                    .replace('{episode}', ep);
                                var epXhr = new XMLHttpRequest();
                                epXhr.open('GET', cdnUrl('/fancdn/episode?url=') + encodeURIComponent(epUrl) + '&voice_idx=' + voiceIdx, true);
                                epXhr.timeout = 15000;
                                epXhr.onload = function() {
                                    var epData;
                                    try { epData = JSON.parse(epXhr.responseText); } catch(e) { notify('FanCDN: ошибка'); return; }
                                    if (!epData.hls) { notify('FanCDN: нет стрима'); return; }
                                    Lampa.Player.play({ title: t, url: epData.hls });
                                    Lampa.Player.playlist(playlist.length > 0 ? playlist : [{ title: t, url: epData.hls }]);
                                };
                                epXhr.onerror = epXhr.ontimeout = function() { notify('FanCDN: ошибка сети'); };
                                epXhr.send();
                            };
                        })(epNum, firstSeason, curVoiceId, curVoice ? curVoice.title : '', allEpisodes)
                    };
                });
                
                // Async: определяем качество по первому эпизоду
                if (epNums.length > 0) {
                    var firstEpUrl = epUrlTemplate
                        .replace('{season}', firstSeason)
                        .replace('{episode}', epNums[0]);
                    
                    var qXhr = new XMLHttpRequest();
                    qXhr.open('GET', cdnUrl('/fancdn/episode?url=') + encodeURIComponent(firstEpUrl) + '&voice_idx=' + curVoiceId, true);
                    qXhr.timeout = 10000;
                    qXhr.onload = function() {
                        try {
                            var qData = JSON.parse(qXhr.responseText);
                            if (qData.hls) {
                                parseHlsQuality(qData.hls, function(maxQ) {
                                    if (maxQ) items.forEach(function(it) {
                                        it.quality = maxQ;
                                        if (it._setQuality) it._setQuality(maxQ);
                                    });
                                });
                            }
                        } catch(e) {}
                    };
                    qXhr.onerror = qXhr.ontimeout = function() {};
                    qXhr.send();
                }

                items._meta = {
                    seasons: seasonNums.map(function(s) { return { id: s, name: 'Сезон ' + s }; }),
                    curSeason: firstSeason,
                    curSeasonName: 'Сезон ' + firstSeason,
                    voices: voices.map(function(v) { return { id: v.id, name: v.title || ('Озвучка ' + v.id) }; }),
                    curVoice: curVoiceId,
                    curVoiceName: curVoice ? (curVoice.title || '') : ''
                };

                return items;
            }
        }
    });
