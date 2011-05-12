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

// This is a na•ve implementation of Harmony WeakMap that is not weak at all
// and get/set are O(n) instead of O(1)

// This uses === instead of Object.eq.
// The ES Harmony Wiki does not include has nor delete

var WeakMap;

if (typeof WeakMap == 'undefined') {

  var assertObject = function(value) {
    if (value !== Object(value)) {
      throw TypeError('value is not a non-null object');
    }
  };

  WeakMap = function() {};

  WeakMap.prototype = {
    set: function(key, value) {
      assertObject(key);
      if ('__id__' in key) {
        this.valuesById_ = this.valuesById_ || {};
        this.valuesById_[key.__id__] = value;
        return;
      }
      if (!this.keys_) {
        this.keys_ = [];
        this.values_ = [];
      }

      var index = this.keys_.indexOf(key);
      if (index != -1) {
        this.values_[index] = value;
      } else {
        this.keys_.push(key);
        this.values_.push(value);
      }
    },
    get: function(key) {
      assertObject(key);
      if (this.valuesById_) {
        var byId = this.valuesById_[key.__id__];
        if (byId)
          return byId;
      }
      if (!this.keys_)
        return undefined;
      var index = this.keys_.indexOf(key);
      return this.values_[index];
    },
    has: function(key) {
      assertObject(key);
      if (this.valuesById_ && key.__id__ in this.valuesById_)
        return true;
      if (!this.keys_)
        return false;
      return this.keys_.indexOf(key) >= 0;
    },
    'delete': function(key) {
      assertObject(key);
      if (this.valuesById_ && key.__id__ in this.valuesById_) {
        delete this.valuesById_[key.__id__];
        return;
      }
      if (this.keys_) {
        var index = this.keys_.indexOf(key);
        if (index >= 0) {
          this.keys_.splice(index, 1);
          this.values_.splice(index, 1);
        }
      }
    }
  };
}
