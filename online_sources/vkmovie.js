    // --- VKMOVIE SOURCE ----------------------------------------------------------

    function _vkProxyMp4(url) {
        return CDNVIDEOHUB_PROXY + '/vkmovie/stream?url=' + encodeURIComponent(url);
    }

    // HLS теж через /vkmovie/stream — він сам розпізнає m3u8 і переписує URL
    function _vkProxyHls(url) {
        return CDNVIDEOHUB_PROXY + '/vkmovie/stream?url=' + encodeURIComponent(url);
    }

    function _vkMaxQuality(item) {
        if (item.mp4_2160) return '4K';
        if (item.mp4_1440) return '1440p';
        if (item.mp4_1080) return '1080p';
        if (item.mp4_720)  return '720p';
        if (item.mp4_480)  return '480p';
        if (item.mp4_360)  return '360p';
        return '';
    }

    function _vkBuildSubtitles(item) {
        var subs = item.subtitles || [];
        if (!subs.length) return [];
        return subs.map(function(s) {
            return {
                label: s.manifest_name || s.title || s.lang || 'Sub',
                url:   _vkProxyMp4(s.url)
            };
        }).filter(function(s) { return !!s.url; });
    }

    // Парсить VK HLS master playlist і повертає якості
    function _vkParseHlsQualities(hlsUrl, cb) {
        var proxyUrl = _vkProxyHls(hlsUrl);
        var xhr = new XMLHttpRequest();
        xhr.open('GET', proxyUrl, true);
        xhr.timeout = 10000;
        xhr.onload = function() {
            var text = xhr.responseText || '';
            var trimmed = text.replace(/^\s+/, '');
            if (trimmed.indexOf('#EXTM3U') !== 0) {
                cb({}, proxyUrl); return;
            }
            var qualityOrder = ['4K','2160p','1440p','1080p','720p','480p','360p','240p','144p'];
            // VK використовує текстові назви якостей
            var qualityMap = {
                'ultra':   '4K',
                'quad':    '1440p',
                'full':    '1080p',
                'hd':      '720p',
                'sd':      '480p',
                'low':     '360p',
                'lowest':  '240p',
                'mobile':  '144p',
                // числові
                '2160': '4K', '1440': '1440p', '1080': '1080p',
                '720': '720p', '480': '480p', '360': '360p', '240': '240p', '144': '144p'
            };
            var qualities = {};
            var lines = text.split('\n');
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (line.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
                var nextLine = (lines[i + 1] || '').trim();
                if (!nextLine || nextLine.indexOf('#') === 0) continue;

                var label;
                var qMatch = line.match(/QUALITY=([^,\s"]+)/i);
                var rMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);

                if (qMatch) {
                    var qKey = qMatch[1].toLowerCase();
                    label = qualityMap[qKey];
                    if (!label) {
                        var num = parseInt(qKey);
                        if (num >= 2160) label = '4K';
                        else if (num) label = window.resolveQualityLabel(num);
                        else label = qMatch[1]; // залишаємо як є якщо не розпізнали
                    }
                } else if (rMatch) {
                    label = window.resolveQualityLabel(parseInt(rMatch[1]));
                }

                if (label && !qualities[label]) {
                    var streamUrl = nextLine;
                    // Если URL относительный, нужно построить полный URL относительно master playlist
                    if (streamUrl.indexOf('http') !== 0) {
                        // Берем базовый URL из оригинального HLS URL
                        var baseUrl = hlsUrl.substring(0, hlsUrl.lastIndexOf('/') + 1);
                        streamUrl = baseUrl + streamUrl;
                    }
                    // Проксируем каждый вариант качества
                    qualities[label] = _vkProxyHls(streamUrl);
                }
            }

            var sorted = {};
            qualityOrder.forEach(function(q) { if (qualities[q]) sorted[q] = qualities[q]; });
            Object.keys(qualities).forEach(function(q) { if (!sorted[q]) sorted[q] = qualities[q]; });
            cb(sorted, proxyUrl);
        };
        xhr.onerror = xhr.ontimeout = function() { cb({}, proxyUrl); };
        xhr.send();
    }

    registerSource('vkmovie', 'VK Video', {
        load: function(card, callback, opts) {
            opts = opts || {};
            var title = card.title || card.name || '';
            var year  = (card.release_date || card.first_air_date || '').slice(0, 4);
            var query = title + (year ? ' ' + year : '');
            var isMovie = !card.number_of_seasons && card.media_type !== 'tv' && !card.first_air_date;
            var cardImgPath = isMovie ? (card.backdrop_path || card.poster_path) : (card.poster_path || card.backdrop_path);
            var poster = cardImgPath ? Lampa.TMDB.image('t/p/w300' + cardImgPath) : './img/img_broken.svg';
            var cardYear = (card.release_date || card.first_air_date || '').slice(0, 4);
            var genres = card.genres ? card.genres.slice(0, 2).map(function(g) { return g.name; }).join(', ') : '';
            var info = [cardYear, genres].filter(Boolean).join(' \u00b7 ');

            var xhr = new XMLHttpRequest();
            xhr.open('GET', CDNVIDEOHUB_PROXY + '/vkmovie/search?q=' + encodeURIComponent(query) + (year ? '&year=' + encodeURIComponent(year) : ''), true);
            xhr.timeout = 15000;
            xhr.onload = function() {
                var data;
                try { data = JSON.parse(xhr.responseText); } catch(e) { callback(new Error('ошибка парсинга')); return; }
                var results = (data && data.results) ? data.results : [];

                var firstWord = title.split(/\s+/)[0].toLowerCase();
                var filtered = results.filter(function(r) {
                    return r.title && r.title.toLowerCase().indexOf(firstWord) !== -1;
                });
                if (!filtered.length) filtered = results;
                if (!filtered.length) { callback(new Error('не найдено')); return; }

                var items = filtered.map(function(item) {
                    var subs   = _vkBuildSubtitles(item);
                    var hasSub = subs.length > 0;
                    var maxQ   = _vkMaxQuality(item);

                    return {
                        title:     item.title || title,
                        quality:   maxQ,
                        subtitles: hasSub,
                        info:      info,
                        poster:    poster,
                        onPlay: (function(vItem, vSubs) {
                            return function() {
                                // Для WebOS используем только MP4, HLS может не работать через прокси
                                var mp4 = vItem.mp4_2160 || vItem.mp4_1440 || vItem.mp4_1080 || vItem.mp4_720 || vItem.mp4_480 || vItem.mp4_360 || '';
                                if (!mp4 && !vItem.hls) { notify('VK Video: нет ссылки'); return; }
                                
                                // Если есть MP4 - используем его (более стабильно на WebOS)
                                if (mp4) {
                                    var quals = {};
                                    if (vItem.mp4_2160) quals['4K']    = _vkProxyMp4(vItem.mp4_2160);
                                    if (vItem.mp4_1440) quals['1440p'] = _vkProxyMp4(vItem.mp4_1440);
                                    if (vItem.mp4_1080) quals['1080p'] = _vkProxyMp4(vItem.mp4_1080);
                                    if (vItem.mp4_720)  quals['720p']  = _vkProxyMp4(vItem.mp4_720);
                                    if (vItem.mp4_480)  quals['480p']  = _vkProxyMp4(vItem.mp4_480);
                                    if (vItem.mp4_360)  quals['360p']  = _vkProxyMp4(vItem.mp4_360);
                                    var playerItem = { title: title, url: _vkProxyMp4(mp4) };
                                    if (Object.keys(quals).length > 1) playerItem.quality = quals;
                                    if (vSubs.length) playerItem.subtitles = vSubs;
                                    Lampa.Player.play(playerItem);
                                    Lampa.Player.playlist([playerItem]);
                                } else if (vItem.hls) {
                                    // Fallback на HLS если нет MP4
                                    notify('VK Video: загрузка...');
                                    _vkParseHlsQualities(vItem.hls, function(hlsQuals, hlsProxied) {
                                        var playerItem = { title: title, url: hlsProxied };
                                        if (Object.keys(hlsQuals).length > 0) playerItem.quality = hlsQuals;
                                        if (vSubs.length) playerItem.subtitles = vSubs;
                                        Lampa.Player.play(playerItem);
                                        Lampa.Player.playlist([playerItem]);
                                    });
                                }
                            };
                        })(item, subs)
                    };
                });

                callback(null, window.sortItemsByQuality(items));
            };
            xhr.onerror = xhr.ontimeout = function() { callback(new Error('ошибка сети')); };
            xhr.send();
        }
    });
