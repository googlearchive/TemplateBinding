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

  var pathIndent = '[\$a-z0-9_]+[\$a-z0-9_\\d]*';
  var path = '(?:' + pathIndent + ')(?:\\.' + pathIndent + ')*';
  var pathPattern = new RegExp('^(' + path + ')$');
  var classPattern = new RegExp('^([\\w]+)[\\s]*:[\\s]*(' + path + '){1}$');

  function getClassBinding(model, pathString, name, node) {
    pathString = pathString.trim();
    if (pathString.match(pathPattern))
      return; // bail out early if pathString is really just a path.

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

  function MDVSyntax() {}

  MDVSyntax.prototype = {
    getBinding: function(model, path, name, node) {
      var binding;
      binding = getClassBinding(model, path, name, node);
      if (binding)
        return binding;
    }
  }

  global.MDVSyntax = MDVSyntax;
})(this);