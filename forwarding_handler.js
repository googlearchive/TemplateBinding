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

// This requires ES Harmony Proxies

function ForwardingHandler(object) {
  this.object = object;
}

ForwardingHandler.prototype = {
  getOwnPropertyDescriptor: function(name) {
    var desc = Object.getOwnPropertyDescriptor(this.object, name);
    // a trapping proxy's properties must always be configurable
    desc.configurable = true;
    return desc;
  },
  getOwnPropertyNames: function() {
    return Object.getOwnPropertyNames(this.object);
  },
  defineProperty: function(name, desc) {
    Object.defineProperty(this.object, name, desc);
  },
  'delete': function(name) {
    return delete this.object[name];
  },
  fix: function() {
    if (Object.isFrozen(this.object)) {
      return Object.getOwnPropertyNames(this.object).map(function(name) {
        return Object.getOwnPropertyDescriptor(this.object, name);
      });
    }
    // As long as obj is not frozen, the proxy won't allow itself to be fixed
    return undefined; // will cause a TypeError to be thrown
  },
  has: function(name) {
    return name in this.object;
  },
  hasOwn: function(name) {
    return ({}).hasOwnProperty.call(this.object, name);
  },
  get: function(receiver, name) {
    return this.object[name];
  },
  set: function(receiver, name, val) {
    this.object[name] = val;
    return true;
  }, // bad behavior when set fails in non-strict mode
  enumerate: function() {
    var result = [];
    for (var name in this.object) {
      result.push(name);
    }
    return result;
  },
  keys: function() {
    return Object.keys(this.object);
  }
};
