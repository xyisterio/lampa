(function () { 
    'use strict'; 
 
    function startPlugin() { 
        if (window.lampac_ui_plugin_loaded_v100) return; 
        
        if (!window.Lampa || !Lampa.Component || !Lampa.Plugins || !Lampa.Storage) {
            setTimeout(startPlugin, 10);
            return;
        }
 
        window.lampac_ui_plugin_loaded_v100 = true; 
        console.log('[LampacUI] V100 - Multi-Lampac Aggregator (Dampac/Online/Lampac/Vokino)'); 

        // --- 1. CSS & TEMPLATES ---
        var css = [
            '#lampac-aggregator-popup { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 1000; display: flex; align-items: center; justify-content: center; }',
            '.lampac-aggregator-subpopup { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 1100; display: flex; align-items: center; justify-content: center; }',
            '.lampac-aggregator__box { width: 55em; max-width: 90%; max-height: 85vh; background: #1a1a1a; border-radius: 1em; overflow: hidden; display: flex; flex-direction: column; box-sizing: border-box; box-shadow: 0 1em 4em rgba(0,0,0,0.7); border: 1px solid #333; }',
            '.lampac-aggregator__box--sub { width: 35em; }',
            '.lampac-aggregator__head { padding: 1em 2em 0.5em; background: #222; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333; flex-shrink: 0; }',
            '.lampac-aggregator__title { font-size: 1.6em; font-weight: 500; color: #fff; }',
            '.lampac-aggregator__count { font-size: 1em; color: #aaa; }',
            '.lampac-aggregator__body { padding: 0 1.5em 1.5em; flex-grow: 1; overflow: hidden; box-sizing: border-box; position: relative; }',
            '.lampac-aggregator__grid { display: flex; flex-wrap: wrap; width: 100%; box-sizing: border-box; }',
            '.lampac-aggregator__item { width: 47%; margin: 0 1.5% 1.5%; background: #282828; padding: 1.2em; border-radius: 0.8em; display: flex; align-items: center; border: 3px solid transparent; box-sizing: border-box; transition: background 0.1s; cursor: pointer; position: relative; overflow: hidden; }',
            '.lampac-aggregator__item.focus { background: #333; border-color: #fff; }',
            '.lampac-aggregator__item.last-active { background: rgba(255, 255, 255, 0.05); }',
            '.lampac-aggregator__item-icon { width: 3.5em; height: 3.5em; margin-right: 1.2em; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }',
            '.lampac-aggregator__item-icon svg, .lampac-aggregator__item-icon img { width: 100%; height: 100%; object-fit: contain; }',
            '.lampac-aggregator__item-details { flex-grow: 1; overflow: hidden; }',
            '.lampac-aggregator__item-name { font-size: 1.3em; color: #fff; margin-bottom: 0.2em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
            '.lampac-aggregator__item-url { font-size: 0.9em; color: #777; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
            '.lampac-aggregator__item-status { position: absolute; top: 0.6em; right: 0.6em; background: #fff; color: #000; font-size: 0.7em; padding: 0.2em 0.5em; border-radius: 0.3em; text-transform: uppercase; font-weight: bold; pointer-events: none; }',
            '.lampac-aggregator__item--add { border: 3px dashed #444; background: transparent; opacity: 0.6; }',
            '.lampac-aggregator__item--add.focus { opacity: 1; border-style: solid; }',
            '.lampac-aggregator__footer { padding: 1.2em 2em; background: #1a1a1a; border-top: 1px solid #333; text-align: center; flex-shrink: 0; }',
            '.lampac-aggregator__hint { font-size: 0.9em; color: #888; }',
            '.lampac-aggregator__hint span { color: #fff; font-weight: bold; background: #444; padding: 0.1em 0.4em; border-radius: 0.2em; margin: 0 0.2em; }',
            '.lampac-aggregator__item.moving { border-style: dashed; border-color: #4caf50; }',
            '.lampac-aggregator__icon-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1em; width: 100%; }',
            '.lampac-aggregator__icon-item { background: #282828; padding: 1em; border-radius: 0.8em; border: 3px solid transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; }',
            '.lampac-aggregator__icon-item svg { width: 3em; height: 3em; }',
            '.lampac-aggregator__icon-item.focus { background: #333; border-color: #fff; }',
            '@media screen and (max-width: 480px) { .lampac-aggregator__item { width: 98%; margin: 0 1% 1%; } .lampac-aggregator__box { width: 95%; } .lampac-aggregator__icon-grid { grid-template-columns: repeat(3, 1fr); } }'
        ].join('');

        $('<style>' + css + '</style>').appendTo('head');
         
         var CORE_COMPONENTS = ['full', 'category', 'person', 'settings', 'player', 'torrent', 'search', 'subtitles', 'about', 'console', 'head', 'menu', 'plugins', 'feed', 'collections', 'items', 'mod_settings', 'settings_api', 'favorites', 'history', 'watch', 'subscribes', 'base', 'root', 'api', 'activity', 'controller', 'storage', 'utils', 'lang', 'template', 'listener', 'noty', 'select', 'input', 'modal', 'filter', 'api_client', 'reguest'];
        
        // --- SPEECH KILLER ---
        var speechStub = function() {
            this.start = function(){};
            this.stop = function(){};
            this.addEventListener = function(){};
            this.removeEventListener = function(){};
            this.dispatchEvent = function(){ return true; };
        };
        if (window.webkitSpeechRecognition) {
            window.webkitSpeechRecognition = speechStub;
        }
        if (window.SpeechRecognition) {
            window.SpeechRecognition = speechStub;
        }

        window._lampac_name_mapping = window._lampac_name_mapping || {};

        // --- DMCA UNBLOCKER V2 ---
        (function() {
            var origFilter = Array.prototype.filter;
            Array.prototype.filter = function(callback) {
                try {
                    var disableDmca = Lampa.Storage.get('lampac_ui_disable_dmca', '1') == '1';
                    if (disableDmca && typeof callback === 'function') {
                        var str = callback.toString();
                        // Проверяем на характерные признаки DMCA-фильтра из tmdb.js / cub.js
                        if (str.indexOf('Keys.filter') !== -1 || (str.indexOf('RegExp') !== -1 && (str.indexOf('word') !== -1 || str.indexOf('title') !== -1))) {
                            // Если это вызов из контекста Lampa Api (проверяем по наличию объектов с title/name)
                            if (this.length > 0 && this[0] && (this[0].title || this[0].name || this[0].original_title)) {
                                return this; // Пропускаем фильтрацию, возвращаем всё
                            }
                        }
                    }
                } catch(e) {}
                return origFilter.apply(this, arguments);
            };

            // Глобальное отключение через Utils и настройки
            var applyDmcaPatch = function() {
                try {
                    var disableDmca = Lampa.Storage.get('lampac_ui_disable_dmca', '1') == '1';
                    if (disableDmca) {
                        // 1. Отключаем через настройки ядра
                        if (window.lampa_settings) {
                            if (!window.lampa_settings.disable_features) window.lampa_settings.disable_features = {};
                            window.lampa_settings.disable_features.dmca = true;
                            window.lampa_settings.dcma = []; // Очищаем список заблокированных ID
                        }
                        
                        // 2. Патчим метод Utils.dcma (в Lampa часто опечатка dcma вместо dmca)
                        if (window.Lampa && Lampa.Utils && Lampa.Utils.dcma) {
                            Lampa.Utils.dcma = function() { return false; };
                        }
                    }
                } catch(e) {}
            };

            // Запускаем сразу и при открытии любой активности
            applyDmcaPatch();
            if (window.Lampa && Lampa.Listener) {
                Lampa.Listener.follow('activity', function(e) {
                    if (e.type === 'ready') applyDmcaPatch();
                });
            }
        })();

        // --- PREMIUM ACTIVATOR ---
        (function() {
            var applyPremiumPatch = function() {
                try {
                    var disableAdsPremium = Lampa.Storage.get('lampac_ui_disable_ads_premium', '1') == '1';
                    if (disableAdsPremium) {
                        // 1. Force developer settings to enable premium and hide ads
                        if (window.Lampa && Lampa.Storage) {
                            Lampa.Storage.set('developer_nopremium', 'false', true);
                            Lampa.Storage.set('developer_ads', 'false', true);
                            Lampa.Storage.set('developer_enabled', 'true', true);
                        }
                        
                        // 2. Patch Account.hasPremium
                        if (window.Lampa && Lampa.Account) {
                            try {
                                Object.defineProperty(Lampa.Account, 'hasPremium', {
                                    value: function() { return 365; },
                                    writable: true,
                                    configurable: true
                                });
                            } catch(e) {
                                Lampa.Account.hasPremium = function() { return 365; };
                            }
                        }

                        // 3. Patch settings directly
                        if (window.lampa_settings) {
                            if (!window.lampa_settings.developer) window.lampa_settings.developer = {};
                            window.lampa_settings.developer.nopremium = false;
                            window.lampa_settings.developer.ads = false;
                            window.lampa_settings.developer.enabled = true;
                        }
                        
                        // 4. Patch account_user in Storage to avoid 0 days logic
                        var origGet = Lampa.Storage.get;
                        if (origGet && !origGet._lampac_premium_patched) {
                            Lampa.Storage.get = function(key, def) {
                                var val = origGet.apply(Lampa.Storage, arguments);
                                
                                // Premium bypass
                                if (key === 'account_user') {
                                    var user = val;
                                    if (typeof user === 'string' && (user[0] === '{' || user[0] === '[')) {
                                        try { user = JSON.parse(user); } catch(e) {}
                                    }
                                    if (user && typeof user === 'object') {
                                        if (!user.id) user.id = 1;
                                        user.premium = '2099-01-01';
                                        return user;
                                    }
                                    return { id: 1, premium: '2099-01-01' };
                                }
                                if (key === 'developer_nopremium') return false;

                                 // Lampac Auth Spoofing (Global Storage intercept)
                                  try {
                                      var authSpoof = origGet.call(Lampa.Storage, 'lampac_ui_auth_spoof', '0') == '1';
                                      if (authSpoof) {
                                          if (key === 'account_email') return 'bylampa@gmail.com';
                                          if (key === 'lampac_unic_id') return '0000000000000000';
                                          if (key === 'lampac_nws_id') return '0000000000000000';
                                      }
                                  } catch(e) {}
 
                                  return val;
                              };
                              Lampa.Storage.get._lampac_premium_patched = true;
                        }

                        // 4.1 Patch Storage.field to catch getter calls
                        var origField = Lampa.Storage.field;
                        if (origField && !origField._lampac_auth_patched) {
                            Lampa.Storage.field = function(key) {
                                if (key === 'account_email') {
                                    return function() {
                                        try {
                                            var authSpoof = Lampa.Storage.get('lampac_ui_auth_spoof', '0') == '1';
                                            if (authSpoof) return 'bylampa@gmail.com';
                                        } catch(e) {}
                                        return origGet.call(Lampa.Storage, 'account_email', '');
                                    };
                                }
                                return origField.apply(Lampa.Storage, arguments);
                            };
                            Lampa.Storage.field._lampac_auth_patched = true;
                        }

                        // 5. Patch Account.Api.user to inject premium status into live updates
                        if (window.Lampa && Lampa.Account && Lampa.Account.Api && Lampa.Account.Api.user) {
                            var origUserApi = Lampa.Account.Api.user;
                            if (!origUserApi._lampac_patched) {
                                Lampa.Account.Api.user = function(success, error) {
                                    origUserApi.call(Lampa.Account.Api, function(data) {
                                        if (data) {
                                            data.premium = '2099-01-01';
                                            if (!data.id) data.id = 1;
                                            
                                            try {
                                                var authSpoof = Lampa.Storage.get('lampac_ui_auth_spoof', '0') == '1';
                                                if (authSpoof) data.email = 'bylampa@gmail.com';
                                            } catch(e) {}
                                        }
                                        if (success) success(data);
                                    }, error);
                                };
                                Lampa.Account.Api.user._lampac_patched = true;
                            }
                        }
                    }
                } catch(e) {}
            };

            // Запускаем сразу и при открытии любой активности
             applyPremiumPatch();
             if (window.Lampa && Lampa.Listener) {
                 Lampa.Listener.follow('activity', function(e) {
                     if (e.type === 'ready') applyPremiumPatch();
                 });
             }
         })();
 
        // --- ORIGIN SPOOFER (Bylampa Bypass) ---
        (function() {
            var spoofOrigin = function() {
                try {
                    if (window.Lampa && Lampa.Manifest) {
                        var mode = Lampa.Storage.get('lampac_ui_spoof_origin_mode', 'bylampa');
                        var target = mode;
                        
                        if (mode === 'custom') {
                            target = Lampa.Storage.get('lampac_ui_spoof_origin_custom', '');
                        }
                        
                        if (target && Lampa.Manifest.origin !== target) {
                            Object.defineProperty(Lampa.Manifest, 'origin', {
                                get: function() { return target; },
                                configurable: true
                            });
                            console.log('[LampacUI] Origin spoofed to:', target);
                        }
                    }
                } catch(e) {}
            };

            spoofOrigin();
            if (window.Lampa && Lampa.Listener) {
                Lampa.Listener.follow('activity', function(e) {
                    if (e.type === 'ready') spoofOrigin();
                });
            }
        })();

        // --- LAMPAC AUTH SPOOFER ---
        (function() {
            var applyLampacAuthPatch = function() {
                try {
                    var enabled = Lampa.Storage.get('lampac_ui_auth_spoof', '0') == '1';
                    if (!enabled) return;

                    var spoofUrl = function(url) {
                        if (typeof url !== 'string') return url;
                        if (url.indexOf(':11333') !== -1 || url.indexOf('83.143.112.137') !== -1 || url.indexOf('beta.l-vid.online') !== -1) {
                            // 1. Email spoofing
                            if (url.indexOf('account_email=') !== -1) {
                                url = url.replace(/account_email=[^&]*/, 'account_email=bylampa@gmail.com');
                            } else {
                                url += (url.indexOf('?') === -1 ? '?' : '&') + 'account_email=bylampa@gmail.com';
                            }

                            // 2. CUB ID spoofing (hash of email)
                            var spoofCubId = Lampa.Utils.hash('bylampa@gmail.com');
                            if (url.indexOf('cub_id=') !== -1) {
                                url = url.replace(/cub_id=[^&]*/, 'cub_id=' + spoofCubId);
                            } else {
                                url += (url.indexOf('?') === -1 ? '?' : '&') + 'cub_id=' + spoofCubId;
                            }
                            
                            // 3. Token spoofing
                            if (url.indexOf('token=') !== -1) {
                                url = url.replace(/token=[^&]*/, 'token=bylampa');
                            } else {
                                url += (url.indexOf('?') === -1 ? '?' : '&') + 'token=bylampa';
                            }
                            
                            // 4. UID spoofing
                            if (url.indexOf('uid=') !== -1) {
                                url = url.replace(/uid=[^&]*/, 'uid=0000000000000000');
                            } else {
                                url += (url.indexOf('?') === -1 ? '?' : '&') + 'uid=0000000000000000';
                            }

                            // 5. NWS ID spoofing
                            if (url.indexOf('nws_id=') !== -1) {
                                url = url.replace(/nws_id=[^&]*/, 'nws_id=0000000000000000');
                            }

                            console.log('[LampacUI] Aggressive URL spoofed:', url);
                        }
                        return url;
                    };

                    // Patch XMLHttpRequest for direct requests (betaonline.js uses it)
                    if (window.XMLHttpRequest && !window.XMLHttpRequest._lampac_patched) {
                        var origOpen = XMLHttpRequest.prototype.open;
                        XMLHttpRequest.prototype.open = function(method, url) {
                            this._url = url;
                            return origOpen.apply(this, arguments);
                        };

                        var origSend = XMLHttpRequest.prototype.send;
                        XMLHttpRequest.prototype.send = function() {
                            var self = this;
                            var spoofedUrl = spoofUrl(this._url);
                            
                            // If it's an auth status check for beta online, mock it
                            if (this._url && (this._url.indexOf('beta.l-vid.online/tg/auth/status') !== -1 || this._url.indexOf('beta.l-vid.online/tg/auth/promo') !== -1)) {
                                Object.defineProperty(this, 'status', { writable: true, value: 200 });
                                Object.defineProperty(this, 'responseText', { writable: true, value: JSON.stringify({ authorized: true, token: 'bylampa', ok: true, days: 999 }) });
                                Object.defineProperty(this, 'readyState', { writable: true, value: 4 });
                                
                                var trigger = function() {
                                    if (self.onload) self.onload();
                                    if (self.onreadystatechange) self.onreadystatechange();
                                    self.dispatchEvent(new Event('load'));
                                    self.dispatchEvent(new Event('readystatechange'));
                                };
                                setTimeout(trigger, 10);
                                return;
                            }
                            
                            this._url = spoofedUrl;
                            return origSend.apply(this, arguments);
                        };
                        window.XMLHttpRequest._lampac_patched = true;
                    }

                    // Patch Lampa.Reguest
                    var patchRequest = function(method) {
                        var orig = Lampa.Reguest.prototype[method];
                        if (orig && !orig._lampac_auth_patched) {
                            Lampa.Reguest.prototype[method] = function(url, success, error, data, params) {
                                arguments[0] = spoofUrl(url);
                                return orig.apply(this, arguments);
                            };
                            Lampa.Reguest.prototype[method]._lampac_auth_patched = true;
                        }
                    };

                    if (window.Lampa && Lampa.Reguest) {
                        patchRequest('native');
                        patchRequest('silent');
                    }

                    // Patch jQuery AJAX
                    if (window.jQuery && window.jQuery.ajax && !window.jQuery.ajax._lampac_patched) {
                        var origAjax = window.jQuery.ajax;
                        window.jQuery.ajax = function(options) {
                            if (typeof options === 'object' && options.url) {
                                options.url = spoofUrl(options.url);
                            } else if (typeof options === 'string') {
                                arguments[0] = spoofUrl(options);
                            }
                            return origAjax.apply(window.jQuery, arguments);
                        };
                        window.jQuery.ajax._lampac_patched = true;
                    }

                    // Patch Account
                    if (window.Lampa && Lampa.Account) {
                        var origUser = Lampa.Account.user;
                        if (origUser && !origUser._lampac_auth_patched) {
                            Lampa.Account.user = function() {
                                var user = origUser.apply(Lampa.Account, arguments);
                                if (user && typeof user === 'object') {
                                    user.email = 'bylampa@gmail.com';
                                }
                                return user;
                            };
                            Lampa.Account.user._lampac_auth_patched = true;
                        }
                    }

                } catch(e) {}
            };

            applyLampacAuthPatch();
            if (window.Lampa && Lampa.Listener) {
                Lampa.Listener.follow('activity', function(e) {
                    if (e.type === 'ready') applyLampacAuthPatch();
                });
            }
        })();

        var ICONS = { 
            'zap': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
            'play': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
            'play-circle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>', 
            'play-3d': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="#2886fb"/><path d="M8 5l11 7-11 7V5z" fill="rgba(255,255,255,0.2)"/><path d="M19 12L8 19V5l11 7z" fill="none" stroke="#1e60b3" stroke-width="1" stroke-linejoin="round"/></svg>',
            'play-glow': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><filter id="glow"><feGaussianBlur stdDeviation="1.5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M8 5v14l11-7z" fill="#00d2ff" filter="url(#glow)"/></svg>',
            'play-ring': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="4 4"/><path d="m10 8 5 4-5 4V8Z" fill="currentColor"/></svg>',
            'play-diamond': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fb8c00" stroke-width="2"><path d="M12 2L2 12l10 10 10-10L12 2z"/><path d="M10 8l5 4-5 4V8z" fill="#fb8c00"/></svg>',
            'play-shield': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M10 9l5 3-5 3V9z" fill="#4caf50"/></svg>',
            'play-badge': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FFD700" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/><path d="M11 10l3 2-3 2v-4z" fill="#FFD700"/></svg>',
            'play-hexagon': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#9c27b0" stroke-width="2"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z"/><path d="M10 8l6 4-6 4V8z" fill="#9c27b0"/></svg>',
            'play-square': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M10 8l6 4-6 4V8z" fill="#f44336"/></svg>',
            'play-octo': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#00bcd4" stroke-width="2"><path d="M8.5 2h7l5.5 5.5v7l-5.5 5.5h-7L3 14.5v-7L8.5 2z"/><path d="M10 8l6 4-6 4V8z" fill="#00bcd4"/></svg>',
            'play-modern': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 3v18l15-9L5 3z" fill="url(#grad1)"/><defs><linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#ff00cc;stop-opacity:1"/><stop offset="100%" style="stop-color:#3333ff;stop-opacity:1"/></linearGradient></defs></svg>',
            'play-retro': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffeb3b" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="7" cy="12" r="2"/><circle cx="17" cy="12" r="2"/><path d="M10 10l4 2-4 2v-4z" fill="#ffeb3b"/></svg>',
            'play-pulse': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#e91e63" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/><path d="M11 10l3 2-3 2v-4z" fill="#e91e63"/></svg>',
            'play-cloud': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2196f3" stroke-width="2"><path d="M17.5 19c3.037 0 5.5-2.463 5.5-5.5 0-2.793-2.083-5.1-4.81-5.44A7.002 7.002 0 0 0 5 10.5a7.004 7.004 0 0 0-4.945 4.88c-.036.2-.055.405-.055.62C0 17.537 2.463 20 5.5 20h12"/><path d="M10 11l4 3-4 3v-6z" fill="#2196f3"/></svg>',
            'play-target': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ff5722" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="#ff5722"/><path d="M10 10l4 2-4 2v-4z" fill="#fff" stroke="none"/></svg>',
            'play-neon': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#00ff00" stroke-width="2" style="filter: drop-shadow(0 0 3px #00ff00)"><path d="M5 3l15 9-15 9V3z"/></svg>',
            'play-pixel': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#607d8b"><path d="M3 3h2v18H3V3zm4 4h2v10H7V7zm4 4h2v2h-2v-2zm4-4h2v10h-2V7zm4-4h2v18h-2V3z"/></svg>',
            'play-star': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffc107" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/><path d="M11 10l3 2-3 2v-4z" fill="#ffc107"/></svg>',
            'film': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>', 
            'tv': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>', 
            'monitor': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
            'plus': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>',
            'arrow-up': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>',
            'arrow-down': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>',
            'chevrons-up': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 11l-5-5-5 5"/><path d="M17 18l-5-5-5 5"/></svg>',
            'chevrons-down': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 6l5 5 5-5"/><path d="M7 13l5 5 5-5"/></svg>'
        }; 

        var Custom = { 
            get: function(id, key, def) { var data = Lampa.Storage.get('lampac_ui_' + key, {}); return data[id] || def; }, 
            set: function(id, key, val) { var data = Lampa.Storage.get('lampac_ui_' + key, {}); if (val === null) delete data[id]; else data[id] = val; Lampa.Storage.set('lampac_ui_' + key, data); } 
        }; 

        window._lampac_name_mapping = window._lampac_name_mapping || {};

        // --- 0. UTILS ---
        var _find = function(arr, callback) {
            if (!arr || !arr.length) return null;
            for (var i = 0; i < arr.length; i++) {
                if (callback(arr[i], i, arr)) return arr[i];
            }
            return null;
        };

        // --- 0. CSS ---
        if (!document.getElementById('lampac-ui-styles-v100')) {
            var style = document.createElement('style'); 
            style.id = 'lampac-ui-styles-v100';
            style.textContent = [
                '.lampac-logo-container, .lampac-text-title { ',
                '     cursor: pointer !important; ',
                '     display: inline-flex !important; ',
                '     align-items: center !important;',
                '     justify-content: flex-start !important;',
                '     padding: 0 !important; ',
                '     border-radius: 0.4em !important; ',
                '     background: transparent !important; ',
                '     border: 1px solid transparent !important; ',
                '     box-sizing: border-box !important; ',
                '     filter: drop-shadow(0 0.5em 1em rgba(0,0,0,0.9)) !important;',
                '     transition: transform 0.2s ease !important;',
                '     text-shadow: 0 0.1em 0.3em rgba(0,0,0,0.9) !important;',
                '     margin-top: -0.9em !important;',
                '     margin-bottom: 0.2em !important;',
                '     margin-left: 0 !important;',
                '     width: 14em !important;',
                '     max-width: 100% !important;',
                '     height: 3.2em !important;',
                ' } ',
                '.lampac-text-title { white-space: nowrap !important; text-overflow: ellipsis !important; overflow: hidden !important; font-weight: 700 !important; }',
                ' .lampac-logo-container.focus, .lampac-text-title.focus { ',
                '     background: rgba(255,255,255,0.1) !important; ',
                '     border: 1px solid rgba(255,255,255,0.5) !important;',
                ' } ',
                ' .lampac-logo-container img { ',
                '     height: 100% !important;',
                '     width: 100% !important;',
                '     display: block !important; ',
                '     object-fit: contain !important;',
                '     max-width: 100% !important;',
                ' }',
                ' .lampac-filters-container { ',
                '     display: inline-flex !important; ',
                '     gap: 0.6em !important; ',
                '     width: auto !important; ',
                '     max-width: 100% !important;',
                '     box-sizing: border-box !important;',
                '     flex-wrap: nowrap !important; ',
                '     align-items: flex-start !important; ',
                '     margin-top: -0.3em !important; ',
                '     overflow: hidden !important;',
                ' } ',
                ' .lampac-filter-column { ',
                '     display: flex !important; ',
                '     flex-direction: column !important; ',
                '     min-width: 0 !important; ',
                '     flex-shrink: 0 !important;',
                '     position: relative !important;',
                '     padding-top: 1.3em !important;',
                ' } ',
                ' .lampac-season-column { min-width: 3.4em !important; } ',
                ' .lampac-season-column .lampac-filter-item { ',
                '     width: 3em !important;',
                '     min-width: 3em !important;',
                '     height: 3em !important;',
                '     min-height: 3em !important;',
                '     padding: 0 !important; ',
                '     text-align: center !important;',
                '     justify-content: center !important;',
                '     display: flex !important;',
                '     align-items: center !important;',
                ' }',
                ' .lampac-other-column { min-width: 14em !important; max-width: 22em !important; } ',
                ' .lampac-filter-group-title { ',
                '    font-size: 1em !important; ',
                '    font-weight: 600 !important; ',
                '    margin-bottom: 0 !important; ',
                '    opacity: 0.5 !important; ',
                '    white-space: nowrap !important; ',
                '    position: absolute !important;',
                '    top: 0 !important;',
                '    left: 0 !important;',
                '    right: 0 !important;',
                '    height: 1.1em !important;',
                '    line-height: 1.1em !important;',
                ' } ',
                ' .lampac-filter-group { ',
                '     display: flex !important; ',
                '     flex-direction: column !important; ',
                '     gap: 0.5em !important; ',
                '     max-height: calc(100vh - 12em) !important; ',
                '     overflow-y: auto !important; ',
                '     overflow-x: hidden !important;',
                '     overscroll-behavior: contain !important;',
                '     min-height: 0 !important;',
                '     padding: 0.3em !important; ',
                '     scrollbar-width: none !important;',
                ' } ',
                ' .lampac-filter-group::-webkit-scrollbar { display: none !important; }',
                ' @keyframes lampac-focus-shift {',
                '    from { transform: translate3d(0,-10%,0); }',
                '    to { transform: translate3d(0,0,0); }',
                ' }',
                ' .lampac-filter-item { ',
                '     cursor: pointer !important; ',
                '     border-radius: 0.4em !important; ',
                '     background: rgba(0,0,0,0.5) !important; ',
                '     padding: 0.6em 1em !important; ',
                '     text-align: center !important; ',
                '     border: 1px solid rgba(255,255,255,0.1) !important;',
                '     width: 100% !important;',
                '     box-sizing: border-box !important;',
                '     white-space: nowrap !important;',
                '     overflow: hidden !important;',
                '     text-overflow: ellipsis !important;',
                '     font-size: 1em !important; ',
                '     flex-shrink: 0 !important;',
                '     min-height: 3em !important;',
                '     display: flex !important;',
                '     align-items: center !important;',
                '     justify-content: center !important;',
                ' } ',
                ' .lampac-other-column .lampac-filter-item { justify-content: flex-start !important; text-align: left !important; } ',
                ' .lampac-filter-item.focus { ',
                '     background: #fff !important; ',
                '     color: #000 !important; ',
                '     text-shadow: none !important;',
                '     z-index: 10 !important;',
                '     animation: lampac-focus-shift 0.12s ease-out !important;',
                ' } ',
                ' .lampac-filter-item.selected { ',
                '     background: rgba(255,255,255,0.2) !important; ',
                '     border-color: rgba(255,255,255,0.3) !important;',
                '     font-weight: 600 !important; ',
                ' }',
                ' .button--lampac { display: flex !important; align-items: center !important; justify-content: center !important; width: 3.8em !important; min-width: 3.8em !important; padding: 0 !important; overflow: hidden !important; }',
                ' .button--lampac span { display: none !important; }',
                ' .button--lampac svg { width: 1.8em !important; height: 1.8em !important; margin: 0 !important; flex-shrink: 0 !important; }',
                ' ',
                ' /* Развернутое состояние при фокусе */',
                ' .button--lampac.focus { width: auto !important; padding: 0 1.2em !important; justify-content: flex-start !important; }',
                ' .button--lampac.focus span { display: block !important; margin-left: 0.6em !important; white-space: nowrap !important; }',
                ' ',
                ' /* Минимальное вмешательство: только скрываем постер когда активны наши фильтры */',
                ' body.lampac-ui-active .info__poster, ',
                ' body.lampac-ui-active .full-descr__poster, ',
                ' body.lampac-ui-active .full-start__poster { ',
                '    display: none !important; ',
                ' }',
                '',
                ' /* Фикс ширины бокового меню (только в горизонтальном режиме) */',
                ' @media screen and (orientation: landscape) {',
                '     body.lampac-ui-with-filters .full-descr__left, ',
                '     body.lampac-ui-with-filters .info__left { ',
                '        width: 32em !important; ',
                '        min-width: 32em !important; ',
                '        max-width: 32em !important; ',
                '     }',
                '     ',
                '     body.lampac-ui-with-filters .explorer-card__descr,',
                '     body.lampac-ui-with-filters .online__info-left,',
                '     body.lampac-ui-with-filters .info__left,',
                '     body.lampac-ui-with-filters .online__descr,',
                '     body.lampac-ui-with-filters .online-descr,',
                '     body.lampac-ui-with-filters .full-descr__left,',
                '     body.lampac-ui-with-filters .explorer__left {',
                '        overflow: hidden !important;',
                '        visibility: hidden !important;',
                '        pointer-events: none !important;',
                '     }',
                ' }',
                '',
                ' /* В портретном режиме мобилок скрываем сайдбар совсем */',
                ' @media screen and (orientation: portrait) {',
                '     body.true--mobile #lampac-ui-fixed-sidebar {',
                '        display: none !important;',
                '     }',
                ' }',
                ' ',
                ' #lampac-ui-fixed-sidebar {',
                '    position: fixed !important;',
                '    z-index: 10 !important;',
                '    pointer-events: none !important;',
                '    transform: translate3d(0,0,0) !important;',
                '    transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.2s ease !important;',
                '    display: none;',
                ' }',
                ' ',
                ' body.with--menu #lampac-ui-fixed-sidebar {',
                '    transform: translate3d(17.2rem, 0, 0) !important;',
                ' }',
                ' ',
                ' /* Скрываем наши элементы когда открыт поиск или настройки */',
                ' body.with--search #lampac-ui-fixed-sidebar, ',
                ' body.with--settings #lampac-ui-fixed-sidebar { ',
                '    display: none !important; ',
                '    opacity: 0 !important; ',
                '    visibility: hidden !important; ',
                ' }',
                ' ',
                ' .online__info-left, .info__left, .full-descr__left, .explorer__left, .explorer-card__descr, .online__descr, .online-descr {',
                '    position: relative !important;',
                ' }',
                ' ',
                ' #lampac-ui-fixed-sidebar .lampac-ui-fixed-inner {',
                '    height: 100% !important;',
                '    display: flex !important;',
                '    flex-direction: column !important;',
                '    padding: 0.6em 0.8em 0.6em 1.2em !important;',
                '    box-sizing: border-box !important;',
                '    background: transparent !important;',
                '    backdrop-filter: none !important;',
                '    pointer-events: auto !important;',
                ' }',
                ' ',
                ' #lampac-ui-fixed-sidebar .lampac-ui-fixed-logo {',
                '    flex: 0 0 auto !important;',
                ' }',
                '',
                ' #lampac-ui-fixed-sidebar .lampac-ui-fixed-meta {',
                '    flex: 0 0 auto !important;',
                '    margin: 0.2em 0 0.6em 0 !important;',
                '    color: rgba(255,255,255,0.65) !important;',
                '    font-size: 0.95em !important;',
                '    line-height: 1.2 !important;',
                '    text-shadow: 0 1px 3px rgba(0,0,0,0.8) !important;',
                '    max-width: 100% !important;',
                '    height: 1.2em !important;',
                '    overflow: hidden !important;',
                '    white-space: nowrap !important;',
                '    text-overflow: ellipsis !important;',
                ' }',
                ' ',
                ' #lampac-ui-fixed-sidebar .lampac-ui-fixed-filters {',
                '    flex: 1 1 auto !important;',
                '    min-height: 0 !important;',
                ' }',
                '',
                ' #lampac-ui-fixed-sidebar .lampac-logo-container,',
                ' #lampac-ui-fixed-sidebar .lampac-text-title {',
                '    margin-top: 0 !important;',
                '    margin-bottom: 0.3em !important;',
                '    height: 5.0em !important;',
                '    width: 20em !important;',
                ' }',
                '',
                ' #lampac-ui-fixed-sidebar .lampac-logo-container img {',
                '    height: 100% !important;',
                '    width: 100% !important;',
                '    object-fit: contain !important;',
                ' }',
                ' ',
                ' #lampac-ui-fixed-sidebar .lampac-filters-container {',
                '    margin-top: 0 !important;',
                ' }',
                ' ',
                ' #lampac-ui-fixed-sidebar .lampac-filters-container,',
                ' #lampac-ui-fixed-sidebar .lampac-filter-column,',
                ' #lampac-ui-fixed-sidebar .lampac-filter-group {',
                '    height: 100% !important;',
                '    max-height: none !important;',
                ' }',
                ' ',
                ' body.lampac-ui-with-filters .online__info-left,',
                ' body.lampac-ui-with-filters .info__left,',
                ' body.lampac-ui-with-filters .full-descr__left,',
                ' body.lampac-ui-with-filters .explorer__left {',
                '    padding-top: 5em !important;',
                '    box-sizing: border-box !important;',
                ' }',
                ' ',
                ' body.lampac-ui-with-filters .info__title,',
                ' body.lampac-ui-with-filters .online__title,',
                ' body.lampac-ui-with-filters .explorer-card__title {',
                '    display: none !important;',
                ' }',
                '',
                ' body.lampac-ui-with-filters .explorer-card__descr .lampac-filters-container,',
                ' body.lampac-ui-with-filters .online__info-left .lampac-filters-container,',
                ' body.lampac-ui-with-filters .info__left .lampac-filters-container,',
                ' body.lampac-ui-with-filters .online__descr .lampac-filters-container,',
                ' body.lampac-ui-with-filters .online-descr .lampac-filters-container {',
                '    display: none !important;',
                ' }',
                '',
                ' /* Скрываем дефолтное описание ТОЛЬКО внутри плагинов (когда мы НЕ на странице фильма activity--full) */',
                ' body.lampac-ui-with-filters:not(.activity--full) .info__descr, ',
                ' body.lampac-ui-with-filters:not(.activity--full) .full-descr__text, ',
                ' body.lampac-ui-with-filters:not(.activity--full) .online__descr,',
                ' body.lampac-ui-with-filters:not(.activity--full) .online-descr,',
                ' body.lampac-ui-with-filters:not(.activity--full) .explorer-card__descr {',
                '    font-size: 0 !important;',
                '    color: transparent !important;',
                ' }',
                ' ',
                ' /* Но наши фильтры должны быть видны всегда, если они созданы */',
                ' body.lampac-ui-with-filters .lampac-filters-container {',
                '    color: #fff !important;',
                '    display: flex !important;',
                ' }',
                ' ',
                ' /* Скрываем все дочерние элементы описания, кроме наших фильтров, ТОЛЬКО в плагинах */',
                ' body.lampac-ui-with-filters:not(.activity--full) .info__descr > *:not(.lampac-filters-container), ',
                ' body.lampac-ui-with-filters:not(.activity--full) .full-descr__text > *:not(.lampac-filters-container), ',
                ' body.lampac-ui-with-filters:not(.activity--full) .online__descr > *:not(.lampac-filters-container),',
                ' body.lampac-ui-with-filters:not(.activity--full) .online-descr > *:not(.lampac-filters-container),',
                ' body.lampac-ui-with-filters:not(.activity--full) .explorer-card__descr > *:not(.lampac-filters-container) {',
                '    display: none !important;',
                ' }',
                ' ',
                ' .explorer-card__descr, .online__info-left, .info__left, .online__descr, .online-descr {',
                '    overflow: visible !important;',
                ' }',
                '',
                ' #lampac-side-backdrop { ',
                '     position: fixed !important; ',
                '     top: 0 !important; ',
                '     left: 0 !important; ',
                '     width: 50% !important; ',
                '     height: 100% !important; ',
                '     background-size: auto 100% !important; ',
                '     background-position: center center !important; ',
                '     background-repeat: no-repeat !important;',
                '     z-index: 2 !important; ',
                '     visibility: hidden !important; ',
                '     opacity: 0 !important; ',
                '     transform: translateX(-50px) !important;',
                '     transition: opacity 1.5s ease, transform 2s ease-out !important; ',
                '     pointer-events: none !important;',
                '     -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 100%) !important;',
                '     mask-image: linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 100%) !important;',
                ' }',
                ' #lampac-side-backdrop.visible { visibility: visible !important; opacity: 0.4 !important; transform: translateX(0) !important; }',
                ' ',
                ' /* === LAMPAC: плашки типа контента === */',
                ' .card__view { overflow: visible !important; }',
                ' .card__type {',
                '    position: absolute !important;',
                '    top: 1.4em !important;',
                '    left: -0.8em !important;',
                '    padding: 0.4em 0.7em !important;',
                '    border-radius: 0.3em !important;',
                '    font-size: 0.8em !important;',
                '    font-weight: 700 !important;',
                '    line-height: 1 !important;',
                '    color: #fff !important;',
                '    text-transform: uppercase !important;',
                '    font-family: Arial, sans-serif !important;',
                '    z-index: 10 !important;',
                '    pointer-events: none !important;',
                '    box-shadow: 0 0.2em 0.5em rgba(0,0,0,0.5) !important;',
                ' }',
                ' .card__type.lampac-movie   { background: #1e88e5 !important; }',
                ' .card__type.lampac-serial  { background: #e53935 !important; }',
                ' .card__type.lampac-cartoon { background: #fb8c00 !important; }',
                ' .card__type.lampac-anime   { background: #8e24aa !important; }',
                ' .card__quality { z-index: 11 !important; }',
                '',
                ' body.lampac_ui_no_badges .card__type { display: none !important; }',
                '',
                ' /* === LAMPAC: Индикация последнего источника === */',
                ' .lampac-source-indicator {',
                '    position: absolute; top: -0.2em; right: -0.2em;',
                '    width: 1.2em; height: 1.2em;',
                '    background: #27ae60; border-radius: 50%;',
                '    border: 2px solid #fff;',
                '    box-shadow: 0 0 0.5em rgba(0,0,0,0.5);',
                '    z-index: 10;',
                '    animation: lampac-pulse 2s infinite;',
                ' }',
                ' @keyframes lampac-pulse {',
                '    0% { transform: scale(1); box-shadow: 0 0 0 rgba(39, 174, 96, 0.7); }',
                '    70% { transform: scale(1.2); box-shadow: 0 0 10px rgba(39, 174, 96, 0); }',
                '    100% { transform: scale(1); box-shadow: 0 0 0 rgba(39, 174, 96, 0); }',
                ' }',
                ' .selectbox-item__icon { position: relative !important; overflow: visible !important; }',
                '',
                ' /* === LAMPAC: Попап продолжения просмотра === */',
                ' #lampac-continue-popup {',
                '    position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999;',
                '    display: flex; align-items: center; justify-content: center;',
                '    background: rgba(0,0,0,0.7); box-sizing: border-box;',
                '    animation: lampac-fade-in 0.25s ease-out;',
                ' }',
                ' @keyframes lampac-fade-in { from { opacity: 0; } to { opacity: 1; } }',
                ' ',
                ' .lampac-continue__card {',
                '    background: #1a1a1a; border-radius: 1em;',
                '    width: 44em; max-width: 94vw; overflow: hidden;',
                '    box-shadow: 0 1em 4em rgba(0,0,0,0.8);',
                '    border: 1px solid rgba(255,255,255,0.05);',
                '    transform: scale(1); transition: transform 0.2s ease-out;',
                ' }',
                ' .lampac-continue__img {',
                '    position: relative; width: 100%; padding-top: 56.25%;',
                '    background: #000; overflow: hidden;',
                ' }',
                ' .lampac-continue__img img {',
                '    position: absolute; top: 0; left: 0; width: 100%; height: 100%;',
                '    object-fit: cover; opacity: 0.7;',
                ' }',
                ' .lampac-continue__details {',
                '    position: absolute; bottom: 0; left: 0; right: 0;',
                '    padding: 1.5em;',
                '    background: linear-gradient(transparent, rgba(0,0,0,0.95));',
                ' }',
                ' .lampac-continue__title {',
                '    font-size: 1.8em; font-weight: 700; margin-bottom: 0.3em;',
                '    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
                '    color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.5);',
                ' }',
                ' .lampac-continue__info {',
                '    font-size: 1.1em; opacity: 0.6; color: #fff;',
                ' }',
                ' .lampac-continue__body { padding: 0 1.5em; margin-top: -0.5em; }',
                ' .lampac-continue__footer {',
                '    display: flex; flex-direction: row; gap: 1em; padding: 1.5em;',
                ' }',
                ' .lampac-continue__btn {',
                '    position: relative; padding: 1em 1.5em; border-radius: 0.6em;',
                '    cursor: pointer; font-size: 1.2em; font-weight: 600;',
                '    background: rgba(255,255,255,0.08); color: #fff;',
                '    transition: all 0.2s ease; text-align: center;',
                '    flex: 1; display: flex; align-items: center; justify-content: center;',
                '    border: 1px solid rgba(255,255,255,0.05);',
                ' }',
                ' .lampac-continue__btn.focus {',
                '    background: #fff; color: #000;',
                '    transform: translateY(-0.2em);',
                '    box-shadow: 0 0.5em 1.5em rgba(255,255,255,0.2);',
                ' }',
                ' .lampac-continue__btn.clicking {',
                '    transform: scale(0.96); transition: all 0.1s ease;',
                ' }',
                ' .lampac-continue__timeline { margin-bottom: 1em; }',
                ' .lampac-continue__timeline .timeline { height: 0.4em !important; background: rgba(255,255,255,0.1) !important; }',
                ' .lampac-continue__timeline .timeline__line { background: #fff !important; }',
                '',
                ' /* Скрытие микрофона и его контейнера */',
                ' .input__speech, .input__voice, .speech, .voice-input { display: none !important; }'
            ].join('\n');
            document.head.appendChild(style);
        }

        // --- 0. UTILS ---
        var Backdrop = {
            ensure: function() {
                var sideBg = document.getElementById('lampac-side-backdrop');
                if (!sideBg) {
                    sideBg = document.createElement('div');
                    sideBg.id = 'lampac-side-backdrop';
                    document.body.insertBefore(sideBg, document.body.firstChild);
                }
                return sideBg;
            },
            show: function(bgUrl) {
                if (!bgUrl) return;
                try { window._lampacSideBackdropUrl = bgUrl; } catch (e) {}
                var sideBg = this.ensure();
                try {
                    if (sideBg._lampac_pending && sideBg.getAttribute('data-lampac-bg') === bgUrl) return;
                    if (sideBg.getAttribute('data-lampac-bg') === bgUrl && sideBg.style.display !== 'none' && sideBg.classList.contains('visible')) return;
                } catch (e) {}
                try { sideBg._lampac_pending = true; } catch (e) {}
                sideBg.style.backgroundImage = 'url(' + bgUrl + ')';
                try { sideBg.setAttribute('data-lampac-bg', bgUrl); } catch (e) {}
                sideBg.style.display = 'block';
                sideBg.style.visibility = 'visible';
                sideBg.classList.remove('visible');
                try { void sideBg.offsetHeight; } catch (e) {}
                setTimeout(function() {
                    try {
                        sideBg.classList.add('visible');
                    } catch (e) {}
                    setTimeout(function() {
                        try { sideBg._lampac_pending = false; } catch (e) {}
                    }, 100);
                }, 30);
            },
            fromMovie: function(movie) {
                try {
                    if (!movie) return;
                    if (Lampa.Storage.get('lampac_ui_side_backdrop', '1') !== '1') return;
                    if (movie.backdrop_path) this.show(Lampa.TMDB.image('t/p/w1280' + movie.backdrop_path));
                } catch (e) {}
            },
            hide: function(immediate) {
                var sideBg = document.getElementById('lampac-side-backdrop');
                if (sideBg) {
                    sideBg.classList.remove('visible');
                    if (immediate) {
                        sideBg.style.visibility = 'hidden';
                        return;
                    }
                    setTimeout(function() {
                        if (!sideBg.classList.contains('visible')) {
                            sideBg.style.visibility = 'hidden';
                        }
                    }, 1500);
                }
            }
        };

        var _lampacCleanupSidebar = function() {
            try { document.body.classList.remove('lampac-ui-with-filters'); } catch (e) {}
            try { document.body.classList.remove('lampac-ui-active'); } catch (e) {}
            try {
                var fixedSidebar = document.getElementById('lampac-ui-fixed-sidebar');
                if (fixedSidebar) {
                    fixedSidebar.style.display = 'none';
                    fixedSidebar.remove();
                }
                var sideBg = document.getElementById('lampac-side-backdrop');
                if (sideBg) {
                    sideBg.classList.remove('visible');
                    sideBg.remove();
                }
            } catch (e) {}
            try { window._lampacCurrentLogo = null; } catch (e) {}
            try { window._lampacCurrentLogoEl = null; } catch (e) {}
        };

        var _lampacBindLeftToSidebar = function() {
            try {
                if (!document.body.classList.contains('lampac-ui-with-filters')) return;
                var sb = document.getElementById('lampac-ui-fixed-sidebar');
                if (!sb) return;

                var root = document.querySelector('.activity__body') || document.querySelector('.activity');
                if (!root) return;

                var nodes = root.querySelectorAll('.selector');
                for (var i = 0; i < nodes.length; i++) {
                    var el = nodes[i];
                    if (!el || sb.contains(el)) continue;
                    if (el.closest && el.closest('.head, .menu, .modal, .selectbox, .player, .settings')) continue;

                    $(el).off('hover:left.lampacui').on('hover:left.lampacui', function(e) {
                        try {
                            if (!document.body.classList.contains('lampac-ui-with-filters')) return;
                            var sb2 = document.getElementById('lampac-ui-fixed-sidebar');
                            if (!sb2) return;
                            if (sb2.contains(this)) return;

                            var toFocusEl = sb2.querySelector('.lampac-filter-item.selected') || sb2.querySelector('.lampac-filter-item') || sb2.querySelector('.lampac-ui-fixed-logo');
                            if (!toFocusEl) return;

                            if (e && e.preventDefault) e.preventDefault();
                            if (e && e.stopPropagation) e.stopPropagation();
                            Lampa.Controller.focus($(toFocusEl));
                        } catch (ex) {}
                    });
                }
            } catch (e) {}
        };

        if (!window._lampacUiKeyNav) window._lampacUiKeyNav = true;

        // Слушаем открытие/закрытие меню Лампы
        if (!window._lampacMenuObserver) {
            window._lampacMenuObserver = true;
            (function() {
                var lastMenuState = null;
                var checkMenu = function() {
                    try {
                        var menu = document.querySelector('.menu');
                        var isOpen = menu && menu.offsetParent !== null;
                        if (isOpen !== lastMenuState) {
                            lastMenuState = isOpen;
                            var sb = document.getElementById('lampac-ui-fixed-sidebar');
                            if (sb) {
                                sb.style.display = '';
                            }
                        }
                    } catch(e) {}
                };
                setInterval(checkMenu, 100);
            })();
        }

        if (!window._lampacUiMenuGatePatch) {
            window._lampacUiMenuGatePatch = true;
            window._lampacUiLastLeftAt = 0;
            window._lampacSidebarElements = []; // Global store for sidebar selectors
            
            try {
                document.addEventListener('keydown', function(e) {
                    try {
                        var k = e && (e.keyCode || e.which);
                        if (k === 37 || k === 4) window._lampacUiLastLeftAt = Date.now();
                    } catch (ex) {}
                }, true);
            } catch (e) {}

            try {
                if (window.Lampa && Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
                    Lampa.Listener.follow('left', function(ev) {
                        try { window._lampacUiLastLeftAt = Date.now(); } catch (ex) {}
                    });
                }
            } catch (e) {}

            try {
                if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.toggle === 'function') {
                    var _lampacOrigToggle = Lampa.Controller.toggle;
                    Lampa.Controller.toggle = function(name) {
                        var res;
                        try {
                            res = _lampacOrigToggle.apply(this, arguments);
                        } catch (toggleError) {
                            return;
                        }
                        try {
                            if (name === 'menu') {
                                if (document.body.classList.contains('lampac-ui-with-filters')) {
                                    var cn = '';
                                    try { cn = (Lampa.Controller.enabled && Lampa.Controller.enabled().name) ? String(Lampa.Controller.enabled().name) : ''; } catch (ex) {}
                                    if (cn !== 'menu') {
                                        var recentLeft = (Date.now() - (window._lampacUiLastLeftAt || 0)) < 300;
                                        if (recentLeft) {
                                            var sb = document.getElementById('lampac-ui-fixed-sidebar');
                                            if (sb) {
                                                var focused = document.querySelector('.selector.focus');
                                                if (focused) {
                                                    if (sb.contains(focused)) return res;
                                                    if (focused.closest && focused.closest('.head, .menu, .modal, .selectbox, .player, .settings')) return res;
                                                }

                                                var toFocusEl = sb.querySelector('.lampac-filter-item.selected') || sb.querySelector('.lampac-filter-item') || sb.querySelector('.lampac-ui-fixed-logo');
                                                if (toFocusEl) {
                                                    Lampa.Controller.focus($(toFocusEl));
                                                    return;
                                                }
                                            }
                                        }
                                    }
                                }
                            } else if (name !== 'menu' && window._lampacSidebarElements && window._lampacSidebarElements.length > 0) {
                                // If we toggled to something else (e.g. back from menu), re-append our elements
                                if (document.body.classList.contains('lampac-ui-with-filters')) {
                                    setTimeout(function() {
                                        if (window._lampacSidebarElements && window._lampacSidebarElements.length > 0) {
                                            Lampa.Controller.collectionAppend(window._lampacSidebarElements);
                                        }
                                    }, 200);
                                }
                            }
                        } catch (ex2) {}
                        return res;
                    };
                }
            } catch (e) {}
        }

        var normalizeUrlForComponentId = function(url) {
            var u = (url + '').trim();
            if (!u) return '';
            try {
                var parsed = new URL(u, window.location && window.location.href ? window.location.href : undefined);
                parsed.hash = '';
                try { parsed.searchParams.delete('reset'); } catch (e) {}
                try { parsed.searchParams.delete('_'); } catch (e) {}
                return parsed.toString();
            } catch (e) {
                u = u.replace(/([?&])reset=[^&#]*(&)?/i, function(m, sep, amp) {
                    if (sep === '?' && amp) return '?';
                    if (sep === '&' && amp) return '&';
                    return '';
                });
                u = u.replace(/[?&]$/, '');
                u = u.replace(/\?&/g, '?');
                u = u.replace(/#.*$/, '');
                return u;
            }
        };

        var urlToComponentName = function(url, originalName) {
            if (!url) return originalName;
            var base = normalizeUrlForComponentId(url) || (url + '');
            var h = 0;
            for (var i = 0; i < base.length; i++) {
                h = (h << 5) - h + base.charCodeAt(i);
                h = h & h;
            }
            var id = 'plugin_' + Math.abs(h);
            if (originalName && originalName !== 'online' && originalName !== 'lampac' && originalName !== 'dampac' && originalName !== 'vokino') {
                return id + '_' + originalName;
            }
            return id;
        };

        // --- 1. HIJACKERS (GLOBAL FALLBACK) ---
        if (!Lampa.Component.add._lampac_patched) {
            var originalComponentAdd = Lampa.Component.add;
            window._lampac_registered_ids = {}; // Track successful registrations per URL

            Lampa.Component.add = function(name, comp) {
                var url = window._lampac_loading_url || window._currentLoadingPluginUrl;
                if (!url && document.currentScript) url = document.currentScript.getAttribute('data-lampac-url');
                
                var actualName = name;
                
                if (url) {
                    var id = urlToComponentName(url, name);
                    if (CORE_COMPONENTS.indexOf(name) === -1) {
                        window._lampac_name_mapping[name] = id;
                        actualName = id;
                        window._lampac_registered_ids[url] = id; // Store the last ID for this URL
                        console.log('[LampacUI] Omnivorous Hijack (Load):', name, '->', actualName, 'from', url);
                    }
                } else if (window._lampac_name_mapping[name]) {
                    actualName = window._lampac_name_mapping[name];
                    console.log('[LampacUI] Omnivorous Hijack (Map):', name, '->', actualName);
                }
                
                return originalComponentAdd.call(Lampa.Component, actualName, comp);
            };
            Lampa.Component.add._lampac_patched = true;
        }

        if (Lampa.Activity && !Lampa.Activity.push._lampac_patched) {
            var originalActivityPush = Lampa.Activity.push;
            Lampa.Activity.push = function(params) {
                Backdrop.hide();
                try {
                    var nextComp = params && params.component ? String(params.component) : '';
                    if (nextComp && nextComp.indexOf('plugin_') !== 0) _lampacCleanupSidebar();
                } catch (e) {}

                if (params && params.component) {
                    var target = params.component;
                    var active = Lampa.Activity.active && Lampa.Activity.active();
                    var activeComp = active && active.component;

                    // 1. If target is in our omnivorous mapping, redirect
                    if (window._lampac_name_mapping[target]) {
                        params.component = window._lampac_name_mapping[target];
                    } 
                }
                return originalActivityPush.call(this, params);
            };
            Lampa.Activity.push._lampac_patched = true;
        }

        // --- 6. КАЧЕСТВО НА КАРТОЧКАХ ---
        var QualityCache = {};

        var isQualitySourceUrl = function(url) {
            if (!url) return false;
            if (/\.(css|js|png|jpg|svg|woff|ico)(\?|$)/.test(url)) return false;
            return true;
        };

        var extractQualityItems = function(json) {
            if (!json) return [];
            if (Array.isArray(json)) return json;
            if (json.results && Array.isArray(json.results)) return json.results;
            if (json.id && json.release_quality) return [json];
            return [];
        };

        var addQualityBadgeToCard = function(cardEl, quality) {
            var view = cardEl.querySelector('.card__view');
            if (!view || view.querySelector('.card__quality')) return;
            var qEl = document.createElement('div');
            qEl.className = 'card__quality';
            qEl.innerHTML = '<div>' + quality + '</div>';
            view.appendChild(qEl);
        };

        var applyQualityToRenderedCards = function(id, quality) {
            var cards = document.querySelectorAll('.card');
            for (var i = 0; i < cards.length; i++) {
                var d = cards[i].card_data;
                if (d && d.id === id) addQualityBadgeToCard(cards[i], quality);
            }
        };

        var processQualityResponse = function(json) {
            if (Lampa.Storage.get('lampac_ui_global_quality', '1') === '0') return;
            var items = extractQualityItems(json);
            items.forEach(function(item) {
                if (item && item.id && item.release_quality) {
                    QualityCache[item.id] = item.release_quality;
                    item.quality = item.quality || item.release_quality;
                    applyQualityToRenderedCards(item.id, item.release_quality);
                }
            });
        };

        if (!window._lampac_xhr_quality_patched) {
            window._lampac_xhr_quality_patched = true;
            var _origXHROpen = XMLHttpRequest.prototype.open;
            var _origXHRSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function(method, url) {
                this._lampac_req_url = url ? String(url) : '';
                return _origXHROpen.apply(this, arguments);
            };
            XMLHttpRequest.prototype.send = function() {
                var self = this;
                if (self._lampac_req_url && isQualitySourceUrl(self._lampac_req_url)) {
                    self.addEventListener('load', function() {
                        if (self.status !== 200) return;
                        try {
                            var ct = self.getResponseHeader('content-type') || '';
                            if (ct.indexOf('json') === -1 && ct.indexOf('javascript') === -1) return;
                            var json = JSON.parse(self.responseText);
                            processQualityResponse(json);
                        } catch(e) {}
                    });
                }
                return _origXHRSend.apply(this, arguments);
            };
        }

        if (!window._lampac_fetch_quality_patched && window.fetch) {
            window._lampac_fetch_quality_patched = true;
            var _origFetch = window.fetch;
            window.fetch = function(input, init) {
                var url = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
                var p = _origFetch.apply(this, arguments);
                if (isQualitySourceUrl(url)) {
                    p.then(function(resp) {
                        resp.clone().json().then(function(json) {
                            processQualityResponse(json);
                        }).catch(function(){});
                    }).catch(function(){});
                }
                return p;
            };
        }

        if (Lampa.Api && !Lampa.Api._lampac_quality_patched) {
            var _origApiMain = Lampa.Api.main;
            if (_origApiMain) {
                Lampa.Api.main = function(params, oncomplete, onerror) {
                    return _origApiMain.call(this, params, function(json) {
                        processQualityResponse(json);
                        if (oncomplete) oncomplete(json);
                    }, onerror);
                };
            }
            if (Lampa.Listener) {
                Lampa.Listener.follow('request_success', function(e) {
                    if (!e || !e.url || !isQualitySourceUrl(e.url)) return;
                    if (e.data) processQualityResponse(e.data);
                });
            }
            Lampa.Api._lampac_quality_patched = true;
        }

        // Step 3: Badge system
        var initBadges = function() {
            if (window.lampac_ui_badges_v100) return;
            window.lampac_ui_badges_v100 = true;

            var resolveType = function(cardEl, data) {
                var isTV = cardEl.classList.contains('card--tv') || !!(data && data.original_name);
                var isAnim = false;
                if (data) {
                    var ids = data.genre_ids;
                    if (!ids && data.genres) ids = data.genres.map(function(g) { return g.id; });
                    if (ids) isAnim = ids.indexOf(16) !== -1;
                }
                var isAnime = isAnim && !!(data && (data.original_language === 'ja' || (data.origin_country && data.origin_country.indexOf('JP') !== -1)));

                if (isAnime)        return { text: 'АНИМЕ',     cls: 'lampac-anime'   };
                if (isTV && isAnim) return { text: 'СЕРИАЛ',    cls: 'lampac-cartoon' };
                if (isTV)           return { text: 'СЕРИАЛ',     cls: 'lampac-serial'  };
                if (isAnim)         return { text: 'МУЛЬТФИЛЬМ', cls: 'lampac-cartoon' };
                                    return { text: 'ФИЛЬМ',      cls: 'lampac-movie'   };
            };

            var applyBadge = function(cardEl) {
                if (cardEl._lampac_badge) return;
                if (!cardEl.classList.contains('card')) return;
                if (cardEl.querySelector('.card-parser__title')) return;
                var view = cardEl.querySelector('.card__view');
                if (!view) return;
                
                var data = cardEl.card_data || null;
                var type = resolveType(cardEl, data);
                var typeEl = view.querySelector('.card__type');
                if (!typeEl) {
                    typeEl = document.createElement('div');
                    view.appendChild(typeEl);
                }
                typeEl.className = 'card__type ' + type.cls;
                typeEl.textContent = type.text;
                if (Lampa.Storage.get('lampac_ui_global_quality', '1') !== '0' && data) {
                    var qu = data.release_quality || data.quality || QualityCache[data.id];
                    if (qu) addQualityBadgeToCard(cardEl, qu);
                }
                cardEl._lampac_badge = true;
            };

            var badgeObserver = new MutationObserver(function(mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    var added = mutations[i].addedNodes;
                    for (var j = 0; j < added.length; j++) {
                        var node = added[j];
                        if (node.nodeType !== 1) continue;
                        if (node.classList && node.classList.contains('card')) applyBadge(node);
                        else {
                            var found = node.querySelectorAll('.card');
                            for (var k = 0; k < found.length; k++) applyBadge(found[k]);
                        }
                    }
                }
            });
            badgeObserver.observe(document.body, { childList: true, subtree: true });
            var existing = document.querySelectorAll('.card');
            for (var i = 0; i < existing.length; i++) applyBadge(existing[i]);

            // Toggle body class based on setting
            if (Lampa.Storage.get('lampac_ui_content_badges', '1') === '0') document.body.classList.add('lampac-ui-no-badges');
            
            Lampa.Storage.listener.follow('change', function(e) {
                if (e.name === 'lampac_ui_content_badges') {
                    document.body.classList.toggle('lampac-ui-no-badges', e.value === '0');
                }
            });
        }

        if (document.body) initBadges();
        else Lampa.Listener.follow('app', function(e) { if (e.type === 'ready') initBadges(); });

        if (Lampa.Storage && !Lampa.Storage.field._quality_patched_v100) {
            var originalStorageField = Lampa.Storage.field;
            Lampa.Storage.field = function(name) {
                if (name === 'card_quality' && Lampa.Storage.get('lampac_ui_global_quality', '1') != '0') return true;
                return originalStorageField.apply(this, arguments);
            };
            Lampa.Storage.field._quality_patched_v100 = true;
        }

        if (Lampa.Activity && !Lampa.Activity.back._lampac_patched) {
            var originalActivityBack = Lampa.Activity.back;
            Lampa.Activity.back = function() { Backdrop.hide(); _lampacCleanupSidebar(); return originalActivityBack.apply(this, arguments); };
            Lampa.Activity.back._lampac_patched = true;
        }

        // --- 2. AGGREGATOR CORE ---
        var Sources = {
            list: function() { return Lampa.Storage.get('lampac_sources_v2', []); },
            save: function(list) { Lampa.Storage.set('lampac_sources_v2', list); },
            add: function(url) {
                var list = this.list();
                if (!_find(list, function(i){ return i.url === url; })) {
                    list.push({url: url, name: ''});
                    this.save(list);
                    var _this = this;
                    this.fetchIcon(url, function() {
                        try {
                            var id = urlToComponentName(url);
                            var foundName = Custom.get(id, 'default_names', '');
                            var nm = (foundName || '').toString().replace(/\s+/g, ' ').trim();
                            if (!nm) return;
                            if (/^\(?rate\)?$/i.test(nm)) return;
                            var list2 = _this.list();
                            list2.forEach(function(i) {
                                if (i && i.url === url && !(i.name && String(i.name).trim())) i.name = nm;
                            });
                            _this.save(list2);
                        } catch (e) {}
                    });
                }
            },
            remove: function(url) { this.save(this.list().filter(function(i) { return i.url !== url; })); },
            displayName: function(source) {
                var url = source && source.url ? String(source.url) : '';
                var id = url ? urlToComponentName(url) : '';
                var def = id ? Custom.get(id, 'default_names', '') : '';
                var n = source && source.name ? String(source.name).trim() : '';
                if (n) {
                    if ((n + '').trim().toLowerCase() === 'cinema' && def && url.toLowerCase().indexOf('cinema') === -1) return def;
                    if (/^\(?rate\)?$/i.test(n)) return def || 'Lampac';
                    return n;
                }
                if (def) return def;
                if (url) {
                    var base = url.split('?')[0].split('#')[0];
                    var tail = base.split('/').pop() || base;
                    tail = tail.replace(/\.js$/i, '');
                    if (tail) return tail.charAt(0).toUpperCase() + tail.slice(1);
                }
                return 'Lampac';
            },
            move: function(url, to) {
                var list = this.list();
                var idx = -1;
                for (var i = 0; i < list.length; i++) {
                    if (list[i] && list[i].url === url) { idx = i; break; }
                }
                if (idx < 0) return;

                if (to === 'up' && idx > 0) {
                    var t1 = list[idx - 1];
                    list[idx - 1] = list[idx];
                    list[idx] = t1;
                } else if (to === 'down' && idx < list.length - 1) {
                    var t2 = list[idx + 1];
                    list[idx + 1] = list[idx];
                    list[idx] = t2;
                } else if (to === 'top' && idx > 0) {
                    var el = list.splice(idx, 1)[0];
                    list.unshift(el);
                } else if (to === 'bottom' && idx < list.length - 1) {
                    var el2 = list.splice(idx, 1)[0];
                    list.push(el2);
                } else {
                    return;
                }

                this.save(list);
            },
            fetchIcon: function(url, callback) {
                var id = urlToComponentName(url);
                var network = new Lampa.Reguest();
                network.native(url, function(code) {
                    try {
                        var cleanRaw = function(s) {
                            try {
                                return (s || '').replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, '').replace(/\\t/g, '');
                            } catch (e) {
                                return s || '';
                            }
                        };

                        var stripTags = function(s) {
                            return (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
                        };

                        var resolveLangToken = function(s) {
                            var t = (s || '').trim();
                            if (!t) return '';
                            try {
                                if (window.Lampa && Lampa.Lang && typeof Lampa.Lang.translate === 'function') {
                                    return stripTags(Lampa.Lang.translate(t));
                                }
                            } catch (e) {}
                            return stripTags(t);
                        };

                        var extractButtonMeta = function(src) {
                            var text = '';
                            var icon = '';
                            var idx = -1;
                            var marks = ['full-start__button', 'view--online', 'buttons--container'];
                            for (var mi = 0; mi < marks.length; mi++) {
                                var p = (src || '').indexOf(marks[mi]);
                                if (p >= 0 && (idx < 0 || p < idx)) idx = p;
                            }
                            if (idx < 0) return { text: '', icon: '' };

                            var from = Math.max(0, idx - 8000);
                            var to = Math.min((src || '').length, idx + 20000);
                            var chunk = (src || '').slice(from, to);

                            var btnHtmlMatch = chunk.match(/<div[^>]*full-start__button[^>]*>[\s\S]*?<\/div>/i);
                            var scope = btnHtmlMatch && btnHtmlMatch[0] ? btnHtmlMatch[0] : chunk;

                            var svgMatch = scope.match(/<svg[\s\S]*?<\/svg>/i);
                            if (svgMatch && svgMatch[0]) icon = cleanRaw(svgMatch[0]);

                            if (!icon) {
                                var imgMatch = scope.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
                                if (imgMatch && imgMatch[1]) icon = cleanRaw(imgMatch[1]);
                            }

                            if (!icon) {
                                var cssBg = scope.match(/background-image\s*:\s*url\(([^)]+)\)/i);
                                if (cssBg && cssBg[1]) icon = cleanRaw(cssBg[1].replace(/^['"]|['"]$/g, '').trim());
                            }

                            var spanMatch = scope.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
                            if (spanMatch && spanMatch[1]) {
                                text = cleanRaw(spanMatch[1]);
                            } else {
                                var dataTitle = scope.match(/data-title\s*=\s*["']([^"']+)["']/i);
                                if (dataTitle && dataTitle[1]) text = cleanRaw(dataTitle[1]);
                            }

                            text = resolveLangToken(text);

                            return { text: text, icon: icon };
                        };

                        var btnMeta = extractButtonMeta(code);

                        // 1. Ищем иконку (приоритет: манифест -> кнопка -> любой большой SVG)
                        var iconMatch = code.match(/icon\s*:\s*['"](<svg.*?<\/svg>|http.*?\.(png|jpg|jpeg|svg|webp))['"]/i) || 
                                       code.match(/this\.manifest\s*=\s*\{[\s\S]*?icon\s*:\s*['"](.*?)['"]/i) ||
                                       code.match(/manifest\s*=\s*\{[\s\S]*?icon\s*:\s*['"](.*?)['"]/i) ||
                                       code.match(/var\s+button\s*=\s*['"](.*?)<svg([\s\S]*?)<\/svg>/i) ||
                                       code.match(/icon\s*:\s*['"](.*?)['"]/i);
                        
                        var foundIcon = null;
                        if (btnMeta && btnMeta.icon) foundIcon = btnMeta.icon;
                        if (iconMatch) {
                            var raw = iconMatch[0];
                            var svg = raw.match(/<svg[\s\S]*?<\/svg>/i);
                            var img = raw.match(/http[s]?:\/\/[^'"]+\.(png|jpg|jpeg|svg|webp)/i);
                            var data = raw.match(/data:image\/[^'"]+/i);
                            foundIcon = (svg ? svg[0] : (img ? img[0] : (data ? data[0] : null)));
                        }

                        // Если ничего не нашли специфического, ищем любой КРУПНЫЙ SVG (логотип обычно сложный)
                        if (!foundIcon || foundIcon.length < 100) {
                            var svgs = code.match(/<svg[\s\S]*?<\/svg>/gi);
                            if (svgs) {
                                // Выбираем самый длинный SVG (обычно это логотип, а не иконка звезды/папки)
                                svgs.sort(function(a, b) { return b.length - a.length; });
                                if (svgs[0].length > 200) foundIcon = svgs[0];
                            }
                        }

                        // Если нашли просто имя (например "card" или "play"), игнорируем его
                        if (foundIcon && foundIcon.length < 10 && foundIcon.indexOf('<svg') === -1) {
                            foundIcon = null;
                        }

                        // 2. Спец-кейс для Z01 / Cinema
                        if ((!foundIcon || foundIcon.length < 20) && (url.indexOf('z01') !== -1 || url.indexOf('lampac') !== -1 || code.indexOf('Cinema') !== -1)) {
                            var zBlue = code.match(/<svg[^>]*?>[\s\S]*?#2886fb[\s\S]*?<\/svg>/i) || code.match(/<svg[^>]*?>[\s\S]*?viewBox="0 0 24 24"[\s\S]*?<\/svg>/i);
                            if (zBlue) foundIcon = zBlue[0];
                        }
                        
                        if (foundIcon && foundIcon.length > 5) {
                            foundIcon = cleanRaw(foundIcon);
                            if (foundIcon.trim().charAt(0) === '<' || foundIcon.indexOf('http') === 0 || foundIcon.indexOf('./') === 0 || foundIcon.indexOf('data:image') === 0) {
                                Custom.set(id, 'default_icons', foundIcon);
                            }
                        }

                        // 3. Ищем имя автора/плагина
                        var nameMatch = code.match(/name\s*:\s*['"](.*?)['"]/i) || 
                                        code.match(/author\s*:\s*['"](.*?)['"]/i) ||
                                        code.match(/title\s*:\s*['"](.*?)['"]/i);
                        
                        var foundName2 = (btnMeta && btnMeta.text) ? btnMeta.text : '';
                        if (!foundName2 && nameMatch && nameMatch[1]) foundName2 = (nameMatch[1] || '').trim();
                        if (foundName2) {
                            foundName2 = stripTags(foundName2);
                            if (/^\(?rate\)?$/i.test(foundName2)) foundName2 = '';
                            if (foundName2 && foundName2.length > 1) {
                                Custom.set(id, 'default_names', foundName2);
                            }
                        } else {
                            // Если не нашли в коде, пробуем вытащить из URL (без подмен "online -> Cinema")
                            var base = (url + '').split('?')[0].split('#')[0];
                            var tail = base.split('/').pop() || base;
                            tail = (tail || '').replace(/\.js$/i, '');
                            if (tail) Custom.set(id, 'default_names', tail.charAt(0).toUpperCase() + tail.slice(1));
                        }
                    } catch(e) {}
                    if (callback) callback();
                }, function() { if (callback) callback(); }, false, { dataType: 'text' });
            },
            open: function(source, movie) {
                var id = urlToComponentName(source.url);
                
                // --- ЛОГИКА ПРОДОЛЖЕНИЯ ПРОСМОТРА (с нуля) ---
                var movieHash = Lampa.Utils.hash(movie.number_of_seasons ? movie.original_name : movie.original_title);
                var watchedLast = Lampa.Storage.get('online_watched_last', {});
                var watchedData = watchedLast[movieHash];
                
                // Проверяем, привязан ли этот фильм к текущему плагину
                var pluginInfo = Lampa.Storage.get('lampac_plugin_info', {});
                var isThisPlugin = pluginInfo[movie.id] === id;

                if (watchedData && isThisPlugin) {
                    var tl = null;
                    if (watchedData.season && watchedData.episode) {
                        var tlHash = Lampa.Utils.hash([watchedData.season, watchedData.season > 10 ? ':' : '', watchedData.episode, movie.original_name || movie.original_title].join(''));
                        tl = Lampa.Timeline.view(tlHash);
                    } else {
                        var tlHash = Lampa.Utils.hash([movie.original_title || movie.original_name].join(''));
                        tl = Lampa.Timeline.view(tlHash);
                    }

                    // Показываем попап только если прогресс более 5%
                    if (tl && tl.percent > 5) {
                        this.showContinuePopup(source, movie, watchedData, tl, id);
                        return;
                    }
                }

                // Если попап не нужен - открываем сразу
                if (Lampa.Component.get(id)) this.push(id, source, movie);
                else this.loadAndOpen(source, movie);
            },
            showContinuePopup: function(source, movie, watchedData, tl, componentId) {
                var _this = this;
                var isSerial = !!(watchedData.season && watchedData.episode);
                var timeStr = Lampa.Utils.secondsToTime(tl.time);
                var enabled = Lampa.Controller.enabled().name;

                var show = function(posterUrl, episodeTitle) {
                    $('#lampac-continue-popup').remove();
                    
                    var parts = [_this.displayName(source)];
                    if (watchedData.balanser_name) parts.push(watchedData.balanser_name);
                    if (watchedData.voice_name) parts.push(watchedData.voice_name);
                    if (isSerial) parts.push('С' + watchedData.season + ' • E' + watchedData.episode);
                    var subTitle = parts.join(' • ');

                    var popup = $([
                        '<div id="lampac-continue-popup">',
                            '<div class="lampac-continue__card">',
                                '<div class="lampac-continue__img">',
                                    posterUrl ? '<img src="' + posterUrl + '" onload="this.style.opacity=0.7">' : '',
                                    '<div class="lampac-continue__details">',
                                        '<div class="lampac-continue__title">' + episodeTitle + '</div>',
                                        '<div class="lampac-continue__info">' + subTitle + ' • ' + timeStr + '</div>',
                                    '</div>',
                                '</div>',
                                '<div class="lampac-continue__body">',
                                    '<div class="lampac-continue__timeline"></div>',
                                '</div>',
                                '<div class="lampac-continue__footer">',
                                    '<div class="lampac-continue__btn lampac-continue__btn--play selector focus">',
                                        '<span>▶&nbsp; Продолжить</span>',
                                    '</div>',
                                    '<div class="lampac-continue__btn lampac-continue__btn--choose selector">',
                                        '<span>☰&nbsp; ' + (isSerial ? 'Выбрать серию' : 'Начать сначала') + '</span>',
                                    '</div>',
                                '</div>',
                            '</div>',
                        '</div>'
                    ].join(''));

                    var tlEl = Lampa.Timeline.render(tl);
                    popup.find('.lampac-continue__timeline').append(tlEl);
                    $('body').append(popup);

                    var btns = popup.find('.lampac-continue__btn');
                    var focusIdx = 0;

                    var setFocus = function(i) {
                        focusIdx = i;
                        btns.removeClass('focus');
                        btns.eq(i).addClass('focus');
                    };

                    var close = function() {
                        popup.remove();
                        Lampa.Controller.toggle(enabled);
                    };

                    Lampa.Controller.add('lampac_continue', {
                        toggle: function() {},
                        left: function() { setFocus(0); },
                        right: function() { setFocus(1); },
                        enter: function() { btns.eq(focusIdx).trigger('hover:enter'); },
                        back: function() { close(); }
                    });
                    Lampa.Controller.toggle('lampac_continue');

                    btns.on('hover:enter', function() {
                        var idx = btns.index(this);
                        $(this).addClass('clicking');

                        setTimeout(function() {
                            close();
                            if (idx === 0) {
                                // Кнопка "Продолжить"
                                // 1. Устанавливаем выбор в Storage ПРАВИЛЬНОГО балансера
                                var guessed = (_this.displayName(source).split(' ')[0] || '').toLowerCase();
                                var bName = watchedData.balanser || guessed || 'online';
                                var choiceKey = 'online_choice_' + bName;
                                var currentChoice = Lampa.Storage.cache(choiceKey, 3000, {});
                                if (!currentChoice[movie.id]) currentChoice[movie.id] = {};
                                
                                if (watchedData.season) currentChoice[movie.id].season = Math.max(0, watchedData.season - 1);
                                if (watchedData.voice_name) currentChoice[movie.id].voice_name = watchedData.voice_name;
                                if (watchedData.voice_id) currentChoice[movie.id].voice_id = watchedData.voice_id;
                                
                                Lampa.Storage.set(choiceKey, currentChoice);

                                // 2. Устанавливаем последний балансер глобально
                                Lampa.Storage.set('online_balanser', bName);

                                // 3. Передаем команду на автозапуск
                                window._lampac_continue_episode = watchedData.episode;
                            } else {
                                window._lampac_continue_episode = null;
                            }
                            
                            if (Lampa.Component.get(componentId)) _this.push(componentId, source, movie);
                            else _this.loadAndOpen(source, movie);
                        }, 200);
                    });

                    popup.on('click', function(e) { if (e.target === popup[0]) close(); });
                };

                if (isSerial && movie.id) {
                    var lang = Lampa.Storage.field('tmdb_lang') || 'ru';
                    var epUrl = Lampa.TMDB.api('tv/' + movie.id + '/season/' + watchedData.season + '/episode/' + watchedData.episode + '?api_key=' + Lampa.TMDB.key() + '&language=' + lang);
                    $.ajax({ url: epUrl, timeout: 5000 })
                        .done(function(epData) {
                            var poster = (epData && epData.still_path) ? Lampa.TMDB.image('t/p/w500' + epData.still_path) : (movie.backdrop_path ? Lampa.TMDB.image('t/p/w780' + movie.backdrop_path) : '');
                            show(poster, (epData && epData.name) ? epData.name : ('Серия ' + watchedData.episode));
                        })
                        .fail(function() {
                            show(movie.backdrop_path ? Lampa.TMDB.image('t/p/w780' + movie.backdrop_path) : '', 'Серия ' + watchedData.episode);
                        });
                } else {
                    show(movie.backdrop_path ? Lampa.TMDB.image('t/p/w780' + movie.backdrop_path) : '', movie.title || movie.name || '');
                }
            },
            loadAndOpen: function(source, movie) {
                var id = urlToComponentName(source.url);
                Lampa.Noty.show('Загрузка: ' + this.displayName(source));
                var scriptUrl = source.url;
                if (scriptUrl.indexOf('reset=') === -1) scriptUrl += (scriptUrl.indexOf('?') === -1 ? '?' : '&') + 'reset=' + Math.random();

                // Aggressive global resets for "all-eating" mode
                window.lampac_plugin = false;
                window.dolpac_plugin = false;
                window.bandera_online = false;
                window.prestige_plugin = false;

                var network = new Lampa.Reguest();
                network.native(scriptUrl, function(code) {
                    try {
                        // Обновляем дефолтную иконку при каждом открытии
                        var iconMatch = code.match(/icon\s*:\s*['"](<svg.*?<\/svg>|http.*?\.(png|jpg|jpeg|svg|webp))['"]/i) || 
                                       code.match(/this\.manifest\s*=\s*\{[\s\S]*?icon\s*:\s*['"](.*?)['"]/i) ||
                                       code.match(/manifest\s*=\s*\{[\s\S]*?icon\s*:\s*['"](.*?)['"]/i) ||
                                       code.match(/icon\s*:\s*['"](.*?)['"]/i);
                        
                        var foundIcon = iconMatch ? iconMatch[1] : null;
                        if (foundIcon && foundIcon.length < 10 && foundIcon.indexOf('<svg') === -1) foundIcon = null;

                        if ((!foundIcon || foundIcon.length < 20) && (source.url.indexOf('z01') !== -1 || source.url.indexOf('lampac') !== -1)) {
                            var zBlue = code.match(/<svg[^>]*?>[\s\S]*?#2886fb[\s\S]*?<\/svg>/i);
                            if (zBlue) foundIcon = zBlue[0];
                            else if (source.url.indexOf('z01') !== -1) {
                                foundIcon = '<svg width="36" height="36" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="112" height="112" rx="32" fill="white" stroke="#2886fb" stroke-width="12"/><path d="M38 36h52L38 92h52" stroke="#2886fb" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
                            }
                        }
                        if (foundIcon && foundIcon.length > 5) {
                            foundIcon = foundIcon.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, '').replace(/\\t/g, '');
                            if (foundIcon.indexOf('<svg') === 0 || foundIcon.indexOf('http') === 0 || foundIcon.indexOf('./') === 0 || foundIcon.indexOf('data:image') === 0) {
                                Custom.set(id, 'default_icons', foundIcon);
                            }
                        }

                        // 1. Bypass guards & Version checks (Nuclear "all-eating" mode)
                        var modifiedCode = code
                            .replace(/window\.[a-zA-Z0-9_]+_plugin\s*=\s*true/g, "")
                            .replace(/if\s*\(\s*!window\.[a-zA-Z0-9_]+_plugin\s*\)/g, "if(true)")
                            .replace(/\bif\s*\(\s*window\.[a-zA-Z0-9_]+_plugin\s*\)/g, "if(false)")
                            // Bypass Bandera-specific version check
                            .replace(/Lampa\.Manifest\.app_digital\s*>=\s*\d+/g, "true")
                            // Bypass Bandera-specific guard
                            .replace(/!window\.bandera_online/g, "true")
                            // Bypass Prestige guard
                            .replace(/!window\.prestige_plugin/g, "true")
                            // Robust support for auto-continue
                            .replace(/if\s*\(\s*(object|activity)\.lampac_continue_episode\s*\)/g, "if($1.lampac_continue_episode || window._lampac_continue_episode)")
                            .replace(/var\s+target_ep\s*=\s*(object|activity)\.lampac_continue_episode/g, "var target_ep = $1.lampac_continue_episode || window._lampac_continue_episode")
                            .replace(/var\s+target_item\s*=\s*videos\.find\(.*?\)/g, "var target_item = null; if(videos && videos.length) { for(var i=0; i<videos.length; i++) { if(videos[i].episode == (activity.lampac_continue_episode || window._lampac_continue_episode)) { target_item = videos[i]; break; } } }")
                            .replace(/if\s*\(\s*target_item\s*\)\s*\{/g, "if(target_item) { ")
                            // Патчим вызов display, чтобы перехватить отрисовку серий
                            .replace(/this\.display\s*\(\s*videos\s*\)/g, "this.display(videos); if(window._lampac_continue_episode) { var _this_spy = this; setTimeout(function(){ if(window._lampac_continue_episode) { var target_item = null; if(videos && videos.length) { for(var i=0; i<videos.length; i++) { if(videos[i].episode == window._lampac_continue_episode) { target_item = videos[i]; break; } } } if(target_item){ var $body = _this_spy.activity.render(); var target_html = $body.find('.online-prestige--full').eq(videos.indexOf(target_item)); if(target_html.length){ Lampa.Controller.collectionFocus(target_html[0], $body); target_html.trigger('hover:enter'); window._lampac_continue_episode = null; } } } }, 500); }")
                            // Support for auto-continue via global variable
                            .replace(/(object|activity)\.lampac_continue_episode/g, "($1.lampac_continue_episode || window._lampac_continue_episode)")
                            // Bypass any "plugin already loaded" noty or alert
                            .replace(/Lampa\.Noty\.show\((['"])Плагин уже загружен\1\)/g, "console.log('Plugin already loaded (bypassed)')");

                        var script = document.createElement('script');
                        script.id = 'lampac-' + id;
                        script.setAttribute('data-lampac-url', source.url);

                        var _origListenerFollow = null;
                        if (window.appready && Lampa.Listener && Lampa.Listener.follow && !Lampa.Listener._lampac_inject_hijack) {
                            _origListenerFollow = Lampa.Listener.follow;
                            Lampa.Listener.follow = function(type, callback) {
                                if (type === 'app' && typeof callback === 'function') {
                                    try { callback({ type: 'ready' }); } catch(ex) {}
                                    return;
                                }
                                return _origListenerFollow.apply(this, arguments);
                            };
                            Lampa.Listener._lampac_inject_hijack = true;
                        }

                        window._lampac_loading_url = source.url;
                        script.textContent = modifiedCode;
                        document.head.appendChild(script);
                        // Extended timeout for async registrations (3 seconds)
                        setTimeout(function() { window._lampac_loading_url = null; }, 3000);

                        if (_origListenerFollow) {
                            setTimeout(function() {
                                Lampa.Listener.follow = _origListenerFollow;
                                delete Lampa.Listener._lampac_inject_hijack;
                            }, 1000);
                        }

                        var attempts = 0;
                        var check = setInterval(function() {
                            attempts++;
                            var foundId = window._lampac_registered_ids[source.url];
                            if (foundId && Lampa.Component.get(foundId)) {
                                clearInterval(check);
                                Sources.push(foundId, source, movie);
                            } else if (attempts > 80) {
                                clearInterval(check);
                                Lampa.Noty.show('Ошибка регистрации (N)');
                            }
                        }, 100);
                    } catch(e) {
                        window._lampac_loading_url = null;
                        Lampa.Noty.show('Ошибка запуска: ' + e.message);
                    }
                }, function() {
                    window.lampac_plugin = false;
                    window.dolpac_plugin = false;
                    window.bandera_online = false;
                    window._lampac_loading_url = source.url;
                    Lampa.Utils.putScriptAsync([scriptUrl], function() {
                        var attempts = 0;
                        var check = setInterval(function() {
                            attempts++;
                            var foundId = window._lampac_registered_ids[source.url];
                            if (foundId && Lampa.Component.get(foundId)) {
                                clearInterval(check);
                                window._lampac_loading_url = null;
                                Sources.push(foundId, source, movie);
                            } else if (attempts > 80) {
                                clearInterval(check);
                                window._lampac_loading_url = null;
                                Lampa.Noty.show('Ошибка регистрации (S)');
                            }
                        }, 100);
                    }, null, false, true);
                }, false, { dataType: 'text' });
            },
            push: function(id, source, movie) {
                if (movie && movie.id) {
                    window._lampac_last_plugin_for_movie = { movie_id: movie.id, component: id };
                }

                var activityObj = {
                    url: source.url,
                    title: this.displayName(source),
                    component: id,
                    id: movie.id,
                    method: movie.name ? 'tv' : 'movie',
                    card: movie,
                    movie: movie,
                    page: 1
                };

                // Если есть команда на автозапуск серии - передаем её в корень объекта активности
                if (window._lampac_continue_episode) {
                    activityObj.lampac_continue_episode = window._lampac_continue_episode;
                }

                Lampa.Activity.push(activityObj);
            }
        };

        (function() {
            try {
                if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.set || Lampa.Storage.set._lampac_watched_patch) return;

                var origSet = Lampa.Storage.set;
                Lampa.Storage.set = function(key, value) {
                    var res = origSet.apply(this, arguments);

                    try {
                        if (key === 'online_watched_last') {
                            var active = null;
                            try { active = Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active() : null; } catch (e) {}

                            var component = null;
                            var movieId = null;

                            if (active && active.component && active.component.indexOf('plugin_') === 0) {
                                component = active.component;
                                movieId = active.id || (active.activity && active.activity.object ? active.activity.object.id : null);
                            }

                            if ((!component || !movieId) && window._lampac_last_plugin_for_movie) {
                                component = component || window._lampac_last_plugin_for_movie.component;
                                movieId = movieId || window._lampac_last_plugin_for_movie.movie_id;
                            }

                            if (component && movieId) {
                                var pluginInfo = Lampa.Storage.get('lampac_plugin_info', {});
                                if (pluginInfo[movieId] !== component) {
                                    pluginInfo[movieId] = component;
                                    origSet.call(Lampa.Storage, 'lampac_plugin_info', pluginInfo);
                                }
                            }
                        }
                    } catch (e) {}

                    return res;
                };
                Lampa.Storage.set._lampac_watched_patch = true;
            } catch (e) {}
        })();

        var lampacNormalizeExtensions = function(list) {
            if (!list) return [];
            if (typeof list === 'string') {
                try { list = JSON.parse(list); } catch (e) { list = []; }
            }
            if (!Array.isArray(list)) return [];

            return list.map(function(p) {
                if (typeof p === 'string') return { url: p, status: 1 };
                if (!p) return null;
                var url = (p.url || p.link || '').toString();
                if (!url) return null;
                return { url: url, status: p.status, name: p.name, author: p.author, descr: p.descr };
            }).filter(function(p) {
                return p && p.url;
            });
        };

        var lampacSafeToggle = function(name, fallback) {
            try {
                if (name) return Lampa.Controller.toggle(name);
            } catch (e) {}

            try {
                return Lampa.Controller.toggle(fallback || 'content');
            } catch (e) {}
        };

        var lampacUniqByUrl = function(arr) {
            var seen = {};
            var out = [];
            (arr || []).forEach(function(p) {
                if (!p || !p.url) return;
                var key = p.url;
                if (seen[key]) return;
                seen[key] = true;
                out.push(p);
            });
            return out;
        };

        var lampacGetLocalExtensions = function() {
            return lampacNormalizeExtensions(Lampa.Storage.get('plugins', []));
        };

        var lampacGetCubExtensions = function(cb) {
            try {
                if (Lampa.Account && Lampa.Account.Api && typeof Lampa.Account.Api.plugins === 'function') {
                    Lampa.Account.Api.plugins(function(list) {
                        cb(lampacNormalizeExtensions(list));
                    });
                    return;
                }
            } catch (e) {}
            cb([]);
        };

        var lampacGetExtensions = function(mode, cb) {
            var local = lampacGetLocalExtensions();

            if (mode === 'local') {
                cb(local);
                return;
            }

            if (mode === 'cub') {
                lampacGetCubExtensions(function(cub) {
                    cb(cub);
                });
                return;
            }

            lampacGetCubExtensions(function(cub) {
                cb(lampacUniqByUrl(local.concat(cub)));
            });
        };

        var lampacIsLikelyLampacSourceUrl = function(url) {
            if (!url) return false;
            var u = (url + '').toLowerCase();
            if (u.indexOf('lampac-ui-plugin') !== -1) return false;
            if (!/\.js(\?|#|$)/.test(u)) return false;
            if (/\/online[^\/]*\.js(\?|#|$)/.test(u)) return true;
            if (/\/(lampac|dampac|vokino)[^\/]*\.js(\?|#|$)/.test(u)) return true;
            return false;
        };

        var lampacBuildExtensionTitle = function(p) {
            var name = (p && p.name ? (p.name + '').trim() : '');
            var disabled = p && (p.status === 0 || p.status === false);
            if (name) return (disabled ? 'Отключено: ' : '') + name;
            var url = (p && p.url ? (p.url + '') : '');
            return (disabled ? 'Отключено: ' : '') + url.replace(/^https?:\/\//, '').replace(/[?#].*$/, '');
        };

        var lampacOpenExtensionsPicker = function(mode) {
            var filterKey = 'lampac_aggregator_ext_filter';
            var filterEnabled = Lampa.Storage.get(filterKey, '1') == '1';

            var modeTitle = mode === 'cub' ? 'CUB' : (mode === 'local' ? 'Локальные' : 'Все');
            var title = 'Добавить из расширений: ' + modeTitle + (filterEnabled ? ' (online)' : '');

            lampacGetExtensions(mode, function(list) {
                if (filterEnabled) list = list.filter(function(p) { return lampacIsLikelyLampacSourceUrl(p.url); });

                if (!list.length) {
                    if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('Список пуст');
                    return;
                }

                var actions = [
                    { title: filterEnabled ? 'Показать все .js' : 'Только online/Lampac', key: 'toggle_filter', icon: 'zap' }
                ].concat(list.map(function(p) {
                    return { title: lampacBuildExtensionTitle(p), key: 'add_from_ext', url: p.url, icon: 'plus' };
                }));

                lampacPopupOpenManage(title, actions, function(opt) {
                    if (!opt) return;
                    if (opt.key === 'toggle_filter') {
                        Lampa.Storage.set(filterKey, filterEnabled ? '0' : '1');
                        lampacOpenExtensionsPicker(mode);
                        return;
                    }
                    if (opt.key === 'add_from_ext' && opt.url) {
                        Sources.add(opt.url.trim());
                        openAggregatorMenu();
                        return;
                    }
                    lampacSafeToggle('lampac_aggregator', 'content');
                }, 'lampac_aggregator');
            });
        };

        var lampacFitAggregatorScroll = function(popup, scroll, head, footer) {
            try {
                var box = popup.find('.lampac-aggregator__box').eq(0);
                var body = popup.find('.lampac-aggregator__body').eq(0);

                var maxBox = Math.floor(window.innerHeight * 0.85);
                var headH = head && head.length ? head.outerHeight(true) : 0;
                var footerH = footer && footer.length ? footer.outerHeight(true) : 0;

                var padTop = parseFloat(body.css('padding-top')) || 0;
                var padBottom = parseFloat(body.css('padding-bottom')) || 0;

                var max = maxBox - headH - footerH - padTop - padBottom;

                var boxHeight = box && box.length ? box.height() : 0;
                if (boxHeight) max = Math.min(max, boxHeight - headH - footerH - padTop - padBottom);

                if (!max || max < 200) max = Math.max(200, Math.floor(window.innerHeight * 0.45));

                scroll.render().css({ 'max-height': max + 'px', width: '100%' });
            } catch (e) {}
        };

        var lampacPopupOpenIcons = function(onSelect, onBackToggle) {
            $('.lampac-aggregator-subpopup').remove();

            var popup = $([
                '<div class="lampac-aggregator-subpopup">',
                    '<div class="lampac-aggregator__box">',
                        '<div class="lampac-aggregator__head">',
                            '<div class="lampac-aggregator__title">Иконка</div>',
                        '</div>',
                        '<div class="lampac-aggregator__body"></div>',
                    '</div>',
                '</div>'
            ].join(''));

            var head = popup.find('.lampac-aggregator__head');
            var body = popup.find('.lampac-aggregator__body');

            var scroll = new Lampa.Scroll({mask: true, over: true, step: 150});
            body.append(scroll.render());

            var grid = $('<div class="lampac-aggregator__icon-grid"></div>');
            scroll.append(grid);

            Object.keys(ICONS).forEach(function(iconKey) {
                var el = $('<div class="lampac-aggregator__icon-item selector">' + ICONS[iconKey] + '</div>');

                el.on('hover:hover hover:focus', function() {
                    scroll.update(el, true);
                });

                el.on('hover:enter', function(e) {
                    if (e) { try { e.preventDefault(); e.stopPropagation(); } catch (ex) {} }
                    popup.remove();
                    if (onSelect) onSelect(iconKey);
                });

                grid.append(el);
            });

            $('body').append(popup);
            lampacFitAggregatorScroll(popup, scroll, head, null);

            var closeSub = function() {
                popup.remove();
                if (onBackToggle) lampacSafeToggle(onBackToggle, 'lampac_aggregator');
                else lampacSafeToggle('lampac_aggregator', 'content');
            };

            popup.on('click', function(e) {
                if (e && e.target === popup[0]) closeSub();
            });

            Lampa.Controller.add('lampac_aggregator_icons', {
                toggle: function() {
                    lampacFitAggregatorScroll(popup, scroll, head, null);
                    Lampa.Controller.collectionSet(popup);
                    var first = popup.find('.selector').eq(0);
                    Lampa.Controller.collectionFocus(first[0], popup);
                },
                up: function() { if (window.Navigator && window.Navigator.move) window.Navigator.move('up'); },
                down: function() { if (window.Navigator && window.Navigator.move) window.Navigator.move('down'); },
                left: function() { if (window.Navigator && window.Navigator.move) window.Navigator.move('left'); },
                right: function() { if (window.Navigator && window.Navigator.move) window.Navigator.move('right'); },
                back: function() {
                    closeSub();
                }
            });

            Lampa.Controller.toggle('lampac_aggregator_icons');
        };

        var lampacPopupOpenManage = function(title, actions, onSelect, onBackToggle) {
            $('.lampac-aggregator-subpopup').remove();

            var popup = $([
                '<div class="lampac-aggregator-subpopup">',
                    '<div class="lampac-aggregator__box lampac-aggregator__box--sub">',
                        '<div class="lampac-aggregator__head">',
                            '<div class="lampac-aggregator__title">' + title + '</div>',
                        '</div>',
                        '<div class="lampac-aggregator__body"></div>',
                    '</div>',
                '</div>'
            ].join(''));

            var head = popup.find('.lampac-aggregator__head');
            var body = popup.find('.lampac-aggregator__body');

            var scroll = new Lampa.Scroll({mask: true, over: true, step: 150});
            body.append(scroll.render());

            var list = $('<div></div>');
            scroll.append(list);

            actions.forEach(function(a) {
                var icon = a.icon && ICONS[a.icon] ? '<div class="lampac-aggregator__item-icon">' + ICONS[a.icon] + '</div>' : '';
                var el = $([
                    '<div class="lampac-aggregator__item selector" style="width: 95%; margin: 2.5%;">',
                        icon,
                        '<div class="lampac-aggregator__item-details">',
                            '<div class="lampac-aggregator__item-name">' + a.title + '</div>',
                        '</div>',
                    '</div>'
                ].join(''));

                el.on('hover:hover hover:focus', function() {
                    scroll.update(el, true);
                });

                el.on('hover:enter', function(e) {
                    if (e) { try { e.preventDefault(); e.stopPropagation(); } catch (ex) {} }
                    popup.remove();
                    if (onSelect) onSelect(a);
                });

                list.append(el);
            });

            $('body').append(popup);
            lampacFitAggregatorScroll(popup, scroll, head, null);

            var closeSub = function() {
                popup.remove();
                if (onBackToggle) lampacSafeToggle(onBackToggle, 'lampac_aggregator');
                else lampacSafeToggle('lampac_aggregator', 'content');
            };

            popup.on('click', function(e) {
                if (e && e.target === popup[0]) closeSub();
            });

            Lampa.Controller.add('lampac_aggregator_manage', {
                toggle: function() {
                    lampacFitAggregatorScroll(popup, scroll, head, null);
                    Lampa.Controller.collectionSet(popup);
                    var first = popup.find('.selector').eq(0);
                    Lampa.Controller.collectionFocus(first[0], popup);
                },
                up: function() { if (window.Navigator && window.Navigator.move) window.Navigator.move('up'); },
                down: function() { if (window.Navigator && window.Navigator.move) window.Navigator.move('down'); },
                left: function() { if (window.Navigator && window.Navigator.move) window.Navigator.move('left'); },
                back: function() {
                    closeSub();
                }
            });

            Lampa.Controller.toggle('lampac_aggregator_manage');
        };

        var openAggregatorMenu = function() {
            var active = Lampa.Activity.active();
            var movie = (active.activity && active.activity.object) ? (active.activity.object.card || active.activity.object.movie || active.activity.object) : (active.card || active.movie || active.object);

            var pluginInfo = Lampa.Storage.get('lampac_plugin_info', {});
            var lastPluginId = movie ? pluginInfo[movie.id] : null;
            var currentEnabled = (Lampa.Controller.enabled && Lampa.Controller.enabled()) ? Lampa.Controller.enabled().name : 'content';
            var focusLampacsButton = function() {
                var tries = 0;
                var tick = function() {
                    tries++;
                    try {
                        if (typeof fixDOM === 'function') fixDOM();
                    } catch (e) {}
                    try {
                        if (Lampa.Controller && Lampa.Controller.enabled && Lampa.Controller.enabled().name !== 'content') {
                            try { Lampa.Controller.toggle('content'); } catch (e2) {}
                        }
                    } catch (e) {}
                    try {
                        var active2 = Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active() : null;
                        var root = active2 && active2.activity && active2.activity.render ? active2.activity.render() : $('body');
                        var $btn = root && root.find ? root.find('.button--lampac').eq(0) : $();
                        if ($btn && $btn.length) {
                            try {
                                Lampa.Controller.collectionSet(root);
                                Lampa.Controller.collectionFocus($btn[0], root);
                            } catch (e3) {
                                try { Lampa.Controller.focus($btn); } catch (e4) {}
                            }
                            return;
                        }
                    } catch (e) {}
                    if (tries < 8) setTimeout(tick, 120);
                };
                setTimeout(tick, 30);
            };

            var items = Sources.list().map(function(source) {
                var id = urlToComponentName(source.url);
                var isLast = lastPluginId === id;

                var customIcon = Custom.get(id, 'icons');
                var defaultIcon = Custom.get(id, 'default_icons');
                var iconHtml = '';

                if (customIcon) {
                    iconHtml = ICONS[customIcon] || ICONS['play-circle'];
                } else if (defaultIcon) {
                    var cleanIcon = defaultIcon.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, '').replace(/\\t/g, '');
                    iconHtml = cleanIcon.trim().charAt(0) === '<' ? cleanIcon : '<img src="' + cleanIcon + '" style="height: 100%;">';
                } else {
                    iconHtml = ICONS['play-circle'];
                }

                return {
                    title: Sources.displayName(source),
                    subtitle: source.url,
                    source: source,
                    icon: iconHtml,
                    id: id,
                    isLast: isLast
                };
            });

            $('#lampac-aggregator-popup').remove();
            $('.lampac-aggregator-subpopup').remove();

            var popup = $([
                '<div id="lampac-aggregator-popup">',
                    '<div class="lampac-aggregator__box">',
                        '<div class="lampac-aggregator__head">',
                            '<div class="lampac-aggregator__title">Выбор источника</div>',
                            '<div class="lampac-aggregator__count">Доступно: ' + items.length + '</div>',
                        '</div>',
                        '<div class="lampac-aggregator__body"></div>',
                        '<div class="lampac-aggregator__footer">',
                            '<div class="lampac-aggregator__hint"><span>OK</span> - запуск • <span>Long OK</span> - настройки</div>',
                        '</div>',
                    '</div>',
                '</div>'
            ].join(''));

            var head = popup.find('.lampac-aggregator__head');
            var body = popup.find('.lampac-aggregator__body');
            var footer = popup.find('.lampac-aggregator__footer');
            var hint = popup.find('.lampac-aggregator__hint');
            var defaultHint = hint.html();

            var scroll = new Lampa.Scroll({mask: true, over: true, step: 150});
            body.append(scroll.render());

            var grid = $('<div class="lampac-aggregator__grid"></div>');
            scroll.append(grid);

            var addBtn = null;
            var elementsByUrl = {};
            var orderUrls = items.map(function(i){ return i.source.url; });
            var moveMode = false;
            var movingUrl = null;
            var originalOrderUrls = null;
            var lastFocusedEl = null;

            var closePopup = function() {
                $('.lampac-aggregator-subpopup').remove();
                popup.remove();
            };

            var setMoveMode = function(enabled, url) {
                moveMode = !!enabled;
                movingUrl = enabled ? url : null;
                originalOrderUrls = enabled ? orderUrls.slice(0) : null;
                grid.find('.lampac-aggregator__item').removeClass('moving');
                if (moveMode && movingUrl && elementsByUrl[movingUrl]) elementsByUrl[movingUrl].addClass('moving');
                hint.html(moveMode ? '<span>OK</span> - закрепить • <span>Back</span> - отмена • <span>▲▼◄►</span> - двигать' : defaultHint);
            };

            var renderOrder = function() {
                grid.empty();
                orderUrls.forEach(function(u){
                    if (elementsByUrl[u]) grid.append(elementsByUrl[u]);
                });
                if (addBtn) grid.append(addBtn);
                if (moveMode && movingUrl && elementsByUrl[movingUrl]) elementsByUrl[movingUrl].addClass('moving');
            };

            var saveOrder = function() {
                var list = Sources.list();
                var byUrl = {};
                list.forEach(function(s){ if (s && s.url) byUrl[s.url] = s; });
                var next = [];
                orderUrls.forEach(function(u){
                    if (byUrl[u]) {
                        next.push(byUrl[u]);
                        delete byUrl[u];
                    }
                });
                Object.keys(byUrl).forEach(function(u){ next.push(byUrl[u]); });
                Sources.save(next);
            };

            var moveStep = function(dir) {
                if (!moveMode || !movingUrl) return;
                var idx = orderUrls.indexOf(movingUrl);
                if (idx < 0) return;

                var cols = window.innerWidth <= 480 ? 1 : 2;
                var delta = 0;
                if (dir === 'left') delta = cols === 1 ? 0 : -1;
                else if (dir === 'right') delta = cols === 1 ? 0 : 1;
                else if (dir === 'up') delta = -cols;
                else if (dir === 'down') delta = cols;

                if (!delta) return;

                var to = idx + delta;
                if (to < 0 || to >= orderUrls.length) return;
                if (cols === 2 && (dir === 'left' || dir === 'right')) {
                    if (Math.floor(idx / cols) !== Math.floor(to / cols)) return;
                }

                var t = orderUrls[idx];
                orderUrls[idx] = orderUrls[to];
                orderUrls[to] = t;

                renderOrder();

                try {
                    Lampa.Controller.collectionSet(popup);
                    var el = elementsByUrl[movingUrl];
                    if (el && el.length) {
                        Lampa.Controller.collectionFocus(el[0], popup);
                        scroll.update(el, true);
                        lastFocusedEl = el;
                    }
                } catch (e) {}
            };

            var navMove = function(dir) {
                try {
                    var root = popup && popup[0] ? popup[0] : null;
                    if (!root) return;

                    var nodes = Array.prototype.slice.call(root.querySelectorAll('.lampac-aggregator__item.selector'));
                    if (!nodes.length) return;

                    var cur = root.querySelector('.lampac-aggregator__item.selector.focus');
                    if (!cur) {
                        if (lastFocusedEl && lastFocusedEl.length) cur = lastFocusedEl[0];
                    }
                    if (!cur) cur = nodes[0];

                    var idx = nodes.indexOf(cur);
                    if (idx < 0) idx = 0;

                    var cols = window.innerWidth <= 480 ? 1 : 2;
                    var next = idx;
                    if (dir === 'left') next = cols === 1 ? idx : idx - 1;
                    else if (dir === 'right') next = cols === 1 ? idx : idx + 1;
                    else if (dir === 'up') next = idx - cols;
                    else if (dir === 'down') next = idx + cols;

                    if (next < 0 || next >= nodes.length) return;
                    if (cols === 2 && (dir === 'left' || dir === 'right')) {
                        if (Math.floor(idx / cols) !== Math.floor(next / cols)) return;
                    }

                    var t = nodes[next];
                    if (!t) return;
                    lastFocusedEl = $(t);
                    try { Lampa.Controller.focus(t); } catch (e) {}
                    try { scroll.update($(t), true); } catch (e) {}
                } catch (e) {}
            };

            items.forEach(function(item) {
                var el = $([
                    '<div class="lampac-aggregator__item selector' + (item.isLast ? ' last-active' : '') + '" data-source-url="' + item.source.url.replace(/"/g, '&quot;') + '">',
                        '<div class="lampac-aggregator__item-icon">' + item.icon + '</div>',
                        '<div class="lampac-aggregator__item-details">',
                            '<div class="lampac-aggregator__item-name">' + item.title + '</div>',
                            '<div class="lampac-aggregator__item-url">' + item.subtitle.replace(/^https?:\/\//, '') + '</div>',
                        '</div>',
                        item.isLast ? '<div class="lampac-aggregator__item-status">Последний</div>' : '',
                    '</div>'
                ].join(''));

                el.on('hover:hover hover:focus', function() {
                    lastFocusedEl = el;
                    scroll.update(el, true);
                });

                el.on('hover:enter', function(e) {
                    if (e) { try { e.preventDefault(); e.stopPropagation(); } catch (ex) {} }
                    if (moveMode) return;
                    closePopup();
                    lampacSafeToggle(currentEnabled, 'content');
                    document.body.classList.add('lampac-ui-active');
                    Sources.open(item.source, movie);
                });

                el.on('hover:long', function(e) {
                    if (e) { try { e.preventDefault(); e.stopPropagation(); } catch (ex) {} }

                    lampacPopupOpenManage('Управление: ' + item.title, [
                        { title: 'Удалить', key: 'remove', icon: 'trash' },
                        { title: 'Изменить название', key: 'rename', icon: 'edit' },
                        { title: 'Изменить URL', key: 'change_url', icon: 'edit' },
                        { title: 'Сменить иконку', key: 'change_icon', icon: 'settings' },
                        { title: 'Сбросить имя и иконку', key: 'reset_meta', icon: 'refresh' },
                        { title: 'Переместить', key: 'move_mode', icon: 'chevrons-up' }
                    ], function(opt) {
                        if (opt.key === 'remove') {
                            Sources.remove(item.source.url);
                            openAggregatorMenu();
                        }
                        else if (opt.key === 'move_mode') {
                            setMoveMode(true, item.source.url);
                            lampacSafeToggle('lampac_aggregator', 'content');
                            try {
                                var el = elementsByUrl[item.source.url];
                                if (el && el.length) {
                                    Lampa.Controller.collectionFocus(el[0], popup);
                                    scroll.update(el, true);
                                }
                            } catch (e) {}
                        }
                        else if (opt.key === 'rename') {
                            closePopup();
                            Lampa.Input.edit({ title: 'Имя', value: item.title, free: true, nomic: true }, function(v) {
                                if (v) {
                                    var list = Sources.list();
                                    list.forEach(function(i){ if(i.url === item.source.url) i.name = v.trim(); });
                                    Sources.save(list);
                                }
                                openAggregatorMenu();
                            });
                        }
                        else if (opt.key === 'change_url') {
                            closePopup();
                            Lampa.Input.edit({ title: 'URL', value: item.source.url, free: true, nomic: true }, function(v) {
                                if (v && v.trim()) {
                                    var newUrl = v.trim();
                                    var list = Sources.list();
                                    list.forEach(function(i){ if(i.url === item.source.url) i.url = newUrl; });
                                    Sources.save(list);
                                }
                                openAggregatorMenu();
                            });
                        }
                        else if (opt.key === 'change_icon') {
                            lampacPopupOpenIcons(function(iconKey) {
                                Custom.set(item.id, 'icons', iconKey);
                                openAggregatorMenu();
                            }, 'lampac_aggregator');
                        }
                        else if (opt.key === 'reset_meta') {
                            Custom.set(item.id, 'icons', null);
                            try { Custom.set(item.id, 'names', null); } catch (e) {}
                            try {
                                var list = Sources.list();
                                list.forEach(function(i) { if (i && i.url === item.source.url) i.name = ''; });
                                Sources.save(list);
                            } catch (e) {}
                            Sources.fetchIcon(item.source.url, function() {
                                openAggregatorMenu();
                            });
                        }
                        else {
                            lampacSafeToggle('lampac_aggregator', 'content');
                        }
                    }, 'lampac_aggregator');
                });

                elementsByUrl[item.source.url] = el;
            });

            var updateCardForUrl = function(u) {
                try {
                    if (!u || !elementsByUrl[u]) return;
                    var sid = urlToComponentName(u);
                    var el = elementsByUrl[u];
                    var iconEl = el.find('.lampac-aggregator__item-icon').eq(0);
                    var nameEl = el.find('.lampac-aggregator__item-name').eq(0);
                    var customIconKey = Custom.get(sid, 'icons');
                    var defaultIcon = Custom.get(sid, 'default_icons');
                    var nextIconHtml = '';
                    if (customIconKey) nextIconHtml = ICONS[customIconKey] || ICONS['play-circle'];
                    else if (defaultIcon) {
                        var cleanIcon = (defaultIcon + '').replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\n/g, '').replace(/\\t/g, '');
                        nextIconHtml = cleanIcon.trim().charAt(0) === '<' ? cleanIcon : '<img src="' + cleanIcon + '" style="height: 100%;">';
                    } else nextIconHtml = ICONS['play-circle'];
                    iconEl.html(nextIconHtml);
                    var src = _find(Sources.list(), function(s) { return s && s.url === u; }) || { url: u, name: '' };
                    nameEl.text(Sources.displayName(src));
                } catch (e) {}
            };

            var refreshQueue = [];
            try {
                Sources.list().forEach(function(s) {
                    var u = s && s.url ? String(s.url) : '';
                    if (!u) return;
                    var sid = urlToComponentName(u);
                    var dn = Custom.get(sid, 'default_names', '');
                    var di = Custom.get(sid, 'default_icons', '');
                    var dn2 = (dn + '').trim().toLowerCase();
                    var need = !dn || !di || (dn2 === 'cinema' && u.toLowerCase().indexOf('cinema') === -1) || dn2 === '(rate)' || dn2 === 'rate';
                    if (need) refreshQueue.push(u);
                });
            } catch (e) {}

            var refreshNext = function() {
                if (!refreshQueue.length) return;
                var u = refreshQueue.shift();
                Sources.fetchIcon(u, function() {
                    updateCardForUrl(u);
                    refreshNext();
                });
            };
            refreshNext();

            var addBtn = $([
                '<div class="lampac-aggregator__item selector lampac-aggregator__item--add">',
                    '<div class="lampac-aggregator__item-icon">' + ICONS['plus'] + '</div>',
                    '<div class="lampac-aggregator__item-details">',
                        '<div class="lampac-aggregator__item-name">Добавить источник</div>',
                        '<div class="lampac-aggregator__item-url">Новый URL Лампака</div>',
                    '</div>',
                '</div>'
            ].join(''));

            addBtn.on('hover:hover hover:focus', function() {
                lastFocusedEl = addBtn;
                scroll.update(addBtn, true);
            });

            addBtn.on('hover:enter', function(e) {
                if (e) { try { e.preventDefault(); e.stopPropagation(); } catch (ex) {} }
                closePopup();
                Lampa.Input.edit({ title: 'URL', value: '', free: true, nomic: true }, function(url) {
                    if (url && url.trim()) Sources.add(url.trim());
                    openAggregatorMenu();
                });
            });

            addBtn.on('hover:long', function(e) {
                if (e) { try { e.preventDefault(); e.stopPropagation(); } catch (ex) {} }
                lampacPopupOpenManage('Источник расширений', [
                    { title: 'Локальные (память)', key: 'mode_local', icon: 'monitor' },
                    { title: 'Установленные из CUB', key: 'mode_cub', icon: 'monitor' },
                    { title: 'Все', key: 'mode_all', icon: 'monitor' }
                ], function(opt) {
                    if (!opt) return;
                    if (opt.key === 'mode_local') return lampacOpenExtensionsPicker('local');
                    if (opt.key === 'mode_cub') return lampacOpenExtensionsPicker('cub');
                    if (opt.key === 'mode_all') return lampacOpenExtensionsPicker('all');
                    lampacSafeToggle('lampac_aggregator', 'content');
                }, 'lampac_aggregator');
            });

            renderOrder();

            $('body').append(popup);
            lampacFitAggregatorScroll(popup, scroll, head, footer);

            var ok_ts = 0;
            var okAction = function() {
                var now = Date.now();
                if (now - ok_ts < 200) return;
                ok_ts = now;

                if (moveMode) {
                    var url = movingUrl;
                    saveOrder();
                    setMoveMode(false);
                    renderOrder();
                    try {
                        Lampa.Controller.collectionSet(popup);
                        if (url && elementsByUrl[url] && elementsByUrl[url].length) {
                            Lampa.Controller.collectionFocus(elementsByUrl[url][0], popup);
                            scroll.update(elementsByUrl[url], true);
                            lastFocusedEl = elementsByUrl[url];
                        }
                    } catch (e) {}
                    setTimeout(function() {
                        try { if (document.getElementById('lampac-aggregator-popup')) Lampa.Controller.toggle('lampac_aggregator'); } catch (e) {}
                    }, 30);
                    ok_ts = 0;
                    return;
                }

                try {
                    var focusedEl = null;
                    if (lastFocusedEl && lastFocusedEl.length && lastFocusedEl[0] && popup && popup[0] && popup[0].contains(lastFocusedEl[0])) {
                        focusedEl = lastFocusedEl[0];
                    }
                    if (!focusedEl && popup && popup[0]) {
                        focusedEl = popup[0].querySelector('.lampac-aggregator__item.selector.focus');
                    }
                    if (!focusedEl && popup && popup[0]) {
                        focusedEl = popup[0].querySelector('.lampac-aggregator__item.selector');
                    }
                    if (!focusedEl) return;

                    var $focused = $(focusedEl);
                    lastFocusedEl = $focused;

                    if (focusedEl.classList && focusedEl.classList.contains('lampac-aggregator__item--add')) {
                        closePopup();
                        Lampa.Input.edit({ title: 'URL', value: '', free: true, nomic: true }, function(url) {
                            if (url && url.trim()) Sources.add(url.trim());
                            openAggregatorMenu();
                        });
                        return;
                    }

                    var srcUrl = '';
                    try { srcUrl = focusedEl.getAttribute('data-source-url') || ''; } catch (e) {}
                    if (srcUrl) {
                        var src = _find(Sources.list(), function(s) { return s && s.url === srcUrl; });
                        if (src) {
                            closePopup();
                            lampacSafeToggle(currentEnabled, 'content');
                            document.body.classList.add('lampac-ui-active');
                            Sources.open(src, movie);
                            return;
                        }
                    }

                    try { $focused.trigger('hover:enter'); } catch (e) {}
                    try { if (Lampa.Utils && Lampa.Utils.trigger) Lampa.Utils.trigger(focusedEl, 'hover:enter'); } catch (e) {}
                } catch (e) {}
            };

            var doBack = function() {
                if (moveMode) {
                    var url = movingUrl;
                    if (originalOrderUrls) orderUrls = originalOrderUrls.slice(0);
                    setMoveMode(false);
                    renderOrder();
                    try {
                        Lampa.Controller.collectionSet(popup);
                        if (url && elementsByUrl[url] && elementsByUrl[url].length) {
                            Lampa.Controller.collectionFocus(elementsByUrl[url][0], popup);
                            scroll.update(elementsByUrl[url], true);
                            lastFocusedEl = elementsByUrl[url];
                        }
                    } catch (e) {}
                    setTimeout(function() {
                        try { if (document.getElementById('lampac-aggregator-popup')) Lampa.Controller.toggle('lampac_aggregator'); } catch (e) {}
                    }, 30);
                    return;
                }
                closePopup();
                lampacSafeToggle(currentEnabled, 'content');
                focusLampacsButton();
            };

            popup.on('click', function(e) {
                if (e && e.target === popup[0]) doBack();
            });

            Lampa.Controller.add('lampac_aggregator', {
                toggle: function() {
                    lampacFitAggregatorScroll(popup, scroll, head, footer);
                    Lampa.Controller.collectionSet(popup);
                    var focusUrl = window._lampac_aggregator_focus_url;
                    var focusItem = focusUrl ? popup.find('.lampac-aggregator__item').filter(function() { return $(this).attr('data-source-url') === focusUrl; }).eq(0) : $();
                    window._lampac_aggregator_focus_url = null;
                    if (moveMode && movingUrl && elementsByUrl[movingUrl] && elementsByUrl[movingUrl].length) focusItem = elementsByUrl[movingUrl];
                    if (!focusItem.length) focusItem = popup.find('.last-active');
                    if (!focusItem.length) focusItem = popup.find('.selector').eq(0);
                    lastFocusedEl = focusItem && focusItem.length ? $(focusItem[0]) : null;
                    Lampa.Controller.collectionFocus(focusItem[0], popup);
                },
                enter: okAction,
                finish: okAction,
                up: function() { if (moveMode) moveStep('up'); else navMove('up'); },
                down: function() { if (moveMode) moveStep('down'); else navMove('down'); },
                left: function() { if (moveMode) moveStep('left'); else navMove('left'); },
                right: function() { if (moveMode) moveStep('right'); else navMove('right'); },
                back: doBack
            });

            lampacSafeToggle('lampac_aggregator', 'content');
        };

        // --- 4. CUSTOMIZATION & LOGO ---
        var originalSelectShow = Lampa.Select.show; 
        Lampa.Select.show = function (params) { 
            if (params && params.items) { 
                params.items.forEach(function (item) { 
                    var url = item.pluginUrl || item.url || (item.data ? item.data.url : ''); 
                    var comp = item.component;
                    // Omnivorous: If it's a known mapped name or has a URL but no component, fix it
                    if (url && (!comp || window._lampac_name_mapping[comp] || comp.indexOf('plugin_') !== 0)) {
                        item.component = urlToComponentName(url);
                    } else if (comp && window._lampac_name_mapping[comp]) {
                        item.component = window._lampac_name_mapping[comp];
                    }
                    
                    if (item.component && item.component.indexOf('plugin_') === 0) { 
                        var cleanTitle = (item.title || '').replace(/<[^>]*>/g, '').trim(); 
                        item.title = Custom.get(item.component, 'names', cleanTitle); 
                        var iconKey = Custom.get(item.component, 'icons', 'play-circle'); 
                        if (ICONS[iconKey]) { item.icon = ICONS[iconKey]; item.template = 'selectbox_icon'; } 
                    } 
                }); 
                var originalOnLong = params.onLong; 
                params.onLong = function (item, el) { 
                    var id = item.component; 
                    if (!id || id.indexOf('plugin_') !== 0) { if (originalOnLong) originalOnLong(item, el); return; } 
                    Lampa.Select.show({ 
                        title: 'Настройка: ' + (item.title || '').replace(/<[^>]*>/g, '').trim(), 
                        items: [{ title: 'Переименовать', rename: true }, { title: 'Сменить иконку', change_icon: true }, { title: 'Сбросить', reset: true }], 
                        onBack: function() { Lampa.Controller.toggle('select'); },
                        onSelect: function (a) { 
                            if (a.rename) { Lampa.Input.edit({ title: 'Имя', value: (item.title || '').replace(/<[^>]*>/g, '').trim(), free: true }, function (v) { if (v && v.trim()) { Custom.set(id, 'names', v.trim()); Lampa.Noty.show('Сохранено'); } Lampa.Controller.toggle('select'); }); } 
                            else if (a.change_icon) { var iconsList = []; for (var k in ICONS) iconsList.push({ title: k, icon: ICONS[k], iconKey: k, template: 'selectbox_icon' }); Lampa.Select.show({ title: 'Иконка', items: iconsList, onBack: function() { Lampa.Controller.toggle('select'); }, onSelect: function (i) { Custom.set(id, 'icons', i.iconKey); Lampa.Noty.show('Иконка изменена'); Lampa.Controller.toggle('select'); } }); } 
                            else if (a.reset) { Custom.set(id, 'names', null); Custom.set(id, 'icons', null); Lampa.Noty.show('Сброшено'); Lampa.Controller.toggle('select'); } 
                        } 
                    }); 
                }; 
            } 
            return originalSelectShow.call(this, params); 
        }; 

        var originalFilter = Lampa.Filter; 
        Lampa.Filter = function (params) { 
            var instance = new originalFilter(params); 
            var originalSet = instance.set; 
            instance.set = function (type, items) { 
                originalSet.call(instance, type, items); 
                var activity = Lampa.Activity.active(); 
                var controller = Lampa.Controller.enabled() ? Lampa.Controller.enabled().name : '';
                var isSearchActive = controller === 'search' || controller === 'keyboard' || document.body.classList.contains('with--search');
                
                // Omnivorous: Check if current activity is a plugin and search is NOT active
                if (!isSearchActive && activity && activity.component && activity.component.indexOf('plugin_') === 0) { 
                    setTimeout(function () {
                        var ensureFixedSidebar = function() {
                            var sb = document.getElementById('lampac-ui-fixed-sidebar');
                            if (!sb) {
                                sb = document.createElement('div');
                                sb.id = 'lampac-ui-fixed-sidebar';
                                sb.innerHTML = '<div class="lampac-ui-fixed-inner"><div class="lampac-ui-fixed-logo selector"></div><div class="lampac-ui-fixed-meta"></div><div class="lampac-ui-fixed-filters"></div></div>';
                                document.body.appendChild(sb);
                            }

                            if (!window._lampacUiFixedSidebarSync) {
                                window._lampacUiFixedSidebarSync = { running: false };
                            }
                            
                            var syncState = window._lampacUiFixedSidebarSync;
                            if (!syncState.running) {
                                syncState.running = true;
                                (function tick() {
                                    try {
                                        var cur = document.getElementById('lampac-ui-fixed-sidebar');
                                        var controller = Lampa.Controller.enabled() ? Lampa.Controller.enabled().name : '';
                                        var isSearchActive = controller === 'search' || controller === 'keyboard' || document.body.classList.contains('with--search') || !!document.querySelector('.search, .keyboard');
                                        
                                        if (!cur || !document.body.classList.contains('lampac-ui-with-filters') || isSearchActive) {
                                            if (cur && isSearchActive) cur.style.display = 'none';
                                            if (isSearchActive) Backdrop.hide(true);
                                            if (!cur || !document.body.classList.contains('lampac-ui-with-filters')) {
                                                if (cur) { cur.style.display = 'none'; cur.remove(); }
                                                syncState.running = false;
                                                return;
                                            }
                                            requestAnimationFrame(tick);
                                            return;
                                        }

                                        var isPlayer = false;
                                        try { isPlayer = !!(window.Lampa && Lampa.Player && Lampa.Player.opened && Lampa.Player.opened()); } catch (e) {}
                                        if (isPlayer) {
                                            cur.style.display = 'none';
                                            requestAnimationFrame(tick);
                                            return;
                                        }

                                        var anchor = document.querySelector('.online__info-left, .info__left, .full-descr__left, .explorer__left, .explorer-card__descr, .online__descr, .online-descr');
                                        
                                        if (cur.parentNode !== document.body) {
                                            document.body.appendChild(cur);
                                        }

                                        if (anchor && anchor.getBoundingClientRect) {
                                            var r = anchor.getBoundingClientRect();
                                            var top = Math.round(r.top);
                                            var left = Math.round(r.left);
                                            
                                            var btns = document.querySelector('.full-start-new__buttons, .full-start__buttons, .info__buttons, .online__buttons, .movie-full__buttons, .full-descr__buttons, .full-start-new__actions, .full-start__actions');
                                            if (btns && btns.getBoundingClientRect) {
                                                var br = btns.getBoundingClientRect();
                                                if (br && br.top > 0 && br.top < window.innerHeight) {
                                                    top = Math.round((top + (Math.round(br.top) - 10)) / 2);
                                                }
                                            }
                                            
                                            if (top > window.innerHeight * 0.1) top = Math.round(window.innerHeight * 0.1);
                                            if (top < 5) top = 5;

                                            cur.style.display = 'block';
                                            cur.style.top = top + 'px';
                                            cur.style.left = left + 'px';
                                            cur.style.width = Math.max(200, Math.round(r.width)) + 'px';
                                            cur.style.height = 'calc(100vh - ' + top + 'px)';
                                        } else {
                                            cur.style.display = 'none';
                                        }
                                    } catch (e) {}
                                    
                                    requestAnimationFrame(tick);
                                })();
                            }

                            return sb;
                        };

                        var syncFixedSidebarPosition = function(anchorEl) {
                            var sb = ensureFixedSidebar();
                            var isMobile = document.body.classList.contains('true--mobile');
                            if (isMobile) {
                                var mobAnchor = document.querySelector('.full-start, .full-descr, .online, .movie-full');
                                if (mobAnchor) {
                                    if (sb.parentNode !== mobAnchor) mobAnchor.insertBefore(sb, mobAnchor.firstChild);
                                } else if (sb.parentNode !== document.body) {
                                    document.body.appendChild(sb);
                                }
                                sb.style.position = 'relative'; sb.style.top = '0'; sb.style.left = '0'; 
                                sb.style.width = '100%'; sb.style.height = 'auto'; sb.style.display = 'block';
                            } else {
                                if (sb.parentNode !== document.body) document.body.appendChild(sb);
                                if (anchorEl && anchorEl.getBoundingClientRect) {
                                    var r = anchorEl.getBoundingClientRect();
                                    var top = Math.max(0, Math.round(r.top));
                                    var left = Math.max(0, Math.round(r.left));
                                    
                                    var btns = document.querySelector('.full-start-new__buttons, .full-start__buttons, .info__buttons, .online__buttons, .movie-full__buttons, .full-descr__buttons, .full-start-new__actions, .full-start__actions');
                                    if (btns && btns.getBoundingClientRect) {
                                        var br = btns.getBoundingClientRect();
                                        if (br && br.top > 0 && br.top < window.innerHeight) {
                                            top = Math.round((top + (Math.round(br.top) - 10)) / 2);
                                        }
                                    }
                                    
                                    if (top > window.innerHeight * 0.1) top = Math.round(window.innerHeight * 0.1);
                                    if (top < 5) top = 5;
                                    sb.style.position = 'fixed';
                                    sb.style.top = top + 'px';
                                    sb.style.left = left + 'px';
                                    sb.style.width = Math.max(0, Math.round(r.width)) + 'px';
                                    sb.style.height = 'calc(100vh - ' + top + 'px)';
                                }
                            }
                            return sb;
                        };

                        var setFixedLogo = function(movie, mType, logoPath, fallbackText) {
                            var sb = ensureFixedSidebar();
                            var logoEl = sb.querySelector('.lampac-ui-fixed-logo');
                            if (!logoEl) return;
                            
                            var currentKey = logoEl.getAttribute('data-logo-key') || '';
                            var newKey = (logoPath || fallbackText || '') + (movie ? movie.id : '');
                            
                            if (currentKey === newKey && logoEl.innerHTML !== '') return;
                            
                            var cls = 'lampac-ui-fixed-logo selector ' + (logoPath ? 'lampac-logo-container' : 'lampac-text-title');
                            if (logoEl.className !== cls) logoEl.className = cls;
                            logoEl.innerHTML = '';
                            logoEl.setAttribute('data-logo-key', newKey);
                            
                            if (logoPath) {
                                var img = document.createElement('img');
                                img.src = Lampa.TMDB.image('t/p/w400' + logoPath);
                                logoEl.appendChild(img);
                            } else {
                                logoEl.textContent = fallbackText || '';
                            }
                            
                            var $logo = $(logoEl);
                            $logo.off('.lampacui');
                            var openMovie = function(e) { 
                                if (e) {
                                    if (typeof e.preventDefault === 'function') e.preventDefault();
                                    if (typeof e.stopPropagation === 'function') e.stopPropagation();
                                }
                                try { 
                                    var card = movie;
                                    if (!card || !card.id) {
                                        var act = Lampa.Activity.active();
                                        card = (act && act.card) || (act && (act.activity && act.activity.object)) || (act && act.object);
                                    }
                                    
                                    if (card && card.id) {
                                         var type = card.name ? 'tv' : 'movie';
                                         console.log('[LampacUI] Opening movie:', card.id, type);
                                         
                                         Lampa.Activity.push({ 
                                             url: '', 
                                             component: 'full', 
                                             id: card.id, 
                                             method: type, 
                                             card: card 
                                         }); 
                                         
                                         setTimeout(function() {
                                             Lampa.Controller.toggle('full');
                                         }, 10);
                                     } else {
                                        console.log('[LampacUI] No movie data to open');
                                    }
                                } catch (ex2) {
                                    console.log('[LampacUI] Logo click error:', ex2);
                                } 
                            };
                            $logo.on('hover:enter.lampacui click.lampacui', openMovie);
                            $logo.on('hover:focus.lampacui', function() { logoEl.classList.add('focus'); });
                            $logo.on('hover:blur.lampacui', function() { logoEl.classList.remove('focus'); });
                            window._lampacCurrentLogo = $logo;
                            window._lampacCurrentLogoEl = logoEl;

                            $logo.on('hover:right.lampacui', function(e) {
                                try {
                                    var sb2 = document.getElementById('lampac-ui-fixed-sidebar');
                                    if (!sb2) return;
                                    var toFocusEl = sb2.querySelector('.lampac-filter-item.selected') || sb2.querySelector('.lampac-filter-item');
                                    if (!toFocusEl) return;
                                    if (e && e.preventDefault) e.preventDefault();
                                    if (e && e.stopPropagation) e.stopPropagation();
                                    Lampa.Controller.focus($(toFocusEl));
                                } catch (ex) {}
                            });
                        };
                        
                        var setFixedGenres = function(text) {
                            var sb = ensureFixedSidebar();
                            var metaEl = sb.querySelector('.lampac-ui-fixed-meta');
                            if (!metaEl) return;
                            var t = text || '';
                            if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
                            metaEl.textContent = t;
                        };

                        var head = document.querySelector('.explorer-card__head'); if (head) head.style.display = 'none'; 
                        var titleSelectors = ['.info__title', '.online__title', '.explorer-card__title', 'h1', 'h2']; 
                        var titleElement = null; for (var ts = 0; ts < titleSelectors.length; ts++) { titleElement = document.querySelector(titleSelectors[ts]); if (titleElement && titleElement.textContent.trim().length > 0) break; } 
                        var movie = (activity.activity && activity.activity.object) ? (activity.activity.object.movie || activity.activity.object.card || activity.activity.object) : (activity.movie || activity.card || activity.object);
                        if (movie && movie.id) { 
                            Backdrop.fromMovie(movie);
                            var mType = (movie.name || movie.title) ? (movie.name ? 'tv' : 'movie') : 'movie'; 
                            var imagesUrl = Lampa.TMDB.api(mType + '/' + movie.id + '/images?api_key=' + Lampa.TMDB.key() + '&include_image_language=ru,en,null'); 
                            $.getJSON(imagesUrl, function (data) { 
                                 var backdrop = data.backdrops && (data.backdrops[1] || data.backdrops[0]);
                                 if (backdrop && Lampa.Storage.get('lampac_ui_side_backdrop', '1') == '1') {
                                     var bgUrl = Lampa.TMDB.image('t/p/w1280' + backdrop.file_path);
                                     Backdrop.show(bgUrl);
                                 }
                                 if (Lampa.Storage.get('lampac_ui_custom_logos', '1') == '1') {
                                     var logosForFixed = data.logos || [];
                                     var fixedLogo = _find(logosForFixed, function(l){ return l.iso_639_1 === 'ru'; }) || _find(logosForFixed, function(l){ return l.iso_639_1 === 'en'; }) || logosForFixed[0];
                                     if (fixedLogo) {
                                         setFixedLogo(movie, mType, fixedLogo.file_path, (movie.name || movie.title || movie.original_name || movie.original_title || (titleElement ? titleElement.textContent : '')));
                                     }
                                 }
                            }); 
                            
                            var currentLogoKey = window._lampacCurrentLogoEl ? window._lampacCurrentLogoEl.getAttribute('data-logo-key') : '';
                            var hasImageLogo = window._lampacCurrentLogoEl && window._lampacCurrentLogoEl.classList.contains('lampac-logo-container');
                            var sameMovie = currentLogoKey && currentLogoKey.indexOf(movie.id) !== -1;

                            if (!hasImageLogo || !sameMovie) {
                                setFixedLogo(movie, mType, null, (movie.name || movie.title || movie.original_name || movie.original_title || (titleElement ? titleElement.textContent : '')));
                            }
                        } 
                        if (type === 'filter' && items && items.length >= 1) { 
                            var descBlock = document.querySelector('.explorer-card__descr, .online__info-left, .info__left, .online__descr, .online-descr'); 
                            if (descBlock) { 
                                var sidebar = syncFixedSidebarPosition(descBlock);
                                var fixedFilters = sidebar.querySelector('.lampac-ui-fixed-filters');
                                if (!fixedFilters) return;
                                fixedFilters.innerHTML = '';
                                
                                var genresText = '';
                                if (movie && movie.genres && movie.genres.length) {
                                    try { genresText = movie.genres.map(function(g){ return g.name; }).filter(function(n){ return !!n; }).join(', '); } catch(e) {}
                                }
                                setFixedGenres(genresText);
                                
                                if (descBlock.getAttribute('data-filters-replaced') === 'true') { 
                                    var old = descBlock.querySelector('.lampac-filters-container'); 
                                    if (old) old.remove(); 
                                } else { 
                                    descBlock.setAttribute('data-filters-replaced', 'true'); 
                                } 
                                var container = document.createElement('div'); 
                                 container.className = 'lampac-filters-container'; 
                                 try { container.style.fontSize = window.getComputedStyle(document.body).fontSize; } catch(e) {}
                                 fixedFilters.appendChild(container); 
                                 document.body.classList.add('lampac-ui-active'); 
                                 document.body.classList.add('lampac-ui-with-filters'); // Добавляем новый класс
                                 
                                 var seasonGroup = _find(items, function(i) { return i.title && (i.title.toLowerCase().indexOf('сезон') !== -1 || i.title.toLowerCase().indexOf('season') !== -1); }); 
                                var otherGroups = items.filter(function(i) { return i !== seasonGroup; }); 
                                var columnsElements = []; 
                                var createColumn = function(group, isSeason, colIndex) { 
                                    if (!group || !group.items || group.items.length === 0) return null; 
                                    var col = document.createElement('div'); col.className = 'lampac-filter-column ' + (isSeason ? 'lampac-season-column' : 'lampac-other-column'); 
                                    var t = document.createElement('div'); t.className = 'lampac-filter-group-title'; t.textContent = group.title || (isSeason ? 'Сезоны' : 'Озвучка'); col.appendChild(t); 
                                    var g = document.createElement('div'); g.className = 'lampac-filter-group'; col.appendChild(g); 
                                    var colElements = []; 
                                    group.items.forEach(function(sub) { 
                                        var item = document.createElement('div'); item.className = 'lampac-filter-item selector' + (sub.selected ? ' selected' : ''); 
                                        var txt = sub.title || ''; 
                                        if (isSeason) { var m = txt.match(/\d+/); if (m) txt = m[0]; } else if (txt.length > 25) txt = txt.substring(0, 24) + '...';
                                        item.textContent = txt; 
                                        var $item = $(item); 
                                        $item.off('.lampacui');
                                        $item.on('hover:focus.lampacui', function() { var r = item.getBoundingClientRect(); var cr = g.getBoundingClientRect(); g.scrollTop = (r.top - cr.top + g.scrollTop + (r.height / 2)) - (cr.height / 2); }); 
                                        var doSelect = function() { group.items.forEach(function(i) { i.selected = false; }); sub.selected = true; try { instance.onSelect('filter', group, sub); } catch(e) {} };
                                        $item.on('hover:enter.lampacui', doSelect);
                                        $item.on('click.lampacui', function(e) { e.preventDefault(); e.stopPropagation(); doSelect(); });
                                        $item.on('hover:left.lampacui', function(e) { if (colIndex === 0) { if (window._lampacCurrentLogoEl) { e.preventDefault(); e.stopPropagation(); Lampa.Controller.focus($(window._lampacCurrentLogoEl)); } } else { e.preventDefault(); e.stopPropagation(); var prevCol = columnsElements[colIndex - 1]; var toFocus = _find(prevCol, function(el) { return el.classList.contains('selected'); }) || prevCol[0]; Lampa.Controller.focus($(toFocus)); } }); 
                                        $item.on('hover:right.lampacui', function(e) { if (colIndex < columnsElements.length - 1) { e.preventDefault(); e.stopPropagation(); var nextCol = columnsElements[colIndex + 1]; var toFocus = _find(nextCol, function(el) { return el.classList.contains('selected'); }) || nextCol[0]; Lampa.Controller.focus($(toFocus)); } }); 
                                        g.appendChild(item); colElements.push(item); 
                                    }); 
                                    columnsElements[colIndex] = colElements; return col; 
                                }; 
                                if (seasonGroup) { var sCol = createColumn(seasonGroup, true, 0); if (sCol) container.appendChild(sCol); } 
                                otherGroups.forEach(function(og, idx) { var oCol = createColumn(og, false, seasonGroup ? idx + 1 : idx); if (oCol) container.appendChild(oCol); }); 
                                setTimeout(function() { 
                                    var all = []; 
                                    columnsElements.forEach(function(c) { all = all.concat(c); }); 
                                    try { 
                                        var sbx = document.getElementById('lampac-ui-fixed-sidebar');
                                        var lg = sbx ? sbx.querySelector('.lampac-ui-fixed-logo') : null;
                                        if (lg) {
                                            all.unshift(lg);
                                            var $lg = $(lg);
                                            $lg.on('hover:right.lampacui', function(e) {
                                                try {
                                                    var toFocus = null;
                                                    if (columnsElements.length > 0) {
                                                        var firstCol = columnsElements[0];
                                                        toFocus = _find(firstCol, function(el) { return el.classList.contains('selected'); }) || firstCol[0];
                                                    }
                                                    if (!toFocus) {
                                                        toFocus = document.querySelector('.lampac-filter-item');
                                                    }
                                                    if (toFocus) {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        Lampa.Controller.focus($(toFocus));
                                                    }
                                                } catch(ex) {}
                                            });
                                            $lg.on('hover:left.lampacui', function(e) {
                                                try {
                                                    var menuOpen = document.querySelector('.menu') && document.querySelector('.menu').offsetParent !== null;
                                                    if (menuOpen) return;
                                                } catch(ex) {}
                                            });
                                        }
                                    } catch (e) {}
                                    if (all.length > 0) {
                                        window._lampacSidebarElements = all;
                                        Lampa.Controller.collectionAppend(all);
                                    } 
                                }, 100); 
                                
                                var hideOrig = Lampa.Storage.get('lampac_ui_hide_standard_filter', '1') == '1';
                                var filterButton = document.querySelector('.filter--filter'); 
                                if (filterButton) { 
                                    if (hideOrig) {
                                        filterButton.style.display = 'none'; 
                                        filterButton.classList.remove('selector'); 
                                    } else {
                                        filterButton.style.display = ''; 
                                        filterButton.classList.add('selector'); 
                                    }
                                } 
                            } 
                        } 
                    }, 200); 
                } 
            }; 
            return instance; 
        }; 
        for (var k in originalFilter) Lampa.Filter[k] = originalFilter[k]; 

        // --- 5. SETTINGS COMPONENT ---
        if (Lampa.SettingsApi) {
            Lampa.SettingsApi.addComponent({ component: 'lampac_ui', name: 'Lampacs UI', icon: ICONS['zap'] });
            Lampa.SettingsApi.addParam({ component: 'lampac_ui', param: { name: 'lampac_ui_side_backdrop', type: 'select', values: { 1: 'Вкл', 0: 'Выкл' }, default: '1' }, field: { name: 'Боковой задник', description: 'Отображать второй Backdrop в карточке фильма' } });
            Lampa.SettingsApi.addParam({ component: 'lampac_ui', param: { name: 'lampac_ui_custom_logos', type: 'select', values: { 1: 'Вкл', 0: 'Выкл' }, default: '1' }, field: { name: 'Кастомные логотипы', description: 'Заменять текстовые заголовки на графические логотипы' } });
            Lampa.SettingsApi.addParam({ component: 'lampac_ui', param: { name: 'lampac_ui_global_quality', type: 'select', values: { 1: 'Вкл', 0: 'Выкл' }, default: '1' }, field: { name: 'Качество на карточках', description: 'Отображать качество (4K, WEBDL и др.) на всех карточках' } });
            Lampa.SettingsApi.addParam({ component: 'lampac_ui', param: { name: 'lampac_ui_content_badges', type: 'select', values: { 1: 'Вкл', 0: 'Выкл' }, default: '1' }, field: { name: 'Плашки типа контента', description: 'Отображать тип контента (Фильм, Сериал и др.) на карточках' } });
            Lampa.SettingsApi.addParam({ component: 'lampac_ui', param: { name: 'lampac_ui_hide_standard_filter', type: 'select', values: { 1: 'Скрывать', 0: 'Показывать' }, default: '1' }, field: { name: 'Стандартная кнопка фильтра', description: 'Скрывать стандартную кнопку фильтра Лампы при работе плагина' } });
            Lampa.SettingsApi.addParam({ component: 'lampac_ui', param: { name: 'lampac_ui_disable_dmca', type: 'select', values: { 1: 'Выключить', 0: 'Включить' }, default: '1' }, field: { name: 'DMCA Блокировка', description: 'Отключить фильтрацию контента по требованию правообладателей' } });
            Lampa.SettingsApi.addParam({ component: 'lampac_ui', param: { name: 'lampac_ui_disable_ads_premium', type: 'select', values: { 1: 'Выключить', 0: 'Включить' }, default: '1' }, field: { name: 'CUB Premium & Реклама', description: 'Активировать премиум функции и отключить встроенную рекламу' } });
            Lampa.SettingsApi.addParam({ component: 'lampac_ui', param: { name: 'lampac_ui_spoof_origin_mode', type: 'select', values: { 'bylampa': 'bylampa', 'lampa': 'lampa', 'cub': 'cub', 'custom': 'Свой вариант' }, default: 'bylampa' }, field: { name: 'Тип Origin (Обход защиты)', description: 'Подмена системного ID для работы заблокированных плагинов' } });
            Lampa.SettingsApi.addParam({ component: 'lampac_ui', param: { name: 'lampac_ui_spoof_origin_custom', type: 'input', values: {}, default: '' }, field: { name: 'Свой Origin', description: 'Введите текст подмены (если выбран "Свой вариант" выше)' } });
            Lampa.SettingsApi.addParam({ component: 'lampac_ui', param: { name: 'lampac_ui_auth_spoof', type: 'select', values: { 1: 'Включить', 0: 'Выключить' }, default: '0' }, field: { name: 'Обход авторизации Lampac', description: 'Попытаться обойти ограничение доступа (accsdb) на сторонних серверах' } });
            Lampa.Settings.listener.follow('open', function (e) {
                if (e.name === 'main') {
                    setTimeout(function() {
                        var body = e.body || e.render || e.html;
                        if (body && body.find) {
                            var menu = body.find('.settings-main');
                            var ourItem = menu.find('[data-component="lampac_ui"]');
                            if (ourItem.length) menu.prepend(ourItem);
                        }
                    }, 10);
                }
            });
        }

        var fixDOM = function() {
            var active = Lampa.Activity.active();
            var activeComp = active ? active.component : '';
            var controller = Lampa.Controller.enabled() ? Lampa.Controller.enabled().name : '';
            var isSearchActive = controller === 'search' || controller === 'keyboard' || document.body.classList.contains('with--search') || !!document.querySelector('.search, .keyboard');
            var isSettingsActive = controller === 'settings' || document.body.classList.contains('with--settings');

            var sb = document.getElementById('lampac-ui-fixed-sidebar');
            var sideBg = document.getElementById('lampac-side-backdrop');

            if (isSearchActive || isSettingsActive) {
                if (sb) sb.style.display = 'none';
                Backdrop.hide(true);
                return;
            }
            
            try {
                if (Lampa.Storage.get('lampac_ui_side_backdrop', '1') === '1' && window._lampacSideBackdropUrl) {
                    if (!sideBg || (!sideBg.classList.contains('visible') && !sideBg._lampac_pending)) {
                        Backdrop.show(window._lampacSideBackdropUrl);
                    }
                }
            } catch (e) {}

            if (activeComp && activeComp.indexOf('plugin_') === -1 && activeComp !== 'full' && activeComp !== 'online' && activeComp !== 'lampac') {
                window._lampacSidebarElements = [];
            }

            var hideOrig = Lampa.Storage.get('lampac_ui_hide_standard_filter', '1') == '1';
            var filterButton = document.querySelector('.filter--filter');
            if (filterButton) {
                if (hideOrig && document.body.classList.contains('lampac-ui-with-filters')) {
                    filterButton.style.display = 'none';
                    filterButton.classList.remove('selector');
                } else {
                    filterButton.style.display = '';
                    filterButton.classList.add('selector');
                }
            }

            var containers = ['.full-start-new__buttons', '.full-start__buttons', '.info__buttons', '.online__buttons', '.movie-full__buttons', '.full-descr__buttons', '.full-start'];
            containers.forEach(function(selector) {
                var buttons = $(selector);
                if (buttons.length && !buttons.find('.button--lampac').length) {
                    var btnName = Lampa.Storage.get('lampac_button_name', 'Lampacs');
                    var btnIconKey = Lampa.Storage.get('lampac_button_icon', 'zap');
                    var btnIcon = ICONS[btnIconKey];
                    
                    if (!btnIcon && btnIconKey && btnIconKey.indexOf('<svg') === 0) {
                        btnIcon = btnIconKey; // Поддержка сырого SVG из Storage
                    }
                    if (!btnIcon) btnIcon = ICONS['zap'];

                    var btn = $('<div class="full-start__button selector button--lampac">' + btnIcon + '<span>' + btnName + '</span></div>');
                    btn.on('hover:enter click', function(e) { e.preventDefault(); e.stopPropagation(); openAggregatorMenu(); });
                    btn.on('hover:long', function(e) {
                        if (e) { try { e.preventDefault(); e.stopPropagation(); } catch (ex) {} }

                        var currentEnabled = (Lampa.Controller.enabled && Lampa.Controller.enabled()) ? Lampa.Controller.enabled().name : 'content';

                        lampacPopupOpenManage('Настройка кнопки', [
                            { title: 'Переименовать', key: 'rename', icon: 'edit' },
                            { title: 'Сменить иконку', key: 'change_icon', icon: 'settings' },
                            { title: 'Сбросить', key: 'reset', icon: 'refresh' }
                        ], function(a) {
                            if (a.key === 'rename') {
                                Lampa.Input.edit({title: 'Имя кнопки', value: btnName, free: true}, function(v) {
                                    if (v && v.trim()) {
                                        Lampa.Storage.set('lampac_button_name', v.trim());
                                        Lampa.Noty.show('Переименовано. Обновите страницу.');
                                    }
                                    lampacSafeToggle(currentEnabled, 'content');
                                });
                            }
                            else if (a.key === 'change_icon') {
                                lampacPopupOpenIcons(function(iconKey) {
                                    Lampa.Storage.set('lampac_button_icon', iconKey);
                                    Lampa.Noty.show('Иконка изменена. Обновите страницу.');
                                    lampacSafeToggle(currentEnabled, 'content');
                                }, currentEnabled);
                            }
                            else if (a.key === 'reset') {
                                var active = Lampa.Activity.active();
                                var movie = (active.activity && active.activity.object) ? (active.activity.object.card || active.activity.object.movie || active.activity.object) : (active.card || active.movie || active.object);
                                var pluginInfo = Lampa.Storage.get('lampac_plugin_info', {});
                                var lastPluginId = movie ? pluginInfo[movie.id] : null;
                                var source = null;

                                if (lastPluginId) {
                                    source = _find(Sources.list(), function(s) { return urlToComponentName(s.url) === lastPluginId; });
                                }
                                if (!source && Sources.list().length) source = Sources.list()[0];

                                if (source) {
                                    var id = urlToComponentName(source.url);
                                    var defName = Custom.get(id, 'default_names') || source.name || 'Lampac';
                                    var defIcon = Custom.get(id, 'default_icons') || 'zap';

                                    Lampa.Storage.set('lampac_button_name', defName);
                                    Lampa.Storage.set('lampac_button_icon', defIcon);
                                    Lampa.Noty.show('Сброшено к оригиналу (' + defName + '). Обновите страницу.');
                                } else {
                                    Lampa.Storage.set('lampac_button_name', 'Lampacs');
                                    Lampa.Storage.set('lampac_button_icon', 'zap');
                                    Lampa.Noty.show('Сброшено. Обновите страницу.');
                                }
                                lampacSafeToggle(currentEnabled, 'content');
                            }
                        }, currentEnabled);
                    });
                    if (selector === '.full-start') buttons.append(btn); else buttons.prepend(btn);
                    
                    var activeName = Lampa.Controller.enabled().name;
                    if (activeName === 'full_start' || activeName === 'full_descr' || activeName === 'info') lampacSafeToggle(activeName, 'content');
                }
            });

            $('.selector[data-component]').each(function() {
                var $el = $(this);
                var comp = $el.attr('data-component');
                if (comp && CORE_COMPONENTS.indexOf(comp) === -1) {
                    if ($el.attr('data-lampac-fixed')) return;
                    var url = $el.attr('data-url') || $el.data('url') || $el.attr('data-plugin') || '';
                    if (!url) { var parent = $el.closest('[data-url]'); if (parent.length) url = parent.attr('data-url'); }
                    
                    if (url) { 
                        $el.attr('data-component', urlToComponentName(url)); 
                        $el.attr('data-lampac-fixed', 'true'); 
                    } else if (window._lampac_name_mapping[comp]) {
                        $el.attr('data-component', window._lampac_name_mapping[comp]);
                        $el.attr('data-lampac-fixed', 'true');
                    }
                }
            });

            _lampacBindLeftToSidebar();

            if (sideBg) {
                var activeCompCheck = active ? (active.component || active.name || '') : '';
                var isPluginPage = activeCompCheck && (CORE_COMPONENTS.indexOf(activeCompCheck) === -1 || activeCompCheck.indexOf('plugin_') === 0 || activeCompCheck === 'online' || activeCompCheck === 'lampac' || activeCompCheck === 'dampac' || activeCompCheck === 'vokino');
                if (!isPluginPage || activeCompCheck === 'full' || isSearchActive || isSettingsActive || Lampa.Storage.get('lampac_ui_side_backdrop', '1') === '0') Backdrop.hide();
                else {
                    if (sideBg.style.backgroundImage && sideBg.style.backgroundImage !== 'none') {
                        sideBg.style.display = 'block';
                        sideBg.classList.add('visible');
                    }
                }
            }

            // Очищаем состояние плагина при выходе из него
            var activeCompClean = Lampa.Activity.active() ? Lampa.Activity.active().component : '';
            if (activeCompClean && activeCompClean.indexOf('plugin_') !== 0 && activeCompClean !== 'online' && activeCompClean !== 'lampac' && activeCompClean !== 'full') {
                _lampacCleanupSidebar();
            }
        };

        // Подписываемся на события рендера, чтобы вставлять кнопку мгновенно
        if (window.Lampa && Lampa.Listener) {
            Lampa.Listener.follow('activity', function(e) {
                if (e.type === 'destroy') {
                    _lampacCleanupSidebar();
                } else if (e.type === 'render' || e.type === 'append' || e.type === 'ready') {
                    if (e.component === 'full') {
                        _lampacCleanupSidebar();
                        fixDOM();
                        setTimeout(fixDOM, 50);
                        setTimeout(fixDOM, 200);
                        setTimeout(fixDOM, 500);
                    } else if (e.component === 'online' || e.component === 'lampac') {
                        fixDOM();
                        setTimeout(fixDOM, 50);
                        setTimeout(fixDOM, 200);
                        setTimeout(fixDOM, 500);
                    } else if (e.component && e.component.indexOf('plugin_') === 0) {
                        fixDOM();
                    } else {
                        _lampacCleanupSidebar();
                    }
                }
            });
        }

        setInterval(fixDOM, 1000); 
    } 
 
    startPlugin(); 
})();
