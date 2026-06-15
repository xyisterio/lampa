    // --- KINOTOCHKA (kinovibe.co) SOURCE -----------------------------------------

    registerSource('kinotochka', 'Kinotochka', {
        load: function(card, callback, opts) {
            opts = opts || {};
            var title = card.title || card.name || '';
            var isMovie = !card.number_of_seasons && card.media_type !== 'tv' && !card.first_air_date;
            var cardImgPath = isMovie ? (card.backdrop_path || card.poster_path) : (card.poster_path || card.backdrop_path);
            var poster = cardImgPath ? Lampa.TMDB.image('t/p/w300' + cardImgPath) : './img/img_broken.svg';
            var year = (card.release_date || card.first_air_date || '').slice(0, 4);
            var genres = card.genres ? card.genres.slice(0, 2).map(function(g) { return g.name; }).join(', ') : '';
            var info = [year, genres].filter(Boolean).join(' \u00b7 ');

            var isSerial = !!(card.number_of_seasons || card.media_type === 'tv' || card.first_air_date);

            // Kinotochka підтримує тільки фільми
            if (isSerial) {
                callback(new Error('Kinotochka: тільки фільми'));
                return;
            }

            var parseQualities = function(fileStr) {
                // Формат 1: [480,720]url_template — замінюємо число в URL
                var qMatch = fileStr.match(/\[(\d+(?:,\d+)*)\]/);
                if (qMatch) {
                    var qualities = qMatch[1].split(',');
                    var result = {};
                    qualities.forEach(function(q) {
                        result[q + 'p'] = fileStr.replace(/\[\d+(?:,\d+)*\]/, q);
                    });
                    return result;
                }

                // Формат 2: url_480.mp4,url_720.mp4 — кілька URL через кому
                if (fileStr.indexOf(',') !== -1 && fileStr.indexOf('http') === 0) {
                    var urls = fileStr.split(',').map(function(u) { return u.trim(); }).filter(function(u) { return u.indexOf('http') === 0; });
                    if (urls.length > 1) {
                        var result2 = {};
                        urls.forEach(function(u) {
                            // Витягуємо якість з назви файлу: _480.mp4, _720.mp4, 1080p і т.д.
                            var qm = u.match(/_(\d{3,4})(?:p)?\.(?:mp4|mkv|avi)/i) ||
                                     u.match(/[_\-\/](\d{3,4})p/i) ||
                                     u.match(/(\d{3,4})p/i);
                            var label = qm ? qm[1] + 'p' : ('Вариант ' + (Object.keys(result2).length + 1));
                            result2[label] = u;
                        });
                        return result2;
                    }
                    // Один URL з комою в кінці — прибираємо кому
                    return { 'auto': fileStr.split(',')[0].trim() };
                }

                return { 'auto': fileStr.replace(/,$/, '') };
            };

            var getMaxQualityFromFileStr = function(fileStr) {
                var qMatch = fileStr.match(/\[(\d+(?:,\d+)*)\]/);
                if (qMatch) return window.resolveMaxQualityFromList(qMatch[1].split(','));
                // Формат 2: витягуємо максимальну якість з URL
                if (fileStr.indexOf(',') !== -1) {
                    var nums = [];
                    var re = /_(\d{3,4})(?:p)?\.mp4/gi;
                    var m;
                    while ((m = re.exec(fileStr)) !== null) nums.push(m[1]);
                    if (nums.length) return window.resolveMaxQualityFromList(nums);
                }
                return '';
            };

            var playFile = function(fileStr, t) {
                var quals = parseQualities(fileStr);
                var keys = Object.keys(quals);
                keys.sort(function(a, b) { return parseInt(a) - parseInt(b); });
                var bestKey = keys[keys.length - 1];
                var url = quals[bestKey];
                var playerItem = { title: t, url: url };
                if (keys.length > 1) playerItem.quality = quals;
                Lampa.Player.play(playerItem);
                Lampa.Player.playlist([playerItem]);
            };

            var buildMovieItem = function(fileStr) {
                return [{
                    title:   'Смотреть',
                    quality: getMaxQualityFromFileStr(fileStr),
                    info:    info,
                    poster:  poster,
                    onPlay: function() { playFile(fileStr, title); }
                }];
            };

            var buildEpisodeItems = function(playlist, seasonNum) {
                return playlist.map(function(ep) {
                    var commentRaw = (ep.comment || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
                    var epNumMatch = commentRaw.match(/^(\d+)/);
                    var epNum = epNumMatch ? parseInt(epNumMatch[1]) : 0;
                    var voiceMatch = commentRaw.match(/\[([^\]]+)\]/);
                    var voiceName = voiceMatch ? voiceMatch[1] : '';

                    return {
                        title:   'Серия ' + epNum + (voiceName ? ' [' + voiceName + ']' : ''),
                        quality: getMaxQualityFromFileStr(ep.file || ''),
                        info:    info,
                        poster:  poster,
                        onPlay: (function(episode, eNum, eVoice) {
                            return function() {
                                var t = title + ' S' + seasonNum + 'E' + eNum;
                                if (eVoice) t += ' \u2014 ' + eVoice;
                                playFile(episode.file, t);
                            };
                        })(ep, epNum, voiceName)
                    };
                });
            };

            var loadEmbed = function(embedId, seasonNum, isKpMovie, cb) {
                // embedId може бути числом або повним URL (https://kinovibe.cc/embed/673)
                var embedStr = String(embedId || '');
                var url;
                if (embedStr.indexOf('http') === 0) {
                    url = embedStr; // вже повний URL
                } else if (isKpMovie) {
                    url = 'https://kinovibe.vip/embed/kinopoisk/' + embedStr;
                } else {
                    url = 'https://kinovibe.vip/embed/' + embedStr;
                }
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.timeout = 12000;
                xhr.onload = function() {
                    var html = xhr.responseText || '';
                    var mFile = html.match(/file\s*:\s*"(https?:\/\/[^"]+)"/);
                    if (!mFile) { cb(new Error('Kinotochka: не найдено')); return; }
                    var fileStr = mFile[1].replace(/,\s*$/, '');

                    if (fileStr.indexOf('.txt') !== -1) {
                        var xhrTxt = new XMLHttpRequest();
                        xhrTxt.open('GET', fileStr, true);
                        xhrTxt.timeout = 12000;
                        xhrTxt.onload = function() {
                            var data;
                            try { data = JSON.parse(xhrTxt.responseText); } catch(e) { cb(new Error('Kinotochka: ошибка парсинга')); return; }
                            var playlist = data.playlist || [];
                            if (!playlist.length) { cb(new Error('Kinotochka: нет серий')); return; }
                            cb(null, buildEpisodeItems(playlist, seasonNum));
                        };
                        xhrTxt.onerror = xhrTxt.ontimeout = function() { cb(new Error('Kinotochka: ошибка сети')); };
                        xhrTxt.send();
                    } else {
                        cb(null, buildMovieItem(fileStr));
                    }
                };
                xhr.onerror = xhr.ontimeout = function() { cb(new Error('Kinotochka: ошибка сети')); };
                xhr.send();
            };

            var startWithKp = function(kp) {
                if (!isSerial) {
                    loadEmbed(kp, 0, true, function(err, items) {
                        if (err) { callback(err); return; }
                        callback(null, items);
                    });
                    return;
                }
                var xhr = new XMLHttpRequest();
                xhr.open('GET', 'https://kinovibe.vip/api/find-by-kinopoisk.php?kinopoisk=' + kp, true);
                xhr.timeout = 10000;
                xhr.onload = function() {
                    var list;
                    try { list = JSON.parse(xhr.responseText); } catch(e) { callback(new Error('Kinotochka: ошибка парсинга')); return; }
                    if (!list || !list.length) { callback(new Error('Kinotochka: не найдено')); return; }

                    var seasons = [];
                    list.forEach(function(item) {
                        var sMatch = (item.url || '').match(/-(\d+)-sezon/);
                        var sNum = sMatch ? parseInt(sMatch[1]) : null;
                        var embedRaw = String(item.embed || '');
                        var embedId = embedRaw.indexOf('http') === 0 ? embedRaw : embedRaw.replace(/.*\/embed\//, '');
                        if (sNum && embedId) seasons.push({ season: sNum, embedId: embedId });
                    });
                    if (!seasons.length) {
                        list.forEach(function(item, i) {
                            var embedRaw = String(item.embed || '');
                            var embedId = embedRaw.indexOf('http') === 0 ? embedRaw : embedRaw.replace(/.*\/embed\//, '');
                            if (embedId) seasons.push({ season: i + 1, embedId: embedId });
                        });
                    }
                    seasons.sort(function(a, b) { return a.season - b.season; });
                    if (!seasons.length) { callback(new Error('Kinotochka: не найдено')); return; }

                    // Load first season's episodes
                    var s = seasons[0];
                    loadEmbed(s.embedId, s.season, false, function(err, items) {
                        if (err) { callback(err); return; }
                        callback(null, items);
                    });
                };
                xhr.onerror = xhr.ontimeout = function() { callback(new Error('Kinotochka: ошибка сети')); };
                xhr.send();
            };

            var kpId = card.kinopoisk_id || (card.external_ids && card.external_ids.kinopoisk_id) || null;
            if (kpId) {
                startWithKp(kpId);
            } else {
                resolveKpId(card, function(kp) {
                    if (!kp) { callback(new Error('Kinotochka: нет Кинопоиск ID')); return; }
                    startWithKp(kp);
                });
            }
        }
    });
