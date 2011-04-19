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

if (!Function.prototype.bind) {
  // JSC does not implement bind
  Object.defineProperty(Function.prototype, 'bind', {
    value: function(selfObj, var_args) {
      var fn = this;
      var context = selfObj || goog.global;
      var boundArgs = Array.prototype.slice.call(arguments, 1);
      return function() {
        // Prepend the bound arguments to the current arguments.
        var newArgs = Array.prototype.slice.call(arguments);
        Array.prototype.unshift.apply(newArgs, boundArgs);
        return fn.apply(context, newArgs);
      };
    },
    writable: true,
    configurable: true
  });
}

// Firefox does not have parentElement
if (!('parentElement' in document.createElement('div'))) {
  Object.defineProperty(Node.prototype, 'parentElement', {
    configurable: true,
    enumerable: true,
    get: function() {
      var p = this.parentNode;
      if (p && p.nodeType == Node.ELEMENT_NODE)
        return p;
      return null;
    },
  });
}
