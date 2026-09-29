<?php

namespace Gabeszm\LinuxGamesCommands;

use Flarum\Extend;
use s9e\TextFormatter\Configurator;

return [
    (new Extend\Frontend('forum'))
        ->js(__DIR__ . '/js/dist/forum.js')
        ->css(__DIR__ . '/less/forum.less'),

    (new Extend\Frontend('admin'))
        ->js(__DIR__ . '/js/dist/admin.js')
        ->css(__DIR__ . '/less/admin.less'),

    new Extend\Locales(__DIR__ . '/locale'),

    (new Extend\Settings())
        ->default('gabeszm-linux-games-commands.allowed_tags', '')
        ->default('gabeszm-linux-games-commands.show_in_discussion', true)
        ->default('gabeszm-linux-games-commands.show_in_composer', true)
        ->serializeToForum('linuxGamesAllowedTags', 'gabeszm-linux-games-commands.allowed_tags')
        ->serializeToForum('linuxGamesShowInDiscussion', 'gabeszm-linux-games-commands.show_in_discussion', 'boolval')
        ->serializeToForum('linuxGamesShowInComposer', 'gabeszm-linux-games-commands.show_in_composer', 'boolval'),

    (new Extend\Formatter)
        ->configure(function (Configurator $config) {
            $config->BBCodes->addCustom(
                '[linux-command]{TEXT}[/linux-command]',
                '<div class="linux-command-container"><div class="linux-command-header"><span class="terminal-dots"><span></span><span></span><span></span></span><span class="linux-command-title"><i class="fas fa-gamepad"></i> Linux Játék Indítási Parancs</span><button type="button" class="linux-command-copy-btn">Másolás</button></div><pre><code class="linux-command-code">{TEXT}</code></pre></div>'
            );
        }),
];
