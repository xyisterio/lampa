    // --- ALLOHA SOURCE -----------------------------------------------------------

    registerSource('alloha', 'Alloha 4K', {
        load: function(card, callback, opts) {
            opts = opts || {};
            var title = card.title || card.name || '';
            var isMovie = !card.number_of_seasons && card.media_type !== 'tv' && !card.first_air_date;
            var cardImgPath = isMovie ? (card.backdrop_path || card.poster_path) : (card.poster_path || card.backdrop_path);
            var poster = cardImgPath ? Lampa.TMDB.image('t/p/w300' + cardImgPath) : './img/img_broken.svg';
            var year = (card.release_date || card.first_air_date || '').slice(0, 4);
            var genres = card.genres ? card.genres.slice(0, 2).map(function(g) { return g.name; }).join(', ') : '';
            var info = [year, genres].filter(Boolean).join(' \u00b7 ');

            var qualOrder = ['2160','1440','1080','720','480','360'];

            var WATCHED_KEY = 'alloha_watched_last';
            var watchedGet = function() {
                var file_id = Lampa.Utils.hash(card.number_of_seasons ? (card.original_name || '') : (card.original_title || card.original_name || ''));
                var all = Lampa.Storage.cache(WATCHED_KEY, 5000, {});
                return all[file_id] || null;
            };
            var watchedSet = function(data) {
                var file_id = Lampa.Utils.hash(card.number_of_seasons ? (card.original_name || '') : (card.original_title || card.original_name || ''));
                var all = Lampa.Storage.cache(WATCHED_KEY, 5000, {});
                if (!all[file_id]) all[file_id] = {};
                Lampa.Arrays.extend(all[file_id], data, true);
                Lampa.Storage.set(WATCHED_KEY, all);
            };

            var getMaxQuality = function(qualObj) {
                for (var qi = 0; qi < qualOrder.length; qi++) {
                    if (qualObj && qualObj[qualOrder[qi]]) return qualOrder[qi] + 'p';
                }
                return '';
            };

            var buildStreams = function(qualObj) {
                var tStreams = [];
                for (var qi = 0; qi < qualOrder.length; qi++) {
                    var q = qualOrder[qi];
                    if (qualObj && qualObj[q]) {
                        var u = qualObj[q].split(' or ')[0].trim();
                        if (u.indexOf('//') === 0) u = 'https:' + u;
                        tStreams.push({ quality: q + 'p', url: u });
                    }
                }
                return tStreams;
            };

            var loadPI = function(tokenMovie, partnerToken, cb) {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', getProxyUrl() + '/alloha/player-info', true);
                xhr.timeout = 20000;
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.onload = function() {
                    if (xhr.status !== 200) { cb(new Error('pi_' + xhr.status)); return; }
                    var pi; try { pi = JSON.parse(xhr.responseText); } catch(e) { cb(new Error('parse')); return; }
                    if (!pi || !pi.ok || !pi.nk) { cb(new Error(pi && pi.error || 'nk_not_found')); return; }
                    cb(null, pi);
                };
                xhr.onerror = function() { cb(new Error('network')); };
                xhr.ontimeout = function() { cb(new Error('timeout')); };
                xhr.send(JSON.stringify({ token_movie: tokenMovie, partner_token: partnerToken }));
            };

            var partnerToken = getAllohaToken();
            var _tokenMovie = null;

            var buildSerialItems = function(pi) {
                var fl = pi.file_list;
                if (!fl || fl.type !== 'serial' || !fl.all) return null;

                var translations = {};
                var seasons = Object.keys(fl.all).sort(function(a, b) { return parseInt(a) - parseInt(b); });
                seasons.forEach(function(s) {
                    Object.keys(fl.all[s]).forEach(function(e) {
                        Object.keys(fl.all[s][e]).forEach(function(k) {
                            if (!translations[k]) translations[k] = fl.all[s][e][k].translation || ('Перевод ' + k);
                        });
                    });
                });
                var tKeys = Object.keys(translations);

                var savedKey = 'alloha_last_' + card.id;
                var saved = Lampa.Storage.get(savedKey, '{}');
                try { saved = typeof saved === 'string' ? JSON.parse(saved) : saved; } catch(e) { saved = {}; }

                var curSeason = opts.season || saved.season || seasons[0] || null;
                var curTransKey = opts.voice || saved.voice || tKeys[0] || null;
                if (seasons.indexOf(String(curSeason)) < 0) curSeason = seasons[0] || null;
                if (tKeys.indexOf(curTransKey) < 0) curTransKey = tKeys[0] || null;

                var eps = fl.all[curSeason] || {};
                var availEps = Object.keys(eps).filter(function(e) { return curTransKey ? eps[e][curTransKey] : true; })
                    .sort(function(a, b) { return parseInt(a) - parseInt(b); });

                var items = [];
                var w = watchedGet();

                // Continue watching banner
                if (w && (w.episode || w.season)) {
                    var parts = [];
                    if (w.voice_name) parts.push(w.voice_name);
                    if (w.season) parts.push('Сезон ' + w.season);
                    if (w.episode) parts.push('Серия ' + w.episode);
                    items.push({
                        title:   'Продолжить \u2022 ' + parts.join(' \u2022 '),
                        quality: '',
                        info:    info,
                        poster:  poster,
                        onPlay: (function(ww, sn, tk) {
                            return function() {
                                var epToPlay = ww.episode ? String(ww.episode) : availEps[0];
                                var epEntry = tk ? eps[epToPlay] && eps[epToPlay][tk] : eps[epToPlay] && eps[epToPlay][Object.keys(eps[epToPlay] || {})[0]];
                                if (!epEntry) { notify('Alloha: поиск не дал результатов'); return; }
                                if (_tokenMovie) {
                                    loadPI(_tokenMovie, partnerToken, function(errPi, freshPi) {
                                        var useNk = (errPi || !freshPi) ? pi.nk : freshPi.nk;
                                        var usePurl = (errPi || !freshPi) ? pi.player_url : freshPi.player_url;
                                        allohaPlayEpisode(String(epEntry.id), partnerToken, useNk, usePurl, card, sn, epToPlay, tk, _tokenMovie);
                                    });
                                } else {
                                    allohaPlayEpisode(String(epEntry.id), partnerToken, pi.nk, pi.player_url, card, sn, epToPlay, tk, _tokenMovie);
                                }
                            };
                        })(w, curSeason, curTransKey)
                    });
                }

                availEps.forEach(function(epNum) {
                    var epEntry = curTransKey ? eps[epNum][curTransKey] : eps[epNum][Object.keys(eps[epNum])[0]];
                    if (!epEntry) return;
                    items.push({
                        title:   'Серия ' + epNum,
                        episode: parseInt(epNum) || 0,
                        season:  parseInt(curSeason) || 1,
                        quality: '',
                        info:    info,
                        poster:  poster,
                        onPlay: (function(en, ee, sn, tk) {
                            return function() {
                                watchedSet({
                                    source: 'alloha',
                                    voice_name: translations[tk] || tk || '',
                                    season: parseInt(sn),
                                    episode: parseInt(en)
                                });
                                if (_tokenMovie) {
                                    loadPI(_tokenMovie, partnerToken, function(errPi, freshPi) {
                                        if (errPi || !freshPi) {
                                            allohaPlayEpisode(String(ee.id), partnerToken, pi.nk, pi.player_url, card, sn, en, tk, _tokenMovie);
                                            return;
                                        }
                                        allohaPlayEpisode(String(ee.id), partnerToken, freshPi.nk, freshPi.player_url, card, sn, en, tk, _tokenMovie);
                                    });
                                } else {
                                    allohaPlayEpisode(String(ee.id), partnerToken, pi.nk, pi.player_url, card, sn, en, tk, _tokenMovie);
                                }
                            };
                        })(epNum, epEntry, curSeason, curTransKey)
                    });
                });
                
                // Async: определяем качество по первому эпизоду
                var firstEpNum = availEps[0];
                if (firstEpNum && curTransKey) {
                    var firstEpEntry = eps[firstEpNum][curTransKey];
                    if (firstEpEntry && firstEpEntry.id) {
                        allohaGetBnsiStreams(String(firstEpEntry.id), partnerToken, pi.nk, pi.player_url, function(err, streams) {
                            if (err || !streams || !streams.length) return;
                            var maxQ = streams[0].quality || '';
                            if (maxQ) items.forEach(function(it) {
                                if (it.episode) { // Skip "Continue watching" item
                                    it.quality = maxQ;
                                    if (it._setQuality) it._setQuality(maxQ);
                                }
                            });
                        }, _tokenMovie);
                    }
                }

                items._meta = {
                    seasons: seasons.map(function(s) { return { id: s, name: 'Сезон ' + s }; }),
                    curSeason: curSeason,
                    curSeasonName: 'Сезон ' + curSeason,
                    voices: tKeys.map(function(k) { return { id: k, name: translations[k] || k }; }),
                    curVoice: curTransKey,
                    curVoiceName: translations[curTransKey] || curTransKey || ''
                };

                return items;
            };

            var buildMovieItems = function(pi) {
                var fileId = pi.file_id;
                if (!fileId) return null;

                var runtime = card.runtime || 0;
                var timeStr = runtime ? (Math.floor(runtime / 60) + ':' + ('0' + (runtime % 60)).slice(-2)) : '';
                var posterPath = card.poster_path || '';
                var movieTitle = title;

                // We need to fetch streams first, then build items
                return null; // handled async below
            };

            var doLoadPI = function(tokenMovie) {
                _tokenMovie = tokenMovie;
                loadPI(tokenMovie, partnerToken, function(err2, pi) {
                    if (err2) { callback(new Error('Alloha: ошибка (' + err2.message + ')')); return; }

                    if (pi.bundle_app || pi.bundle_runtime || pi.bundle_539) {
                        var fh = (pi.bundle_app ? 'src="' + pi.bundle_app + '"' : '') +
                                 (pi.bundle_runtime ? 'src="' + pi.bundle_runtime + '"' : '') +
                                 (pi.bundle_539 ? 'src="' + pi.bundle_539 + '"' : '');
                        allohaDetectBundleUrls(fh);
                    }

                    if (pi.file_list && pi.file_list.type === 'serial' && pi.file_list.all) {
                        var items = buildSerialItems(pi);
                        if (!items || !items.length) { callback(new Error('Alloha: нет серий')); return; }
                        callback(null, items);
                    } else {
                        // Movie: fetch streams async
                        var fileId = pi.file_id;
                        if (!fileId) { callback(new Error('Alloha: не удалось получить ID фильма')); return; }

                        notify('Alloha: загрузка...');
                        allohaGetBnsiStreams(fileId, partnerToken, pi.nk, pi.player_url, function(err, streams, translations) {
                            if (err || !streams || !streams.length) {
                                callback(new Error('Alloha: ошибка (' + (err ? err.message : 'нет данных') + ')'));
                                return;
                            }

                            var runtime = card.runtime || 0;
                            var timeStr = runtime ? (Math.floor(runtime / 60) + ':' + ('0' + (runtime % 60)).slice(-2)) : '';
                            var posterPath = card.poster_path || '';
                            var movieTitle = title;

                            var voiceList = (translations && translations.length) ? translations : streams.map(function(s, i) {
                                return { title: 'Перевод ' + (i + 1), quality: null, _stream: s };
                            });

                            var items = voiceList.map(function(voice) {
                                var voiceName = voice.title || voice.translation || 'Перевод';
                                var maxQ = voice.quality ? getMaxQuality(voice.quality) : (voice._stream ? voice._stream.quality : '');
                                var hasSub = !!(voice.subtitles && voice.subtitles.length);

                                return {
                                    title:     voiceName,
                                    quality:   maxQ,
                                    subtitles: hasSub,
                                    info:      info,
                                    poster:    poster,
                                    time:      timeStr,
                                    onPlay: (function(v) {
                                        return function() {
                                            var tStreams = v.quality ? buildStreams(v.quality) : (v._stream ? [v._stream] : streams);
                                            if (!tStreams.length) tStreams = streams;

                                            var playCard = {
                                                id: card.id,
                                                title: movieTitle + (v.title ? ' \u2014 ' + v.title : ''),
                                                name: movieTitle,
                                                original_name: card.original_name || card.original_title || '',
                                                poster_path: posterPath,
                                                source: card.source || 'tmdb',
                                                balanser_name: 'Alloha'
                                            };

                                            if (card.id) {
                                                var tl = Lampa.Timeline.view('alloha_' + card.id + '_voice_' + (v.id || v.title || '0'));
                                                tl.card = playCard;
                                                window._online_current_timeline = tl;
                                            }

                                            watchedSet({ source: 'alloha', voice_name: v.title || '' });

                                            var subs = v.subtitles && v.subtitles.length ? v.subtitles : [];
                                            if (subs.length) {
                                                playStream(tStreams, playCard, null, null, subs);
                                            } else {
                                                fetchHDRezkaSubtitles(card, null, null, function(hdSubs) {
                                                    playStream(tStreams, playCard, null, null, hdSubs);
                                                });
                                            }
                                        };
                                    })(voice)
                                };
                            });

                            callback(null, items);
                        }, _tokenMovie);
                    }
                });
            };

            var tmdbId = card.id;

            if (tmdbId) {
                var apiUrl = 'https://api.apbugall.org/?token=' + encodeURIComponent(partnerToken) + '&tmdb=' + tmdbId;
                $.ajax({ url: apiUrl, dataType: 'json', timeout: 8000 })
                    .done(function(data) {
                        if (data && data.status === 'success' && data.data && data.data.token_movie) {
                            doLoadPI(data.data.token_movie);
                        } else {
                            kinokradSearch(title, year, function(err, filmData) {
                                if (err) { callback(new Error('Alloha: не найдено (' + err.message + ')')); return; }
                                doLoadPI(filmData.tokenMovie);
                            });
                        }
                    })
                    .fail(function() {
                        kinokradSearch(title, year, function(err, filmData) {
                            if (err) { callback(new Error('Alloha: не найдено (' + err.message + ')')); return; }
                            doLoadPI(filmData.tokenMovie);
                        });
                    });
            } else {
                kinokradSearch(title, year, function(err, filmData) {
                    if (err) { callback(new Error('Alloha: не найдено (' + err.message + ')')); return; }
                    doLoadPI(filmData.tokenMovie);
                });
            }
        }
    });
