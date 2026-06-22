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
          _this.img.src = './img/img_broken.svg';
        };

        this.icon.onload = function () {
          _this.item.find('.cub-collection-card__user-icon').classList.add('loaded');
        };

        this.icon.onerror = function () {
          _this.icon.src = './img/img_broken.svg';
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
              title: 'Коллeкции @' + data.username,
              onSelect: function onSelect() {
                Lampa.Activity.push({
                  url: 'user_' + data.cid,
                  title: 'Коллeкции @' + data.username,
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
                    text: Lampa.Lang.translate(status.saved ? 'Убрано из сохраненных' : 'Добавлено в сохраненных')
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

    function tryEndpoints(endpoints, params, oncomplite, onerror) {
      var index = 0;

      function next(last) {
        if (index >= endpoints.length) return onerror(last);
        var url = api_url + endpoints[index++];
        network.silent(url, function (data) {
          if (data && (data.secuses || data.success || data.result || data.id)) return oncomplite(data);
          next(data);
        }, function (a, e) {
          next({
            a: a,
            e: e
          });
        }, params, header());
      }

      next();
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
      tryEndpoints(['create', 'add', 'new', 'create-collection', 'collection-create', 'create_collection'], params, callaback, onerror);
    }

    function editCollection(params, callaback, onerror) {
      tryEndpoints(['edit', 'update', 'change', 'modify', 'set', 'update-collection', 'collection-update', 'edit_collection'], params, callaback, onerror);
    }

    function deleteCollection(params, callaback, onerror) {
      tryEndpoints(['delete', 'remove', 'del', 'trash', 'delete-collection', 'collection-delete', 'remove_collection'], params, callaback, onerror);
    }

    function coverCollection(params, callaback, onerror) {
      tryEndpoints(['cover', 'set-cover', 'backdrop', 'set-backdrop', 'poster', 'set-image', 'cover-set'], params, callaback, onerror);
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
      coverCollection: coverCollection
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
            Api.createCollection({
              title: title,
              public: item.public
            }, function () {
              Lampa.Loading.stop();
              Lampa.Bell.push({
                text: 'Коллекция создана'
              });
              if (onDone) onDone();
            }, function (err) {
              Lampa.Loading.stop();
              Lampa.Noty.show('Не удалось создать коллекцию');
              if (err && err.a && err.e) Lampa.Noty.show(network.errorDecode(err.a, err.e));
            });
          },
          onBack: function onBack() {
            Lampa.Controller.toggle('content');
          }
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
            }, function () {
              Api.editCollection(payload, function () {
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

      return comp;
    }

    function component(object) {
      var comp = new Lampa.InteractionCategory(object);

      comp.create = function () {
        Api.collection(object, this.build.bind(this), this.empty.bind(this));
      };

      comp.nextPageReuest = function (object, resolve, reject) {
        Api.collection(object, resolve.bind(comp), reject.bind(comp));
      };

      comp.cardRender = function (object, element, card) {
        card.onMenu = false;

        card.onEnter = function () {
          Lampa.Activity.push({
            url: element.id,
            title: element.title,
            component: 'cub_collection',
            page: 1
          });
        };
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
      Lampa.Template.add('cub_collection', "<div class=\"card cub-collection-card selector layer--visible layer--render card--collection\">\n        <div class=\"card__view\">\n            <img src=\"./img/img_load.svg\" class=\"card__img\">\n            <div class=\"cub-collection-card__head\">\n                <div class=\"cub-collection-card__items\"></div>\n                <div class=\"cub-collection-card__date\"></div>\n            </div>\n            <div class=\"cub-collection-card__bottom\">\n                <div class=\"cub-collection-card__views\"></div>\n                <div class=\"cub-collection-card__liked\">\n                    <div class=\"full-review__like-icon\">\n                        <svg width=\"29\" height=\"27\" viewBox=\"0 0 29 27\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                            <path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M8.0131 9.05733H3.75799C2.76183 9.05903 1.80696 9.45551 1.10257 10.1599C0.39818 10.8643 0.00170332 11.8192 0 12.8153V23.0778C0.00170332 24.074 0.39818 25.0289 1.10257 25.7333C1.80696 26.4377 2.76183 26.8341 3.75799 26.8358H23.394C24.2758 26.8354 25.1294 26.5252 25.8056 25.9594C26.4819 25.3936 26.9379 24.6082 27.094 23.7403L28.9408 13.4821C29.038 12.9408 29.0153 12.3849 28.8743 11.8534C28.7333 11.3218 28.4774 10.8277 28.1247 10.4058C27.7721 9.98391 27.3311 9.6445 26.833 9.41151C26.3349 9.17852 25.7918 9.05762 25.2419 9.05733H18.5043V3.63509C18.5044 2.90115 18.2824 2.18438 17.8673 1.57908C17.4522 0.973783 16.8636 0.508329 16.179 0.243966C15.4943 -0.0203976 14.7456 -0.0712821 14.0315 0.0980078C13.3173 0.267298 12.6712 0.648829 12.178 1.1924L12.1737 1.19669C10.5632 2.98979 9.70849 5.78681 8.79584 7.79142C8.6423 8.14964 8.45537 8.49259 8.23751 8.81574C8.16898 8.90222 8.09358 8.98301 8.01203 9.05733H8.0131ZM6.54963 23.6147H3.75799C3.68706 23.6147 3.61686 23.6005 3.55156 23.5728C3.48626 23.5452 3.42719 23.5046 3.37789 23.4536C3.32786 23.4047 3.28819 23.3463 3.26126 23.2817C3.23433 23.2171 3.22065 23.1478 3.22098 23.0778V12.8153C3.22098 12.7456 3.23468 12.6767 3.26131 12.6123C3.28793 12.5479 3.32695 12.4894 3.37575 12.4402C3.42472 12.3902 3.48307 12.3505 3.54767 12.3236C3.61227 12.2967 3.68156 12.283 3.75156 12.2833H6.54963V23.6147ZM25.2451 23.6147H9.76977V11.7493C10.4118 11.2783 10.932 10.661 11.2872 9.94823C12.1022 8.16002 12.838 5.71062 14.5078 3.81051C14.5804 3.73544 14.6753 3.68549 14.7783 3.6681C14.8812 3.65071 14.9869 3.66679 15.0804 3.71404C15.1739 3.76128 15.2503 3.83728 15.2982 3.93043C15.346 4.02357 15.363 4.12918 15.3466 4.23251V10.6689C15.3466 11.0936 15.5153 11.5009 15.8155 11.8012C16.1158 12.1015 16.5231 12.2701 16.9478 12.2701H25.2419C25.479 12.2702 25.7132 12.3224 25.9277 12.423C26.1422 12.5237 26.3319 12.6704 26.4833 12.8529C26.6352 13.0345 26.7454 13.2476 26.8061 13.4768C26.8668 13.7061 26.8766 13.9458 26.8349 14.1793L24.9881 24.4375C24.9612 24.5894 24.8814 24.7269 24.7628 24.8256C24.6443 24.9243 24.4947 24.9778 24.3404 24.9767H24.3393\" fill=\"currentColor\"/>\n                        </svg>\n                    </div>\n                    <div class=\"full-review__like-counter\"></div>\n                </div>\n                <div class=\"cub-collection-card__user-name\"></div>\n                <div class=\"cub-collection-card__user-icon\"><img src=\"./img/img_load.svg\"></div>\n            </div>\n            <div class=\"card__overlay\">\n                <div class=\"card__title\"></div>\n            </div>\n        </div>\n    </div>");
      var style = "\n        <style>\n        .cub-collection-card__head{display:-webkit-box;display:-webkit-flex;display:-moz-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-webkit-align-items:center;-moz-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:justify;-webkit-justify-content:space-between;-moz-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;padding:.5em 1em;color:#fff;font-size:1em;font-weight:500;position:absolute;top:0;left:0;width:100%}.cub-collection-card__bottom{display:-webkit-box;display:-webkit-flex;display:-moz-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-webkit-align-items:center;-moz-box-align:center;-ms-flex-align:center;align-items:center;padding:.5em 1em;background-color:rgba(0,0,0,0.5);color:#fff;font-size:1em;font-weight:400;-webkit-border-radius:1em;-moz-border-radius:1em;border-radius:1em;position:absolute;bottom:0;left:0;width:100%}.cub-collection-card__liked{padding-left:1em;display:-webkit-box;display:-webkit-flex;display:-moz-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-webkit-align-items:center;-moz-box-align:center;-ms-flex-align:center;align-items:center}.cub-collection-card__liked .full-review__like-icon{margin-top:-0.2em}.cub-collection-card__liked .full-review__like-counter{font-weight:600}.cub-collection-card__items{background:rgba(0,0,0,0.5);padding:.3em;-webkit-border-radius:.2em;-moz-border-radius:.2em;border-radius:.2em}.cub-collection-card__user-name{padding:0 1em;margin-left:auto}.cub-collection-card__user-icon{width:2em;height:2em;-webkit-border-radius:100%;-moz-border-radius:100%;border-radius:100%;background-color:#fff;border:.2em solid #fff}.cub-collection-card__user-icon img{width:100%;height:100%;-webkit-border-radius:100%;-moz-border-radius:100%;border-radius:100%;opacity:0}.cub-collection-card__user-icon.loaded img{opacity:1}.category-full .cub-collection-card{padding-bottom:2em}body.glass--style .cub-collection-card .cub-collection-card__bottom{background-color:rgba(0,0,0,0.3)}body.glass--style .cub-collection-card .cub-collection-card__head{background-color:rgba(0,0,0,0.3)}\n        </style>\n        ";
      Lampa.Template.add('cub_collections_in_lampa_css', style);
      $('body').append(Lampa.Template.get('cub_collections_in_lampa_css', {}, true));

      function add() {
        var button = $("<li class=\"menu__item selector\">\n            <div class=\"menu__ico\">\n                <svg width=\"191\" height=\"239\" viewBox=\"0 0 191 239\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                    <path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M35.3438 35.3414V26.7477C35.3438 19.9156 38.0594 13.3543 42.8934 8.51604C47.7297 3.68251 54.2874 0.967027 61.125 0.966431H164.25C171.086 0.966431 177.643 3.68206 182.482 8.51604C187.315 13.3524 190.031 19.91 190.031 26.7477V186.471C190.031 189.87 189.022 193.192 187.133 196.018C185.245 198.844 182.561 201.046 179.421 202.347C176.28 203.647 172.825 203.988 169.492 203.325C166.158 202.662 163.096 201.026 160.692 198.623L155.656 193.587V220.846C155.656 224.245 154.647 227.567 152.758 230.393C150.87 233.219 148.186 235.421 145.046 236.722C141.905 238.022 138.45 238.363 135.117 237.7C131.783 237.037 128.721 235.401 126.317 232.998L78.3125 184.993L30.3078 232.998C27.9041 235.401 24.8419 237.037 21.5084 237.7C18.1748 238.363 14.7195 238.022 11.5794 236.722C8.43922 235.421 5.75517 233.219 3.86654 230.393C1.9779 227.567 0.969476 224.245 0.96875 220.846V61.1227C0.96875 54.2906 3.68437 47.7293 8.51836 42.891C13.3547 38.0575 19.9124 35.342 26.75 35.3414H35.3438ZM138.469 220.846V61.1227C138.469 58.8435 137.563 56.6576 135.952 55.046C134.34 53.4343 132.154 52.5289 129.875 52.5289H26.75C24.4708 52.5289 22.2849 53.4343 20.6733 55.046C19.0617 56.6576 18.1562 58.8435 18.1562 61.1227V220.846L66.1609 172.841C69.3841 169.619 73.755 167.809 78.3125 167.809C82.87 167.809 87.2409 169.619 90.4641 172.841L138.469 220.846ZM155.656 169.284L172.844 186.471V26.7477C172.844 24.4685 171.938 22.2826 170.327 20.671C168.715 19.0593 166.529 18.1539 164.25 18.1539H61.125C58.8458 18.1539 56.6599 19.0593 55.0483 20.671C53.4367 22.2826 52.5312 24.4685 52.5312 26.7477V35.3414H129.875C136.711 35.3414 143.268 38.0571 148.107 42.891C152.94 47.7274 155.656 54.285 155.656 61.1227V169.284Z\" fill=\"currentColor\"/>\n                </svg>\n            </div>\n            <div class=\"menu__text\">".concat(manifest.name, "</div>\n        </li>"));
        button.on('hover:enter', function () {
          Lampa.Activity.push({
            url: '',
            title: manifest.name,
            component: 'cub_collections_in_lampa_main',
            page: 1
          });
        });
        button.on('hover:long', function () {
          openCreateDialog(function () {
            var user = Lampa.Storage.get('account', '{}');
            if (user && user.id) {
              Lampa.Activity.push({
                url: 'user_' + user.id,
                title: 'Мои коллекции',
                component: 'cub_collections_in_lampa_collection',
                page: 1
              });
            }
          });
        });
        $('.menu .menu__list').eq(0).append(button);
      }

      if (window.appready) add();else {
        Lampa.Listener.follow('app', function (e) {
          if (e.type == 'ready') add();
        });
      }
    }

    if (!window.cub_collections_in_lampa_ready && Lampa.Manifest.app_digital >= 242) {
      window.cub_collections_in_lampa_ready = true;
      startPlugin();
    }
})();

