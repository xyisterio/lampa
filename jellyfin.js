(function () {
    'use strict';

    var JELLYFIN_SERVER = 'https://eu.mir-kino.pp.ru';
    var JELLYFIN_USER = '';
    var JELLYFIN_PASS = '';
    var JELLYFIN_ICON = '<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\" focusable=\"false\"><path fill=\"#9B59B6\" d=\"M12 .002C8.826.002-1.398 18.537.16 21.666c1.56 3.129 22.14 3.094 23.682 0C25.384 18.573 15.177 0 12 0zm7.76 18.949c-1.008 2.028-14.493 2.05-15.514 0C3.224 16.9 9.92 4.755 12.003 4.755c2.081 0 8.77 12.166 7.759 14.196zM12 9.198c-1.054 0-4.446 6.15-3.93 7.189.518 1.04 7.348 1.027 7.86 0 .511-1.027-2.874-7.19-3.93-7.19z\"/></svg>';

    function sget(key, def) { return Lampa.Storage.get(key, def); }
    function sset(key, val) { Lampa.Storage.set(key, val); }

    var Jellyfin = {
        token: null,
        userId: null,
        lastServer: null,
        lastUser: null,
        quickConnectTimer: null,
        quickConnectSecret: null,
        quickConnectInFlight: false,
        quickConnectFailCount: 0,
        apiPatched: false,
        linePrefsKey: 'jellyfin_line_prefs',
        playbackStateKey: 'jellyfin_playback_state_v1',
        ticksPerSecond: 10000000,
        activePlayback: null,

        getDeviceId: function() {
            var id = sget('jellyfin_device_id', '');
            if (!id) {
                id = Math.random().toString(36).slice(2, 12);
                sset('jellyfin_device_id', id);
            }
            return id;
        },

        saveAuth: function (server, token, userId, userLabel) {
            this.token = token || null;
            this.userId = userId || null;
            this.lastServer = server || null;
            this.lastUser = userLabel || null;

            if (server) sset('jellyfin_server', server);
            sset('jellyfin_token', token || '');
            sset('jellyfin_user_id', userId || '');
            sset('jellyfin_auth_type', userLabel || '');
            try { if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update(); } catch (e0) {}
        },

        clearAuth: function () {
            this.token = null;
            this.userId = null;
            this.lastServer = null;
            this.lastUser = null;
            sset('jellyfin_token', '');
            sset('jellyfin_user_id', '');
            sset('jellyfin_auth_type', '');
            try { if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update(); } catch (e0) {}
        },

        getAuthHeader: function() {
            return 'MediaBrowser Client=\"Lampa\", Device=\"TV\", DeviceId=\"' + this.getDeviceId() + '\", Version=\"1.6.1\"';
        },

        request: function(url, method, body, callback, error, opts) {
            try {
                var req = new Lampa.Reguest();

                var options = opts || {};
                var timeoutMs = options.timeoutMs || (1000 * 20);
                req.timeout(timeoutMs);
                var headers = options.headers || {};

                if (options.useAuthHeader !== false) {
                    headers['X-Emby-Authorization'] = this.getAuthHeader();
                }

                if (options.useTokenHeader !== false && this.token) {
                    headers['X-Emby-Token'] = this.token;
                }

                var post_data = false;
                var params = { dataType: options.dataType || 'json', headers: headers };

                if (method === 'POST') {
                    if (options.contentType) headers['Content-Type'] = options.contentType;
                    else headers['Content-Type'] = 'application/json';
                    headers['Accept'] = 'application/json';

                    if (options.form) post_data = String(body || '');
                    else post_data = JSON.stringify(body || {});
                }

                req.native(
                    url,
                    function (res) {
                        if (typeof res === 'string') { try { res = JSON.parse(res); } catch (e0) {} }
                        callback(res);
                    },
                    error,
                    post_data,
                    params
                );
            } catch (e1) {
                if (error) error(e1);
            }
        },

        buildImageUrl: function (itemId, type) {
            try {
                var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                var token = String(this.token || sget('jellyfin_token', '') || '');
                if (!server || !itemId) return '';

                var path = '';
                if (type === 'backdrop') path = '/Items/' + encodeURIComponent(itemId) + '/Images/Backdrop/0';
                else path = '/Items/' + encodeURIComponent(itemId) + '/Images/Primary';

                var url = server + path + '?maxWidth=' + (type === 'backdrop' ? '1280' : '420') + '&quality=90';
                if (token) url += '&api_key=' + encodeURIComponent(token);
                return url;
            } catch (e0) {
                return '';
            }
        },

        rememberTmdbMapping: function (cardType, tmdbId, jellyfinId) {
            try {
                if (!tmdbId || !jellyfinId) return;
                var map = sget('jellyfin_tmdb_map', {});
                if (!map || typeof map !== 'object') map = {};
                var key = String(cardType || 'movie') + ':' + String(tmdbId);
                map[key] = String(jellyfinId);
                sset('jellyfin_tmdb_map', map);
            } catch (e0) {}
        },

        findJellyfinIdByTmdb: function (cardType, tmdbId) {
            try {
                var map = sget('jellyfin_tmdb_map', {});
                if (!map || typeof map !== 'object') return '';
                var key = String(cardType || 'movie') + ':' + String(tmdbId);
                return map[key] ? String(map[key]) : '';
            } catch (e0) {
                return '';
            }
        },

        getLinePrefs: function () {
            var prefs = sget(this.linePrefsKey, {});
            if (!prefs || typeof prefs !== 'object') prefs = {};
            if (!Array.isArray(prefs.order)) prefs.order = [];
            if (!prefs.disabled || typeof prefs.disabled !== 'object') prefs.disabled = {};
            return prefs;
        },

        setLinePrefs: function (prefs) {
            try {
                sset(this.linePrefsKey, prefs || {});
            } catch (e0) {}
        },

        lineKey: function (line) {
            try {
                if (!line) return '';
                if (line.url) return String(line.url);
                if (line.title) return 'title:' + String(line.title);
                return '';
            } catch (e0) {
                return '';
            }
        },

        applyLinePrefs: function (lines) {
            var prefs = this.getLinePrefs();
            var disabled = prefs.disabled || {};
            var order = prefs.order || [];

            var byKey = {};
            var keys = [];

            (lines || []).forEach(function (l) {
                var k = this.lineKey(l);
                if (!k) return;
                if (byKey[k]) return;
                byKey[k] = l;
                keys.push(k);
            }.bind(this));

            var filtered = keys.filter(function (k) { return !disabled[k]; });

            var out = [];
            for (var i = 0; i < order.length; i++) {
                var ok = order[i];
                if (!ok || !byKey[ok]) continue;
                if (disabled[ok]) continue;
                out.push(byKey[ok]);
                byKey[ok] = null;
            }

            for (var j = 0; j < filtered.length; j++) {
                var k2 = filtered[j];
                if (byKey[k2]) out.push(byKey[k2]);
            }

            return out;
        },

        ticksToSeconds: function (ticks) {
            var t = 0;
            try { t = parseInt(ticks, 10) || 0; } catch (e0) { t = 0; }
            if (!t) return 0;
            return t / this.ticksPerSecond;
        },

        secondsToTicks: function (sec) {
            var s = 0;
            try { s = parseFloat(sec) || 0; } catch (e0) { s = 0; }
            if (!s) return 0;
            return Math.max(0, Math.round(s * this.ticksPerSecond));
        },

        getPlaybackState: function () {
            var st = sget(this.playbackStateKey, {});
            if (!st || typeof st !== 'object') st = {};
            if (!st.items || typeof st.items !== 'object') st.items = {};
            if (!st.series || typeof st.series !== 'object') st.series = {};
            return st;
        },

        setPlaybackState: function (st) {
            try { sset(this.playbackStateKey, st || {}); } catch (e0) {}
        },

        getLocalItemState: function (itemId) {
            try {
                var st = this.getPlaybackState();
                var it = st.items && itemId ? st.items[String(itemId)] : null;
                return it && typeof it === 'object' ? it : null;
            } catch (e0) {
                return null;
            }
        },

        setLocalItemState: function (itemId, data) {
            try {
                if (!itemId) return;
                var st = this.getPlaybackState();
                st.items[String(itemId)] = data || {};
                this.setPlaybackState(st);
            } catch (e0) {}
        },

        getSeriesLastState: function (seriesId) {
            try {
                var st = this.getPlaybackState();
                var it = st.series && seriesId ? st.series[String(seriesId)] : null;
                return it && typeof it === 'object' ? it : null;
            } catch (e0) {
                return null;
            }
        },

        setSeriesLastState: function (seriesId, data) {
            try {
                if (!seriesId) return;
                var st = this.getPlaybackState();
                st.series[String(seriesId)] = data || {};
                this.setPlaybackState(st);
            } catch (e0) {}
        },

        getResumeSecondsFromItem: function (it) {
            var sec = 0;
            try {
                if (it && it.UserData && it.UserData.PlaybackPositionTicks) {
                    sec = this.ticksToSeconds(it.UserData.PlaybackPositionTicks);
                }
            } catch (e0) { sec = 0; }
            if (!sec) {
                try {
                    var local = this.getLocalItemState(it && it.Id ? it.Id : '');
                    if (local && local.positionSec) sec = parseFloat(local.positionSec) || 0;
                } catch (e1) { sec = 0; }
            }
            return sec || 0;
        },

        getDurationSecondsFromItem: function (it) {
            var sec = 0;
            try { if (it && it.RunTimeTicks) sec = this.ticksToSeconds(it.RunTimeTicks); } catch (e0) { sec = 0; }
            if (!sec) {
                try {
                    var local = this.getLocalItemState(it && it.Id ? it.Id : '');
                    if (local && local.durationSec) sec = parseFloat(local.durationSec) || 0;
                } catch (e1) { sec = 0; }
            }
            return sec || 0;
        },

        shouldOfferContinue: function (resumeSec, durationSec) {
            var r = 0;
            var d = 0;
            try { r = parseFloat(resumeSec) || 0; } catch (e0) { r = 0; }
            try { d = parseFloat(durationSec) || 0; } catch (e1) { d = 0; }
            if (r < 30) return false;
            if (d > 0 && r > (d - 30)) return false;
            if (d > 0 && (r / d) >= 0.95) return false;
            return true;
        },

        formatSecondsShort: function (sec) {
            var s = 0;
            try { s = Math.max(0, Math.floor(parseFloat(sec) || 0)); } catch (e0) { s = 0; }
            try {
                if (Lampa && Lampa.Utils && Lampa.Utils.secondsToTime) return Lampa.Utils.secondsToTime(s, true);
            } catch (e1) {}
            var h = Math.floor(s / 3600);
            var m = Math.floor((s % 3600) / 60);
            var ss = Math.floor(s % 60);
            var mm = (m < 10 ? '0' : '') + m;
            var sss = (ss < 10 ? '0' : '') + ss;
            return (h ? (h + ':') : '') + mm + ':' + sss;
        },

        openContinuePopup: function (opts) {
            var enabled = null;
            try { enabled = Lampa.Controller.enabled(); } catch (e0) { enabled = null; }
            var restoreTo = enabled && enabled.name ? enabled.name : 'full_start';

            try {
                if (this._continueOverlay && this._continueOverlay.remove) this._continueOverlay.remove();
                this._continueOverlay = null;
            } catch (e00) {}
            try { $('.jellyfin-continue-popup').remove(); } catch (e01) {}

            if (!document.getElementById('jellyfin-continue-styles')) {
                $('body').append('<style id="jellyfin-continue-styles">.jellyfin-continue-popup{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);}.jellyfin-continue__card{background:#1a1a1a;border-radius:1em;width:44em;max-width:94vw;overflow:hidden;box-shadow:0 1em 4em rgba(0,0,0,0.8);border:1px solid rgba(255,255,255,0.06);}.jellyfin-continue__img{position:relative;width:100%;padding-top:56.25%;background:#000;overflow:hidden;}.jellyfin-continue__img img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0.75;}.jellyfin-continue__details{position:absolute;bottom:0;left:0;right:0;padding:1.3em;background:linear-gradient(transparent,rgba(0,0,0,0.95));}.jellyfin-continue__title{font-size:1.7em;font-weight:700;margin-bottom:0.25em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;}.jellyfin-continue__info{font-size:1.05em;opacity:0.65;color:#fff;}.jellyfin-continue__body{padding:0 1.3em 0.4em;margin-top:-0.4em;}.jellyfin-continue__question{font-size:1.15em;font-weight:600;margin:1em 0 0.8em;}.jellyfin-continue__footer{display:flex;flex-direction:row;gap:1em;padding:1.2em;}.jellyfin-continue__btn{position:relative;padding:1em 1.2em;border-radius:0.6em;cursor:pointer;font-size:1.15em;font-weight:600;background:rgba(255,255,255,0.08);color:#fff;transition:all 0.2s ease;text-align:center;flex:1;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.06);}.jellyfin-continue__btn.focus{background:#fff;color:#000;transform:translateY(-0.2em);box-shadow:0 0.5em 1.5em rgba(255,255,255,0.2);}.jellyfin-continue__bar{height:0.42em;background:rgba(255,255,255,0.12);border-radius:0.3em;overflow:hidden;}.jellyfin-continue__barfill{height:100%;background:#9B59B6;width:0%;}</style>');
            }

            var title = opts && opts.title ? String(opts.title) : 'Продолжить просмотр?';
            var name = opts && opts.name ? String(opts.name) : '';
            var info = opts && opts.info ? String(opts.info) : '';
            var image = opts && opts.image ? String(opts.image) : '';
            var percent = 0;
            try { percent = opts && typeof opts.percent !== 'undefined' ? parseFloat(opts.percent) || 0 : 0; } catch (e1) { percent = 0; }
            percent = Math.max(0, Math.min(100, percent));

            var overlay = $([
                '<div class="jellyfin-continue-popup">',
                '  <div class="jellyfin-continue__card">',
                '    <div class="jellyfin-continue__img">',
                (image ? ('      <img src="' + image + '" alt="">') : ''),
                '      <div class="jellyfin-continue__details">',
                '        <div class="jellyfin-continue__title"></div>',
                '        <div class="jellyfin-continue__info"></div>',
                '      </div>',
                '    </div>',
                '    <div class="jellyfin-continue__body">',
                '      <div class="jellyfin-continue__question"></div>',
                '      <div class="jellyfin-continue__timeline"><div class="jellyfin-continue__bar"><div class="jellyfin-continue__barfill"></div></div></div>',
                '    </div>',
                '    <div class="jellyfin-continue__footer">',
                '      <div class="jellyfin-continue__btn selector jellyfin-continue__btn-yes">▶ Продолжить</div>',
                '      <div class="jellyfin-continue__btn selector jellyfin-continue__btn-no">Выбрать</div>',
                '    </div>',
                '  </div>',
                '</div>'
            ].join(''));

            overlay.find('.jellyfin-continue__title').text(name || 'Jellyfin');
            overlay.find('.jellyfin-continue__info').text(info || '');
            overlay.find('.jellyfin-continue__question').text(title);
            overlay.find('.jellyfin-continue__barfill').css('width', percent + '%');

            $('body').append(overlay);
            this._continueOverlay = overlay;

            var yesBtn = overlay.find('.jellyfin-continue__btn-yes');
            var noBtn = overlay.find('.jellyfin-continue__btn-no');
            var last = yesBtn.length ? yesBtn[0] : null;

            overlay.find('.selector').on('hover:focus', function () { last = this; });

            var close = function () {
                try { overlay.remove(); } catch (e0) {}
                try { Jellyfin._continueOverlay = null; } catch (e00) {}
                try { Lampa.Controller.toggle(restoreTo); } catch (e1) {}
            };

            overlay.on('click', function (e) {
                try {
                    if (e && e.target === overlay[0]) close();
                } catch (e0) {}
            });

            yesBtn.on('hover:enter', function () {
                close();
                if (opts && opts.onContinue) setTimeout(function () { try { opts.onContinue(); } catch (e0) {} }, 0);
            });

            noBtn.on('hover:enter', function () {
                close();
                if (opts && opts.onChoose) setTimeout(function () { try { opts.onChoose(); } catch (e0) {} }, 0);
            });

            Lampa.Controller.add('jellyfin_continue', {
                toggle: function () {
                    try { Lampa.Controller.collectionSet(overlay); } catch (e0) {}
                    try { Lampa.Controller.collectionFocus(yesBtn[0], overlay); } catch (e1) {}
                },
                left: function () {
                    if (!yesBtn.length || !noBtn.length) return;
                    if (last === noBtn[0]) Lampa.Controller.collectionFocus(yesBtn[0], overlay);
                    else Lampa.Controller.collectionFocus(noBtn[0], overlay);
                },
                right: function () {
                    if (!yesBtn.length || !noBtn.length) return;
                    if (last === yesBtn[0]) Lampa.Controller.collectionFocus(noBtn[0], overlay);
                    else Lampa.Controller.collectionFocus(yesBtn[0], overlay);
                },
                enter: function () {
                    try { if (last) $(last).trigger('hover:enter'); } catch (e0) {}
                },
                back: function () {
                    close();
                },
                gone: function () {
                    try { overlay.find('.selector').removeClass('focus'); } catch (e0) {}
                }
            });

            try { Lampa.Controller.toggle('jellyfin_continue'); } catch (e2) {}
        },

        getTmdbIdFromItem: function (it) {
            try {
                if (!it) return '';
                var providers = it.ProviderIds || it.Providerids || {};
                var tmdb = providers && (providers.Tmdb || providers.tmdb || providers.TMDb || '');
                return tmdb ? String(tmdb) : '';
            } catch (e0) {
                return '';
            }
        },

        getTmdbLang: function () {
            try { return String(Lampa.Storage.field('tmdb_lang') || 'ru'); } catch (e0) { return 'ru'; }
        },

        getEpisodeStillFromTmdb: function (tmdbSeriesId, seasonNumber, episodeNumber, callback) {
            try {
                var sid = String(tmdbSeriesId || '');
                var s = parseInt(seasonNumber, 10) || 0;
                var e = parseInt(episodeNumber, 10) || 0;
                if (!sid || !s || !e) return callback('');
                if (!window.Lampa || !Lampa.TMDB || !Lampa.TMDB.api || !Lampa.TMDB.key || !Lampa.TMDB.image) return callback('');

                var lang = this.getTmdbLang();
                var epUrl = Lampa.TMDB.api('tv/' + sid + '/season/' + s + '/episode/' + e + '?api_key=' + Lampa.TMDB.key() + '&language=' + lang);
                $.ajax({ url: epUrl, timeout: 5000 })
                    .done(function (epData) {
                        try {
                            var still = (epData && epData.still_path) ? String(epData.still_path) : '';
                            if (still) return callback(Lampa.TMDB.image('t/p/w500' + still));
                        } catch (e0) {}
                        callback('');
                    })
                    .fail(function () { callback(''); });
            } catch (e1) {
                callback('');
            }
        },

        getResumeItems: function (callback, onFail) {
            this.authenticate(function () {
                try {
                    var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                    var token = String(this.token || '');
                    var uid = String(this.userId || '');
                    if (!server || !token || !uid) return (onFail ? onFail() : null);

                    var url = server + '/Users/' + encodeURIComponent(uid) + '/Items/Resume?Limit=100&Recursive=true&Fields=UserData,SeriesId,ParentId,IndexNumber,ParentIndexNumber,Name,RunTimeTicks&api_key=' + encodeURIComponent(token);
                    this.request(url, 'GET', null, function (res) {
                        var items = (res && (res.Items || res.items)) ? (res.Items || res.items) : [];
                        callback(items || []);
                    }.bind(this), function () {
                        if (onFail) onFail();
                    }, { useAuthHeader: false, useTokenHeader: false, dataType: 'json', timeoutMs: 1000 * 25 });
                } catch (e0) {
                    if (onFail) onFail();
                }
            }.bind(this));
        },

        getSeriesResume: function (seriesId, callback, onFail) {
            var sid = String(seriesId || '');
            if (!sid) return (onFail ? onFail() : null);
            this.getResumeItems(function (items) {
                var best = null;
                var bestTime = 0;
                for (var i = 0; i < (items || []).length; i++) {
                    var it = items[i];
                    var seriesMatch = '';
                    try { seriesMatch = String(it.SeriesId || it.seriesId || ''); } catch (e0) { seriesMatch = ''; }
                    if (seriesMatch !== sid) continue;
                    var pos = 0;
                    try { pos = it && it.UserData ? parseInt(it.UserData.PlaybackPositionTicks || 0, 10) || 0 : 0; } catch (e1) { pos = 0; }
                    if (!pos) continue;
                    var t = 0;
                    try { t = it && it.UserData && it.UserData.LastPlayedDate ? Date.parse(it.UserData.LastPlayedDate) : 0; } catch (e2) { t = 0; }
                    if (!t) t = pos;
                    if (!best || t > bestTime) {
                        best = it;
                        bestTime = t;
                    }
                }
                if (best) callback(best);
                else if (onFail) onFail();
            }.bind(this), onFail);
        },

        sessionReport: function (endpoint, payload) {
            try {
                var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                if (!server || !endpoint) return;
                var url = server + endpoint;
                this.request(url, 'POST', payload || {}, function () {}, function () {}, { useAuthHeader: true, useTokenHeader: true, dataType: 'text', timeoutMs: 1000 * 15 });
            } catch (e0) {}
        },

        playstateRequest: function (endpoint, method) {
            try {
                var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                var uid = String(this.userId || '');
                if (!server || !uid || !endpoint) return;
                var url = server + endpoint;
                this.request(url, method || 'POST', {}, function () {}, function () {}, { useAuthHeader: true, useTokenHeader: true, dataType: 'text', timeoutMs: 1000 * 15 });
            } catch (e0) {}
        },

        updateUserData: function (itemId, positionTicks, played) {
            try {
                var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                var uid = String(this.userId || '');
                var id = String(itemId || '');
                if (!server || !uid || !id) return;

                var pt = 0;
                try { pt = parseInt(positionTicks, 10) || 0; } catch (e0) { pt = 0; }
                if (pt < 0) pt = 0;

                var body = { PlaybackPositionTicks: pt };
                if (typeof played !== 'undefined') body.Played = !!played;
                try { body.LastPlayedDate = (new Date()).toISOString(); } catch (e1) {}

                var url = server + '/Users/' + encodeURIComponent(uid) + '/Items/' + encodeURIComponent(id) + '/UserData';
                this.request(url, 'POST', body, function () {}, function () {}, { useAuthHeader: true, useTokenHeader: true, dataType: 'text', timeoutMs: 1000 * 15 });
            } catch (e2) {}
        },

        markPlayed: function (itemId) {
            try {
                var uid = String(this.userId || '');
                var id = String(itemId || '');
                if (!uid || !id) return;
                this.playstateRequest('/Users/' + encodeURIComponent(uid) + '/PlayedItems/' + encodeURIComponent(id), 'POST');
            } catch (e0) {}
        },

        stopPlaybackSync: function (opts) {
            var pb = this.activePlayback;
            this.activePlayback = null;

            if (pb && pb.handlers) {
                try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.remove('timeupdate', pb.handlers.timeupdate); } catch (e0) {}
                try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.remove('pause', pb.handlers.pause); } catch (e1) {}
                try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.remove('play', pb.handlers.play); } catch (e2) {}
                try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.remove('ended', pb.handlers.ended); } catch (e3) {}
                try { if (Lampa && Lampa.Player && Lampa.Player.listener) Lampa.Player.listener.remove('destroy', pb.handlers.destroy); } catch (e4) {}
            }

            try {
                if (pb && pb.itemId && pb.playSessionId) {
                    var stopped = {
                        ItemId: pb.itemId,
                        MediaSourceId: pb.mediaSourceId || pb.itemId,
                        PositionTicks: this.secondsToTicks(pb.positionSec || 0),
                        PlaySessionId: pb.playSessionId
                    };
                    if (opts && opts.playedToCompletion) stopped.PlayedToCompletion = true;
                    this.sessionReport('/Sessions/Playing/Stopped', stopped);

                    try {
                        if (opts && opts.playedToCompletion) this.markPlayed(pb.itemId);
                        var finalTicks = this.secondsToTicks(pb.positionSec || 0);
                        if (opts && opts.playedToCompletion) this.updateUserData(pb.itemId, 0, true);
                        else this.updateUserData(pb.itemId, finalTicks, false);
                    } catch (e7) {}
                }
            } catch (e5) {}
        },

        startPlaybackSync: function (meta) {
            try { this.stopPlaybackSync({}); } catch (e0) {}

            var pb = meta || {};
            pb.itemId = pb.itemId ? String(pb.itemId) : '';
            pb.mediaSourceId = pb.mediaSourceId ? String(pb.mediaSourceId) : '';
            pb.playSessionId = pb.playSessionId || (Math.random().toString(36).slice(2) + Date.now().toString(36));
            pb.positionSec = pb.positionSec || 0;
            pb.durationSec = pb.durationSec || 0;
            pb.lastReportAt = 0;
            pb.lastUserDataAt = 0;
            pb.started = false;

            var updateLocal = function () {
                try {
                    if (!pb.itemId) return;
                    var itemState = {
                        positionSec: pb.positionSec || 0,
                        durationSec: pb.durationSec || 0,
                        updatedAt: Date.now(),
                        mediaSourceId: pb.mediaSourceId || '',
                        audioIndex: typeof pb.audioIndex !== 'undefined' ? pb.audioIndex : '',
                        title: pb.title || ''
                    };
                    Jellyfin.setLocalItemState(pb.itemId, itemState);

                    if (pb.seriesId) {
                        var seriesState = {
                            itemId: pb.itemId,
                            updatedAt: Date.now(),
                            seasonNumber: pb.seasonNumber || '',
                            episodeNumber: pb.episodeNumber || '',
                            seriesName: pb.seriesName || '',
                            episodeName: pb.title || ''
                        };
                        Jellyfin.setSeriesLastState(pb.seriesId, seriesState);
                    }
                } catch (e0) {}
            };

            var reportProgress = function (paused, force) {
                try {
                    var now = Date.now();
                    if (!force && pb.lastReportAt && (now - pb.lastReportAt) < 8000) return;
                    pb.lastReportAt = now;

                    if (!pb.started) {
                        pb.started = true;
                        this.sessionReport('/Sessions/Playing', {
                            ItemId: pb.itemId,
                            MediaSourceId: pb.mediaSourceId || pb.itemId,
                            PositionTicks: this.secondsToTicks(pb.positionSec || 0),
                            PlaySessionId: pb.playSessionId,
                            CanSeek: true,
                            PlayMethod: 'DirectPlay'
                        });

                        try {
                            var uid = String(this.userId || '');
                            if (uid) {
                                var startUrl = '/Users/' + encodeURIComponent(uid) + '/PlayingItems/' + encodeURIComponent(pb.itemId) +
                                    '?MediaSourceId=' + encodeURIComponent(pb.mediaSourceId || pb.itemId) +
                                    '&AudioStreamIndex=' + encodeURIComponent(String(typeof pb.audioIndex !== 'undefined' ? pb.audioIndex : '')) +
                                    '&PositionTicks=' + encodeURIComponent(String(this.secondsToTicks(pb.positionSec || 0))) +
                                    '&PlaySessionId=' + encodeURIComponent(String(pb.playSessionId || '')) +
                                    '&CanSeek=true';
                                this.playstateRequest(startUrl, 'POST');
                            }
                        } catch (e2) {}
                    }

                    this.sessionReport('/Sessions/Playing/Progress', {
                        ItemId: pb.itemId,
                        MediaSourceId: pb.mediaSourceId || pb.itemId,
                        PositionTicks: this.secondsToTicks(pb.positionSec || 0),
                        IsPaused: !!paused,
                        PlaySessionId: pb.playSessionId
                    });

                    try {
                        var uid2 = String(this.userId || '');
                        if (uid2) {
                            var progUrl = '/Users/' + encodeURIComponent(uid2) + '/PlayingItems/' + encodeURIComponent(pb.itemId) + '/Progress' +
                                '?MediaSourceId=' + encodeURIComponent(pb.mediaSourceId || pb.itemId) +
                                '&AudioStreamIndex=' + encodeURIComponent(String(typeof pb.audioIndex !== 'undefined' ? pb.audioIndex : '')) +
                                '&PositionTicks=' + encodeURIComponent(String(this.secondsToTicks(pb.positionSec || 0))) +
                                '&PlaySessionId=' + encodeURIComponent(String(pb.playSessionId || '')) +
                                '&IsPaused=' + (paused ? 'true' : 'false');
                            this.playstateRequest(progUrl, 'POST');
                        }
                    } catch (e3) {}

                    try {
                        if (!pb.lastUserDataAt || (now - pb.lastUserDataAt) > 15000) {
                            pb.lastUserDataAt = now;
                            this.updateUserData(pb.itemId, this.secondsToTicks(pb.positionSec || 0), false);
                        }
                    } catch (e4) {}
                } catch (e1) {}
            }.bind(this);

            pb.handlers = {};
            pb.handlers.timeupdate = function (e) {
                try {
                    pb.positionSec = e && typeof e.current !== 'undefined' ? (parseFloat(e.current) || 0) : pb.positionSec;
                    pb.durationSec = e && typeof e.duration !== 'undefined' ? (parseFloat(e.duration) || 0) : pb.durationSec;
                    updateLocal();
                    reportProgress(false, false);
                } catch (e0) {}
            };
            pb.handlers.pause = function () { reportProgress(true, true); };
            pb.handlers.play = function () { reportProgress(false, true); };
            pb.handlers.ended = function () {
                try {
                    updateLocal();
                    this.stopPlaybackSync({ playedToCompletion: true });
                } catch (e0) {}
            }.bind(this);
            pb.handlers.destroy = function () {
                try {
                    updateLocal();
                    this.stopPlaybackSync({});
                } catch (e0) {}
            }.bind(this);

            this.activePlayback = pb;

            try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.follow('timeupdate', pb.handlers.timeupdate); } catch (e2) {}
            try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.follow('pause', pb.handlers.pause); } catch (e3) {}
            try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.follow('play', pb.handlers.play); } catch (e4) {}
            try { if (Lampa && Lampa.PlayerVideo && Lampa.PlayerVideo.listener) Lampa.PlayerVideo.listener.follow('ended', pb.handlers.ended); } catch (e5) {}
            try { if (Lampa && Lampa.Player && Lampa.Player.listener) Lampa.Player.listener.follow('destroy', pb.handlers.destroy); } catch (e6) {}
        },

        configureLinesUI: function () {
            var enabled = null;
            try { enabled = Lampa.Controller.enabled(); } catch (e0) { enabled = null; }
            var restore = function () {
                try { Lampa.Controller.toggle(enabled && enabled.name ? enabled.name : 'settings'); } catch (e1) {}
            };

            var prefs = this.getLinePrefs();
            var order = prefs.order || [];
            var disabled = prefs.disabled || {};

            this.getViews(function (views) {
                var list = Array.isArray(views) ? views : [];
                var map = {};

                map['jellyfin://resume'] = { title: 'Продолжить просмотр', desc: '' };

                for (var i = 0; i < list.length; i++) {
                    var v = list[i];
                    if (!v || !v.Id) continue;
                    var ct = '';
                    try { ct = String(v.CollectionType || v.collectionType || '').toLowerCase(); } catch (e0) { ct = ''; }
                    if (ct !== 'movies' && ct !== 'tvshows') continue;

                    var media = ct === 'tvshows' ? 'tv' : 'movie';
                    var name = '';
                    try { name = String(v.Name || v.name || '').trim(); } catch (e1) { name = ''; }
                    if (!name) name = media === 'tv' ? 'Сериалы' : 'Фильмы';

                    var latestKey = 'jellyfin://latest?type=' + encodeURIComponent(media) + '&parentId=' + encodeURIComponent(String(v.Id));
                    map[latestKey] = { title: 'Недавно добавлено в ' + name, desc: '' };

                    if (media === 'movie') {
                        var premKey = 'jellyfin://premiere?type=' + encodeURIComponent(media) + '&parentId=' + encodeURIComponent(String(v.Id));
                        map[premKey] = { title: 'Новинки (' + name + ')', desc: '' };
                    }
                }

                var modal = null;
                try { modal = (Lampa && Lampa.Modal) ? Lampa.Modal : (typeof Modal !== 'undefined' ? Modal : null); } catch (e1) { modal = null; }
                if (!modal || !modal.open || !modal.close) {
                    Lampa.Noty.show('Jellyfin: Не удалось открыть окно');
                    restore();
                    return;
                }

                var keys = Object.keys(map || {});
                keys.sort(function (a, b) {
                    var ia = order.indexOf(a);
                    var ib = order.indexOf(b);
                    if (ia === -1 && ib === -1) return String(map[a].title).localeCompare(String(map[b].title));
                    if (ia === -1) return 1;
                    if (ib === -1) return -1;
                    return ia - ib;
                });

                var buildRow = function (k) {
                    var title = '';
                    try { title = map[k] && map[k].title ? String(map[k].title) : String(k); } catch (e0) { title = String(k); }

                    var row = $([
                        '<div class="menu-edit-list__item" data-key="' + encodeURIComponent(String(k)) + '">',
                        '  <div class="menu-edit-list__icon">' + JELLYFIN_ICON + '</div>',
                        '  <div class="menu-edit-list__title"></div>',
                        '  <div class="menu-edit-list__move move-up selector">',
                        '    <svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 12L11 3L20 12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
                        '  </div>',
                        '  <div class="menu-edit-list__move move-down selector">',
                        '    <svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2L11 11L20 2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
                        '  </div>',
                        '  <div class="menu-edit-list__toggle toggle selector">',
                        '    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.89111" y="1.78369" width="21.793" height="21.793" rx="3.5" stroke="currentColor" stroke-width="3"/><path d="M7.44873 12.9658L10.8179 16.3349L18.1269 9.02588" stroke="currentColor" stroke-width="3" class="dot" opacity="0" stroke-linecap="round"/></svg>',
                        '  </div>',
                        '</div>'
                    ].join(''));

                    row.find('.menu-edit-list__title').text(title);

                    var applyState = function () {
                        var off = !!disabled[k];
                        row.toggleClass('hidden', off);
                        row.find('.dot').attr('opacity', off ? 0 : 1);
                    };

                    row.find('.move-up').on('hover:enter', function () {
                        var prev = row.prev();
                        if (prev.length) row.insertBefore(prev);
                    });

                    row.find('.move-down').on('hover:enter', function () {
                        var next = row.next();
                        if (next.length) row.insertAfter(next);
                    });

                    row.find('.toggle').on('hover:enter', function () {
                        if (disabled[k]) delete disabled[k];
                        else disabled[k] = true;
                        applyState();
                    });

                    applyState();
                    return row;
                };

                var listEl = $('<div class="menu-edit-list"></div>');
                keys.forEach(function (k) { listEl.append(buildRow(k)); });

                modal.open({
                    title: 'Редактировать',
                    html: listEl,
                    size: 'small',
                    scroll_to_center: true,
                    onBack: function () {
                        var outOrder = [];
                        listEl.find('.menu-edit-list__item').each(function () {
                            var raw = $(this).attr('data-key') || '';
                            try { outOrder.push(decodeURIComponent(raw)); } catch (e0) { outOrder.push(raw); }
                        });

                        Jellyfin.setLinePrefs({ order: outOrder.filter(Boolean), disabled: disabled });
                        try { modal.close(); } catch (e1) {}
                        restore();
                    }
                });
            }, function () {
                Lampa.Noty.show('Jellyfin: не удалось получить список библиотек');
                restore();
            });
        },

        parseLocalUrl: function (url) {
            var raw = String(url || '');
            raw = raw.replace(/^jellyfin:\/*/i, '');
            var out = { path: '', query: {} };
            try {
                var parts = raw.split('?');
                out.path = parts[0] || '';
                if (parts[1]) {
                    parts[1].split('&').forEach(function (p) {
                        if (!p) return;
                        var kv = p.split('=');
                        var k = decodeURIComponent(kv[0] || '');
                        var v = decodeURIComponent(kv.slice(1).join('=') || '');
                        if (k) out.query[k] = v;
                    });
                }
            } catch (e0) {}
            return out;
        },

        jellyfinToCard: function (it) {
            try {
                if (!it || !it.Id) return null;
                var providers = it.ProviderIds || it.Providerids || {};
                var tmdb = providers && (providers.Tmdb || providers.tmdb || providers.TMDb || '');
                tmdb = tmdb ? String(tmdb) : '';

                var isSeries = String(it.Type || '').toLowerCase() === 'series';
                var date = '';
                try { date = String(it.PremiereDate || it.ProductionYear || '').slice(0, 10); } catch (e1) { date = ''; }

                var card = {
                    jellyfin_item_id: String(it.Id),
                    card_type: isSeries ? 'tv' : 'movie',
                    source: tmdb ? 'tmdb' : 'jellyfin',
                    id: tmdb ? tmdb : String(it.Id),
                    img: this.buildImageUrl(it.Id, 'primary'),
                    background_image: this.buildImageUrl(it.Id, 'backdrop')
                };

                if (isSeries) {
                    card.name = it.Name || '';
                    card.original_name = it.OriginalTitle || it.Name || '';
                    if (date && date.length >= 4) card.first_air_date = date;
                } else {
                    card.title = it.Name || '';
                    card.original_title = it.OriginalTitle || it.Name || '';
                    if (date && date.length >= 4) card.release_date = date;
                }

                try {
                    if (it.CommunityRating) card.vote_average = parseFloat(it.CommunityRating) || 0;
                } catch (e2) {}
                try {
                    if (it.Overview) card.overview = String(it.Overview);
                } catch (e3) {}

                if (tmdb) this.rememberTmdbMapping(isSeries ? 'tv' : 'movie', tmdb, it.Id);

                return card;
            } catch (e0) {
                return null;
            }
        },

        dedupeCards: function (cards) {
            var out = [];
            var seen = {};
            for (var i = 0; i < (cards || []).length; i++) {
                var c = cards[i];
                if (!c) continue;
                var key = '';
                try {
                    if (c.source === 'tmdb') key = 'tmdb:' + String(c.card_type || (c.name ? 'tv' : 'movie')) + ':' + String(c.id || '');
                    else key = 'jf:' + String(c.jellyfin_item_id || c.id || '');
                } catch (e0) {
                    key = '';
                }
                if (!key) continue;
                if (seen[key]) continue;
                seen[key] = true;
                out.push(c);
            }
            return out;
        },

        libraryItems: function (mode, media, page, callback, onFail, onlyTmdb, opts) {
            this.authenticate(function () {
                try {
                    var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                    var token = String(this.token || '');
                    var uid = String(this.userId || '');
                    if (!server || !token || !uid) {
                        if (onFail) onFail();
                        return;
                    }

                    var reqPage = parseInt(page, 10) || 1;
                    if (reqPage < 1) reqPage = 1;
                    var startIndex = Math.max(0, (reqPage - 1) * 20);
                    var base = server + '/Users/' + encodeURIComponent(uid) + '/Items';
                    var query = [];
                    query.push('Recursive=true');
                    query.push('StartIndex=' + startIndex);
                    query.push('Limit=100');
                    query.push('Fields=ProviderIds,PremiereDate,ProductionYear,Overview,CommunityRating,Type,UserData,SeriesId,ParentId,IndexNumber,ParentIndexNumber,RunTimeTicks,MediaSources,MediaStreams');

                    if (mode === 'resume') {
                        base = server + '/Users/' + encodeURIComponent(uid) + '/Items/Resume';
                    } else {
                        var types = (media === 'tv') ? 'Series' : 'Movie';
                        query.push('IncludeItemTypes=' + types);
                        if (mode === 'premiere') query.push('SortBy=PremiereDate,DateCreated');
                        else query.push('SortBy=DateCreated');
                        query.push('SortOrder=Descending');
                    }

                    try {
                        if (opts && opts.parentId) query.push('ParentId=' + encodeURIComponent(String(opts.parentId)));
                        if (opts && opts.genre) query.push('Genres=' + encodeURIComponent(String(opts.genre)));
                    } catch (e0) {}

                    query.push('api_key=' + encodeURIComponent(token));

                    var url = base + '?' + query.join('&');

                    this.request(url, 'GET', null, function (res) {
                        var items = (res && (res.Items || res.items)) ? (res.Items || res.items) : [];
                        var total = 0;
                        try { total = parseInt(res.TotalRecordCount || res.totalRecordCount || res.Total || 0, 10) || 0; } catch (e0) { total = 0; }

                        var cards = [];
                        for (var i = 0; i < items.length; i++) {
                            var c = this.jellyfinToCard(items[i]);
                            if (!c) continue;
                            if (onlyTmdb && c.source !== 'tmdb') continue;
                            cards.push(c);
                        }

                        cards = this.dedupeCards(cards).slice(0, 20);
                        callback({ cards: cards, total: total });
                    }.bind(this), function () {
                        if (onFail) onFail();
                    }, { useAuthHeader: false, useTokenHeader: false, dataType: 'json', timeoutMs: 1000 * 25 });
                } catch (e1) {
                    if (onFail) onFail();
                }
            }.bind(this));
        },

        getViews: function (callback, onFail) {
            this.authenticate(function () {
                try {
                    var server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, '');
                    var token = String(this.token || '');
                    var uid = String(this.userId || '');
                    if (!server || !token || !uid) {
                        if (onFail) onFail();
                        return;
                    }

                    var url = server + '/Users/' + encodeURIComponent(uid) + '/Views?api_key=' + encodeURIComponent(token);
                    this.request(url, 'GET', null, function (res) {
                        var items = (res && (res.Items || res.items)) ? (res.Items || res.items) : [];
                        callback(items || []);
                    }.bind(this), function () {
                        if (onFail) onFail();
                    }, { useAuthHeader: false, useTokenHeader: false, dataType: 'json', timeoutMs: 1000 * 25 });
                } catch (e0) {
                    if (onFail) onFail();
                }
            }.bind(this));
        },

        patchApi: function () {
            if (this.apiPatched) return;
            if (!Lampa || !Lampa.Api) return;
            this.apiPatched = true;

            var originalCategory = Lampa.Api.category;
            var originalList = Lampa.Api.list;

            Lampa.Api.category = function (params, oncomplite, onerror) {
                try {
                    if (params && params.url && String(params.url).indexOf('jellyfin:') === 0) {
                        var parsed = Jellyfin.parseLocalUrl(params.url);
                        if (parsed.path === 'main') {
                            var lines = [];
                            var lineSeen = {};
                            var pushLine = function (line) {
                                try {
                                    var k = (line && (line.url || line.title)) ? String(line.url || line.title) : '';
                                    if (!k) return;
                                    if (lineSeen[k]) return;
                                    lineSeen[k] = true;
                                    lines.push(line);
                                } catch (e0) {}
                            };

                            var done = 0;
                            var expected = 1;
                            var finish = function () {
                                done++;
                                if (done >= expected) oncomplite(Jellyfin.applyLinePrefs(lines.filter(function (l) { return l && l.results && l.results.length; })));
                            };

                            Jellyfin.getViews(function (views) {
                                var list = Array.isArray(views) ? views : [];
                                var work = 0;
                                var viewSeen = {};

                                for (var i = 0; i < list.length; i++) {
                                    var v = list[i];
                                    if (!v || !v.Id) continue;
                                    var ct = '';
                                    try { ct = String(v.CollectionType || v.collectionType || '').toLowerCase(); } catch (e0) { ct = ''; }
                                    if (ct !== 'movies' && ct !== 'tvshows') continue;

                                    var viewTitleKey = '';
                                    try { viewTitleKey = String(v.Name || v.name || '').trim().toLowerCase(); } catch (e1) { viewTitleKey = ''; }
                                    var viewKey = String(v.Id) + '|' + ct + '|' + viewTitleKey;
                                    if (viewSeen[viewKey]) continue;
                                    viewSeen[viewKey] = true;

                                    work++;
                                    (function (view) {
                                        var collectionType = '';
                                        try { collectionType = String(view.CollectionType || view.collectionType || '').toLowerCase(); } catch (e1) { collectionType = ''; }
                                        var media = collectionType === 'tvshows' ? 'tv' : 'movie';
                                        var viewTitle = '';
                                        try { viewTitle = String(view.Name || view.name || '').trim(); } catch (e2) { viewTitle = ''; }
                                        if (!viewTitle) viewTitle = (media === 'tv' ? 'Сериалы' : 'Фильмы');

                                        Jellyfin.libraryItems('latest', media, 1, function (data) {
                                            pushLine({
                                                title: 'Jellyfin • Недавно добавлено в ' + viewTitle,
                                                url: 'jellyfin://latest?type=' + encodeURIComponent(media) + '&parentId=' + encodeURIComponent(String(view.Id)),
                                                results: data.cards,
                                                total_pages: Math.max(1, Math.ceil((data.total || 0) / 20))
                                            });

                                            if (media === 'movie') {
                                                Jellyfin.libraryItems('premiere', media, 1, function (data2) {
                                                    pushLine({
                                                        title: 'Jellyfin • Новинки (' + viewTitle + ')',
                                                        url: 'jellyfin://premiere?type=' + encodeURIComponent(media) + '&parentId=' + encodeURIComponent(String(view.Id)),
                                                        results: data2.cards,
                                                        total_pages: Math.max(1, Math.ceil((data2.total || 0) / 20))
                                                    });
                                                    work--;
                                                    if (work <= 0) finish();
                                                }, function () {
                                                    work--;
                                                    if (work <= 0) finish();
                                                }, true, { parentId: String(view.Id) });
                                            } else {
                                                work--;
                                                if (work <= 0) finish();
                                            }
                                        }, function () {
                                            work--;
                                            if (work <= 0) finish();
                                        }, true, { parentId: String(view.Id) });
                                    })(v);
                                }

                                if (!work) {
                                    expected = 3;

                                    Jellyfin.libraryItems('latest', 'movie', 1, function (data) {
                                        pushLine({
                                            title: 'Jellyfin • Последние фильмы',
                                            url: 'jellyfin://latest?type=movie',
                                            results: data.cards,
                                            total_pages: Math.max(1, Math.ceil((data.total || 0) / 20))
                                        });
                                        finish();
                                    }, function () { finish(); }, true);

                                    Jellyfin.libraryItems('latest', 'tv', 1, function (data) {
                                        pushLine({
                                            title: 'Jellyfin • Последние сериалы',
                                            url: 'jellyfin://latest?type=tv',
                                            results: data.cards,
                                            total_pages: Math.max(1, Math.ceil((data.total || 0) / 20))
                                        });
                                        finish();
                                    }, function () { finish(); }, true);

                                    Jellyfin.libraryItems('premiere', 'movie', 1, function (data) {
                                        pushLine({
                                            title: 'Jellyfin • Новинки (фильмы)',
                                            url: 'jellyfin://premiere?type=movie',
                                            results: data.cards,
                                            total_pages: Math.max(1, Math.ceil((data.total || 0) / 20))
                                        });
                                        finish();
                                    }, function () { finish(); }, true);
                                }
                            }, function () {
                                expected = 3;

                                Jellyfin.libraryItems('latest', 'movie', 1, function (data) {
                                    pushLine({
                                        title: 'Jellyfin • Последние фильмы',
                                        url: 'jellyfin://latest?type=movie',
                                        results: data.cards,
                                        total_pages: Math.max(1, Math.ceil((data.total || 0) / 20))
                                    });
                                    finish();
                                }, function () { finish(); }, true);

                                Jellyfin.libraryItems('latest', 'tv', 1, function (data) {
                                    pushLine({
                                        title: 'Jellyfin • Последние сериалы',
                                        url: 'jellyfin://latest?type=tv',
                                        results: data.cards,
                                        total_pages: Math.max(1, Math.ceil((data.total || 0) / 20))
                                    });
                                    finish();
                                }, function () { finish(); }, true);

                                Jellyfin.libraryItems('premiere', 'movie', 1, function (data) {
                                    pushLine({
                                        title: 'Jellyfin • Новинки (фильмы)',
                                        url: 'jellyfin://premiere?type=movie',
                                        results: data.cards,
                                        total_pages: Math.max(1, Math.ceil((data.total || 0) / 20))
                                    });
                                    finish();
                                }, function () { finish(); }, true);
                            });

                            return;
                        }
                    }
                } catch (e0) {}
                return originalCategory(params, oncomplite, onerror);
            };

            Lampa.Api.list = function (params, oncomplite, onerror) {
                try {
                    if (params && params.url && String(params.url).indexOf('jellyfin:') === 0) {
                        var parsed = Jellyfin.parseLocalUrl(params.url);
                        var page = params.page || 1;

                        if (parsed.path === 'latest') {
                            var media = parsed.query.type === 'tv' ? 'tv' : 'movie';
                            var pid = parsed.query.parentId || parsed.query.topParentId || '';
                            Jellyfin.libraryItems('latest', media, page, function (data) {
                                oncomplite({
                                    title: (media === 'tv') ? 'Jellyfin • Последние сериалы' : 'Jellyfin • Последние фильмы',
                                    results: data.cards,
                                    page: page,
                                    total_pages: Math.max(1, Math.ceil((data.total || 0) / 20)),
                                    total_results: data.total || 0
                                });
                            }, function () {
                                if (onerror) onerror({ status: 404 });
                            }, true, { parentId: pid });
                            return;
                        }

                        if (parsed.path === 'premiere') {
                            var media2 = parsed.query.type === 'tv' ? 'tv' : 'movie';
                            var pid2 = parsed.query.parentId || parsed.query.topParentId || '';
                            Jellyfin.libraryItems('premiere', media2, page, function (data) {
                                oncomplite({
                                    title: (media2 === 'tv') ? 'Jellyfin • Новинки (сериалы)' : 'Jellyfin • Новинки (фильмы)',
                                    results: data.cards,
                                    page: page,
                                    total_pages: Math.max(1, Math.ceil((data.total || 0) / 20)),
                                    total_results: data.total || 0
                                });
                            }, function () {
                                if (onerror) onerror({ status: 404 });
                            }, true, { parentId: pid2 });
                            return;
                        }

                        if (parsed.path === 'genre') {
                            var media3 = parsed.query.type === 'tv' ? 'tv' : 'movie';
                            var genre = parsed.query.name ? String(parsed.query.name) : '';
                            var pid3 = parsed.query.parentId || parsed.query.topParentId || '';
                            var title = 'Jellyfin • Жанр';
                            if (genre.toLowerCase() === 'animation') title = (media3 === 'tv') ? 'Jellyfin • Мультсериалы' : 'Jellyfin • Мультфильмы';

                            Jellyfin.libraryItems('genre', media3, page, function (data) {
                                oncomplite({
                                    title: title,
                                    results: data.cards,
                                    page: page,
                                    total_pages: Math.max(1, Math.ceil((data.total || 0) / 20)),
                                    total_results: data.total || 0
                                });
                            }, function () {
                                if (onerror) onerror({ status: 404 });
                            }, true, { genre: genre || 'Animation', parentId: pid3 });
                            return;
                        }

                        if (parsed.path === 'resume') {
                            Jellyfin.libraryItems('resume', 'all', page, function (data) {
                                oncomplite({
                                    title: 'Jellyfin • Продолжить просмотр',
                                    results: data.cards,
                                    page: page,
                                    total_pages: Math.max(1, Math.ceil((data.total || 0) / 20)),
                                    total_results: data.total || 0
                                });
                            }, function () {
                                if (onerror) onerror({ status: 404 });
                            });
                            return;
                        }
                    }
                } catch (e0) {}
                return originalList(params, oncomplite, onerror);
            };
        },

        authenticate: function (callback) {
            var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
            var user = sget('jellyfin_user', JELLYFIN_USER);
            var pass = sget('jellyfin_pass', JELLYFIN_PASS);
            var storedToken = sget('jellyfin_token', '');
            var storedUserId = sget('jellyfin_user_id', '');

            if (this.token && this.userId && this.lastServer === server) {
                callback(this.token);
                return;
            }

            if (storedToken && storedUserId && server) {
                this.token = storedToken;
                this.userId = storedUserId;
                this.lastServer = server;
                this.lastUser = 'token';
                callback(this.token);
                return;
            }

            if (!server || !user || !pass) {
                Lampa.Noty.show('Jellyfin: заполните адрес/логин/пароль или используйте "Быстрое подключение"');
                return;
            }

            var url = server + '/Users/AuthenticateByName';
            var payload = { Username: user, Pw: pass };

            var onFail = function (err) {
                var status = '';
                try { status = err && (err.status || err.decode_code || err.code || ''); } catch (e0) { status = ''; }
                if (String(status) === '401') Lampa.Noty.show('Jellyfin: неверный логин/пароль (401)');
                else if (String(status) === '405') Lampa.Noty.show('Jellyfin: сервер/прокси блокирует POST/OPTIONS (405)');
                else Lampa.Noty.show('Jellyfin: Сервер недоступен' + (status ? ' (' + status + ')' : ''));
            };

            this.request(url, 'POST', payload, function (res) {
                if (res && res.AccessToken) {
                    this.saveAuth(server, res.AccessToken, res.SessionInfo && res.SessionInfo.UserId ? res.SessionInfo.UserId : '', user);
                    callback(this.token);
                } else {
                    this.clearAuth();
                    Lampa.Noty.show('Jellyfin: Ошибка входа');
                }
            }.bind(this), function (err) {
                var status = '';
                try { status = err && (err.status || err.decode_code || err.code || ''); } catch (e0) { status = ''; }
                if (String(status) === '405') {
                    var form = 'Username=' + encodeURIComponent(user) + '&Pw=' + encodeURIComponent(pass);
                    this.request(url, 'POST', form, function (res) {
                        if (res && res.AccessToken) {
                            this.saveAuth(server, res.AccessToken, res.SessionInfo && res.SessionInfo.UserId ? res.SessionInfo.UserId : '', user);
                            callback(this.token);
                        } else {
                            onFail({ status: 401 });
                        }
                    }.bind(this), onFail, { form: true, contentType: 'application/x-www-form-urlencoded; charset=UTF-8', processData: false, useAuthHeader: false });
                } else {
                    onFail(err);
                }
            }.bind(this));
        },

        quickConnectStop: function () {
            if (this.quickConnectTimer) { try { clearTimeout(this.quickConnectTimer); } catch (e0) {} }
            this.quickConnectTimer = null;
            this.quickConnectSecret = null;
            this.quickConnectInFlight = false;
            this.quickConnectFailCount = 0;
        },

        quickConnectInitiate: function (server, callback, onFail) {
            var url = server + '/QuickConnect/Initiate';
            this.request(url, 'GET', null, function (res) {
                callback(res || null);
            }, function () {
                this.request(url, 'POST', {}, function (res2) {
                    callback(res2 || null);
                }, onFail, { useTokenHeader: false, dataType: 'json' });
            }.bind(this), { useTokenHeader: false, dataType: 'json' });
        },

        quickConnectConnect: function (server, secret, callback, onFail) {
            var s = secret || '';
            var url = server + '/QuickConnect/Connect?secret=' + encodeURIComponent(s);
            var url2 = server + '/QuickConnect/Connect';
            var payload = { Secret: s };

            this.request(url, 'POST', payload, function (res) {
                callback(res || null);
            }, function (e0) {
                this.request(url2, 'POST', payload, function (res2) {
                    callback(res2 || null);
                }, function (e1) {
                    this.request(url, 'GET', null, function (res3) { callback(res3 || null); }, function (e2) { if (onFail) onFail(e2 || e1 || e0); }, { useTokenHeader: false, dataType: 'json' });
                }.bind(this), { useTokenHeader: false, dataType: 'json' });
            }.bind(this), { useTokenHeader: false, dataType: 'json' });
        },

        quickConnectAuthenticate: function (server, secret, callback, onFail) {
            var url = server + '/Users/AuthenticateWithQuickConnect';
            var payload = { Secret: secret };

            this.request(url, 'POST', payload, function (res) {
                callback(res || null);
            }, function (e0) {
                var url2 = url + '?secret=' + encodeURIComponent(secret || '');
                this.request(url2, 'POST', {}, function (res2) {
                    callback(res2 || null);
                }, function (e1) {
                    this.request(url2, 'GET', null, function (res3) { callback(res3 || null); }, function (e2) { if (onFail) onFail(e2 || e1 || e0); }, { useTokenHeader: false, dataType: 'json' });
                }.bind(this), { useTokenHeader: false, dataType: 'json' });
            }.bind(this), { useTokenHeader: false, dataType: 'json' });
        },

        quickConnectUI: function () {
            var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
            if (!server) {
                Lampa.Noty.show('Jellyfin: заполните адрес сервера');
                return;
            }

            var enabled = null;
            try { enabled = Lampa.Controller.enabled(); } catch (e0) { enabled = null; }
            var restore = function () {
                Lampa.Controller.toggle(enabled && enabled.name ? enabled.name : 'settings');
            };

            var modal = null;
            try { modal = (Lampa && Lampa.Modal) ? Lampa.Modal : (typeof Modal !== 'undefined' ? Modal : null); } catch (e1) { modal = null; }
            if (!modal || !modal.open) {
                Lampa.Noty.show('Jellyfin: Не удалось открыть окно');
                return;
            }

            this.quickConnectStop();

            var html = $('<div class="jellyfin-qc"><div class="jellyfin-qc__title">Быстрое подключение</div><div class="jellyfin-qc__text">Откройте Jellyfin в браузере и перейдите в "Быстрое подключение", затем введите код:</div><div class="jellyfin-qc__code">...</div><div class="jellyfin-qc__url">' + server + '/web/#/quickconnect.html</div><div class="jellyfin-qc__status">Получаем код...</div></div>');
            var statusEl = html.find('.jellyfin-qc__status');
            var codeEl = html.find('.jellyfin-qc__code');

            modal.open({
                title: 'Jellyfin',
                html: html,
                size: 'small',
                scroll_to_center: true,
                onBack: function () {
                    try { modal.close(); } catch (e0) {}
                    this.quickConnectStop();
                    restore();
                }.bind(this)
            });

            this.quickConnectInitiate(server, function (initRes) {
                var src = initRes || {};
                try { if (src && src.data) src = src.data; } catch (e0) {}
                try { if (src && src.Result) src = src.Result; } catch (e1) {}

                var code = src && (src.Code || src.code || src.QuickConnectCode || src.QuickConnectcode || '');
                var secret = src && (src.Secret || src.secret || src.QuickConnectSecret || src.QuickConnectsecret || '');

                if (!code || !secret) {
                    statusEl.text('Не удалось получить код (Quick Connect выключен на сервере?)');
                    return;
                }

                this.quickConnectSecret = secret;
                this.quickConnectFailCount = 0;
                codeEl.text(String(code));
                statusEl.text('Ожидание подтверждения...');

                var startedAt = Date.now();
                var poll = function () {
                    if (!this.quickConnectSecret) return;
                    if (this.quickConnectInFlight) {
                        this.quickConnectTimer = setTimeout(poll.bind(this), 1200);
                        return;
                    }
                    if (Date.now() - startedAt > 1000 * 180) {
                        statusEl.text('Время ожидания истекло. Повторите.');
                        this.quickConnectStop();
                        return;
                    }

                    this.quickConnectInFlight = true;
                    var scheduleNext = function (delay) {
                        if (!this.quickConnectSecret) return;
                        this.quickConnectInFlight = false;
                        this.quickConnectTimer = setTimeout(poll.bind(this), delay || 2000);
                    }.bind(this);

                    this.quickConnectAuthenticate(server, this.quickConnectSecret, function (authRes) {
                        if (authRes && authRes.AccessToken) {
                            this.quickConnectStop();
                            this.saveAuth(server, authRes.AccessToken, authRes.SessionInfo && authRes.SessionInfo.UserId ? authRes.SessionInfo.UserId : '', 'quickconnect');
                            statusEl.text('Подключено');
                            try { Lampa.Noty.show('Jellyfin: подключено'); } catch (e0) {}
                            setTimeout(function () { try { modal.close(); } catch (e1) {} restore(); }, 600);
                            return;
                        }

                        this.quickConnectConnect(server, this.quickConnectSecret, function (connectRes) {
                            var ok = false;
                            try { ok = !!(connectRes && (connectRes.Authenticated || connectRes.authenticated)); } catch (e2) { ok = false; }
                            if (ok) statusEl.text('Подтверждено, получаем токен...');
                            this.quickConnectFailCount = 0;
                            scheduleNext(ok ? 1200 : 2000);
                        }.bind(this), function () {
                            scheduleNext(2000);
                        });
                    }.bind(this), function (err) {
                        var status = '';
                        try { status = err && (err.status || err.decode_code || err.code || ''); } catch (e0) { status = ''; }
                        var statusStr = String(status || '');
                        var pending = (statusStr === '401' || statusStr === '403' || statusStr === '404' || statusStr === '400' || statusStr === '409');
                        if (pending) {
                            this.quickConnectFailCount = 0;
                            scheduleNext(2000);
                            return;
                        }

                        this.quickConnectFailCount++;
                        if (this.quickConnectFailCount >= 8 && Date.now() - startedAt > 15000) {
                            statusEl.text('Нет ответа от Quick Connect' + (statusStr ? ' (' + statusStr + ')' : ''));
                        }
                        scheduleNext(2500);
                    }.bind(this));
                }.bind(this);

                poll.call(this);
            }.bind(this), function () {
                statusEl.text('Не удалось получить код (сервер недоступен)');
            });
        },

        formatSize: function(bytes) {
            if (!bytes) return '';
            var gbs = bytes / (1024 * 1024 * 1024);
            return gbs.toFixed(1) + ' GB';
        },

        formatLang: function (lang) {
            var l = String(lang || '').toLowerCase();
            if (!l) return '';
            if (l === 'rus' || l === 'ru' || l === 'russian') return 'RU';
            if (l === 'eng' || l === 'en' || l === 'english') return 'EN';
            if (l === 'ukr' || l === 'uk' || l === 'ukrainian') return 'UK';
            if (l === 'spa' || l === 'es' || l === 'spanish') return 'ES';
            if (l === 'fra' || l === 'fr' || l === 'french') return 'FR';
            if (l === 'deu' || l === 'de' || l === 'german') return 'DE';
            if (l === 'ita' || l === 'it' || l === 'italian') return 'IT';
            return l.slice(0, 3).toUpperCase();
        },

        formatChannels: function (channels) {
            var ch = 0;
            try { ch = parseInt(channels, 10) || 0; } catch (e0) { ch = 0; }
            if (!ch) return '';
            if (ch === 1) return '1.0';
            if (ch === 2) return '2.0';
            if (ch === 6) return '5.1';
            if (ch === 8) return '7.1';
            return String(ch);
        },

        getMediaStreams: function (mediaSource, item) {
            try {
                if (mediaSource && mediaSource.MediaStreams && mediaSource.MediaStreams.length) return mediaSource.MediaStreams;
                if (item && item.MediaStreams && item.MediaStreams.length) return item.MediaStreams;
            } catch (e0) {}
            return [];
        },

        getVideoStream: function(mediaSource, item) {
            try {
                var streams = this.getMediaStreams(mediaSource, item);
                for (var i = 0; i < streams.length; i++) {
                    if (streams[i] && streams[i].Type === 'Video') return streams[i];
                }
            } catch (e) {}
            return null;
        },

        getAudioStreams: function (mediaSource, item) {
            var streams = this.getMediaStreams(mediaSource, item);
            var out = [];
            for (var i = 0; i < streams.length; i++) {
                if (streams[i] && streams[i].Type === 'Audio') out.push(streams[i]);
            }
            return out;
        },

        formatAudioStream: function (stream) {
            if (!stream) return '';
            var parts = [];

            var lang = '';
            try { lang = stream.DisplayLanguage || stream.Language || ''; } catch (e0) { lang = ''; }
            lang = this.formatLang(lang);
            if (lang) parts.push(lang);

            var codec = '';
            try { codec = stream.Codec || ''; } catch (e1) { codec = ''; }
            codec = codec ? String(codec).toUpperCase() : '';
            if (codec) parts.push(codec);

            var ch = this.formatChannels(stream.Channels);
            if (ch) parts.push(ch);

            var title = '';
            try { title = stream.Title || stream.DisplayTitle || ''; } catch (e2) { title = ''; }
            if (title) parts.push(String(title).trim());

            return parts.join(' • ');
        },

        getAudioSummary: function (mediaSource, item) {
            var audios = this.getAudioStreams(mediaSource, item);
            if (!audios.length) return '';

            var langs = {};
            for (var i = 0; i < audios.length; i++) {
                var l = '';
                try { l = audios[i].Language || audios[i].DisplayLanguage || ''; } catch (e0) { l = ''; }
                l = this.formatLang(l);
                if (l) langs[l] = true;
            }
            var list = Object.keys(langs);
            if (!list.length) return 'Audio: ' + audios.length;
            return 'Audio: ' + list.join('/') + ' (' + audios.length + ')';
        },

        getVideoCodecInfo: function (mediaSource, item) {
            var v = this.getVideoStream(mediaSource, item);
            if (!v) return '';
            var parts = [];

            var codec = '';
            try { codec = v.Codec || ''; } catch (e0) { codec = ''; }
            codec = codec ? String(codec).toUpperCase() : '';
            if (codec) parts.push(codec);

            var range = '';
            try { range = v.VideoRangeType || v.VideoRange || ''; } catch (e1) { range = ''; }
            range = String(range || '').toUpperCase();
            if (range === 'HDR' || range === 'HLG' || range === 'DOVI' || range === 'DV') parts.push(range === 'DV' ? 'DOVI' : range);

            return parts.join(' ');
        },

        getQuality: function(item, mediaSource) {
            var info = [];
            var ms = mediaSource || (item && item.MediaSources && item.MediaSources.length ? item.MediaSources[0] : null);

            if (ms) {
                var v = this.getVideoStream(ms, item);
                var w = 0;
                var h = 0;
                try { w = v && v.Width ? parseInt(v.Width, 10) : 0; } catch (e0) { w = 0; }
                try { h = v && v.Height ? parseInt(v.Height, 10) : 0; } catch (e1) { h = 0; }
                var px = Math.max(w || 0, h || 0);
                if (px >= 3800 || h >= 2000) info.push('4K');
                else if (px >= 1900 || h >= 1000) info.push('1080p');
                else if (px >= 1200 || h >= 700) info.push('720p');
                else if (px > 0) info.push('SD');

                var vcodec = this.getVideoCodecInfo(ms, item);
                if (vcodec) info.push(vcodec);

                var size = this.formatSize(ms.SizeInBytes || ms.Size);
                if (size) info.push(size);

                if (ms.Bitrate) info.push(Math.round(ms.Bitrate / 1000000) + ' Mbps');

                var as = this.getAudioSummary(ms, item);
                if (as) info.push(as);
            }

            return info.join(' • ') || (item && item.Type === 'Series' ? 'Сериал' : 'Фильм');
        },

        getItemDetails: function (id, callback) {
            try {
                if (!id) return callback(null);
                var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
                var url = server + '/Users/' + encodeURIComponent(this.userId) + '/Items/' + encodeURIComponent(id) + '?Fields=ProductionYear,Name,ProviderIds,MediaSources,MediaStreams,UserData,SeriesId,ParentId,IndexNumber,ParentIndexNumber,RunTimeTicks&api_key=' + encodeURIComponent(this.token || '');
                this.request(
                    url,
                    'GET',
                    null,
                    function (res) { callback(res || null); },
                    function () { callback(null); },
                    { useAuthHeader: false, useTokenHeader: false, dataType: 'json' }
                );
            } catch (e) {
                callback(null);
            }
        },

        search: function (query, year, callback) {
            this.authenticate(function (token) {
                var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
                var url = server + '/Users/' + encodeURIComponent(this.userId) + '/Items?searchTerm=' + encodeURIComponent(query) + '&IncludeItemTypes=Movie,Series&Recursive=true&limit=50&Fields=ProductionYear,Name&api_key=' + encodeURIComponent(token);

                this.request(url, 'GET', null, function (res) {
                    var items = (res && res.Items) ? res.Items : [];

                    var y = 0;
                    if (year) {
                        try { y = parseInt(year, 10) || 0; } catch (eY) { y = 0; }
                    }

                    var filtered = items;
                    if (y && items.length > 0) {
                        var exact = [];
                        var other = [];

                        for (var ii = 0; ii < items.length; ii++) {
                            var cand = items[ii];
                            if (cand && cand.ProductionYear == y) exact.push(cand);
                            else other.push(cand);
                        }

                        filtered = exact.concat(other);
                    }

                    filtered = filtered.slice(0, 20);

                    var out = [];
                    var idx = 0;
                    var seen = {};

                    var getItemKey = function (obj) {
                        try {
                            if (!obj || !obj.Id) return '';
                            return String(obj.Id);
                        } catch (e0) {
                            return '';
                        }
                    };

                    var pushUnique = function (obj) {
                        var key = getItemKey(obj);
                        if (!key) return;
                        if (seen[key]) return;
                        seen[key] = true;
                        out.push(obj);
                    };

                    var next = function () {
                        if (idx >= filtered.length) return callback(out);
                        var it = filtered[idx++];
                        if (!it || !it.Id) return next();

                        this.getItemDetails(it.Id, function (full) {
                            var item = full || it;
                            pushUnique(item);
                            next();
                        });
                    }.bind(this);

                    next();
                }.bind(this), function () {
                    Lampa.Noty.show('Jellyfin: Ошибка поиска');
                }, { useAuthHeader: false, useTokenHeader: false, dataType: 'json' });
            }.bind(this));
        },

        getSeasons: function (seriesId, callback) {
            var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
            this.request(server + '/Shows/' + seriesId + '/Seasons?userId=' + this.userId + '&Fields=MediaSources,MediaStreams,UserData,SeriesId,ParentId,IndexNumber,ParentIndexNumber,RunTimeTicks&api_key=' + encodeURIComponent(this.token || ''), 'GET', null, callback, function() {}, { useAuthHeader: false, useTokenHeader: false, dataType: 'json' });
        },

        getEpisodes: function (seriesId, seasonId, callback) {
            var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
            this.request(server + '/Shows/' + seriesId + '/Episodes?seasonId=' + seasonId + '&userId=' + this.userId + '&Fields=MediaSources,MediaStreams,UserData,SeriesId,ParentId,IndexNumber,ParentIndexNumber,RunTimeTicks&api_key=' + encodeURIComponent(this.token || ''), 'GET', null, callback, function() {}, { useAuthHeader: false, useTokenHeader: false, dataType: 'json' });
        },

        ensureItemDetails: function (item, callback) {
            if (item && item.MediaSources && item.MediaSources.length) return callback(item);
            this.getItemDetails(item && item.Id ? item.Id : '', function (full) {
                callback(full || item || null);
            });
        },

        selectMediaSource: function (item, callback, onBack) {
            var sources = (item && item.MediaSources) ? item.MediaSources : [];
            if (!sources || sources.length <= 1) return callback(sources && sources.length ? sources[0] : null);

            var list = sources.map(function (ms, idx) {
                return {
                    title: 'Версия ' + (idx + 1),
                    subtitle: this.getQuality(item, ms),
                    ms: ms
                };
            }.bind(this));

            Lampa.Select.show({
                title: item && item.Name ? item.Name : 'Jellyfin',
                items: list,
                onSelect: function (a) { callback(a && a.ms ? a.ms : null); },
                onBack: onBack
            });
        },

        selectAudioStreamIndex: function (item, mediaSource, callback, onBack) {
            var audios = this.getAudioStreams(mediaSource, item);
            if (!audios || audios.length <= 1) {
                var one = audios && audios.length ? audios[0] : null;
                var idx = one && typeof one.Index !== 'undefined' ? one.Index : 0;
                return callback(idx);
            }

            var list = audios.map(function (st, i) {
                var title = this.formatAudioStream(st) || ('Дорожка ' + (i + 1));
                var index = typeof st.Index !== 'undefined' ? st.Index : i;
                var isDef = false;
                try { isDef = !!(st.IsDefault || st.Default); } catch (e0) { isDef = false; }
                return {
                    title: title + (isDef ? ' • По умолчанию' : ''),
                    subtitle: '',
                    audioIndex: index
                };
            }.bind(this));

            Lampa.Select.show({
                title: 'Аудио',
                items: list,
                onSelect: function (a) { callback(a && typeof a.audioIndex !== 'undefined' ? a.audioIndex : 0); },
                onBack: onBack
            });
        },

        playWithOptions: function (item, mediaSource, audioIndex, startSeconds) {
            this.authenticate(function () {
                var server = sget('jellyfin_server', JELLYFIN_SERVER).replace(/\/$/, '');
                var msid = '';
                try { msid = mediaSource && mediaSource.Id ? mediaSource.Id : (item && (item.MediaSourceId || (item.MediaSources && item.MediaSources[0] && item.MediaSources[0].Id) || '')); } catch (e0) { msid = ''; }
                var url = server + '/Videos/' + item.Id + '/stream.mp4?Static=true&api_key=' + encodeURIComponent(this.token || '');
                if (msid) url += '&MediaSourceId=' + encodeURIComponent(msid);
                if (typeof audioIndex !== 'undefined' && audioIndex !== null && audioIndex !== '') url += '&AudioStreamIndex=' + encodeURIComponent(audioIndex);

                var timeline = null;
                var ss = 0;
                try { ss = parseFloat(startSeconds) || 0; } catch (e1) { ss = 0; }
                if (ss > 0) timeline = { time: ss, percent: 0, continued: false };

                Lampa.Player.play({ url: url, title: item.Name, timeline: timeline, jellyfin_item: item, jellyfin_media_source_id: msid, jellyfin_audio_index: audioIndex });
                Lampa.Player.playlist([{ url: url, title: item.Name }]);

                var seriesId = '';
                var seasonNumber = '';
                var episodeNumber = '';
                try { seriesId = String(item.SeriesId || item.seriesId || ''); } catch (e2) { seriesId = ''; }
                try { seasonNumber = item.ParentIndexNumber ? String(item.ParentIndexNumber) : ''; } catch (e3) { seasonNumber = ''; }
                try { episodeNumber = item.IndexNumber ? String(item.IndexNumber) : ''; } catch (e4) { episodeNumber = ''; }

                this.startPlaybackSync({
                    itemId: String(item.Id),
                    mediaSourceId: msid || String(item.Id),
                    audioIndex: audioIndex,
                    positionSec: ss || 0,
                    durationSec: this.getDurationSecondsFromItem(item) || 0,
                    title: String(item.Name || ''),
                    seriesId: seriesId || '',
                    seasonNumber: seasonNumber || '',
                    episodeNumber: episodeNumber || '',
                    seriesName: ''
                });
            }.bind(this));
        },

        openPlayMenu: function (item, onBack, opts) {
            var ctx = opts && typeof opts === 'object' ? opts : {};
            this.ensureItemDetails(item, function (full) {
                if (!full || !full.Id) {
                    if (onBack) onBack();
                    return;
                }

                this.authenticate(function () {
                    var back = typeof onBack === 'function' ? onBack : function () {
                        var enabled = null;
                        try { enabled = Lampa.Controller.enabled(); } catch (e0) { enabled = null; }
                        Lampa.Controller.toggle(enabled && enabled.name ? enabled.name : 'full_start');
                    };

                    var playFlow = function (playItem, resumeSeconds, backHandler, flowOpts) {
                        var fo = flowOpts && typeof flowOpts === 'object' ? flowOpts : {};
                        var sources = [];
                        try { sources = (playItem && playItem.MediaSources) ? playItem.MediaSources : []; } catch (e0) { sources = []; }
                        var localState = null;
                        try { localState = this.getLocalItemState(playItem && playItem.Id ? playItem.Id : ''); } catch (e00) { localState = null; }

                        var showAudioForSource = function (ms, backH) {
                            this.playWithOptions(playItem, ms, null, resumeSeconds || 0);
                        }.bind(this);

                        if (sources && sources.length > 1) {
                            var prefMsId = '';
                            try { prefMsId = localState && localState.mediaSourceId ? String(localState.mediaSourceId) : ''; } catch (e03) { prefMsId = ''; }
                            if (!fo.forceSelect && prefMsId) {
                                for (var i0 = 0; i0 < sources.length; i0++) {
                                    if (sources[i0] && sources[i0].Id && String(sources[i0].Id) === prefMsId) {
                                        showAudioForSource(sources[i0], backHandler || back);
                                        return;
                                    }
                                }
                            }

                            var showMedia = function () {
                                this.selectMediaSource(playItem, function (ms) {
                                    showAudioForSource(ms, showMedia);
                                }.bind(this), backHandler || back);
                            }.bind(this);
                            showMedia();
                        } else {
                            var msOne = sources && sources.length ? sources[0] : null;
                            showAudioForSource(msOne, backHandler || back);
                        }
                    }.bind(this);

                    var typeLower = String(full.Type || '').toLowerCase();
                    if (typeLower === 'episode') {
                        var resumeSecEp = this.getResumeSecondsFromItem(full);
                        var durSecEp = this.getDurationSecondsFromItem(full);
                        var startAt = this.shouldOfferContinue(resumeSecEp, durSecEp) ? resumeSecEp : 0;
                        playFlow(full, startAt, back, { forceSelect: true });
                        return;
                    }

                    if (typeLower === 'series') {
                        var seriesId = String(full.Id);
                        var localSeries = this.getSeriesLastState(seriesId);

                        var proceedSeasons = function () {
                            this.getSeasons(full.Id, function (res) {
                                var seasons = (res && res.Items) ? res.Items : [];
                                var backToPrev = function () { back(); };

                                var seasonsConfig = {
                                    title: full.Name || 'Jellyfin',
                                    items: seasons.map(function (s) { return { title: s.Name || ('Сезон ' + (s.IndexNumber || '')), season: s }; }),
                                    onBack: backToPrev,
                                    onSelect: function (b) {
                                        if (!b || !b.season) return;
                                        this.getEpisodes(full.Id, b.season.Id, function (res2) {
                                            var episodes = (res2 && res2.Items) ? res2.Items : [];
                                            var backToSeasons = function () { Lampa.Select.show(seasonsConfig); };

                                            var lastEpisodeId = '';
                                            try { lastEpisodeId = localSeries && localSeries.itemId ? String(localSeries.itemId) : ''; } catch (e0) { lastEpisodeId = ''; }

                                            Lampa.Select.show({
                                                title: b.season.Name || 'Сезон',
                                                items: episodes.map(function (e) {
                                                    var isLast = false;
                                                    try { isLast = lastEpisodeId && e && e.Id && String(e.Id) === lastEpisodeId; } catch (e1) { isLast = false; }
                                                    var t = (e.IndexNumber ? e.IndexNumber + '. ' : '') + (e.Name || '');
                                                    if (isLast) t = t + ' <span class="jellyfin-badge jellyfin-badge--last">Последняя</span>';
                                                    var sub = Jellyfin.getQuality(e);
                                                    return { title: t, subtitle: sub, episode: e };
                                                }),
                                                onBack: backToSeasons,
                                                onSelect: function (c) { if (c && c.episode) this.openPlayMenu(c.episode, backToSeasons, { skipContinuePopup: true }); }.bind(this)
                                            });
                                        }.bind(this));
                                    }.bind(this)
                                };

                                if (!seasons.length) {
                                    back();
                                    return;
                                }

                                Lampa.Select.show(seasonsConfig);
                            }.bind(this));
                        }.bind(this);

                        this.getSeriesResume(seriesId, function (resumeEpisode) {
                            var resumeSec = this.getResumeSecondsFromItem(resumeEpisode);
                            var durSec = this.getDurationSecondsFromItem(resumeEpisode);
                            var percent = durSec ? ((resumeSec / durSec) * 100) : 0;
                            var sNo = '';
                            var eNo = '';
                            try { sNo = resumeEpisode.ParentIndexNumber ? String(resumeEpisode.ParentIndexNumber) : ''; } catch (e0) { sNo = ''; }
                            try { eNo = resumeEpisode.IndexNumber ? String(resumeEpisode.IndexNumber) : ''; } catch (e1) { eNo = ''; }
                            var info = [];
                            if (sNo) info.push('Сезон ' + sNo);
                            if (eNo) info.push('Серия ' + eNo);
                            if (resumeSec) info.push(this.formatSecondsShort(resumeSec));
                            var fallbackImg = this.buildImageUrl(resumeEpisode.Id, 'primary') || this.buildImageUrl(seriesId, 'backdrop') || this.buildImageUrl(seriesId, 'primary');
                            var tmdbSeriesId = this.getTmdbIdFromItem(full);

                            var openSeriesContinue = function (imgUrl) {
                                var img = imgUrl || fallbackImg;
                                if (!ctx.skipContinuePopup && this.shouldOfferContinue(resumeSec, durSec)) {
                                    this.openContinuePopup({
                                        title: 'Продолжить просмотр?',
                                        name: String(full.Name || 'Jellyfin'),
                                        info: info.join(' • '),
                                        image: img,
                                        percent: percent,
                                        onContinue: function () {
                                            this.getItemDetails(resumeEpisode.Id, function (epFull) {
                                                playFlow(epFull || resumeEpisode, resumeSec, back, { forceSelect: false });
                                            }.bind(this));
                                        }.bind(this),
                                        onChoose: function () { proceedSeasons(); }
                                    });
                                    return;
                                }
                                proceedSeasons();
                            }.bind(this);

                            if (tmdbSeriesId && sNo && eNo) {
                                this.getEpisodeStillFromTmdb(tmdbSeriesId, sNo, eNo, function (stillUrl) {
                                    openSeriesContinue(stillUrl || '');
                                });
                            } else {
                                openSeriesContinue('');
                            }
                        }.bind(this), function () {
                            if (localSeries && localSeries.itemId) {
                                this.getItemDetails(localSeries.itemId, function (epFull) {
                                    if (!epFull || !epFull.Id) return proceedSeasons();
                                    var resumeSec = this.getResumeSecondsFromItem(epFull);
                                    var durSec = this.getDurationSecondsFromItem(epFull);
                                    var percent = durSec ? ((resumeSec / durSec) * 100) : 0;
                                    var info = [];
                                    if (localSeries.seasonNumber) info.push('Сезон ' + localSeries.seasonNumber);
                                    if (localSeries.episodeNumber) info.push('Серия ' + localSeries.episodeNumber);
                                    if (resumeSec) info.push(this.formatSecondsShort(resumeSec));
                                    var img = this.buildImageUrl(epFull.Id, 'primary') || this.buildImageUrl(seriesId, 'backdrop') || this.buildImageUrl(seriesId, 'primary');

                                    if (!ctx.skipContinuePopup && this.shouldOfferContinue(resumeSec, durSec)) {
                                        this.openContinuePopup({
                                            title: 'Продолжить просмотр?',
                                            name: String(full.Name || 'Jellyfin'),
                                            info: info.join(' • '),
                                            image: img,
                                            percent: percent,
                                            onContinue: function () { playFlow(epFull, resumeSec, back, { forceSelect: false }); }.bind(this),
                                            onChoose: function () { proceedSeasons(); }
                                        });
                                        return;
                                    }
                                    proceedSeasons();
                                }.bind(this));
                                return;
                            }
                            proceedSeasons();
                        }.bind(this));

                        return;
                    }

                    var resumeSecItem = this.getResumeSecondsFromItem(full);
                    var durSecItem = this.getDurationSecondsFromItem(full);
                    var percentItem = durSecItem ? ((resumeSecItem / durSecItem) * 100) : 0;
                    var imgItem = this.buildImageUrl(full.Id, 'backdrop') || this.buildImageUrl(full.Id, 'primary');

                    if (!ctx.skipContinuePopup && this.shouldOfferContinue(resumeSecItem, durSecItem)) {
                        this.openContinuePopup({
                            title: 'Продолжить просмотр?',
                            name: String(full.Name || 'Jellyfin'),
                            info: (resumeSecItem ? this.formatSecondsShort(resumeSecItem) : ''),
                            image: imgItem,
                            percent: percentItem,
                            onContinue: function () { playFlow(full, resumeSecItem, back, { forceSelect: false }); }.bind(this),
                            onChoose: function () { playFlow(full, 0, back, { forceSelect: true }); }.bind(this)
                        });
                        return;
                    }

                    playFlow(full, 0, back, { forceSelect: true });
                }.bind(this));
            }.bind(this));
        }
    };

    function showSelection(items, onBack) {
        var list = items.map(function (item) {
            return { 
                title: item.Name + (item.ProductionYear ? ' (' + item.ProductionYear + ')' : ''), 
                subtitle: Jellyfin.getQuality(item, item && item.MediaSources && item.MediaSources[0] ? item.MediaSources[0] : null), 
                item: item 
            };
        });

        if (list.length === 0) {
            list.push({ title: 'Ничего не найдено', subtitle: 'Попробуйте другой поиск или проверьте сервер' });
        }

        Lampa.Select.show({
            title: 'Jellyfin',
            items: list,
            onBack: onBack,
            onSelect: function (a) {
                if (!a.item) {
                    if (onBack) onBack();
                    return;
                }
                if (a.item.Type === 'Series') Jellyfin.openPlayMenu(a.item, function () { showSelection(items, onBack); });
                else Jellyfin.openPlayMenu(a.item, function () { showSelection(items, onBack); });
            }
        });
    }

    function addJellyfinButton(movie) {
        var buttons = $('.full-start-new__buttons, .full-start__buttons');
        if (buttons.length && !buttons.find('.button--jellyfin').length) {
            var btn = $('<div class="full-start__button selector button--jellyfin">' + JELLYFIN_ICON + '<span class="button--jellyfin__text">Jellyfin</span></div>');
            btn.on('hover:enter click', function () {
                var enabled = null;
                try { enabled = Lampa.Controller.enabled(); } catch (e0) { enabled = null; }
                var restore = function () {
                    Lampa.Controller.toggle(enabled && enabled.name ? enabled.name : 'full_start');
                    setTimeout(function () {
                        try {
                            if (btn && btn.length) Lampa.Controller.collectionFocus(btn[0], btn.parent());
                        } catch (e1) {}
                    }, 10);
                };

                var cardType = movie && (movie.name || movie.original_name) ? 'tv' : 'movie';
                var jfId = '';
                try { jfId = movie && movie.jellyfin_item_id ? String(movie.jellyfin_item_id) : ''; } catch (e2) { jfId = ''; }
                if (!jfId) {
                    try { jfId = Jellyfin.findJellyfinIdByTmdb(cardType, movie && movie.id ? movie.id : ''); } catch (e3) { jfId = ''; }
                }

                if (jfId) {
                    Jellyfin.authenticate(function () {
                        Jellyfin.getItemDetails(jfId, function (full) {
                            Jellyfin.openPlayMenu(full || { Id: jfId, Name: movie.title || movie.name || 'Jellyfin' }, restore);
                        });
                    });
                    return;
                }

                var title = movie.title || movie.name;
                var year = (movie.release_date || movie.first_air_date || '').split('-')[0];
                Lampa.Noty.show('Jellyfin: Поиск...');
                Jellyfin.search(title, year, function (items) {
                    showSelection(items, restore);
                });
            });
            var children = buttons.children();
            if (children && children.length >= 1) {
                btn.insertAfter(children.eq(0));
            } else {
                buttons.append(btn);
            }
            if (Lampa.Controller.enabled().name === 'full_start') Lampa.Controller.toggle('full_start');
        }
    }

    if (!document.getElementById('jellyfin-button-styles')) {
        $('body').append('<style id="jellyfin-button-styles">.button--jellyfin{overflow:hidden !important;}.button--jellyfin svg{width:30px !important;height:30px !important;flex:0 0 30px !important;display:block !important;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6)) !important;}.button--jellyfin .button--jellyfin__text{display:block !important;opacity:0 !important;max-width:0 !important;overflow:hidden !important;white-space:nowrap !important;margin-left:0 !important;transition:opacity .15s ease,max-width .2s ease,margin-left .2s ease !important;}.button--jellyfin.focus .button--jellyfin__text,.button--jellyfin:hover .button--jellyfin__text{opacity:1 !important;max-width:160px !important;margin-left:.6em !important;}.jellyfin-qc{padding:1.2em !important;}.jellyfin-qc__title{font-size:1.2em !important;font-weight:700 !important;margin-bottom:.8em !important;}.jellyfin-qc__text{opacity:.85 !important;line-height:1.35 !important;margin-bottom:1em !important;}.jellyfin-qc__code{font-size:2.4em !important;font-weight:900 !important;letter-spacing:.18em !important;padding:.45em .4em !important;border-radius:.6em !important;background:rgba(255,255,255,.08) !important;border:1px solid rgba(255,255,255,.18) !important;text-align:center !important;}.jellyfin-qc__url{margin-top:1em !important;opacity:.7 !important;word-break:break-all !important;font-size:.9em !important;}.jellyfin-qc__status{margin-top:1em !important;font-weight:600 !important;opacity:.9 !important;}.jellyfin-continue-popup{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);}.jellyfin-continue__card{background:#1a1a1a;border-radius:1em;width:44em;max-width:94vw;overflow:hidden;box-shadow:0 1em 4em rgba(0,0,0,0.8);border:1px solid rgba(255,255,255,0.06);}.jellyfin-continue__img{position:relative;width:100%;padding-top:56.25%;background:#000;overflow:hidden;}.jellyfin-continue__img img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0.75;}.jellyfin-continue__details{position:absolute;bottom:0;left:0;right:0;padding:1.3em;background:linear-gradient(transparent,rgba(0,0,0,0.95));}.jellyfin-continue__title{font-size:1.7em;font-weight:700;margin-bottom:0.25em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;}.jellyfin-continue__info{font-size:1.05em;opacity:0.65;color:#fff;}.jellyfin-continue__body{padding:0 1.3em 0.4em;margin-top:-0.4em;}.jellyfin-continue__question{font-size:1.15em;font-weight:600;margin:1em 0 0.8em;}.jellyfin-continue__footer{display:flex;flex-direction:row;gap:1em;padding:1.2em;}.jellyfin-continue__btn{position:relative;padding:1em 1.2em;border-radius:0.6em;cursor:pointer;font-size:1.15em;font-weight:600;background:rgba(255,255,255,0.08);color:#fff;transition:all 0.2s ease;text-align:center;flex:1;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.06);}.jellyfin-continue__btn.focus{background:#fff;color:#000;transform:translateY(-0.2em);box-shadow:0 0.5em 1.5em rgba(255,255,255,0.2);}.jellyfin-continue__bar{height:0.42em;background:rgba(255,255,255,0.12);border-radius:0.3em;overflow:hidden;}.jellyfin-continue__barfill{height:100%;background:#9B59B6;width:0%;}.jellyfin-badge{display:inline-block;margin-left:0.55em;padding:0.18em 0.55em;border-radius:0.55em;font-size:0.78em;line-height:1.2;font-weight:700;vertical-align:middle;white-space:nowrap;background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.12);color:#fff;}.jellyfin-badge--last{background:rgba(155,89,182,0.25);border-color:rgba(155,89,182,0.45);}</style>');
    }

    function init() {
        if (!window.Lampa) return setTimeout(init, 500);
        Lampa.SettingsApi.addComponent({ component: 'jellyfin_settings', name: 'Jellyfin', icon: JELLYFIN_ICON });
        Lampa.SettingsApi.addParam({ component: 'jellyfin_settings', param: { name: 'jellyfin_server', type: 'input', values: '', 'default': JELLYFIN_SERVER }, field: { name: 'Адрес сервера' } });
        Lampa.SettingsApi.addParam({
            component: 'jellyfin_settings',
            param: { name: 'jellyfin_auth_status', type: 'static' },
            field: { name: 'Статус авторизации', description: '' },
            onRender: function (item) {
                var server = '';
                var token = '';
                var uid = '';
                var type = '';

                try { server = String(sget('jellyfin_server', JELLYFIN_SERVER) || '').replace(/\/$/, ''); } catch (e0) { server = ''; }
                try { token = String(sget('jellyfin_token', '') || ''); } catch (e1) { token = ''; }
                try { uid = String(sget('jellyfin_user_id', '') || ''); } catch (e2) { uid = ''; }
                try { type = String(sget('jellyfin_auth_type', '') || ''); } catch (e3) { type = ''; }

                var value = item.find('.settings-param__value');
                if (value.length) value.text(token ? 'Авторизован' : 'Не авторизован');

                var descr = item.find('.settings-param__descr');
                if (!descr.length) descr = $('<div class="settings-param__descr"></div>').appendTo(item);

                if (token) {
                    var parts = [];
                    if (server) parts.push('Сервер: ' + server);
                    if (uid) parts.push('UserId: ' + uid);
                    if (type) parts.push('Способ: ' + type);
                    descr.text(parts.join(' • ') || 'Токен сохранён');
                } else {
                    descr.text('Нет сохранённого токена. Войдите по логину/паролю или через "Быстрое подключение".');
                }
            }
        });
        Lampa.SettingsApi.addParam({ component: 'jellyfin_settings', param: { name: 'jellyfin_user', type: 'input', values: '', 'default': JELLYFIN_USER }, field: { name: 'Логин', description: '' } });
        Lampa.SettingsApi.addParam({ component: 'jellyfin_settings', param: { name: 'jellyfin_pass', type: 'input', values: '', 'default': JELLYFIN_PASS }, field: { name: 'Пароль', description: '' } });
        Lampa.SettingsApi.addParam({ component: 'jellyfin_settings', param: { type: 'button', name: 'jellyfin_quick_connect' }, field: { name: 'Быстрое подключение', description: 'Войти по коду (Quick Connect) без логина/пароля' }, onChange: function () { Jellyfin.quickConnectUI(); } });
        Lampa.SettingsApi.addParam({ component: 'jellyfin_settings', param: { type: 'button', name: 'jellyfin_lines_config' }, field: { name: 'Ленты Jellyfin', description: 'Порядок и видимость лент в разделе Jellyfin' }, onChange: function () { Jellyfin.configureLinesUI(); } });
        Lampa.SettingsApi.addParam({ component: 'jellyfin_settings', param: { type: 'button', name: 'jellyfin_logout' }, field: { name: 'Выйти', description: 'Удалить сохранённый токен Jellyfin' }, onChange: function () { Jellyfin.clearAuth(); try { Lampa.Noty.show('Jellyfin: токен очищен'); } catch (e0) {} } });
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite' || e.type === 'build') {
                var movie = e.data.movie || e.object;
                if (movie) setTimeout(function() { addJellyfinButton(movie); }, 200);
            }
        });

        Jellyfin.patchApi();

        Lampa.Listener.follow('menu', function (e) {
            try {
                if (!e || e.type !== 'start' || !e.body) return;
                var list = $('.menu__list:eq(0)', e.body);
                if (!list.length) return;
                if (list.find('[data-action="jellyfin"]').length) return;

                var item = $('<li class="menu__item selector" data-action="jellyfin"><div class="menu__ico">' + JELLYFIN_ICON + '</div><div class="menu__text">Jellyfin</div></li>');
                item.on('hover:enter', function () {
                    Lampa.Activity.push({
                        component: 'category',
                        title: 'Jellyfin',
                        url: 'jellyfin://main',
                        page: 1,
                        source: 'tmdb'
                    });
                });
                list.append(item);
            } catch (e0) {}
        });
    }
    init();
})();
