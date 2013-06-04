// Copyright 2013 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

(function (global) {
  'use strict';

  // SideTable is a weak map where possible. If WeakMap is not available the
  // association is stored as an expando property.
  var SideTable;
  // TODO(arv): WeakMap does not allow for Node etc to be keys in Firefox
  if (typeof WeakMap !== 'undefined' && navigator.userAgent.indexOf('Firefox/') < 0) {
    SideTable = WeakMap;
  } else {
    (function() {
      var defineProperty = Object.defineProperty;
      var hasOwnProperty = Object.hasOwnProperty;
      var counter = new Date().getTime() % 1e9;

      SideTable = function() {
        this.name = '__st' + (Math.random() * 1e9 >>> 0) + (counter++ + '__');
      };

      SideTable.prototype = {
        set: function(key, value) {
          defineProperty(key, this.name, {value: value, writable: true});
        },
        get: function(key) {
          return hasOwnProperty.call(key, this.name) ? key[this.name] : undefined;
        },
        delete: function(key) {
          this.set(key, undefined);
        }
      }
    })();
  }

  // JScript does not have __proto__. We wrap all object literals with
  // createObject which uses Object.create, Object.defineProperty and
  // Object.getOwnPropertyDescriptor to create a new object that does the exact
  // same thing. The main downside to this solution is that we have to extract
  // all those property descriptors for IE.
  var createObject = ('__proto__' in {}) ?
      function(obj) { return obj; } :
      function(obj) {
        var proto = obj.__proto__;
        if (!proto)
          return obj;
        var newObject = Object.create(proto);
        Object.getOwnPropertyNames(obj).forEach(function(name) {
          Object.defineProperty(newObject, name,
                               Object.getOwnPropertyDescriptor(obj, name));
        });
        return newObject;
      };

  // IE does not support have Document.prototype.contains.
  if (typeof document.contains != 'function') {
    Document.prototype.contains = function(node) {
      if (node === this || node.parentNode === this)
        return true;
      return this.documentElement.contains(node);
    }
  }

  var ident = '[\$a-z0-9_]+[\$a-z0-9_\\d]*';
  var path = '(?:' + ident + ')(?:\\.' + ident + ')*';

  var capturedIdent = '(' + ident + ')';
  var capturedPath = '(' + path + ')';
  var anyWhitespace = '[\\s]*';

  var pathPattern = new RegExp('^' + capturedPath + '$');

  var classPattern = new RegExp('^' +
                                  capturedIdent + anyWhitespace +
                                  ':' + anyWhitespace +
                                  capturedPath +
                                '$');

  function getClassBinding(model, pathString, name, node) {
    if (node.nodeType !== Node.ELEMENT_NODE || name.toLowerCase() !== 'class')
      return;

    var tokens = pathString.split(';');
    var tuples = [];
    for (var i = 0; i < tokens.length; i++) {
      var match = tokens[i].trim().match(classPattern);
      if (!match)
        return;
      tuples.push(match[1], match[2]);
    }

    if (!tuples.length)
      return;

    var binding = new CompoundBinding(function(values) {
      var strings = [];
      for (var i = 0; i < tuples.length; i = i + 2) {
        if (values[tuples[i+1]])
          strings.push(tuples[i]);
      }

      return strings.join(' ');
    });

    for (var i = 0; i < tuples.length; i = i + 2)
      binding.bind(tuples[i+1], model, tuples[i+1]);

    return binding;
  }

  var bindPattern = new RegExp('^' +
                                 capturedPath + anyWhitespace +
                                 ' as ' + anyWhitespace +
                                 capturedIdent +
                               '$');

  var repeatPattern = new RegExp('^' +
                                 capturedIdent + anyWhitespace +
                                 ' in ' + anyWhitespace +
                                 capturedPath +
                               '$');

  var templateScopeTable = new SideTable;

  function getNamedScopeBinding(model, pathString, name, node) {
    if (node.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'TEMPLATE' ||
       (name !== 'bind' && name !== 'repeat'))
      return;

    var scopeName, path;
    var match = pathString.match(repeatPattern);
    if (match) {
      scopeName = match[1];
      path = match[2];
    } else {
      match = pathString.match(bindPattern);
      scopeName = match[2];
      path = match[1];
    }
    if (!match)
      return;

    var binding = new CompoundBinding(function(values) {
      return values['value'];
    });

    binding.bind('value', model, path);
    templateScopeTable.set(node, scopeName);
    return binding;
  }

  function MDVSyntax() {}

  MDVSyntax.prototype = {
    getBinding: function(model, pathString, name, node) {
      pathString = pathString.trim();
      if (!pathString || pathString.match(pathPattern))
        return; // bail out early if pathString is really just a path.

      var binding;

      binding = getClassBinding(model, pathString, name, node);
      if (binding)
        return binding;

      binding = getNamedScopeBinding(model, pathString, name, node);
      if (binding)
        return binding;
    },

    getInstanceModel: function(template, model) {
      var scopeName = templateScopeTable.get(template);
      if (!scopeName)
        return model;

      var parentScope = template.templateInstance.model;
      var scope = createObject({
        __proto__: parentScope
      });

      scope[scopeName] = model;
      return scope;
    }
  }

  global.MDVSyntax = MDVSyntax;
})(this);