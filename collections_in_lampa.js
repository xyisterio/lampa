(function () {
    'use strict';

    function Collection(data) {
        this.data = data;

        function remove(elem) {
            if (elem) elem.remove();
        }

        this.build = function () {
            this.item = Lampa.Template.js('cub_collection');
            this.img = this.item.find('.card__img');
            this.icon = this.item.find('.cub-collection-card__user-icon img');
            this.item.find('.card__title').text(Lampa.Utils.capitalizeFirstLetter(data.title));
            this.item.find('.cub-collection-card__items').text(data.items_count);
            this.item.find('.cub-collection-card__date').text(Lampa.Utils.parseTime(data.time).full);
            this.item.find('.cub-collection-card__views').text(Lampa.Utils.bigNumberToShort(data.views));
            this.item.find('.full-review__like-counter').text(Lampa.Utils.bigNumberToShort(data.liked));
            this.item.find('.cub-collection-card__user-name').text(data.username);
            this.item.addEventListener('visible', this.visible.bind(this));
        };

        this.image = function () {
            var _this = this;

            this.img.onload = function () {
                _this.item.classList.add('card--loaded');
            };

            this.img.onerror = function () {
                _this.img.src = './img/img_load.svg';
            };

            this.icon.onload = function () {
                _this.item.find('.cub-collection-card__user-icon').classList.add('loaded');
            };

            this.icon.onerror = function () {
                _this.icon.src = './img/img_load.svg';
            };
        };

        this.create = function () {
            var _this2 = this;

            this.build();
            this.item.addEventListener('hover:focus', function () {
                if (_this2.onFocus) _this2.onFocus(_this2.item, data);
            });
            this.item.addEventListener('hover:touch', function () {
                if (_this2.onTouch) _this2.onTouch(_this2.item, data);
            });
            this.item.addEventListener('hover:hover', function () {
                if (_this2.onHover) _this2.onHover(_this2.item, data);
            });
            this.item.addEventListener('hover:enter', function () {
                Lampa.Activity.push({
                    url: data.id,
                    collection: data,
                    title: Lampa.Utils.capitalizeFirstLetter(data.title),
                    component: 'cub_collections_in_lampa_view',
                    page: 1
                });
            });
            this.item.addEventListener('hover:long', function () {
                Lampa.Loading.start(function () {
                    Api.clear();
                    Lampa.Loading.stop();
                    Lampa.Controller.toggle('content');
                });
                Api.status(data, function (status) {
                    Lampa.Loading.stop();
                    var items = [];
                    var voited = Lampa.Storage.cache('collections_voited', 100, []);
                    var user = Lampa.Storage.get('account', '{}');
                    var is_owner = user && user.id && user.id == data.cid;
                    items.push({
                        title: 'Коллекции @' + data.username,
                        onSelect: function onSelect() {
                            Lampa.Activity.push({
                                url: 'user_' + data.cid,
                                title: 'Коллекции @' + data.username,
                                component: 'cub_collections_in_lampa_collection',
                                page: 1
                            });
                            Lampa.Controller.toggle('content');
                        }
                    });
                    items.push({
                        title: Lampa.Lang.translate(status.saved ? 'Убрать из сохраненных' : 'Добавить в сохраненные'),
                        onSelect: function onSelect() {
                            Lampa.Controller.toggle('content');
                            Api.save(data, function () {
                                Lampa.Bell.push({
                                    text: Lampa.Lang.translate(status.saved ? 'Убрано из сохраненных' : 'Добавлено в сохраненные')
                                });
                            });
                        }
                    });
                    items.push({
                        title: Lampa.Lang.translate('more'),
                        separator: true
                    });

                    if (is_owner) {
                        items.push({
                            title: 'Редактировать',
                            onSelect: function onSelect() {
                                Lampa.Controller.toggle('content');
                                openEditDialog(data, _this2);
                            }
                        });
                        items.push({
                            title: 'Обложка (из карточек)',
                            onSelect: function onSelect() {
                                Lampa.Controller.toggle('content');
                                openCoverDialog(data, _this2);
                            }
                        });
                        items.push({
                            title: 'Удалить',
                            onSelect: function onSelect() {
                                Lampa.Controller.toggle('content');
                                openDeleteDialog(data, _this2);
                            }
                        });
                        items.push({
                            title: Lampa.Lang.translate('more'),
                            separator: true
                        });
                    }

                    if (voited.indexOf(data.id) == -1) {
                        items = items.concat([{
                            title: '<span class="settings-param__label">+1</span> ' + Lampa.Lang.translate('title_like'),
                            like: 1
                        }, {
                            title: Lampa.Lang.translate('reactions_shit'),
                            like: -1
                        }]);
                    }

                    Lampa.Select.show({
                        title: Lampa.Lang.translate('title_action'),
                        items: items,
                        onSelect: function onSelect(item) {
                            if (item.onSelect) return item.onSelect(item);
                            Lampa.Controller.toggle('content');
                            Api.liked({
                                id: data.id,
                                dir: item.like
                            }, function () {
                                voited.push(data.id);
                                Lampa.Storage.set('collections_voited', voited);
                                data.liked += item.like;

                                _this2.item.find('.full-review__like-counter').text(Lampa.Utils.bigNumberToShort(data.liked));

                                Lampa.Bell.push({
                                    text: Lampa.Lang.translate('discuss_voited')
                                });
                            });
                        },
                        onBack: function onBack() {
                            Lampa.Controller.toggle('content');
                        }
                    });
                });
            });
            this.image();
        };

        this.visible = function () {
            this.img.src = Lampa.Api.img(data.backdrop_path, 'w500');
            this.icon.src = Lampa.Utils.protocol() + Lampa.Manifest.cub_domain + '/img/profiles/' + data.icon + '.png';
            if (this.onVisible) this.onVisible(this.item, data);
        };

        this.destroy = function () {
            this.img.onerror = function () {};
            this.img.onload = function () {};
            this.img.src = '';
            remove(this.item);
            this.item = null;
            this.img = null;
        };

        this.render = function (js) {
            return js ? this.item : $(this.item);
        };
    }

    var network = new Lampa.Reguest();
    var api_url = Lampa.Utils.protocol() + Lampa.Manifest.cub_domain + '/api/collections/';
    var collections = [{
        hpu: 'user',
        title: 'Мои коллекции'
    }, {
        hpu: 'saved',
        title: 'Сохраненные'
    }, {
        hpu: 'new',
        title: 'Новинки'
    }, {
        hpu: 'top',
        title: 'В топе'
    }, {
        hpu: 'week',
        title: 'Популярные за неделю'
    }, {
        hpu: 'month',
        title: 'Популярные за месяц'
    }, {
        hpu: 'big',
        title: 'Большие коллекции'
    }, {
        hpu: 'all',
        title: 'Все коллекции'
    }];

    function header() {
        var user = Lampa.Storage.get('account', '{}');
        if (!user.token) return false;
        return {
            headers: {
                token: user.token,
                profile: user.id
            }
        };
    }

    function main(params, oncomplite, onerror) {
        var user = Lampa.Storage.get('account', '{}');
        var status = new Lampa.Status(collections.length);

        status.onComplite = function () {
            var keys = Object.keys(status.data);
            var sort = collections.map(function (a) {
                return a.hpu;
            });

            if (keys.length) {
                var fulldata = [];
                keys.sort(function (a, b) {
                    return sort.indexOf(a) - sort.indexOf(b);
                });
                keys.forEach(function (key) {
                    var data = status.data[key];
                    data.title = collections.find(function (item) {
                        return item.hpu == key;
                    }).title;

                    data.cardClass = function (elem, param) {
                        return new Collection(elem, param);
                    };

                    fulldata.push(data);
                });
                oncomplite(fulldata);
            } else onerror();
        };

        collections.forEach(function (item) {
            if (item.hpu == 'user' && !user.token) return status.error();
            var url = api_url + 'list?category=' + item.hpu;
            if (item.hpu == 'user') url = api_url + 'list?cid=' + user.id;
            if (item.hpu == 'saved') url = api_url + 'saved-list';
            network.silent(url, function (data) {
                data.collection = true;
                data.line_type = 'collection';
                data.category = item.hpu;
                status.append(item.hpu, data);
            }, status.error.bind(status), false, header());
        });
    }

    function collection(params, oncomplite, onerror) {
        var url = api_url + 'list?category=' + params.url + '&page=' + params.page;

        if (params.url.indexOf('user') >= 0) {
            url = api_url + 'list?cid=' + params.url.split('_').pop() + '&page=' + params.page;
        }

        network.silent(url, function (data) {
            data.collection = true;
            data.total_pages = data.total_pages || 15;

            data.cardClass = function (elem, param) {
                return new Collection(elem, param);
            };

            oncomplite(data);
        }, onerror, false, header());
    }

    function liked(params, callaback) {
        network.silent(api_url + 'liked', callaback, function (a, e) {
            Lampa.Noty.show(network.errorDecode(a, e));
        }, params, header());
    }

    function full(params, oncomplite, onerror) {
        network.silent(api_url + 'view/' + params.url + '?page=' + params.page, function (data) {
            data.total_pages = data.total_pages || 15;
            oncomplite(data);
        }, onerror, false, header());
    }

    function status(params, callaback) {
        network.silent(api_url + 'save-status?id=' + params.id, callaback, function (a, e) {
            Lampa.Noty.show(network.errorDecode(a, e));
        }, false, header());
    }

    function save(params, callaback) {
        network.silent(api_url + 'save', callaback, function (a, e) {
            Lampa.Noty.show(network.errorDecode(a, e));
        }, {
            id: params.id
        }, header());
    }

    function createCollection(params, callaback, onerror) {
        network.silent(api_url + 'create', callaback, function (a, e) {
            if (onerror) onerror({
                a: a,
                e: e
            });
        }, params, header());
    }

    function editCollection(params, callaback, onerror) {
        network.silent(api_url + 'change', callaback, function (a, e) {
            if (onerror) onerror({
                a: a,
                e: e
            });
        }, params, header());
    }

    function deleteCollection(params, callaback, onerror) {
        network.silent(api_url + 'remove', callaback, function (a, e) {
            if (onerror) onerror({
                a: a,
                e: e
            });
        }, params, header());
    }

    function coverCollection(params, callaback, onerror) {
        network.silent(api_url + 'background', callaback, function (a, e) {
            if (onerror) onerror({
                a: a,
                e: e
            });
        }, params, header());
    }

    function addCardToCollection(params, callaback, onerror) {
        network.silent(api_url + 'add', callaback, function (a, e) {
            if (onerror) onerror({
                a: a,
                e: e
            });
        }, params, header());
    }

    function removeCardFromCollection(params, callaback, onerror) {
        network.silent(api_url + 'remove-card', callaback, function (a, e) {
            if (onerror) onerror({
                a: a,
                e: e
            });
        }, params, header());
    }

    function clear() {
        network.clear();
    }

    var Api = {
        main: main,
        collection: collection,
        full: full,
        clear: clear,
        liked: liked,
        status: status,
        save: save,
        createCollection: createCollection,
        editCollection: editCollection,
        deleteCollection: deleteCollection,
        coverCollection: coverCollection,
        addCardToCollection: addCardToCollection,
        removeCardFromCollection: removeCardFromCollection
    };

    function openCreateDialog(onDone) {
        var user = Lampa.Storage.get('account', '{}');
        if (!user.token) return Lampa.Noty.show('Нужно войти в аккаунт CUB');
        Lampa.Input.edit({
            title: 'Название коллекции',
            free: true,
            nosave: true,
            nomic: true,
            value: ''
        }, function (name) {
            if (!name) return Lampa.Controller.toggle('content');
            Lampa.Controller.toggle('content');
            Lampa.Loading.start(function () {
                Api.clear();
                Lampa.Loading.stop();
            });
            Api.createCollection({
                name: name
            }, function (res) {
                Lampa.Loading.stop();
                Lampa.Bell.push({
                    text: 'Коллекция создана'
                });
                if (onDone) onDone(res && res.collection ? res.collection : null);
            }, function (err) {
                Lampa.Loading.stop();
                Lampa.Noty.show('Не удалось создать коллекцию');
                if (err && err.a && err.e) Lampa.Noty.show(network.errorDecode(err.a, err.e));
            });
        });
    }

    function openEditDialog(data, card) {
        var user = Lampa.Storage.get('account', '{}');
        if (!user.token) return Lampa.Noty.show('Нужно войти в аккаунт CUB');
        Lampa.Input.edit({
            title: 'Название коллекции',
            free: true,
            nosave: true,
            nomic: true,
            value: data.title || ''
        }, function (title) {
            if (!title) return Lampa.Controller.toggle('content');
            Lampa.Select.show({
                title: 'Тип коллекции',
                items: [{
                    title: 'Публичная',
                    public: 1
                }, {
                    title: 'Приватная',
                    public: 0
                }],
                onSelect: function onSelect(item) {
                    Lampa.Controller.toggle('content');
                    Lampa.Loading.start(function () {
                        Api.clear();
                        Lampa.Loading.stop();
                    });
                    Api.editCollection({
                        id: data.id,
                        title: title,
                        public: item.public
                    }, function () {
                        Lampa.Loading.stop();
                        data.title = title;
                        data.public = item.public;
                        if (card && card.item) card.item.find('.card__title').text(Lampa.Utils.capitalizeFirstLetter(title));
                        Lampa.Bell.push({
                            text: 'Коллекция обновлена'
                        });
                    }, function (err) {
                        Lampa.Loading.stop();
                        Lampa.Noty.show('Не удалось обновить коллекцию');
                        if (err && err.a && err.e) Lampa.Noty.show(network.errorDecode(err.a, err.e));
                    });
                },
                onBack: function onBack() {
                    Lampa.Controller.toggle('content');
                }
            });
        });
    }

    function openDeleteDialog(data, card) {
        Lampa.Select.show({
            title: 'Удалить коллекцию?',
            items: [{
                title: 'Удалить',
                confirm: true
            }, {
                title: 'Отмена',
                confirm: false
            }],
            onSelect: function onSelect(item) {
                Lampa.Controller.toggle('content');
                if (!item.confirm) return;
                Lampa.Loading.start(function () {
                    Api.clear();
                    Lampa.Loading.stop();
                });
                Api.deleteCollection({
                    id: data.id
                }, function () {
                    Lampa.Loading.stop();
                    if (card && card.item) card.item.remove();
                    Lampa.Bell.push({
                        text: 'Коллекция удалена'
                    });
                }, function (err) {
                    Lampa.Loading.stop();
                    Lampa.Noty.show('Не удалось удалить коллекцию');
                    if (err && err.a && err.e) Lampa.Noty.show(network.errorDecode(err.a, err.e));
                });
            },
            onBack: function onBack() {
                Lampa.Controller.toggle('content');
            }
        });
    }

    function openCoverDialog(data, card) {
        Lampa.Loading.start(function () {
            Api.clear();
            Lampa.Loading.stop();
        });
        Api.full({
            url: data.id,
            page: 1
        }, function (res) {
            Lampa.Loading.stop();
            var items = (res && res.results || []).slice(0, 30).map(function (it) {
                return {
                    title: it.title || it.name || ('ID ' + it.id),
                    backdrop_path: it.backdrop_path || it.poster_path
                };
            }).filter(function (it) {
                return it.backdrop_path;
            });
            if (!items.length) return Lampa.Noty.show('Нет подходящих карточек для обложки');
            Lampa.Select.show({
                title: 'Выберите обложку',
                items: items,
                onSelect: function onSelect(item) {
                    Lampa.Controller.toggle('content');
                    Lampa.Loading.start(function () {
                        Api.clear();
                        Lampa.Loading.stop();
                    });
                    var payload = {
                        id: data.id,
                        backdrop_path: item.backdrop_path
                    };
                    Api.coverCollection(payload, function () {
                        Lampa.Loading.stop();
                        data.backdrop_path = item.backdrop_path;
                        if (card && card.img) {
                            card.img.src = Lampa.Api.img(item.backdrop_path, 'w500');
                        }
                        Lampa.Bell.push({
                            text: 'Обложка обновлена'
                        });
                    }, function (err) {
                        Lampa.Loading.stop();
                        Lampa.Noty.show('Не удалось обновить обложку');
                        if (err && err.a && err.e) Lampa.Noty.show(network.errorDecode(err.a, err.e));
                    });
                },
                onBack: function onBack() {
                    Lampa.Controller.toggle('content');
                }
            });
        }, function () {
            Lampa.Loading.stop();
            Lampa.Noty.show('Не удалось загрузить список');
        });
    }

    function openAddToCollectionDialog(card_data, collection_id) {
        var user = Lampa.Storage.get('account', '{}');
        if (!user.token) return Lampa.Noty.show('Нужно войти в аккаунт CUB');

        if (collection_id) {
            addCardToCollectionInternal(collection_id, card_data);
        } else {
            Lampa.Loading.start(function () {
                Api.clear();
                Lampa.Loading.stop();
            });

            Api.collection({ url: 'user_' + user.id }, function (data) {
                Lampa.Loading.stop();
                var items = (data.results || []).map(function (col) {
                    return {
                        title: col.title,
                        collection: col
                    };
                });
                items.push({
                    title: 'Создать новую коллекцию',
                    create: true
                });
                Lampa.Select.show({
                    title: 'Добавить в коллекцию',
                    items: items,
                    onSelect: function onSelect(item) {
                        Lampa.Controller.toggle('content');
                        if (item.create) {
                            openCreateDialog(function (new_col) {
                                if (new_col && new_col.id) {
                                    addCardToCollectionInternal(new_col.id, card_data);
                                }
                            });
                        } else if (item.collection) {
                            addCardToCollectionInternal(item.collection.id, card_data);
                        }
                    },
                    onBack: function onBack() {
                        Lampa.Controller.toggle('content');
                    }
                });
            }, function () {
                Lampa.Loading.stop();
                Lampa.Noty.show('Не удалось загрузить коллекции');
            });
        }
    }

    function addCardToCollectionInternal(collection_id, card_data) {
        Lampa.Loading.start(function () {
            Api.clear();
            Lampa.Loading.stop();
        });
        Api.addCardToCollection({
            id: collection_id,
            card_id: card_data.id,
            source: card_data.source || 'tmdb'
        }, function () {
            Lampa.Loading.stop();
            Lampa.Bell.push({
                text: 'Добавлено в коллекцию'
            });
        }, function (err) {
            Lampa.Loading.stop();
            Lampa.Noty.show('Не удалось добавить в коллекцию');
            if (err && err.a && err.e) Lampa.Noty.show(network.errorDecode(err.a, err.e));
        });
    }

    function removeCardFromCollectionInternal(collection_id, card_data) {
        Lampa.Loading.start(function () {
            Api.clear();
            Lampa.Loading.stop();
        });
        Api.removeCardFromCollection({
            id: collection_id,
            card_id: card_data.id,
            source: card_data.source || 'tmdb'
        }, function () {
            Lampa.Loading.stop();
            Lampa.Bell.push({
                text: 'Удалено из коллекции'
            });
        }, function (err) {
            Lampa.Loading.stop();
            Lampa.Noty.show('Не удалось удалить из коллекции');
            if (err && err.a && err.e) Lampa.Noty.show(network.errorDecode(err.a, err.e));
        });
    }

    function component$2(object) {
        var comp = new Lampa.InteractionMain(object);

        comp.create = function () {
            var _this = this;

            this.activity.loader(true);
            Api.main(object, function (data) {
                _this.build(data);
            }, this.empty.bind(this));
            return this.render();
        };

        comp.onMore = function (data) {
            Lampa.Activity.push({
                url: data.category + (data.category == 'user' ? '_' + data.cid : ''),
                title: data.title,
                component: 'cub_collections_in_lampa_collection',
                page: 1
            });
        };

        return comp;
    }

    function component$1(object) {
        var comp = new Lampa.InteractionCategory(object);
        var current_collection_id = object.url;

        comp.create = function () {
            var _this = this;

            Api.full(object, function (data) {
                _this.build(data);
                comp.render().find('.category-full').addClass('mapping--grid cols--6');
            }, this.empty.bind(this));
        };

        comp.nextPageReuest = function (object, resolve, reject) {
            Api.full(object, resolve.bind(comp), reject.bind(comp));
        };

        comp.cardRender = function (object, element, card) {
            var user = Lampa.Storage.get('account', '{}');
            var is_owner = user && user.id && object.activity.collection && object.activity.collection.cid == user.id;

            card.onMenu = true;
            card.onMenuShow = function (menu_items) {
                if (is_owner && current_collection_id) {
                    menu_items.unshift({
                        title: 'Удалить из коллекции',
                        onSelect: function () {
                            removeCardFromCollectionInternal(current_collection_id, element);
                        }
                    });
                    menu_items.unshift({
                        title: Lampa.Lang.translate('more'),
                        separator: true
                    });
                }
            };

            card.onEnter = function () {
                Lampa.Activity.push({
                    url: element.id,
                    title: element.title || element.name,
                    component: 'full',
                    card: element,
                    source: element.source || object.source
                });
            };
        };

        return comp;
    }

    function component(object) {
        var comp = new Lampa.InteractionCategory(object);
        var user = Lampa.Storage.get('account', '{}');
        var is_own = user && user.id && (object.url + '').indexOf('user_') === 0 && (object.url + '').split('_').pop() == user.id;

        comp.create = function () {
            Api.collection(object, function (data) {
                if (is_own) {
                    data.results = data.results || [];
                    data.results.unshift({
                        id: 'create',
                        title: 'Создать коллекцию',
                        backdrop_path: '',
                        items_count: 0,
                        time: Date.now(),
                        views: 0,
                        liked: 0,
                        username: user.username || 'Me',
                        icon: '',
                        cid: user.id
                    });
                }
                comp.build(data);
            }, this.empty.bind(this));
        };

        comp.nextPageReuest = function (object, resolve, reject) {
            Api.collection(object, resolve.bind(comp), reject.bind(comp));
        };

        comp.cardRender = function (object, element, card) {
            if (element.id === 'create') {
                card.onEnter = function () {
                    openCreateDialog(function (created) {
                        Lampa.Activity.replace({
                            url: object.url,
                            title: object.title,
                            component: 'cub_collections_in_lampa_collection',
                            page: 1
                        });
                    });
                };
                card.render(true).innerHTML = `
                    <div class="card__view">
                        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.1);border-radius:0.5em;">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </div>
                    </div>
                    <div class="card__title">Создать коллекцию</div>
                `;
            } else {
                card.onMenu = false;
                card.onEnter = function () {
                    Lampa.Activity.push({
                        url: element.id,
                        title: element.title,
                        component: 'cub_collections_in_lampa_view',
                        page: 1
                    });
                };
            }
        };

        return comp;
    }

    function startPlugin() {
        var manifest = {
            type: 'video',
            version: '1.0.0',
            name: 'Коллекции (в Лампе)',
            description: '',
            component: 'cub_collections_in_lampa'
        };
        Lampa.Manifest.plugins = manifest;
        Lampa.Component.add('cub_collections_in_lampa_main', component$2);
        Lampa.Component.add('cub_collections_in_lampa_collection', component);
        Lampa.Component.add('cub_collections_in_lampa_view', component$1);
        Lampa.Template.add('cub_collection', '<div class="card cub-collection-card selector layer--visible layer--render card--collection">' +
            '<div class="card__view">' +
                '<img src="./img/img_load.svg" class="card__img">' +
                '<div class="cub-collection-card__head">' +
                    '<div class="cub-collection-card__items"></div>' +
                    '<div class="cub-collection-card__date"></div>' +
                '</div>' +
                '<div class="cub-collection-card__bottom">' +
                    '<div class="cub-collection-card__views"></div>' +
                    '<div class="cub-collection-card__user" style="margin-left:auto;display:flex;align-items:center;">' +
                        '<div class="cub-collection-card__user-icon">' +
                            '<img src="./img/img_load.svg">' +
                        '</div>' +
                        '<div class="cub-collection-card__user-name"></div>' +
                    '</div>' +
                    '<div class="cub-collection-card__liked">' +
                        '<div class="full-review__like-icon">' +
                            '<svg width="29" height="27" viewBox="0 0 29 27" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                                '<path fill-rule="evenodd" clip-rule="evenodd" d="M8.0131 9.05733H3.75799C2.76183 9.05903 1.80696 9.45551 1.10257 10.1599C0.39818 10.8643 0.00170332 11.8192 0 12.8153V23.0778C0.00170332 24.074 0.39818 25.0289 1.10257 25.7333C1.80696 26.4377 2.76183 26.8358 3.75799 26.8358H23.394C24.2758 26.8354 25.1294 26.5252 25.8056 25.9594C26.4819 25.3936 26.9379 24.6082 27.094 23.7403L28.9408 13.4821C29.038 12.9408 29.0153 12.3849 28.8743 11.8534C28.7333 11.3218 28.4774 10.8277 28.1247 10.4058C27.7721 9.98391 27.3311 9.6445 26.833 9.41151C26.3349 9.17852 25.7918 9.05762 25.2419 9.05733H18.5043V3.63509C18.5044 2.90115 18.2824 2.18438 17.8673 1.57908C17.4522 0.973783 16.8636 0.508329 16.179 0.243966C15.4943 -0.0203976 14.7456 -0.0712821 14.0315 0.0980078C13.3173 0.267298 12.6712 0.648829 12.178 1.1924L12.1737 1.19669C10.5632 2.98979 9.70849 5.78681 8.79584 7.79142C8.6423 8.14964 8.45537 8.49259 8.23751 8.81574C8.16898 8.90222 8.09358 8.98301 8.01203 9.05733H8.0131ZM6.54963 23.6147H3.75799C3.68706 23.6147 3.61686 23.6005 3.55156 23.5728C3.48626 23.5452 3.42719 23.5046 3.37789 23.4536C3.32786 23.4047 3.28819 23.3463 3.26126 23.2817C3.23433 23.217 3.22045 23.1468 3.22045 23.0778V12.8153C3.22045 12.6768 3.24805 12.5396 3.30209 12.4124C3.35613 12.2852 3.43564 12.1705 3.53638 12.0746C3.63712 11.9787 3.75732 11.9035 3.89118 11.8536C4.02504 11.8038 4.17052 11.7807 4.31673 11.7859H6.54963V23.6147ZM24.9551 23.0778C24.9551 23.2163 24.9275 23.3535 24.8735 23.4807C24.8194 23.6079 24.7399 23.7226 24.6392 23.8185C24.5384 23.9144 24.4182 23.9896 24.2844 24.0394C24.1505 24.0893 24.005 24.1124 23.8588 24.1072H9.87479V12.8153H18.5043V18.0188C18.5043 18.1573 18.4767 18.2945 18.4227 18.4217C18.3686 18.5489 18.2891 18.6636 18.1884 18.7595C18.0876 18.8554 17.9674 18.9306 17.8336 18.9805C17.6997 19.0303 17.5542 19.0534 17.408 19.0482V22.7064C17.408 22.7773 17.3938 22.8475 17.3662 22.9128C17.3386 22.9781 17.298 23.0372 17.247 23.0865C17.196 23.1358 17.1376 23.1755 17.0729 23.2024C17.0082 23.2293 16.938 23.2432 16.8671 23.2432H10.7074C10.569 23.2432 10.4317 23.2156 10.3045 23.1616C10.1773 23.1075 10.0626 23.028 9.96673 22.9273C9.8708 22.8265 9.79561 22.7063 9.74577 22.5725C9.69593 22.4386 9.67284 22.2931 9.67802 22.1469V12.8153H8.0131C8.0131 12.6768 8.0407 12.5396 8.09474 12.4124C8.14878 12.2852 8.22829 12.1705 8.32903 12.0746C8.42977 11.9787 8.54997 11.9035 8.68383 11.8536C8.81769 11.8038 8.96317 11.7807 9.10938 11.7859H10.9419C11.6851 10.188 12.391 8.00569 13.5842 6.75063C13.8806 6.42349 14.2597 6.24027 14.65 6.21986C15.0403 6.19945 15.4314 6.34393 15.7481 6.62702C16.0648 6.91011 16.2882 7.3189 16.3789 7.77865V11.7859H25.2419C25.3804 11.7859 25.5177 11.8135 25.6449 11.8675C25.7721 11.9216 25.8868 12.0011 25.9827 12.1018C26.0786 12.2026 26.1538 12.3228 26.2036 12.4566C26.2535 12.5905 26.2766 12.736 26.2714 12.8822L24.4246 23.1404C24.3832 23.367 24.2625 23.5648 24.0889 23.7058C23.9153 23.8468 23.6995 23.9225 23.475 23.9187H24.9551V23.0778Z" fill="currentColor"/>' +
                            '</svg>' +
                        '</div>' +
                        '<div class="full-review__like-counter"></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="card__title"></div>' +
        '</div>');
        var style = '<style>' +
            '.cub-collection-card { position: relative; }' +
            '.cub-collection-card__head { display: flex; align-items: center; justify-content: space-between; padding: 0.5em 1em; color: #fff; font-size: 1em; font-weight: 500; position: absolute; top: 0; left: 0; width: 100%; }' +
            '.cub-collection-card__bottom { display: flex; align-items: center; padding: 0.5em 1em; background-color: rgba(0,0,0,0.5); color: #fff; font-size: 1em; font-weight: 400; border-radius: 1em; position: absolute; bottom: 0; left: 0; width: 100%; }' +
            '.cub-collection-card__liked { padding-left: 1em; display: flex; align-items: center; }' +
            '.cub-collection-card__liked .full-review__like-icon { margin-top: -0.2em; }' +
            '.cub-collection-card__liked .full-review__like-counter { font-weight: 600; }' +
            '.cub-collection-card__items { background: rgba(0,0,0,0.5); padding: 0.3em; border-radius: 0.2em; }' +
            '.cub-collection-card__user-name { padding: 0 0.5em; margin-left: auto; }' +
            '.cub-collection-card__user-icon { width: 2em; height: 2em; border-radius: 100%; background-color: #fff; border: 0.2em solid #fff; }' +
            '.cub-collection-card__user-icon img { width: 100%; height: 100%; border-radius: 100%; opacity: 0; }' +
            '.cub-collection-card__user-icon.loaded img { opacity: 1; }' +
            '.category-full .cub-collection-card { padding-bottom: 0.5em; }' +
        '</style>';
        Lampa.Template.add('cub_collections_in_lampa_css', style);
        $('body').append(Lampa.Template.get('cub_collections_in_lampa_css', {}, true));

        function add() {
            var button = $('<li class="menu__item selector">' +
                '<div class="menu__ico">' +
                    '<svg width="191" height="239" viewBox="0 0 191 239" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                        '<path fill-rule="evenodd" clip-rule="evenodd" d="M35.3438 35.3414V26.7477C35.3438 19.9156 38.0594 13.3543 42.8934 8.51604C47.7297 3.68251 54.2874 0.967027 61.125 0.966431H164.25C171.086 0.966431 177.643 3.68206 182.482 8.51604C187.315 13.3524 190.031 19.91 190.031 26.7477V186.471C190.031 189.87 189.022 193.192 187.133 196.018C185.245 198.844 182.561 201.046 179.421 202.347C176.28 203.647 172.825 203.988 169.492 203.325C166.158 202.662 163.096 201.026 160.692 198.623L155.656 193.587V220.846C155.656 224.245 154.647 227.567 152.758 230.393C150.87 233.219 148.186 235.421 145.046 236.722C141.905 238.022 138.45 238.363 135.117 237.7C131.783 237.037 128.721 235.401 126.317 232.998L78.3125 184.993L30.3078 232.998C27.9041 235.401 24.8419 237.037 21.5084 237.7C18.1748 238.363 14.7195 238.022 11.5794 236.722C8.43922 235.421 5.75517 233.219 3.86654 230.393C1.9779 227.567 0.969476 224.245 0.96875 220.846V61.1227C0.96875 54.2906 3.68437 47.7293 8.51836 42.891C13.3547 38.0575 19.9124 35.342 26.75 35.3414H35.3438ZM138.469 220.846V61.1227C138.469 58.8435 137.563 56.6576 135.952 55.046C134.34 53.4343 132.154 52.5289 129.875 52.5289H26.75C24.4708 52.5289 22.2849 53.4343 20.6733 55.046C19.0617 56.6576 18.1562 58.8435 18.1562 61.1227V220.846L66.1609 172.841C69.3841 169.619 73.755 167.809 78.3125 167.809C82.87 167.809 87.2409 169.619 90.4641 172.841L138.469 220.846ZM155.656 169.284L172.844 186.471V26.7477C172.844 24.4685 171.938 22.2826 170.327 20.671C168.715 19.0593 166.529 18.1539 164.25 18.1539H61.125C58.8458 18.1539 56.6599 19.0593 55.0483 20.671C53.4367 22.2826 52.5312 24.4685 52.5312 26.7477V35.3414H129.875C136.711 35.3414 143.268 38.0571 148.107 42.891C152.94 47.7274 155.656 54.285 155.656 61.1227V169.284Z" fill="currentColor"/>' +
                    '</svg>' +
                '</div>' +
                '<div class="menu__text">Коллекции (в Лампе)</div>' +
            '</li>');
            button.on('hover:enter', function () {
                Lampa.Activity.push({
                    url: '',
                    title: manifest.name,
                    component: 'cub_collections_in_lampa_main',
                    page: 1
                });
            });
            $('.menu .menu__list').eq(0).append(button);
        }

        if (window.appready) add();
        else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type == 'ready') add();
            });
        }

        Lampa.Listener.follow('card', function (e) {
            if (e.object && e.object.onMenuShow) {
                var original = e.object.onMenuShow;
                e.object.onMenuShow = function (menu_items, card, element) {
                    if (original) original(menu_items, card, element);
                    menu_items.unshift({
                        title: 'В коллекцию',
                        onSelect: function () {
                            openAddToCollectionDialog(element);
                        }
                    });
                    menu_items.unshift({
                        title: Lampa.Lang.translate('more'),
                        separator: true
                    });
                };
            }
        });

        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'ready') {
                var $buttons = $('.full-start-new__buttons');
                if ($buttons.length && e.activity && e.activity.data && e.activity.data.card) {
                    var card_data = e.activity.data.card;
                    var $btn = $('<div class="simple-button selector">' +
                        '<div class="simple-button__icon">' +
                            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                                '<path d="M19 11H13V5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5V11H5C4.44772 11 4 11.4477 4 12C4 12.5523 4.44772 13 5 13H11V19C11 19.5523 11.4477 20 12 20C12.5523 20 13 19.5523 13 19V13H19C19.5523 13 20 12.5523 20 12C20 11.4477 19.5523 11 19 11Z" fill="currentColor"/>' +
                            '</svg>' +
                        '</div>' +
                        '<div class="simple-button__text">В коллекцию</div>' +
                    '</div>');
                    $btn.on('hover:enter', function () {
                        openAddToCollectionDialog(card_data);
                    });
                    $buttons.append($btn);
                }
            }
        });
    }

    if (!window.cub_collections_in_lampa_ready && Lampa.Manifest.app_digital >= 242) {
        window.cub_collections_in_lampa_ready = true;
        startPlugin();
    }
})();
