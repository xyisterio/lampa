    // --- FILMIX SOURCE (api.filmix.tv) -------------------------------------------

    registerSource('filmix', 'Filmix', {
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

            var FILMIX_API = 'https://api.filmix.tv/api-fx';
            var FILMIX_UA  = 'Dalvik/2.1.0 (Linux; U; Android 12; Xiaomi)';

            // Робимо GET запит до FilmixTV API
            var apiGet = function(url, cb) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.timeout = 12000;
                xhr.setRequestHeader('User-Agent', FILMIX_UA);
                xhr.setRequestHeader('Accept', 'application/json');
                xhr.onload = function() {
                    if (xhr.status === 403) {
                        // Пробуємо прочитати повідомлення з тіла відповіді
                        var msg = 'Filmix: нет доступа';
                        try {
                            var body = JSON.parse(xhr.responseText);
                            if (body && body.message) msg = 'Filmix: ' + body.message;
                        } catch(e) {}
                        cb(new Error(msg));
                        return;
                    }
                    if (xhr.status >= 400) {
                        cb(new Error('Filmix: HTTP ' + xhr.status));
                        return;
                    }
                    try { cb(null, JSON.parse(xhr.responseText)); }
                    catch(e) { cb(new Error('Filmix: ошибка парсинга')); }
                };
                xhr.onerror = xhr.ontimeout = function() { cb(new Error('Filmix: ошибка сети')); };
                xhr.send();
            };

            // Конвертує числове значення якості Filmix у мітку
            // API Filmix повертає f.quality як число: 360, 480, 720, 1080, 1440, 2160
            var qualityLabel = function(q) {
                q = parseInt(q, 10) || 0;
                if (q >= 2160) return '4K';
                if (q >= 1440) return '1440p';
                if (q >= 1080) return '1080p';
                if (q >= 720)  return '720p';
                if (q >= 480)  return '480p';
                if (q >= 360)  return '360p';
                if (q > 0)     return q + 'p';
                return '';
            };

            // Будуємо якості з масиву files (фільтруємо proPlus)
            var buildQualities = function(files) {
                var quals = {};
                files.forEach(function(f) {
                    if (f.proPlus) return; // пропускаємо Pro+
                    var label = qualityLabel(f.quality);
                    if (label && !quals[label]) quals[label] = f.url;
                });
                return quals;
            };

            // Максимальна якість з файлів
            var maxQuality = function(files) {
                var free = files.filter(function(f) { return !f.proPlus; });
                if (!free.length) return '';
                var maxQ = Math.max.apply(null, free.map(function(f) { return parseInt(f.quality, 10) || 0; }));
                return qualityLabel(maxQ);
            };

            // Будуємо items для фільму
            var buildMovieItems = function(videoLinks) {
                var items = [];
                Object.keys(videoLinks).forEach(function(key) {
                    var vd = videoLinks[key];
                    var files = vd.files;
                    if (!files || !files.length) return;
                    var voiceName = vd.voiceover || ('Озвучка ' + (parseInt(key) + 1));
                    var freeFiles = files.filter(function(f) { return !f.proPlus; });
                    if (!freeFiles.length) return;

                    freeFiles.sort(function(a, b) { return (b.quality || 0) - (a.quality || 0); });
                    var bestUrl = freeFiles[0].url;
                    var quals = buildQualities(files);
                    var maxQ = maxQuality(files);

                    items.push({
                        title:   voiceName,
                        quality: maxQ,
                        info:    info,
                        poster:  poster,
                        onPlay: (function(url, vQuals, vName) {
                            return function() {
                                var playerItem = { title: title + ' \u2014 ' + vName, url: url };
                                if (Object.keys(vQuals).length > 1) playerItem.quality = vQuals;
                                Lampa.Player.play(playerItem);
                                Lampa.Player.playlist([playerItem]);
                            };
                        })(bestUrl, quals, voiceName)
                    });
                });
                return items;
            };

            // Будуємо items для серіалу
            var buildSerialItems = function(videoLinks) {
                var seasonMap = {};
                var voiceNames = {};

                Object.keys(videoLinks).forEach(function(voiceKey) {
                    var vd = videoLinks[voiceKey];
                    var voiceName = vd.voiceover || ('Озвучка ' + voiceKey);
                    voiceNames[voiceKey] = voiceName;

                    Object.keys(vd).forEach(function(seasonKey) {
                        if (!seasonKey.startsWith('season-')) return;
                        var sNum = parseInt(seasonKey.replace('season-', ''));
                        if (!seasonMap[sNum]) seasonMap[sNum] = {};
                        if (!seasonMap[sNum][voiceKey]) seasonMap[sNum][voiceKey] = vd[seasonKey];
                    });
                });

                var seasonNums = Object.keys(seasonMap).map(Number).sort(function(a, b) { return a - b; });
                var firstSeason = opts.season ? parseInt(opts.season) : seasonNums[0];
                if (seasonNums.indexOf(firstSeason) < 0) firstSeason = seasonNums[0];

                var availVoices = Object.keys(seasonMap[firstSeason] || {});
                var curVoiceKey = opts.voice !== undefined ? String(opts.voice) : availVoices[0];
                if (availVoices.indexOf(curVoiceKey) < 0) curVoiceKey = availVoices[0];

                var seasonData = (seasonMap[firstSeason] || {})[curVoiceKey];
                if (!seasonData || !seasonData.episodes) return [];

                var epNums = Object.keys(seasonData.episodes)
                    .map(function(e) { return parseInt(e.replace('e', '')); })
                    .sort(function(a, b) { return a - b; });

                // Сохраняем все эпизоды для плейлиста
                var allEpisodes = [];
                epNums.forEach(function(epNum) {
                    var epKey = 'e' + epNum;
                    var ep = seasonData.episodes[epKey];
                    if (ep && ep.files) {
                        allEpisodes.push({
                            episode: epNum,
                            files: ep.files,
                            title: ep.title
                        });
                    }
                });

                var items = epNums.map(function(epNum) {
                    var epKey = 'e' + epNum;
                    var ep = seasonData.episodes[epKey];
                    if (!ep || !ep.files) return null;

                    var freeFiles = ep.files.filter(function(f) { return !f.proPlus; });
                    if (!freeFiles.length) return null;

                    var quals = buildQualities(ep.files);
                    var bestUrl = freeFiles[0].url;
                    var maxQ = maxQuality(ep.files);
                    var voiceName = voiceNames[curVoiceKey] || '';

                    return {
                        title:   ep.title || ('Серия ' + epNum),
                        episode: epNum,
                        season:  firstSeason,
                        quality: maxQ,
                        info:    info,
                        poster:  poster,
                        onPlay: (function(url, vQuals, epNum, sn, vName, allEps) {
                            return function() {
                                var t = title + ' S' + sn + 'E' + epNum + (vName ? ' — ' + vName : '');
                                
                                // URL resolver для плейлиста
                                var urlResolver = function(epItem, callback) {
                                    var epFiles = epItem.files.filter(function(f) { return !f.proPlus; });
                                    if (!epFiles.length) {
                                        callback({ url: '' });
                                        return;
                                    }
                                    
                                    var epQuals = buildQualities(epItem.files);
                                    var epBestUrl = epFiles[0].url;
                                    
                                    callback({
                                        url: epBestUrl,
                                        quality: Object.keys(epQuals).length > 1 ? epQuals : undefined
                                    });
                                };
                                
                                // Создаем items для плейлиста
                                var playlistItems = allEps.map(function(ep) {
                                    return {
                                        title: title + ' S' + sn + 'E' + ep.episode + (vName ? ' — ' + vName : ''),
                                        episode: ep.episode,
                                        season: sn,
                                        files: ep.files
                                    };
                                });
                                
                                // Создаем плейлист через универсальную функцию
                                var playlist = window.createOnlinePlaylist(
                                    { title: t },
                                    playlistItems,
                                    urlResolver
                                );
                                
                                var playerItem = { title: t, url: url };
                                if (Object.keys(vQuals).length > 1) playerItem.quality = vQuals;
                                Lampa.Player.play(playerItem);
                                Lampa.Player.playlist(playlist.length > 0 ? playlist : [playerItem]);
                            };
                        })(bestUrl, quals, epNum, firstSeason, voiceName, allEpisodes)
                    };
                }).filter(Boolean);

                items._meta = {
                    seasons: seasonNums.map(function(s) { return { id: s, name: 'Сезон ' + s }; }),
                    curSeason: firstSeason,
                    curSeasonName: 'Сезон ' + firstSeason,
                    voices: availVoices.map(function(k) { return { id: k, name: voiceNames[k] || k }; }),
                    curVoice: curVoiceKey,
                    curVoiceName: voiceNames[curVoiceKey] || ''
                };

                return items;
            };

            // Нормалізація рядка для порівняння
            var normalize = function(s) {
                return (s || '').toLowerCase()
                    .replace(/[\u0451]/g, '\u0435') // ё -> е
                    .replace(/[^a-z\u0400-\u04ff0-9]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            };

            // Оцінка збігу між карткою і результатом пошуку (більше = краще)
            var scoreMatch = function(item, searchTitles, yearInt) {
                var score = 0;
                var itemTitles = [
                    normalize(item.title),
                    normalize(item.original_name),
                    normalize(item.ru_title)
                ].filter(Boolean);

                var yearDiff = yearInt ? Math.abs((item.year || 0) - yearInt) : 99;

                // Рік: точний збіг +30, ±1 рік +15, інше — штраф
                if (yearDiff === 0) score += 30;
                else if (yearDiff === 1) score += 15;
                else if (yearDiff > 2) score -= 20;

                // Порівнюємо всі комбінації назв
                for (var i = 0; i < searchTitles.length; i++) {
                    var st = searchTitles[i];
                    if (!st) continue;
                    for (var j = 0; j < itemTitles.length; j++) {
                        var it = itemTitles[j];
                        if (st === it) { score += 50; break; }           // точний збіг
                        if (it.indexOf(st) === 0 || st.indexOf(it) === 0) { score += 20; break; } // один є початком іншого
                        if (it.indexOf(st) !== -1 || st.indexOf(it) !== -1) { score += 10; break; } // часткове входження
                    }
                }

                return score;
            };

            // Пошук по назві — повертає найкращий збіг або null
            var doSearch = function(searchTitle, extraTitles, cb) {
                var url = FILMIX_API + '/list?search=' + encodeURIComponent(searchTitle) + '&limit=20';
                apiGet(url, function(err, data) {
                    if (err) { cb(err); return; }
                    var items = (data && data.items) || [];
                    if (!items.length) { cb(null, null); return; }

                    var yearInt = parseInt(year) || 0;
                    var allTitles = [normalize(searchTitle)].concat((extraTitles || []).map(normalize)).filter(Boolean);

                    // Знаходимо найкращий збіг
                    var best = null;
                    var bestScore = -Infinity;

                    for (var i = 0; i < items.length; i++) {
                        var s = scoreMatch(items[i], allTitles, yearInt);
                        if (s > bestScore) {
                            bestScore = s;
                            best = items[i];
                        }
                    }

                    // Якщо найкращий збіг занадто поганий — не повертаємо нічого
                    // (score < 10 означає що ні назва ні рік не збіглись)
                    if (bestScore < 10) { cb(null, null); return; }

                    cb(null, best.id);
                });
            };

            // Завантажуємо відео-лінки
            var doLoad = function(postId) {
                apiGet(FILMIX_API + '/post/' + postId + '/video-links', function(err, videoLinks) {
                    if (err) { callback(err); return; }
                    if (!videoLinks || !Object.keys(videoLinks).length) {
                        callback(new Error('Filmix: нет данных'));
                        return;
                    }

                    var firstVoice = videoLinks[Object.keys(videoLinks)[0]];
                    var isSerial = firstVoice && !firstVoice.files && Object.keys(firstVoice).some(function(k) { return k.startsWith('season-'); });

                    var items = isSerial ? buildSerialItems(videoLinks) : buildMovieItems(videoLinks);

                    if (!items || !items.length) {
                        callback(new Error('Filmix: нет доступных потоков (требуется Pro)'));
                        return;
                    }
                    callback(null, items);
                });
            };

            // Основний flow:
            // 1. Шукаємо по локальній назві (кирилиця), передаємо оригінальну як додаткову
            // 2. Якщо не знайшли — шукаємо по оригінальній назві
            // 3. Якщо і так не знайшли — помилка
            var extraTitles = (originalTitle && originalTitle !== title) ? [originalTitle] : [];

            doSearch(title || originalTitle, extraTitles, function(err, postId) {
                if (err) { callback(err); return; }

                if (!postId && originalTitle && originalTitle !== title) {
                    // Спробуємо по оригінальній назві
                    doSearch(originalTitle, [title], function(err2, postId2) {
                        if (err2) { callback(err2); return; }
                        if (!postId2) { callback(new Error('Filmix: не найдено')); return; }
                        doLoad(postId2);
                    });
                } else if (!postId) {
                    callback(new Error('Filmix: не найдено'));
                } else {
                    doLoad(postId);
                }
            });
        }
    });
