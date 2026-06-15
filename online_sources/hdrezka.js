    // --- HDREZKA SOURCE ----------------------------------------------------------

    registerSource('hdrezka', 'HDRezka', {
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

            var WATCHED_KEY = 'hdrezka_watched_last';
            var watchedGet = function() {
                var fid = Lampa.Utils.hash(card.number_of_seasons ? (card.original_name || '') : (card.original_title || card.original_name || ''));
                var all = Lampa.Storage.cache(WATCHED_KEY, 5000, {});
                return all[fid] || null;
            };
            var watchedSet = function(data) {
                var fid = Lampa.Utils.hash(card.number_of_seasons ? (card.original_name || '') : (card.original_title || card.original_name || ''));
                var all = Lampa.Storage.cache(WATCHED_KEY, 5000, {});
                if (!all[fid]) all[fid] = {};
                Lampa.Arrays.extend(all[fid], data, true);
                Lampa.Storage.set(WATCHED_KEY, all);
            };

            var playEpisode = function(pi, trans, seasonId, episodeId) {
                notify('HDRezka: загрузка потока...');
                getStreamAjax(pi.id, trans.id, seasonId, episodeId, pi.favs, function(err, streams, subtitles) {
                    if (err || !streams || !streams.length) { notify('HDRezka: ошибка потока'); return; }
                    var t = title + ' S' + seasonId + 'E' + episodeId;
                    var playCard = {
                        id: card.id, title: t, name: t,
                        original_name: card.original_name || card.original_title || '',
                        poster_path: card.poster_path || '', source: card.source || 'tmdb',
                        season: parseInt(seasonId), episode: parseInt(episodeId), balanser_name: 'HDRezka'
                    };
                    if (card.id) {
                        var tl = Lampa.Timeline.view('hdrezka_' + card.id + '_s' + seasonId + '_e' + episodeId);
                        tl.card = playCard;
                        window._online_current_timeline = tl;
                    }
                    playStream(streams, playCard, seasonId, episodeId, subtitles);
                });
            };

            var buildSerialItems = function(pi, overrideTransId, overrideSeason) {
                var trans = pi.translators[0] || { id: 0, name: 'Оригинал' };
                var savedKey = 'hdrezka_last_' + card.id;
                var saved = Lampa.Storage.get(savedKey, '{}');
                try { saved = typeof saved === 'string' ? JSON.parse(saved) : saved; } catch(e) { saved = {}; }

                // opts.voice и opts.season имеют приоритет над сохранёнными
                var curTransId = overrideTransId !== undefined ? overrideTransId
                               : (saved.trans || trans.id);
                var curSeason  = overrideSeason  !== undefined ? overrideSeason
                               : (saved.season || (pi.seasons[0] ? pi.seasons[0].id : '1'));

                var curTrans = pi.translators.filter(function(t) { return String(t.id) === String(curTransId); })[0] || pi.translators[0] || trans;

                // Сохраняем текущий переводчик и сезон чтобы при следующем открытии восстановить
                var savedKey2 = 'hdrezka_last_' + card.id;
                var savedData = Lampa.Storage.get(savedKey2, '{}');
                try { savedData = typeof savedData === 'string' ? JSON.parse(savedData) : savedData; } catch(e) { savedData = {}; }
                savedData.trans = curTransId;
                savedData.season = curSeason;
                Lampa.Storage.set(savedKey2, JSON.stringify(savedData));

                // Build items: one item per episode
                var episodes = pi._cachedEpisodes || [];
                var w = watchedGet();

                var items = [];

                // Continue watching banner item
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
                        onPlay: (function(ww, t) {
                            return function() {
                                var epToPlay = ww.episode ? String(ww.episode) : '1';
                                watchedSet({ source: 'hdrezka', voice_name: t.name, season: parseInt(ww.season || curSeason), episode: parseInt(epToPlay) });
                                playEpisode(pi, t, ww.season || curSeason, epToPlay);
                            };
                        })(w, curTrans)
                    });
                }

                // Сохраняем все эпизоды для плейлиста
                var allEpisodes = episodes.map(function(ep) {
                    return {
                        id: ep.id,
                        name: ep.name,
                        episode: parseInt(ep.id) || 0,
                        season: parseInt(curSeason) || 1
                    };
                });

                episodes.forEach(function(ep) {
                    items.push({
                        title:   ep.name || ('Серия ' + ep.id),
                        episode: parseInt(ep.id) || 0,
                        season:  parseInt(curSeason) || 1,
                        quality: '',
                        info:    info,
                        poster:  poster,
                        onPlay: (function(epId, t, allEps) {
                            return function() {
                                watchedSet({ source: 'hdrezka', voice_name: t.name, season: parseInt(curSeason), episode: parseInt(epId) });
                                
                                // URL resolver для плейлиста
                                var urlResolver = function(epItem, callback) {
                                    getStreamAjax(pi.id, t.id, curSeason, String(epItem.episode), pi.favs, function(err, streams, subtitles) {
                                        if (err || !streams || !streams.length) {
                                            callback({ url: '' });
                                            return;
                                        }
                                        
                                        // Берем первый поток (обычно лучшее качество)
                                        var result = { url: streams[0].url };
                                        
                                        // Если есть несколько качеств, создаем объект quality
                                        if (streams.length > 1) {
                                            result.quality = {};
                                            streams.forEach(function(s) {
                                                result.quality[s.quality] = s.url;
                                            });
                                        }
                                        
                                        if (subtitles && subtitles.length) {
                                            result.subtitles = subtitles;
                                        }
                                        
                                        callback(result);
                                    });
                                };
                                
                                // Создаем items для плейлиста
                                var playlistItems = allEps.map(function(epItem) {
                                    return {
                                        title: title + ' S' + curSeason + 'E' + epItem.episode,
                                        episode: epItem.episode,
                                        season: epItem.season
                                    };
                                });
                                
                                // Создаем плейлист через универсальную функцию
                                var playlist = window.createOnlinePlaylist(
                                    { title: title + ' S' + curSeason + 'E' + epId },
                                    playlistItems,
                                    urlResolver
                                );
                                
                                // Загружаем текущую серию
                                notify('HDRezka: загрузка потока...');
                                getStreamAjax(pi.id, t.id, curSeason, epId, pi.favs, function(err, streams, subtitles) {
                                    if (err || !streams || !streams.length) { notify('HDRezka: ошибка потока'); return; }
                                    var playerTitle = title + ' S' + curSeason + 'E' + epId;
                                    var playCard = {
                                        id: card.id, title: playerTitle, name: playerTitle,
                                        original_name: card.original_name || card.original_title || '',
                                        poster_path: card.poster_path || '', source: card.source || 'tmdb',
                                        season: parseInt(curSeason), episode: parseInt(epId), balanser_name: 'HDRezka'
                                    };
                                    if (card.id) {
                                        var tl = Lampa.Timeline.view('hdrezka_' + card.id + '_s' + curSeason + '_e' + epId);
                                        tl.card = playCard;
                                        window._online_current_timeline = tl;
                                    }
                                    
                                    // Создаем playerItem с качествами
                                    var playerItem = { title: playerTitle, url: streams[0].url };
                                    if (streams.length > 1) {
                                        playerItem.quality = {};
                                        streams.forEach(function(s) {
                                            playerItem.quality[s.quality] = s.url;
                                        });
                                    }
                                    if (subtitles && subtitles.length) {
                                        playerItem.subtitles = subtitles;
                                    }
                                    
                                    Lampa.Player.play(playerItem);
                                    Lampa.Player.playlist(playlist.length > 0 ? playlist : [playerItem]);
                                });
                            };
                        })(ep.id, curTrans, allEpisodes)
                    });
                });

                items._meta = {
                    seasons: pi.seasons.map(function(s) { return { id: s.id, name: s.name || ('Сезон ' + s.id) }; }),
                    curSeason: curSeason,
                    curSeasonName: 'Сезон ' + curSeason,
                    voices: pi.translators.map(function(t) { return { id: t.id, name: t.name }; }),
                    curVoice: curTransId,
                    curVoiceName: (pi.translators.filter(function(t) { return String(t.id) === String(curTransId); })[0] || {}).name || ''
                };

                return items;
            };

            var buildMovieItems = function(pi) {
                var posterPath = card.poster_path || '';
                var movieTitle = title;
                var runtime = card.runtime || 0;
                var timeStr = runtime ? (Math.floor(runtime/60) + ':' + ('0' + (runtime%60)).slice(-2)) : '';

                var items = pi.translators.map(function(trans) {
                    return {
                        title:   trans.name,
                        quality: '',
                        info:    info,
                        poster:  poster,
                        time:    timeStr,
                        onPlay: (function(t) {
                            return function() {
                                watchedSet({ source: 'hdrezka', voice_name: t.name });
                                notify('HDRezka: загрузка потока...');
                                getStreamAjax(pi.id, t.id, null, null, pi.favs, function(err, streams, subtitles) {
                                    if (err || !streams || !streams.length) { notify('HDRezka: ошибка потока'); return; }
                                    var playCard = {
                                        id: card.id, title: movieTitle + ' \u2014 ' + t.name, name: movieTitle,
                                        original_name: card.original_name || card.original_title || '',
                                        poster_path: posterPath, source: card.source || 'tmdb', balanser_name: 'HDRezka'
                                    };
                                    if (card.id) {
                                        var tl = Lampa.Timeline.view('hdrezka_' + card.id + '_voice_' + t.id);
                                        tl.card = playCard;
                                        window._online_current_timeline = tl;
                                    }
                                    playStream(streams, playCard, null, null, subtitles);
                                });
                            };
                        })(trans)
                    };
                });

                // Async: определяем качество по первому переводчику
                var firstTrans = pi.translators[0];
                if (firstTrans) {
                    getStreamAjax(pi.id, firstTrans.id, null, null, pi.favs, function(err, streams) {
                        if (err || !streams || !streams.length) return;
                        var maxQ = window.resolveMaxQualityFromList(streams.map(function(s) { return s.quality; }));
                        if (maxQ) items.forEach(function(it) {
                            it.quality = maxQ;
                            if (it._setQuality) it._setQuality(maxQ);
                        });
                    });
                }

                return items;
            };

            var query = title;
            notify('HDRezka: поиск...');

            searchByTitle(query, function(err, results) {
                if (err || !results.length) {
                    callback(new Error('HDRezka: не найдено'));
                    return;
                }

                // Auto-match by title + year
                var best = null;
                for (var i = 0; i < results.length; i++) {
                    var r = results[i];
                    var titleOk = r.title.toLowerCase().indexOf(query.toLowerCase()) !== -1;
                    var yearOk = year ? r.year === year : true;
                    if (titleOk && yearOk) { best = r; break; }
                }
                if (!best) best = results[0];

                notify('HDRezka: загрузка...');
                get(best.url).then(function(resp) {
                    var pi = parseFilmPage(resp.text || '');

                    if (pi.isSeries) {
                        if (!pi.translators.length) pi.translators.push({ id: 0, name: 'Оригинал' });
                        var savedKey = 'hdrezka_last_' + card.id;
                        var saved = Lampa.Storage.get(savedKey, '{}');
                        try { saved = typeof saved === 'string' ? JSON.parse(saved) : saved; } catch(e) { saved = {}; }
                        var curTransId = opts.voice !== undefined ? opts.voice : (saved.trans || (pi.translators[0] ? pi.translators[0].id : '0'));
                        var curSeason = null;

                        getSeasons(pi.id, curTransId, pi.favs, function(err2, seasons) {
                            if (!err2 && seasons.length > 0) pi.seasons = seasons;
                            curSeason = opts.season || saved.season || (pi.seasons[0] ? pi.seasons[0].id : '1');
                            var seasonIds = pi.seasons.map(function(s) { return s.id; });
                            if (seasonIds.length && seasonIds.indexOf(curSeason) < 0) curSeason = pi.seasons[0].id;

                            getEpisodes(pi.id, curTransId, curSeason, pi.favs, function(err3, episodes) {
                                pi._cachedEpisodes = err3 ? [] : episodes;
                                // Передаём curTransId и curSeason явно чтобы buildSerialItems не читал устаревший saved
                                var items = buildSerialItems(pi, curTransId, curSeason);
                                if (!items.length) { callback(new Error('HDRezka: нет серий')); return; }
                                callback(null, items);
                            });
                        });
                    } else {
                        if (!pi.translators.length) pi.translators.push({ id: 0, name: 'Оригинал' });
                        var items = buildMovieItems(pi);
                        if (!items.length) { callback(new Error('HDRezka: нет озвучек')); return; }
                        callback(null, items);
                    }
                }).catch(function() {
                    callback(new Error('HDRezka: ошибка загрузки'));
                });
            });
        }
    });
