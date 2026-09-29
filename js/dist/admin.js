(() => {
  'use strict';

  const resolve = (ext, id) => {
    try {
      const mod = (window.flarum && window.flarum.reg && typeof window.flarum.reg.get === 'function')
        ? window.flarum.reg.get(ext, id)
        : null;
      if (!mod) return null;
      return (mod.__esModule && mod.default) ? mod.default : mod;
    } catch (e) {
      return null;
    }
  };

  const app = window.app || resolve('core', 'admin/app');
  const extenders = resolve('core', 'common/extenders');
  const AdminExtender = extenders && extenders.Admin ? extenders.Admin : null;

  const extendList = [];

  if (AdminExtender && app && app.translator) {
    extendList.push(
      new AdminExtender().setting(() => ({
        setting: 'gabeszm-linux-games-commands.allowed_tags',
        type: 'text',
        label: app.translator.trans('gabeszm-linux-games-commands.admin.settings.allowed_tags_label'),
        help: app.translator.trans('gabeszm-linux-games-commands.admin.settings.allowed_tags_help'),
        placeholder: 'pl. general, guides, support (üresen hagyva minden kategóriában elérhető)',
      })),
      new AdminExtender().setting(() => ({
        setting: 'gabeszm-linux-games-commands.show_in_discussion',
        type: 'boolean',
        label: app.translator.trans('gabeszm-linux-games-commands.admin.settings.show_in_discussion'),
        help: app.translator.trans('gabeszm-linux-games-commands.admin.settings.show_in_discussion_help'),
        default: true,
      })),
      new AdminExtender().setting(() => ({
        setting: 'gabeszm-linux-games-commands.show_in_composer',
        type: 'boolean',
        label: app.translator.trans('gabeszm-linux-games-commands.admin.settings.show_in_composer'),
        help: app.translator.trans('gabeszm-linux-games-commands.admin.settings.show_in_composer_help'),
        default: true,
      }))
    );
  }

  if (app && app.initializers) {
    app.initializers.add('gabeszm-linux-games-commands', () => {
      const reg = (app.registry || app.extensionData) ? (app.registry || app.extensionData).for('gabeszm-linux-games-commands') : null;
      if (reg && typeof reg.registerSetting === 'function') {
        reg.registerSetting({
          setting: 'gabeszm-linux-games-commands.allowed_tags',
          type: 'text',
          label: app.translator.trans('gabeszm-linux-games-commands.admin.settings.allowed_tags_label'),
          help: app.translator.trans('gabeszm-linux-games-commands.admin.settings.allowed_tags_help'),
          placeholder: 'pl. general, guides, support (üresen hagyva minden kategóriában elérhető)',
        });
        reg.registerSetting({
          setting: 'gabeszm-linux-games-commands.show_in_discussion',
          type: 'boolean',
          label: app.translator.trans('gabeszm-linux-games-commands.admin.settings.show_in_discussion'),
          help: app.translator.trans('gabeszm-linux-games-commands.admin.settings.show_in_discussion_help'),
          default: true,
        });
        reg.registerSetting({
          setting: 'gabeszm-linux-games-commands.show_in_composer',
          type: 'boolean',
          label: app.translator.trans('gabeszm-linux-games-commands.admin.settings.show_in_composer'),
          help: app.translator.trans('gabeszm-linux-games-commands.admin.settings.show_in_composer_help'),
          default: true,
        });
      }
    });
  }

  if (typeof module !== 'undefined') {
    module.exports = { extend: extendList };
  }
})();
