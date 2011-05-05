// Copyright 2011 Google Inc.
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

var BindAttributeParser = (function() {

  var expressionParser = new ExpressionParser;
  var dependencyParser = new DependencyParser;

  function syntaxError() {
    throw Error('Bind attribute syntax error');
  }

  function BindAttributeParser() {}

  BindAttributeParser.Token = function(type, property, value) {
    this.type = type;
    this.property = property;
    this.value = value;
  };

  BindAttributeParser.prototype = {
    parse: function(s) {
      var result = [];
      // TODO(adamk): Don't use split() here, need to actually parse character
      // by character.
      var parts = s.split(/\s*;\s*/);
      parts.forEach(function(part) {
        // TODO(adamk): Don't use split() here, need to actually parse character
        // by character.
        var propertyAndValue = part.split(/\s*:\s*/);
        if (propertyAndValue.length != 2)
          syntaxError();
        var property = propertyAndValue[0].trim();
        var value = propertyAndValue[1].trim();
        var type = /^expr\s*\(/.test(value) ? 'expr' : 'dep';
        var parser = type == 'expr' ? expressionParser : dependencyParser;
        value = parser.parse(value);
        result.push(new BindAttributeParser.Token(type, property, value));
      });
      return result;
    }
  };

  return BindAttributeParser;
})();
