(function(global) {

'use strict';

function Transform() {}
Transform.registry = {};

Transform.create = function(transformName, transformArgs) {
  var transform;
  var transFunc = Transform.registry[transformName];
  if (transformName && typeof transFunc == 'function') {
      // Construct a new transform using rest args. In Harmony speak:
      //   new transFunc(...transformArgs)
      transform = Object.create(transFunc.prototype);
      transFunc.apply(transform, transformArgs);
  }
  return transform;
};

function ToggleTransform(value) { this.value = value; }
Transform.registry.toggle = ToggleTransform;

ToggleTransform.prototype = {
    toTarget: function(source, sourceName) {
        return source ? (this.value || sourceName) : '';
    },

    toSource: function(target, sourceName) {
        return (this.value || sourceName) == target;
    }
};

function CurrencyTransform() {}
Transform.registry.currency = CurrencyTransform;

CurrencyTransform.prototype = {
    pattern: /^\$?([-\d\.]*)$/,

    toTarget: function(source) {
        var num = Number(source);
        return isNaN(num) ? 'NaN' : '$' + Number(num).toFixed(2);
    },

    toSource: function(target) {
        var m = target.match(this.pattern) || {};
        return Number(m[1]);
    }
};

function NumberTransform() {}
Transform.registry.number = NumberTransform;

NumberTransform.prototype = {
    toTarget: function(source) {
        return String(source);
    },

    toSource: function(target) {
        return Number(target);
    },
};

function AbsentTransform() {}
Transform.registry.absent = AbsentTransform;

AbsentTransform.prototype = {
    toTarget: function(source) {
        if (!source)
            return true;
        if (typeof source == 'object' && 'length' in source && source.length)
            return true;
        return null;
    }
};

function PresentTransform() {}
Transform.registry.present = PresentTransform;

PresentTransform.prototype = {
    toTarget: function(source) {
        return !AbsentTransform.prototype.toTarget(source) || null;
    }
};

global.Transform = Transform;

})(window);

function MDVDelegate(binding, model) {
    // Expression = 'expr' '(' Params ')' Expression
    // Params = path ('@' Ident)?
    function strip(s) {
        return s.replace(/\s/g, '');
    }

    function createExpression(args, body) {
        var args = strip(args);
        args = args ? args.split(',') : [];
        var functionBody = 'return (' + body + ')'; // Parens avoids ASI

        var deps = [], aliases = [];
        for (var i = 0; i < args.length; i++) {
            var arg = args[i];
            var parts = arg.split('@');
            var path = strip(parts[0]);

            if (!path)
                return;

            var alias;
            if (parts.length > 1) {
                alias = strip(parts[1]);
            } else {
                var index = path.indexOf('.');
                if (index < 0)
                    alias = path;
                else
                    alias = path.substring(index + 1);
            }

            if (alias.length == 0)
                return;
            deps.push(path);
            aliases.push(alias);
        }

        var binding = new CompoundBinding();
        deps.forEach(function(dep, i) {
            binding.bind(i, model, dep);
        }, this);

        aliases.push(functionBody);

        var func = Function.apply(undefined, aliases);
        binding.combinator = function(values) {
            var args = [];
            for (var i in values)
                args.push(values[i]);
            return func.apply(undefined, args);
        }
        return binding;
    }

    var expressionPattern = /^expr\s*\(([^)]*)\s*\)\s*((?:.|\n)*)$/m;
    var match = binding.match(expressionPattern);
    if (match != null)
        return createExpression(match[1], match[2]);

    function createTransform(binding, index) {
        var path = binding.substring(0, index).trim();
        var s = binding.substring(index + 1).trim();

        var stringArg = /^(?:"([^"]*)"|'([^']*)')$/;
        var transformPattern = /^([a-z_]+[a-z_\d]*)(?:\(([^\)]*)\))?$/i;
        var m = s.match(transformPattern);
        if (m == null)
            return;

        var transformName = m[1].trim();
        var transformArgsString = m[2];
        if (transformArgsString)
            transformArgsString = transformArgsString.trim();
        var args = transformArgsString ? transformArgsString.split(',') : [];

        var transformArgs = args.map(function(arg) {
            arg = arg.trim();

            if (arg === '')
                return undefined;

            // String arg
            if (stringArg.test(arg)) {
                var m = arg.match(stringArg);
                return m[1] || m[2];
            }

            switch(arg) {
                case 'true':
                    return true;
                case 'false':
                    return false;
                case 'null':
                    return null;
                default:
                    var number = Number(arg);
                    return !isNaN(number) ? number : undefined;
            }
        });

        var transform = Transform.create(transformName, transformArgs);

        var name;
        var index = path.indexOf('.');
        if (index < 0)
            name = path;
        else
            name = path.substring(index + 1);

        var binding = new CompoundBinding();
        binding.bind('dep', model, path);
        binding.combinator = function(values) {
            return transform.toTarget.apply(transform, [values['dep']].concat(name));
        };

//            function(value) {
//                return transform.toSource.apply(transform, [value]);
//            }

        return binding;
    }

    var index = binding.indexOf('|');
    if (index >= 0)
        return createTransform(binding, index);

    return null;
}