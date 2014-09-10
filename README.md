# TemplateBinding

[![Build status](http://www.polymer-project.org/build/TemplateBinding/status.png "Build status")](http://build.chromium.org/p/client.polymer/waterfall) [![Analytics](https://ga-beacon.appspot.com/UA-39334307-2/Polymer/TemplateBinding/README)](https://github.com/igrigorik/ga-beacon)

## Local Development

If you wish to hack on this repo, here's the rough flow:

    mkdir project && cd project
    git checkout https://github.com/Polymer/TemplateBinding
    cd TemplateBinding
    bower install
    npm install

Note that we created a project directory to contain `TemplateBinding`, because
it assumes that all of its dependencies are siblings.

Tests are managed via the [web-component-tester](https://github.com/Polymer/web-component-tester#gulp-testlocal) gulp tasks. `gulp test`, and away you go!
